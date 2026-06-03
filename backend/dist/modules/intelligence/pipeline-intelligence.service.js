// pipeline-intelligence.service.ts
import mongoose from "mongoose";
import Deal from "../deals/deal.model.js";
import { ALL_RULES, RULE_METADATA, } from "./pipeline-intelligence.rules.js";
import { dbLogger } from "../../utils/logger.js";
/* ================= ERRORS ================= */
class IntelligenceServiceError extends Error {
    statusCode;
    code;
    constructor(message, statusCode = 400, code = "INTELLIGENCE_ERROR") {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = "IntelligenceServiceError";
    }
}
/* ================= HELPERS ================= */
function isValidObjectId(id) {
    if (!id)
        return false;
    return mongoose.Types.ObjectId.isValid(id);
}
const PRIORITY_RANK = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
};
function sortRecommendations(recs) {
    return [...recs].sort((a, b) => {
        const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (p !== 0)
            return p;
        const c = b.confidence - a.confidence;
        if (c !== 0)
            return c;
        return (b.estimatedValueAtRisk ?? 0) - (a.estimatedValueAtRisk ?? 0);
    });
}
/**
 * Build RuleContext without ever assigning undefined explicitly.
 * Required for projects with exactOptionalPropertyTypes: true.
 */
function buildRuleContext(deal, benchmarks, repWinRate) {
    const ctx = {
        deal,
        orgAvgVelocity: benchmarks.avgVelocity,
        orgAvgDealSize: benchmarks.avgDealSize,
    };
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
    async analyzeDeal(dealId) {
        if (!isValidObjectId(dealId)) {
            throw new IntelligenceServiceError("Invalid deal ID", 400, "INVALID_ID");
        }
        const deal = await Deal.findById(dealId);
        if (!deal)
            return null;
        const benchmarks = await this.getOrgBenchmarks(deal.organizationId.toString());
        const repWinRate = benchmarks.repWinRates.get(deal.assignedTo.toString());
        const ctx = buildRuleContext(deal, benchmarks, repWinRate);
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
    async analyzeOrg(organizationId) {
        if (!isValidObjectId(organizationId)) {
            throw new IntelligenceServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        const startedAt = Date.now();
        const benchmarks = await this.getOrgBenchmarks(organizationId);
        const byPriority = {
            urgent: 0, high: 0, medium: 0, low: 0,
        };
        const byCategory = {};
        let totalDeals = 0;
        let dealsWithRecommendations = 0;
        let totalRecommendations = 0;
        const cursor = Deal.find({
            organizationId,
            isDeleted: false,
            status: "open",
        }).cursor();
        for await (const deal of cursor) {
            totalDeals++;
            const repWinRate = benchmarks.repWinRates.get(deal.assignedTo.toString());
            const ctx = buildRuleContext(deal, benchmarks, repWinRate);
            let recs;
            try {
                recs = this.runRules(ctx);
            }
            catch (err) {
                dbLogger.error(`Rule evaluation failed for deal ${deal._id}: ${err.message}`);
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
        const result = {
            organizationId,
            totalDeals,
            dealsWithRecommendations,
            totalRecommendations,
            byPriority,
            byCategory,
            generatedAt: new Date(),
            durationMs: Date.now() - startedAt,
        };
        dbLogger.info(`Org intelligence analysis complete: org=${organizationId} ` +
            `deals=${totalDeals} withRecs=${dealsWithRecommendations} ` +
            `totalRecs=${totalRecommendations} durationMs=${result.durationMs}`);
        return result;
    }
    /* =====================================================
       GET RECOMMENDATIONS FOR A REP
    ===================================================== */
    async getRecommendationsForRep(userId, organizationId, opts = {}) {
        if (!isValidObjectId(userId) || !isValidObjectId(organizationId)) {
            throw new IntelligenceServiceError("Invalid ID", 400, "INVALID_ID");
        }
        const benchmarks = await this.getOrgBenchmarks(organizationId);
        const limit = Math.min(opts.limit ?? 20, 100);
        const minRank = opts.minPriority ? PRIORITY_RANK[opts.minPriority] : 3;
        const deals = await Deal.find({
            organizationId,
            assignedTo: userId,
            isDeleted: false,
            status: "open",
        });
        const all = [];
        const repWinRate = benchmarks.repWinRates.get(userId);
        for (const deal of deals) {
            const ctx = buildRuleContext(deal, benchmarks, repWinRate);
            try {
                const recs = this.runRules(ctx);
                for (const r of recs) {
                    if (PRIORITY_RANK[r.priority] > minRank)
                        continue;
                    if (opts.categories?.length && !opts.categories.includes(r.category))
                        continue;
                    all.push({
                        ...r,
                        dealId: deal._id.toString(),
                        dealTitle: deal.title,
                    });
                }
            }
            catch (err) {
                dbLogger.error(`Rep recommendation rule failure: deal=${deal._id} ` +
                    `user=${userId} error=${err.message}`);
            }
        }
        const sorted = sortRecommendations(all);
        return {
            userId,
            recommendations: sorted.slice(0, limit),
            total: sorted.length,
        };
    }
    /* =====================================================
       PIPELINE HEALTH SCORE
    ===================================================== */
    async getPipelineHealthScore(organizationId) {
        if (!isValidObjectId(organizationId)) {
            throw new IntelligenceServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        const benchmarks = await this.getOrgBenchmarks(organizationId);
        let totalOpenDeals = 0;
        let totalOpenValue = 0;
        let staleDeals = 0;
        let overdueDeals = 0;
        let stagnantDeals = 0;
        let highRiskDeals = 0;
        let missingNextSteps = 0;
        const cursor = Deal.find({
            organizationId,
            isDeleted: false,
            status: "open",
        }).cursor();
        for await (const deal of cursor) {
            totalOpenDeals++;
            totalOpenValue += deal.value;
            const repWinRate = benchmarks.repWinRates.get(deal.assignedTo.toString());
            const ctx = buildRuleContext(deal, benchmarks, repWinRate);
            let recs = [];
            try {
                recs = this.runRules(ctx);
            }
            catch (err) {
                dbLogger.error(`Health score rule failure: deal=${deal._id} error=${err.message}`);
                continue;
            }
            for (const r of recs) {
                if (r.ruleCode === "stale_deal")
                    staleDeals++;
                if (r.ruleCode === "close_date_overdue")
                    overdueDeals++;
                if (r.ruleCode === "stage_stagnation")
                    stagnantDeals++;
                if (r.ruleCode === "high_value_at_risk")
                    highRiskDeals++;
                if (r.ruleCode === "missing_next_step")
                    missingNextSteps++;
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
        const grade = score >= 90 ? "A" :
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
    runRules(ctx) {
        const out = [];
        for (const rule of ALL_RULES) {
            try {
                const recs = rule(ctx);
                if (recs?.length)
                    out.push(...recs);
            }
            catch (err) {
                dbLogger.error(`Individual rule threw: deal=${ctx.deal._id} error=${err.message}`);
            }
        }
        return out;
    }
    /* =====================================================
       PRIVATE — ORG BENCHMARKS
    ===================================================== */
    async getOrgBenchmarks(organizationId) {
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
                        _id: "$assignedTo",
                        won: { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } },
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
        const avgMs = velocity[0]?.avgMs ?? 14 * 24 * 60 * 60 * 1000;
        const avgVelocity = Math.round(avgMs / (1000 * 60 * 60 * 24));
        const avgDealSize = dealSize[0]?.avg ?? 500_000;
        const repWinRates = new Map();
        for (const r of winRates) {
            if (r._id)
                repWinRates.set(r._id.toString(), r.winRate);
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
    calculateHealthScore(s) {
        if (s.totalOpenDeals === 0)
            return 100;
        const stalePct = (s.staleDeals / s.totalOpenDeals) * 100;
        const overduePct = (s.overdueDeals / s.totalOpenDeals) * 100;
        const stagnantPct = (s.stagnantDeals / s.totalOpenDeals) * 100;
        const highRiskPct = (s.highRiskDeals / s.totalOpenDeals) * 100;
        const noNextStepPct = (s.missingNextSteps / s.totalOpenDeals) * 100;
        const penalty = overduePct * 1.5 +
            highRiskPct * 1.3 +
            stagnantPct * 1.0 +
            stalePct * 0.8 +
            noNextStepPct * 0.4;
        const score = Math.max(0, Math.min(100, 100 - penalty));
        return Math.round(score);
    }
}
export default new PipelineIntelligenceService();
//# sourceMappingURL=pipeline-intelligence.service.js.map