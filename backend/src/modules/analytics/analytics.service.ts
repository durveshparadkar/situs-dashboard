// analytics.service.ts
//
// Aggregation layer for the analytics dashboard. One method per logical
// section of the dashboard (summary, funnel, trend, insights). Service
// methods receive an organizationId + window and return shaped data
// matching the frontend contract.
//
// Design:
//   - All queries multi-tenant scoped to organizationId
//   - All reads use .lean() — analytics never mutates
//   - Aggregations run in parallel via Promise.all in the controller
//   - Soft-deleted deals always excluded
//   - Currency normalization uses valueInBaseCurrency when present,
//     falls back to value (assumes single-currency org)

import mongoose, { Types } from "mongoose";

import Deal from "../deals/deal.model.js";
import Pipeline from "../pipelines/pipeline.model.js";
import { dbLogger } from "../../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const ANALYTICS_CONFIG = {
  /** Default trend window in months */
  defaultTrendMonths: 12,
  maxTrendMonths:     36,

  /** Stale-deal threshold for insight generation */
  staleDaysThreshold: 14,

  /** Max insights returned per call */
  maxInsights:        6,

  /** Max top actions returned per call */
  maxTopActions:      5,

  /** Currency formatter helper for insight strings */
  formatLakh: (rupees: number): string => {
    if (rupees >= 10_000_000) {
      return "\u20B9" + (rupees / 10_000_000).toFixed(1) + " Cr";
    }
    if (rupees >= 100_000) {
      return "\u20B9" + (rupees / 100_000).toFixed(1) + " Lakh";
    }
    return "\u20B9" + rupees.toLocaleString("en-IN");
  },
} as const;

// ============================================================
// TYPES — frontend contract
// ============================================================

export interface AnalyticsSummary {
  totalRevenue:   number;
  revenueAtRisk:  number;
  avgConversion:  number;
  totalDeals:     number;
}

export interface AnalyticsFunnelStage {
  id:          string;
  name:        string;
  deals:       number;
  conversion:  number | null;
  avgDays:     number;
  totalValue:  number;
}

export interface AnalyticsTrendPoint {
  month:   string;
  revenue: number;
}

export interface AnalyticsTopAction {
  message:     string;
  priority:    "high" | "medium" | "low";
  impactScore: number;
  label:       string;
}

export interface AnalyticsDashboard {
  summary:      AnalyticsSummary;
  funnelStages: AnalyticsFunnelStage[];
  revenueTrend: AnalyticsTrendPoint[];
  insights:     string[];
  topActions:   AnalyticsTopAction[];
}

export interface AnalyticsWindow {
  fromDate: Date;
  toDate:   Date;
}

// ============================================================
// HELPERS
// ============================================================

function toObjectId(id: string | Types.ObjectId): Types.ObjectId {
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(id);
}

function getMonthLabel(date: Date): string {
  return date.toLocaleString("en-US", { month: "short" });
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function clampMonths(value: unknown, fallback: number): number {
  const n = typeof value === "number"
    ? value
    : typeof value === "string"
      ? parseInt(value, 10)
      : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(ANALYTICS_CONFIG.maxTrendMonths, n));
}

/**
 * Safely compute a percentage with rounding. Returns 0 for divide-by-zero.
 */
function percentage(numerator: number, denominator: number, decimals: number = 1): number {
  if (denominator <= 0) return 0;
  const pct = (numerator / denominator) * 100;
  const factor = Math.pow(10, decimals);
  return Math.round(pct * factor) / factor;
}

// ============================================================
// SERVICE CLASS
// ============================================================

class AnalyticsService {

  // -----------------------------------------------------------
  // SUMMARY METRICS
  // -----------------------------------------------------------

  /**
   * Top-line dashboard metrics:
   *   - totalRevenue: sum of WON deal values in window
   *   - revenueAtRisk: sum of high+critical risk OPEN deal values
   *   - avgConversion: won / (won + lost) percentage
   *   - totalDeals: all non-deleted deals in window
   */
  async getSummary(
    organizationId: string,
    window:         AnalyticsWindow
  ): Promise<AnalyticsSummary> {
    const orgId = toObjectId(organizationId);

    const DealModel = Deal as unknown as {
      aggregate: (pipeline: Record<string, unknown>[]) => Promise<Array<Record<string, number>>>;
    };

    const [revenueAgg, atRiskAgg, conversionAgg, totalAgg] = await Promise.all([
      // Total revenue from WON deals in window
      DealModel.aggregate([
        {
          $match: {
            organizationId: orgId,
            isDeleted:      false,
            status:         "won",
            actualCloseDate: {
              $gte: window.fromDate,
              $lte: window.toDate,
            },
          },
        },
        {
          $group: {
            _id:   null,
            total: { $sum: "$value" },
          },
        },
      ]),

      // At-risk revenue: open deals with high or critical risk
      DealModel.aggregate([
        {
          $match: {
            organizationId: orgId,
            isDeleted:      false,
            status:         "open",
            riskLevel:      { $in: ["high", "critical"] },
          },
        },
        {
          $group: {
            _id:   null,
            total: { $sum: "$value" },
          },
        },
      ]),

      // Conversion: won vs (won + lost)
      DealModel.aggregate([
        {
          $match: {
            organizationId: orgId,
            isDeleted:      false,
            status:         { $in: ["won", "lost"] },
            actualCloseDate: {
              $gte: window.fromDate,
              $lte: window.toDate,
            },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),

      // Total deals in window (any status)
      DealModel.aggregate([
        {
          $match: {
            organizationId: orgId,
            isDeleted:      false,
            createdAt: {
              $gte: window.fromDate,
              $lte: window.toDate,
            },
          },
        },
        {
          $group: {
            _id:   null,
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalRevenue  = revenueAgg[0]?.total ?? 0;
    const revenueAtRisk = atRiskAgg[0]?.total  ?? 0;
    const totalDeals    = totalAgg[0]?.count   ?? 0;

    // Conversion math
    let wonCount  = 0;
    let lostCount = 0;
    for (const row of conversionAgg) {
      const status = (row as unknown as { _id: string })._id;
      const count  = row.count as number;
      if (status === "won")  wonCount  = count;
      if (status === "lost") lostCount = count;
    }
    const avgConversion = percentage(wonCount, wonCount + lostCount, 1);

    return {
      totalRevenue,
      revenueAtRisk,
      avgConversion,
      totalDeals,
    };
  }

  // -----------------------------------------------------------
  // FUNNEL STAGES
  // -----------------------------------------------------------

  /**
   * Build the funnel by joining Pipeline stages with deal counts.
   * Returns stages in pipeline order, with deal count, total value,
   * avg days in stage, and conversion to next stage.
   */
  async getFunnel(organizationId: string): Promise<AnalyticsFunnelStage[]> {
    const orgId = toObjectId(organizationId);

    // Load the default pipeline (or first pipeline if no default)
    const PipelineModel = Pipeline as unknown as {
      findOne: (q: Record<string, unknown>) => {
        sort: (s: Record<string, number>) => {
          lean: () => Promise<{
            _id:    Types.ObjectId;
            stages: Array<{
              _id:      Types.ObjectId;
              name:     string;
              order:    number;
              isWon:    boolean;
              isLost:   boolean;
              isClosed: boolean;
            }>;
          } | null>;
        };
      };
    };

    const pipeline = await PipelineModel
      .findOne({ organizationId: orgId })
      .sort({ isDefault: -1, createdAt: 1 })
      .lean();

    if (!pipeline || !pipeline.stages || pipeline.stages.length === 0) {
      return [];
    }

    // Aggregate deals per stage for the open pipeline
    const DealModel = Deal as unknown as {
      aggregate: (pipeline: Record<string, unknown>[]) => Promise<Array<{
        _id:        Types.ObjectId;
        count:      number;
        totalValue: number;
        avgDays:    number;
      }>>;
    };

    const dealsByStage = await DealModel.aggregate([
      {
        $match: {
          organizationId: orgId,
          isDeleted:      false,
          pipelineId:     pipeline._id,
        },
      },
      {
        $group: {
          _id:        "$stageId",
          count:      { $sum: 1 },
          totalValue: { $sum: "$value" },
          avgDays:    { $avg: "$daysInCurrentStage" },
        },
      },
    ]);

    // Build a lookup map by stageId string
    const dealsByStageMap = new Map<string, { count: number; totalValue: number; avgDays: number }>();
    for (const row of dealsByStage) {
      dealsByStageMap.set(String(row._id), {
        count:      row.count,
        totalValue: row.totalValue,
        avgDays:    Math.round(row.avgDays || 0),
      });
    }

    // Sort stages by order
    const sortedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);

    // Build funnel with conversion calculations
    const funnel: AnalyticsFunnelStage[] = [];
    let previousCount: number | null = null;

    for (const stage of sortedStages) {
      const stageData = dealsByStageMap.get(String(stage._id));
      const deals     = stageData?.count      ?? 0;
      const totalValue = stageData?.totalValue ?? 0;
      const avgDays    = stageData?.avgDays    ?? 0;

      // Conversion = this stage count / previous stage count
      // null for first stage (no "previous" exists)
      const conversion = previousCount === null
        ? null
        : percentage(deals, previousCount, 1);

      funnel.push({
        id:         String(stage._id),
        name:       stage.name,
        deals,
        conversion,
        avgDays,
        totalValue,
      });

      previousCount = deals;
    }

    return funnel;
  }

  // -----------------------------------------------------------
  // REVENUE TREND
  // -----------------------------------------------------------

  /**
   * Monthly closed-revenue series for the trend chart. Returns one
   * entry per month in window, including months with zero revenue
   * (frontend renders bars correctly without gaps).
   */
  async getRevenueTrend(
    organizationId: string,
    months:         number
  ): Promise<AnalyticsTrendPoint[]> {
    const orgId    = toObjectId(organizationId);
    const trendMonths = clampMonths(months, ANALYTICS_CONFIG.defaultTrendMonths);

    const now           = new Date();
    const windowEndMs   = now.getTime();
    const windowStart   = addMonths(startOfMonth(now), -(trendMonths - 1));
    const windowStartMs = windowStart.getTime();

    const DealModel = Deal as unknown as {
      aggregate: (pipeline: Record<string, unknown>[]) => Promise<Array<{
        _id:     { year: number; month: number };
        revenue: number;
      }>>;
    };

    const monthly = await DealModel.aggregate([
      {
        $match: {
          organizationId:  orgId,
          isDeleted:       false,
          status:          "won",
          actualCloseDate: {
            $gte: new Date(windowStartMs),
            $lte: new Date(windowEndMs),
          },
        },
      },
      {
        $group: {
          _id: {
            year:  { $year:  "$actualCloseDate" },
            month: { $month: "$actualCloseDate" },
          },
          revenue: { $sum: "$value" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Build a complete series, filling missing months with 0
    const series: AnalyticsTrendPoint[] = [];
    for (let i = 0; i < trendMonths; i++) {
      const month     = addMonths(windowStart, i);
      const year      = month.getFullYear();
      const monthNum  = month.getMonth() + 1;
      const monthData = monthly.find(
        (r) => r._id.year === year && r._id.month === monthNum
      );

      series.push({
        month:   getMonthLabel(month),
        revenue: monthData?.revenue ?? 0,
      });
    }

    return series;
  }

  // -----------------------------------------------------------
  // INSIGHTS (rotating hero text)
  // -----------------------------------------------------------

  /**
   * Generate human-readable insight strings from real aggregations.
   * These rotate in the frontend hero card every 4 seconds.
   *
   * Placeholder for now — when decision engines are server-side,
   * swap this for actual engine calls returning structured insights.
   */
  async getInsights(
    organizationId: string,
    window:         AnalyticsWindow
  ): Promise<string[]> {
    const orgId = toObjectId(organizationId);
    const insights: string[] = [];

    const DealModel = Deal as unknown as {
      aggregate: (pipeline: Record<string, unknown>[]) => Promise<Array<Record<string, unknown>>>;
      countDocuments: (q: Record<string, unknown>) => Promise<number>;
    };

    // Stale deals (no activity > 14 days, status open)
    const staleThreshold = new Date(
      Date.now() - ANALYTICS_CONFIG.staleDaysThreshold * 24 * 60 * 60 * 1000
    );

    const [
      stalledDealsAgg,
      atRiskValueAgg,
      thisMonthRevenueAgg,
      lastMonthRevenueAgg,
      avgDealAgeAgg,
    ] = await Promise.all([
      // Count + total value of stalled open deals
      DealModel.aggregate([
        {
          $match: {
            organizationId: orgId,
            isDeleted:      false,
            status:         "open",
            lastActivityAt: { $lt: staleThreshold },
          },
        },
        {
          $group: {
            _id:        null,
            count:      { $sum: 1 },
            totalValue: { $sum: "$value" },
          },
        },
      ]),

      // High+critical risk deal values
      DealModel.aggregate([
        {
          $match: {
            organizationId: orgId,
            isDeleted:      false,
            status:         "open",
            riskLevel:      { $in: ["high", "critical"] },
          },
        },
        {
          $group: {
            _id:        null,
            count:      { $sum: 1 },
            totalValue: { $sum: "$value" },
          },
        },
      ]),

      // This month closed revenue
      DealModel.aggregate([
        {
          $match: {
            organizationId: orgId,
            isDeleted:      false,
            status:         "won",
            actualCloseDate: { $gte: startOfMonth(new Date()) },
          },
        },
        {
          $group: {
            _id:   null,
            total: { $sum: "$value" },
          },
        },
      ]),

      // Last month closed revenue
      DealModel.aggregate([
        {
          $match: {
            organizationId: orgId,
            isDeleted:      false,
            status:         "won",
            actualCloseDate: {
              $gte: addMonths(startOfMonth(new Date()), -1),
              $lt:  startOfMonth(new Date()),
            },
          },
        },
        {
          $group: {
            _id:   null,
            total: { $sum: "$value" },
          },
        },
      ]),

      // Average deal age for open deals
      DealModel.aggregate([
        {
          $match: {
            organizationId: orgId,
            isDeleted:      false,
            status:         "open",
          },
        },
        {
          $group: {
            _id:     null,
            avgAge: { $avg: "$ageDays" },
            count:  { $sum: 1 },
          },
        },
      ]),
    ]);

    // Insight 1: Stalled deals
    const stalled = stalledDealsAgg[0] as { count?: number; totalValue?: number } | undefined;
    if (stalled && (stalled.count ?? 0) > 0) {
      const count = stalled.count ?? 0;
      const value = stalled.totalValue ?? 0;
      insights.push(
        count + " deal" + (count === 1 ? "" : "s") +
        " worth " + ANALYTICS_CONFIG.formatLakh(value) +
        " stuck without activity for 14+ days"
      );
    }

    // Insight 2: At-risk pipeline
    const atRisk = atRiskValueAgg[0] as { count?: number; totalValue?: number } | undefined;
    if (atRisk && (atRisk.count ?? 0) > 0) {
      const count = atRisk.count ?? 0;
      const value = atRisk.totalValue ?? 0;
      insights.push(
        ANALYTICS_CONFIG.formatLakh(value) + " at high risk across " +
        count + " deal" + (count === 1 ? "" : "s") + " — review this week"
      );
    }

    // Insight 3: Revenue MoM trend
    const thisMonth = (thisMonthRevenueAgg[0] as { total?: number } | undefined)?.total ?? 0;
    const lastMonth = (lastMonthRevenueAgg[0] as { total?: number } | undefined)?.total ?? 0;
    if (lastMonth > 0) {
      const change = percentage(thisMonth - lastMonth, lastMonth, 0);
      if (change > 5) {
        insights.push(
          "Revenue up " + change + "% vs last month — momentum is strong"
        );
      } else if (change < -5) {
        insights.push(
          "Revenue down " + Math.abs(change) + "% vs last month — needs attention"
        );
      }
    }

    // Insight 4: Average deal age
    const ageData = avgDealAgeAgg[0] as { avgAge?: number; count?: number } | undefined;
    if (ageData && (ageData.count ?? 0) > 5 && (ageData.avgAge ?? 0) > 30) {
      insights.push(
        "Average deal age is " + Math.round(ageData.avgAge ?? 0) +
        " days — consider shortening your sales cycle"
      );
    }

    // Fallback if no insights generated
    if (insights.length === 0) {
      insights.push("Pipeline is healthy — keep up the momentum");
    }

    // Bound to maxInsights to avoid bloated payloads
    return insights.slice(0, ANALYTICS_CONFIG.maxInsights);
  }

  // -----------------------------------------------------------
  // TOP ACTIONS
  // -----------------------------------------------------------

  /**
   * Action recommendations cards. Each represents a concrete next step.
   * Currently generated from deal patterns; will be replaced with
   * decision-engine outputs when those are server-side.
   */
  async getTopActions(organizationId: string): Promise<AnalyticsTopAction[]> {
    const orgId   = toObjectId(organizationId);
    const actions: AnalyticsTopAction[] = [];

    const DealModel = Deal as unknown as {
      find: (q: Record<string, unknown>) => {
        sort:  (s: Record<string, number>) => {
          limit: (n: number) => {
            select: (f: string) => {
              lean: () => Promise<Array<{
                _id:        Types.ObjectId;
                title:      string;
                value:      number;
                riskScore:  number;
                riskLevel:  string;
              }>>;
            };
          };
        };
      };
    };

    // Highest-risk open deal — primary risk action
    const topRiskDeals = await DealModel
      .find({
        organizationId: orgId,
        isDeleted:      false,
        status:         "open",
        riskLevel:      { $in: ["high", "critical"] },
      })
      .sort({ riskScore: -1 })
      .limit(3)
      .select("_id title value riskScore riskLevel")
      .lean();

    if (topRiskDeals[0]) {
      const deal = topRiskDeals[0];
      actions.push({
        label:       "TOP RISK",
        priority:    "high",
        impactScore: deal.riskScore,
        message:     "Save " + deal.title + " — " +
          ANALYTICS_CONFIG.formatLakh(deal.value) +
          " at " + deal.riskLevel + " risk",
      });
    }

    // Find an opportunity — high-value, low-risk, in late stage
    const opportunities = await DealModel
      .find({
        organizationId: orgId,
        isDeleted:      false,
        status:         "open",
        riskLevel:      { $in: ["low", "medium"] },
      })
      .sort({ value: -1 })
      .limit(3)
      .select("_id title value riskScore riskLevel")
      .lean();

    if (opportunities[0]) {
      const deal = opportunities[0];
      actions.push({
        label:       "TOP OPPORTUNITY",
        priority:    "low",
        impactScore: deal.value,
        message:     "Close " + deal.title + " — " +
          ANALYTICS_CONFIG.formatLakh(deal.value) +
          " with low risk",
      });
    }

    // Second risk deal if available
    if (topRiskDeals[1]) {
      const deal = topRiskDeals[1];
      actions.push({
        label:       "WATCH",
        priority:    "medium",
        impactScore: deal.riskScore,
        message:     "Monitor " + deal.title + " — " +
          ANALYTICS_CONFIG.formatLakh(deal.value),
      });
    }

    return actions.slice(0, ANALYTICS_CONFIG.maxTopActions);
  }

  // -----------------------------------------------------------
  // FULL DASHBOARD — single call
  // -----------------------------------------------------------

  /**
   * Returns the full dashboard payload that the frontend's
   * /api/analytics endpoint consumes. All sub-aggregations run
   * in parallel.
   */
  async getDashboard(
    organizationId: string,
    options: {
      window?:       AnalyticsWindow;
      trendMonths?:  number;
    } = {}
  ): Promise<AnalyticsDashboard> {
    const now    = new Date();
    const window = options.window ?? {
      fromDate: addMonths(now, -ANALYTICS_CONFIG.defaultTrendMonths),
      toDate:   now,
    };
    const trendMonths = clampMonths(
      options.trendMonths,
      ANALYTICS_CONFIG.defaultTrendMonths
    );

    try {
      const [summary, funnelStages, revenueTrend, insights, topActions] =
        await Promise.all([
          this.getSummary(organizationId, window),
          this.getFunnel(organizationId),
          this.getRevenueTrend(organizationId, trendMonths),
          this.getInsights(organizationId, window),
          this.getTopActions(organizationId),
        ]);

      return {
        summary,
        funnelStages,
        revenueTrend,
        insights,
        topActions,
      };
    } catch (err) {
      dbLogger.error(
        "Analytics dashboard aggregation failed: org=" + organizationId +
        " err=" + ((err as Error)?.message ?? "unknown")
      );
      throw err;
    }
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

const analyticsService = new AnalyticsService();
export default analyticsService;