// forecast.service.ts
import mongoose from "mongoose";
import Deal from "../deals/deal.model.js";
import Pipeline from "../pipelines/pipeline.model.js";
import { dbLogger } from "../../utils/logger.js";
/* =====================================================
   ERRORS
===================================================== */
export class ForecastServiceError extends Error {
    statusCode;
    code;
    constructor(message, statusCode = 400, code = "FORECAST_SERVICE_ERROR") {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = "ForecastServiceError";
    }
}
/* =====================================================
   CONFIG
===================================================== */
export const FORECAST_CONFIG = {
    /* Confidence buckets — Clari-style forecast categorization */
    buckets: {
        commit: { minProbability: 70 }, // realistic commitments
        bestCase: { minProbability: 40 }, // upside if things go well
        pipeline: { minProbability: 0 }, // everything still open
    },
    /* Health score weights */
    health: {
        minHealthyRatio: 0.3, // weighted/total ratio threshold
        healthyConversionRate: 30, // % deals in commit bucket
    },
    /* Insight thresholds */
    insights: {
        lowPipelineHealth: 0.4,
        lowConversionRate: 30,
        weakForecastRatio: 0.3,
        overdueDealsThreshold: 5, // count
        stalledDealsThreshold: 10, // count
    },
    /* Default ranges */
    defaultRange: "month",
};
/* =====================================================
   HELPERS
===================================================== */
function isValidObjectId(id) {
    if (!id)
        return false;
    return mongoose.Types.ObjectId.isValid(id);
}
function toObjectId(id) {
    return new mongoose.Types.ObjectId(id);
}
/**
 * Convert a range token (week/month/quarter/year) into a date window.
 * For "custom", caller must supply startDate/endDate.
 */
function resolveDateWindow(range, startDate, endDate) {
    const now = new Date();
    const end = endDate ? new Date(endDate) : new Date(now);
    if (range === "custom") {
        if (!startDate) {
            throw new ForecastServiceError("startDate is required for custom range", 400, "MISSING_START_DATE");
        }
        return { start: new Date(startDate), end };
    }
    const start = new Date(now);
    switch (range) {
        case "week":
            start.setDate(now.getDate() - 7);
            break;
        case "month":
            start.setMonth(now.getMonth() - 1);
            break;
        case "quarter":
            start.setMonth(now.getMonth() - 3);
            break;
        case "year":
            start.setFullYear(now.getFullYear() - 1);
            break;
    }
    return { start, end };
}
/**
 * Coerce a numeric value to int with safe defaults.
 */
function safeInt(value, fallback = 0) {
    if (typeof value !== "number" || !Number.isFinite(value))
        return fallback;
    return Math.round(value);
}
/* =====================================================
   SERVICE
===================================================== */
class ForecastService {
    /* =====================================================
       MAIN — getForecast
       Backwards-compatible signature:
         getForecast(orgId, range)
       But also accepts a richer filters object internally.
    ===================================================== */
    async getForecast(orgId, rangeOrFilters) {
        const startedAt = Date.now();
        /* ── Validation ── */
        if (!orgId) {
            throw new ForecastServiceError("Organization ID required", 401, "UNAUTHORIZED");
        }
        if (!isValidObjectId(orgId)) {
            throw new ForecastServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        /* ── Normalize filters ── */
        const filters = typeof rangeOrFilters === "object" && rangeOrFilters !== null
            ? rangeOrFilters
            : { range: rangeOrFilters ?? FORECAST_CONFIG.defaultRange };
        const range = (filters.range ?? FORECAST_CONFIG.defaultRange);
        const model = filters.model ?? "weighted_pipeline";
        const { start, end } = resolveDateWindow(range, filters.startDate, filters.endDate);
        /* ── Run aggregations in parallel for speed ── */
        const [openMetrics, closedMetrics, hygieneMetrics] = await Promise.all([
            this.aggregateOpenPipeline(orgId, filters),
            this.aggregateClosedDeals(orgId, start, end, filters),
            this.aggregateHygieneSignals(orgId, filters),
        ]);
        /* ── Build summary ── */
        const summary = {
            totalPipelineValue: safeInt(openMetrics.totalValue),
            weightedForecast: safeInt(openMetrics.weightedValue),
            commitForecast: safeInt(openMetrics.commitValue),
            bestCaseForecast: safeInt(openMetrics.bestCaseValue),
            closedWonValue: safeInt(closedMetrics.wonValue),
            closedLostValue: safeInt(closedMetrics.lostValue),
            averageDealSize: safeInt(openMetrics.avgDealSize),
        };
        /* ── Build metrics ── */
        const totalDeals = openMetrics.openCount + closedMetrics.wonCount + closedMetrics.lostCount;
        const winDenom = closedMetrics.wonCount + closedMetrics.lostCount;
        const winRate = winDenom > 0 ? (closedMetrics.wonCount / winDenom) * 100 : 0;
        const conversionRate = openMetrics.openCount > 0
            ? (openMetrics.commitCount / openMetrics.openCount) * 100
            : 0;
        const pipelineHealth = openMetrics.totalValue > 0
            ? openMetrics.weightedValue / openMetrics.totalValue
            : 0;
        const metrics = {
            totalDeals,
            openDeals: openMetrics.openCount,
            closedWon: closedMetrics.wonCount,
            closedLost: closedMetrics.lostCount,
            commitDeals: openMetrics.commitCount,
            bestCaseDeals: openMetrics.bestCaseCount,
            conversionRate: Math.round(conversionRate),
            winRate: Math.round(winRate * 10) / 10,
            pipelineHealth: Number(pipelineHealth.toFixed(2)),
            averageProbability: Math.round(openMetrics.avgProbability),
            overdueDeals: hygieneMetrics.overdueCount,
            stalledDeals: hygieneMetrics.stalledCount,
        };
        /* ── Generate insights ── */
        const insights = this.generateInsights(summary, metrics);
        const durationMs = Date.now() - startedAt;
        dbLogger.info(`Forecast generated: org=${orgId} range=${range} model=${model} ` +
            `deals=${totalDeals} weighted=${summary.weightedForecast} durationMs=${durationMs}`);
        return {
            summary,
            metrics,
            insights,
            meta: {
                organizationId: orgId,
                range,
                startDate: start,
                endDate: end,
                model,
                generatedAt: new Date(),
                durationMs,
            },
        };
    }
    /* =====================================================
       SUMMARY — lightweight version for dashboard widget
    ===================================================== */
    async getForecastSummary(orgId) {
        const result = await this.getForecast(orgId, "month");
        return result.summary;
    }
    /* =====================================================
       STAGE NAME LOOKUP
       Builds a map of { stageId -> stageName } from the org's pipelines.
       Used so the breakdown can show real stage names (DISCOVERY, WON...)
       instead of raw ObjectId strings.
    ===================================================== */
    async buildStageNameMap(orgId) {
        const map = {};
        try {
            /* Load every pipeline for this org and flatten their stages.
               A pipeline doc has a "stages" array; each stage has _id + name. */
            const pipelines = await Pipeline.find({
                organizationId: toObjectId(orgId),
                isDeleted: { $ne: true },
            }).lean();
            for (const p of pipelines) {
                const stages = Array.isArray(p.stages) ? p.stages : [];
                for (const s of stages) {
                    if (s && s._id != null) {
                        const id = String(s._id);
                        if (s.name)
                            map[id] = s.name;
                    }
                }
            }
        }
        catch (err) {
            dbLogger.error(`buildStageNameMap failed for org=${orgId}: ${err instanceof Error ? err.message : String(err)}`);
        }
        return map;
    }
    /* =====================================================
       BREAKDOWN — group forecast by stage / owner / month / week
    ===================================================== */
    async getForecastBreakdown(orgId, groupBy = "stage") {
        if (!isValidObjectId(orgId)) {
            throw new ForecastServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        const baseMatch = {
            organizationId: toObjectId(orgId),
            isDeleted: { $ne: true },
            status: "open",
        };
        /* Build the $group _id based on requested grouping */
        let groupId;
        switch (groupBy) {
            case "stage":
                groupId = "$stageId";
                break;
            case "owner":
                groupId = "$assignedTo";
                break;
            case "month":
                groupId = {
                    y: { $year: "$expectedCloseDate" },
                    m: { $month: "$expectedCloseDate" },
                };
                break;
            case "week":
                groupId = {
                    y: { $year: "$expectedCloseDate" },
                    w: { $week: "$expectedCloseDate" },
                };
                break;
        }
        const results = await Deal.aggregate([
            { $match: baseMatch },
            {
                $group: {
                    _id: groupId,
                    totalValue: { $sum: "$value" },
                    weightedValue: { $sum: { $multiply: ["$value", { $divide: ["$probability", 100] }] } },
                    commitValue: {
                        $sum: {
                            $cond: [
                                { $gte: ["$probability", FORECAST_CONFIG.buckets.commit.minProbability] },
                                "$value",
                                0,
                            ],
                        },
                    },
                    bestCaseValue: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: ["$probability", FORECAST_CONFIG.buckets.bestCase.minProbability] },
                                        { $lt: ["$probability", FORECAST_CONFIG.buckets.commit.minProbability] },
                                    ],
                                },
                                "$value",
                                0,
                            ],
                        },
                    },
                    dealCount: { $sum: 1 },
                },
            },
            { $sort: { totalValue: -1 } },
            { $limit: 100 },
        ]);
        /* For stage grouping, resolve each stageId into its real stage name.
           Without this, the chart labels every bar with the raw ObjectId
           (or the literal word "stageId"), so the chart can't be read. */
        let stageNames = {};
        if (groupBy === "stage") {
            stageNames = await this.buildStageNameMap(orgId);
        }
        return results.map((r) => {
            const rawKey = r._id != null ? String(r._id) : "(unassigned)";
            /* Resolve a human label depending on grouping */
            let label = rawKey;
            if (groupBy === "stage") {
                label = stageNames[rawKey] || "(no stage)";
            }
            else if (groupBy === "month" && r._id && typeof r._id === "object") {
                const m = r._id;
                if (m.y && m.m)
                    label = `${m.y}-${String(m.m).padStart(2, "0")}`;
            }
            else if (groupBy === "week" && r._id && typeof r._id === "object") {
                const w = r._id;
                if (w.y && w.w != null)
                    label = `${w.y} W${w.w}`;
            }
            else if (groupBy === "owner") {
                label = rawKey === "(unassigned)" ? "Unassigned" : rawKey;
            }
            return {
                key: rawKey,
                label,
                totalValue: safeInt(r.totalValue),
                weightedValue: safeInt(r.weightedValue),
                commitValue: safeInt(r.commitValue),
                bestCaseValue: safeInt(r.bestCaseValue),
                dealCount: r.dealCount ?? 0,
            };
        });
    }
    /* =====================================================
       PRIVATE — open pipeline aggregation
    ===================================================== */
    async aggregateOpenPipeline(orgId, filters) {
        const match = {
            organizationId: toObjectId(orgId),
            isDeleted: { $ne: true },
            status: "open",
        };
        if (filters.pipelineId && isValidObjectId(filters.pipelineId)) {
            match.pipelineId = toObjectId(filters.pipelineId);
        }
        if (filters.ownerId && isValidObjectId(filters.ownerId)) {
            match.assignedTo = toObjectId(filters.ownerId);
        }
        const result = await Deal.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalValue: { $sum: "$value" },
                    weightedValue: { $sum: { $multiply: ["$value", { $divide: ["$probability", 100] }] } },
                    commitValue: {
                        $sum: {
                            $cond: [
                                { $gte: ["$probability", FORECAST_CONFIG.buckets.commit.minProbability] },
                                "$value",
                                0,
                            ],
                        },
                    },
                    bestCaseValue: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: ["$probability", FORECAST_CONFIG.buckets.bestCase.minProbability] },
                                        { $lt: ["$probability", FORECAST_CONFIG.buckets.commit.minProbability] },
                                    ],
                                },
                                "$value",
                                0,
                            ],
                        },
                    },
                    avgDealSize: { $avg: "$value" },
                    avgProbability: { $avg: "$probability" },
                    openCount: { $sum: 1 },
                    commitCount: {
                        $sum: {
                            $cond: [
                                { $gte: ["$probability", FORECAST_CONFIG.buckets.commit.minProbability] },
                                1,
                                0,
                            ],
                        },
                    },
                    bestCaseCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $gte: ["$probability", FORECAST_CONFIG.buckets.bestCase.minProbability] },
                                        { $lt: ["$probability", FORECAST_CONFIG.buckets.commit.minProbability] },
                                    ],
                                },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
        ]);
        const r = result[0] ?? {};
        return {
            totalValue: r.totalValue ?? 0,
            weightedValue: r.weightedValue ?? 0,
            commitValue: r.commitValue ?? 0,
            bestCaseValue: r.bestCaseValue ?? 0,
            avgDealSize: r.avgDealSize ?? 0,
            avgProbability: r.avgProbability ?? 0,
            openCount: r.openCount ?? 0,
            commitCount: r.commitCount ?? 0,
            bestCaseCount: r.bestCaseCount ?? 0,
        };
    }
    /* =====================================================
       PRIVATE — closed deals aggregation (within window)
    ===================================================== */
    async aggregateClosedDeals(orgId, start, end, filters) {
        const match = {
            organizationId: toObjectId(orgId),
            isDeleted: { $ne: true },
            status: { $in: ["won", "lost"] },
            actualCloseDate: { $gte: start, $lte: end },
        };
        if (filters.pipelineId && isValidObjectId(filters.pipelineId)) {
            match.pipelineId = toObjectId(filters.pipelineId);
        }
        if (filters.ownerId && isValidObjectId(filters.ownerId)) {
            match.assignedTo = toObjectId(filters.ownerId);
        }
        const result = await Deal.aggregate([
            { $match: match },
            {
                $group: {
                    _id: "$status",
                    value: { $sum: "$value" },
                    count: { $sum: 1 },
                },
            },
        ]);
        let wonValue = 0;
        let lostValue = 0;
        let wonCount = 0;
        let lostCount = 0;
        for (const r of result) {
            if (r._id === "won") {
                wonValue = r.value ?? 0;
                wonCount = r.count ?? 0;
            }
            if (r._id === "lost") {
                lostValue = r.value ?? 0;
                lostCount = r.count ?? 0;
            }
        }
        return { wonValue, lostValue, wonCount, lostCount };
    }
    /* =====================================================
       PRIVATE — hygiene signals (overdue, stalled)
    ===================================================== */
    async aggregateHygieneSignals(orgId, _filters) {
        const now = new Date();
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const baseMatch = {
            organizationId: toObjectId(orgId),
            isDeleted: { $ne: true },
            status: "open",
        };
        const [overdueCount, stalledCount] = await Promise.all([
            Deal.countDocuments({
                ...baseMatch,
                expectedCloseDate: { $lt: now },
            }),
            Deal.countDocuments({
                ...baseMatch,
                lastActivityAt: { $lt: fourteenDaysAgo },
            }),
        ]);
        return { overdueCount, stalledCount };
    }
    /* =====================================================
       INSIGHTS ENGINE
       Produces structured, explainable insights — not just strings.
    ===================================================== */
    generateInsights(summary, metrics) {
        const insights = [];
        const cfg = FORECAST_CONFIG.insights;
        /* ── Pipeline health ── */
        if (metrics.pipelineHealth < cfg.lowPipelineHealth && metrics.openDeals > 0) {
            insights.push({
                level: "warning",
                category: "health",
                message: "Pipeline health is below healthy threshold",
                reasoning: [
                    `Weighted/total ratio: ${metrics.pipelineHealth.toFixed(2)}`,
                    `Healthy threshold: ${cfg.lowPipelineHealth}`,
                    "Most open deals have low probability — review qualification",
                ],
                metric: metrics.pipelineHealth,
            });
        }
        /* ── Conversion rate ── */
        if (metrics.conversionRate < cfg.lowConversionRate && metrics.openDeals > 5) {
            insights.push({
                level: "warning",
                category: "conversion",
                message: "Few open deals are in the commit bucket",
                reasoning: [
                    `Only ${metrics.commitDeals}/${metrics.openDeals} deals at ≥70% probability`,
                    `Conversion rate: ${metrics.conversionRate}%`,
                ],
                metric: metrics.conversionRate,
            });
        }
        /* ── Forecast strength ── */
        if (summary.totalPipelineValue > 0 &&
            summary.weightedForecast / summary.totalPipelineValue < cfg.weakForecastRatio) {
            insights.push({
                level: "warning",
                category: "forecast_accuracy",
                message: "Weighted forecast is weak relative to pipeline size",
                reasoning: [
                    `Weighted: ₹${summary.weightedForecast.toLocaleString("en-IN")}`,
                    `Total pipeline: ₹${summary.totalPipelineValue.toLocaleString("en-IN")}`,
                    "Consider re-qualifying low-probability deals",
                ],
            });
        }
        /* ── Overdue deals ── */
        if (metrics.overdueDeals >= cfg.overdueDealsThreshold) {
            insights.push({
                level: "critical",
                category: "hygiene",
                message: `${metrics.overdueDeals} deals are past their expected close date`,
                reasoning: [
                    "Overdue deals distort forecast accuracy",
                    "Update expected close dates or move deals to a realistic stage",
                ],
                metric: metrics.overdueDeals,
            });
        }
        /* ── Stalled deals ── */
        if (metrics.stalledDeals >= cfg.stalledDealsThreshold) {
            insights.push({
                level: "warning",
                category: "velocity",
                message: `${metrics.stalledDeals} deals have been inactive for 14+ days`,
                reasoning: [
                    "Stalled deals are unlikely to close in current cycle",
                    "Re-engage or mark as lost to clean up the pipeline",
                ],
                metric: metrics.stalledDeals,
            });
        }
        /* ── Win rate signal ── */
        if (metrics.closedWon + metrics.closedLost >= 10) {
            if (metrics.winRate >= 50) {
                insights.push({
                    level: "positive",
                    category: "conversion",
                    message: `Strong win rate: ${metrics.winRate}%`,
                    metric: metrics.winRate,
                });
            }
            else if (metrics.winRate < 20) {
                insights.push({
                    level: "critical",
                    category: "conversion",
                    message: `Win rate is critically low: ${metrics.winRate}%`,
                    reasoning: [
                        `${metrics.closedWon} won / ${metrics.closedLost} lost`,
                        "Review qualification, ICP fit, and competitive positioning",
                    ],
                    metric: metrics.winRate,
                });
            }
        }
        /* ── No issues ── */
        if (insights.length === 0) {
            insights.push({
                level: "positive",
                category: "health",
                message: "Forecast looks strong — no major issues detected",
            });
        }
        return insights;
    }
}
export default new ForecastService();
//# sourceMappingURL=forecast.service.js.map