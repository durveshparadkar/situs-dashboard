// pipeline-intelligence.service.ts
import mongoose from "mongoose";
import Deal from "../deals/deal.model.js";
import {
  ALL_RULES,
  Recommendation,
  RuleContext,
  RecommendationPriority,
  RecommendationCategory,
  RULE_METADATA,
} from "./pipeline-intelligence.rules.js";
import { dbLogger } from "../../utils/logger.js";

/* ================= ERRORS ================= */

class IntelligenceServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "INTELLIGENCE_ERROR"
  ) {
    super(message);
    this.name = "IntelligenceServiceError";
  }
}

/* ================= TYPES ================= */

export interface AnalyzeDealResult {
  dealId: string;
  recommendations: Recommendation[];
  evaluatedRules: number;
  generatedAt: Date;
}

export interface AnalyzeOrgResult {
  organizationId: string;
  totalDeals: number;
  dealsWithRecommendations: number;
  totalRecommendations: number;
  byPriority: Record<RecommendationPriority, number>;
  byCategory: Record<string, number>;
  generatedAt: Date;
  durationMs: number;
}

export interface PipelineHealthScore {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  signals: {
    staleDeals: number;
    overdueDeals: number;
    stagnantDeals: number;
    highRiskDeals: number;
    missingNextSteps: number;
  };
  totalOpenDeals: number;
  totalOpenValue: number;
}

interface OrgBenchmarks {
  avgVelocity: number;
  avgDealSize: number;
  repWinRates: Map<string, number>;
}

/* ================= HELPERS ================= */

function isValidObjectId(id: string | undefined | null): boolean {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id);
}

const PRIORITY_RANK: Record<RecommendationPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function sortRecommendations(recs: Recommendation[]): Recommendation[] {
  return [...recs].sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    const c = b.confidence - a.confidence;
    if (c !== 0) return c;
    return (b.estimatedValueAtRisk ?? 0) - (a.estimatedValueAtRisk ?? 0);
  });
}

/**
 * Build RuleContext without ever assigning undefined explicitly.
 * Required for projects with exactOptionalPropertyTypes: true.
 */
function buildRuleContext(
  deal: any,
  benchmarks: OrgBenchmarks,
  repWinRate?: number
): RuleContext {
  const ctx: RuleContext = {
    deal,
    orgAvgVelocity: benchmarks.avgVelocity,
    orgAvgDealSize: benchmarks.avgDealSize,
  } as RuleContext;

  if (typeof repWinRate === "number") {
    ctx.repWinRate = repWinRate;
  }

  return ctx;
}

/* ================= SERVICE ================= */

class PipelineIntelligenceService {

  /* =====================================================
     ANALYZE A SINGLE DEAL
  ===================================================== */
  async analyzeDeal(dealId: string): Promise<AnalyzeDealResult | null> {
    if (!isValidObjectId(dealId)) {
      throw new IntelligenceServiceError("Invalid deal ID", 400, "INVALID_ID");
    }

    const deal = await Deal.findById(dealId);
    if (!deal) return null;

    const benchmarks = await this.getOrgBenchmarks(
      deal.organizationId.toString()
    );

    const repWinRate = benchmarks.repWinRates.get(deal.assignedTo.toString());
    const ctx        = buildRuleContext(deal, benchmarks, repWinRate);

    const recommendations = this.runRules(ctx);

    return {
      dealId,
      recommendations: sortRecommendations(recommendations),
      evaluatedRules: ALL_RULES.length,
      generatedAt: new Date(),
    };
  }

  /* =====================================================
     ANALYZE ALL OPEN DEALS FOR AN ORG
  ===================================================== */
  async analyzeOrg(organizationId: string): Promise<AnalyzeOrgResult> {
    if (!isValidObjectId(organizationId)) {
      throw new IntelligenceServiceError(
        "Invalid organization ID",
        400,
        "INVALID_ID"
      );
    }

    const startedAt  = Date.now();
    const benchmarks = await this.getOrgBenchmarks(organizationId);

    const byPriority: Record<RecommendationPriority, number> = {
      urgent: 0, high: 0, medium: 0, low: 0,
    };
    const byCategory: Record<string, number> = {};

    let totalDeals               = 0;
    let dealsWithRecommendations = 0;
    let totalRecommendations     = 0;

    const cursor = Deal.find({
      organizationId,
      isDeleted: false,
      status: "open",
    }).cursor();

    for await (const deal of cursor) {
      totalDeals++;

      const repWinRate = benchmarks.repWinRates.get(deal.assignedTo.toString());
      const ctx        = buildRuleContext(deal, benchmarks, repWinRate);

      let recs: Recommendation[];
      try {
        recs = this.runRules(ctx);
      } catch (err) {
        dbLogger.error(
          `Rule evaluation failed for deal ${deal._id}: ${(err as Error).message}`
        );
        continue;
      }

      if (recs.length) {
        dealsWithRecommendations++;
        totalRecommendations += recs.length;

        for (const r of recs) {
          byPriority[r.priority]++;
          byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
        }
      }
    }

    const result: AnalyzeOrgResult = {
      organizationId,
      totalDeals,
      dealsWithRecommendations,
      totalRecommendations,
      byPriority,
      byCategory,
      generatedAt: new Date(),
      durationMs: Date.now() - startedAt,
    };

    dbLogger.info(
      `Org intelligence analysis complete: org=${organizationId} ` +
      `deals=${totalDeals} withRecs=${dealsWithRecommendations} ` +
      `totalRecs=${totalRecommendations} durationMs=${result.durationMs}`
    );

    return result;
  }

  /* =====================================================
     GET RECOMMENDATIONS FOR A REP
  ===================================================== */
  async getRecommendationsForRep(
    userId: string,
    organizationId: string,
    opts: {
      limit?: number;
      minPriority?: RecommendationPriority;
      categories?: RecommendationCategory[];
    } = {}
  ): Promise<{
    userId: string;
    recommendations: Array<Recommendation & { dealId: string; dealTitle: string }>;
    total: number;
  }> {
    if (!isValidObjectId(userId) || !isValidObjectId(organizationId)) {
      throw new IntelligenceServiceError("Invalid ID", 400, "INVALID_ID");
    }

    const benchmarks = await this.getOrgBenchmarks(organizationId);
    const limit      = Math.min(opts.limit ?? 20, 100);
    const minRank    = opts.minPriority ? PRIORITY_RANK[opts.minPriority] : 3;

    const deals = await Deal.find({
      organizationId,
      assignedTo: userId,
      isDeleted: false,
      status: "open",
    });

    const all: Array<Recommendation & { dealId: string; dealTitle: string }> = [];
    const repWinRate = benchmarks.repWinRates.get(userId);

    for (const deal of deals) {
      const ctx = buildRuleContext(deal, benchmarks, repWinRate);

      try {
        const recs = this.runRules(ctx);
        for (const r of recs) {
          if (PRIORITY_RANK[r.priority] > minRank) continue;
          if (opts.categories?.length && !opts.categories.includes(r.category)) continue;

          all.push({
            ...r,
            dealId: deal._id.toString(),
            dealTitle: deal.title,
          });
        }
      } catch (err) {
        dbLogger.error(
          `Rep recommendation rule failure: deal=${deal._id} ` +
          `user=${userId} error=${(err as Error).message}`
        );
      }
    }

    const sorted = sortRecommendations(all) as Array<
      Recommendation & { dealId: string; dealTitle: string }
    >;

    return {
      userId,
      recommendations: sorted.slice(0, limit),
      total: sorted.length,
    };
  }

  /* =====================================================
     PIPELINE HEALTH SCORE
  ===================================================== */
  async getPipelineHealthScore(
    organizationId: string
  ): Promise<PipelineHealthScore> {
    if (!isValidObjectId(organizationId)) {
      throw new IntelligenceServiceError(
        "Invalid organization ID",
        400,
        "INVALID_ID"
      );
    }

    const benchmarks = await this.getOrgBenchmarks(organizationId);

    let totalOpenDeals    = 0;
    let totalOpenValue    = 0;
    let staleDeals        = 0;
    let overdueDeals      = 0;
    let stagnantDeals     = 0;
    let highRiskDeals     = 0;
    let missingNextSteps  = 0;

    const cursor = Deal.find({
      organizationId,
      isDeleted: false,
      status: "open",
    }).cursor();

    for await (const deal of cursor) {
      totalOpenDeals++;
      totalOpenValue += deal.value;

      const repWinRate = benchmarks.repWinRates.get(deal.assignedTo.toString());
      const ctx        = buildRuleContext(deal, benchmarks, repWinRate);

      let recs: Recommendation[] = [];
      try {
        recs = this.runRules(ctx);
      } catch (err) {
        dbLogger.error(
          `Health score rule failure: deal=${deal._id} error=${(err as Error).message}`
        );
        continue;
      }

      for (const r of recs) {
        if (r.ruleCode === "stale_deal")          staleDeals++;
        if (r.ruleCode === "close_date_overdue")  overdueDeals++;
        if (r.ruleCode === "stage_stagnation")    stagnantDeals++;
        if (r.ruleCode === "high_value_at_risk")  highRiskDeals++;
        if (r.ruleCode === "missing_next_step")   missingNextSteps++;
      }
    }

    const score = this.calculateHealthScore({
      totalOpenDeals,
      staleDeals,
      overdueDeals,
      stagnantDeals,
      highRiskDeals,
      missingNextSteps,
    });

    const grade =
      score >= 90 ? "A" :
      score >= 75 ? "B" :
      score >= 60 ? "C" :
      score >= 45 ? "D" : "F";

    return {
      score,
      grade,
      signals: {
        staleDeals,
        overdueDeals,
        stagnantDeals,
        highRiskDeals,
        missingNextSteps,
      },
      totalOpenDeals,
      totalOpenValue,
    };
  }

  /* =====================================================
     RULE METADATA
  ===================================================== */
  getRuleCatalog() {
    return Object.entries(RULE_METADATA).map(([code, meta]) => ({
      code,
      ...meta,
    }));
  }

  /* =====================================================
     PRIVATE — RUN ALL RULES
  ===================================================== */
  private runRules(ctx: RuleContext): Recommendation[] {
    const out: Recommendation[] = [];

    for (const rule of ALL_RULES) {
      try {
        const recs = rule(ctx);
        if (recs?.length) out.push(...recs);
      } catch (err) {
        dbLogger.error(
          `Individual rule threw: deal=${ctx.deal._id} error=${(err as Error).message}`
        );
      }
    }

    return out;
  }

  /* =====================================================
     PRIVATE — ORG BENCHMARKS
  ===================================================== */
  private async getOrgBenchmarks(organizationId: string): Promise<OrgBenchmarks> {
    const orgId = new mongoose.Types.ObjectId(organizationId);

    const [velocity, dealSize, winRates] = await Promise.all([
      Deal.aggregate([
        { $match: { organizationId: orgId, isDeleted: false } },
        { $unwind: "$stageHistory" },
        { $match: { "stageHistory.durationMs": { $gt: 0 } } },
        {
          $group: {
            _id: null,
            avgMs: { $avg: "$stageHistory.durationMs" },
          },
        },
      ]),

      Deal.aggregate([
        { $match: { organizationId: orgId, isDeleted: false, status: "open" } },
        { $group: { _id: null, avg: { $avg: "$value" } } },
      ]),

      Deal.aggregate([
        {
          $match: {
            organizationId: orgId,
            isDeleted: false,
            status: { $in: ["won", "lost"] },
            actualCloseDate: {
              $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id:   "$assignedTo",
            won:   { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } },
            total: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 1,
            winRate: {
              $cond: [
                { $eq: ["$total", 0] },
                0,
                { $multiply: [{ $divide: ["$won", "$total"] }, 100] },
              ],
            },
          },
        },
      ]),
    ]);

    const avgMs        = velocity[0]?.avgMs ?? 14 * 24 * 60 * 60 * 1000;
    const avgVelocity  = Math.round(avgMs / (1000 * 60 * 60 * 24));
    const avgDealSize  = dealSize[0]?.avg ?? 500_000;

    const repWinRates = new Map<string, number>();
    for (const r of winRates) {
      if (r._id) repWinRates.set(r._id.toString(), r.winRate);
    }

    return {
      avgVelocity,
      avgDealSize,
      repWinRates,
    };
  }

  /* =====================================================
     PRIVATE — HEALTH SCORE FORMULA
  ===================================================== */
  private calculateHealthScore(s: {
    totalOpenDeals: number;
    staleDeals: number;
    overdueDeals: number;
    stagnantDeals: number;
    highRiskDeals: number;
    missingNextSteps: number;
  }): number {
    if (s.totalOpenDeals === 0) return 100;

    const stalePct      = (s.staleDeals       / s.totalOpenDeals) * 100;
    const overduePct    = (s.overdueDeals     / s.totalOpenDeals) * 100;
    const stagnantPct   = (s.stagnantDeals    / s.totalOpenDeals) * 100;
    const highRiskPct   = (s.highRiskDeals    / s.totalOpenDeals) * 100;
    const noNextStepPct = (s.missingNextSteps / s.totalOpenDeals) * 100;

    const penalty =
      overduePct    * 1.5 +
      highRiskPct   * 1.3 +
      stagnantPct   * 1.0 +
      stalePct      * 0.8 +
      noNextStepPct * 0.4;

    const score = Math.max(0, Math.min(100, 100 - penalty));
    return Math.round(score);
  }
}

export default new PipelineIntelligenceService();