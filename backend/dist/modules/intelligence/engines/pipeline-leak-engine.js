// pipeline-leak.engine.ts
//
// Pipeline leak detection. Where deal-risk.engine.ts evaluates INDIVIDUAL
// deals and forecast-risk.engine.ts evaluates the FORECAST as a whole,
// this engine looks at the PIPELINE STRUCTURE — where revenue is bottlenecked,
// where stages are clogged, where the funnel shape is wrong.
//
// "Leak" patterns this engine surfaces:
//   - Stage clog: too much money sitting in one stage too long
//   - Stage starvation: pipeline drying up at top
//   - Velocity drop: deals taking longer than usual to advance
//   - Conversion drop: stage-to-stage conversion below expected
//   - Stage imbalance: 80% of pipeline value stuck in late stages
//   - Old deals: deals significantly older than typical sales cycle
//
// Used for:
//   - Sales manager's "Pipeline Health" dashboard
//   - Weekly pipeline review: where's the friction?
//   - Process diagnosis: "why aren't deals advancing past Discovery?"
//   - Coaching signals: which reps have which leak patterns
//
// Pure heuristic, deterministic, no I/O.
import { formatCurrency } from "../../shared/utils/currency.js";
// ============================================================
// VERSIONING
// ============================================================
export const PIPELINE_LEAK_ENGINE_VERSION = "1.0.0";
// ============================================================
// CONFIG
// ============================================================
const PIPELINE_LEAK_CONFIG = {
    /** Stage clog — too much value parked in one stage */
    stageClog: {
        minValue: 2_000_000, // ₹20 Lakh+ (or equivalent in org's currency)
        minDealCount: 2,
        minAvgInactivity: 10,
        severity: "high",
    },
    /** Severe clog — significantly above clog threshold */
    severeClog: {
        minValue: 10_000_000, // ₹1 Cr+ (or equivalent)
        minDealCount: 3,
        minAvgInactivity: 14,
        severity: "critical",
    },
    /** Stage starvation — top-of-funnel running dry */
    starvation: {
        earlyStages: ["DISCOVERY", "QUALIFICATION"],
        minPipelineForCheck: 1_000_000, // only check when pipeline > ₹10 Lakh (or equivalent)
        earlyShareMin: 0.15, // early stages should hold 15%+ of pipeline
        severity: "high",
    },
    /** Late-stage concentration — 80%+ value in late stages = drought coming */
    lateStageConcentration: {
        lateStages: ["NEGOTIATION", "VERBAL_COMMIT", "CONTRACT_SENT"],
        lateShareMax: 0.8,
        severity: "medium",
    },
    /** Old deals — deals significantly older than typical cycle */
    oldDeals: {
        ageDaysThreshold: 90,
        minCount: 3,
        severity: "medium",
    },
    /** Single-deal whale — one deal so large it dominates pipeline */
    whaleConcentration: {
        pipelineShareMin: 0.5, // single deal = 50%+ of total pipeline
        severity: "high",
    },
    /** How many leak types max per result — prevents noise */
    maxLeaksReturned: 20,
};
export const PIPELINE_LEAK_TYPES = {
    STAGE_CLOG: "stage_clog",
    SEVERE_STAGE_CLOG: "severe_stage_clog",
    STAGE_STARVATION: "stage_starvation",
    LATE_STAGE_CONCENTRATION: "late_stage_concentration",
    OLD_DEAL_CLUSTER: "old_deal_cluster",
    WHALE_CONCENTRATION: "whale_concentration",
};
/**
 * Canonical stage names.
 */
export const PIPELINE_LEAK_STAGES = {
    DISCOVERY: "DISCOVERY",
    QUALIFICATION: "QUALIFICATION",
    PROPOSAL_SENT: "PROPOSAL_SENT",
    NEGOTIATION: "NEGOTIATION",
    VERBAL_COMMIT: "VERBAL_COMMIT",
    CONTRACT_SENT: "CONTRACT_SENT",
};
// ============================================================
// HELPERS
// ============================================================
const SEVERITY_RANK = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
};
function compareSeverity(a, b) {
    return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}
function normalizeStageName(stage) {
    if (!stage)
        return "";
    const upper = stage.trim().toUpperCase().replace(/\s+/g, "_");
    if (upper === "PROPOSAL")
        return PIPELINE_LEAK_STAGES.PROPOSAL_SENT;
    if (upper === "CONTRACT")
        return PIPELINE_LEAK_STAGES.CONTRACT_SENT;
    if (upper === "QUALIFYING")
        return PIPELINE_LEAK_STAGES.QUALIFICATION;
    return upper;
}
function humanizeStage(stage) {
    return stage.toLowerCase().replace(/_/g, " ");
}
function isOpenDeal(s) {
    return (s.status !== "won" &&
        s.status !== "lost" &&
        s.status !== "abandoned");
}
/**
 * @deprecated Use formatCurrency() from shared/utils/currency.ts instead.
 * Kept as a thin wrapper only in case anything external still imports
 * this — always formats as INR regardless of org currency.
 */
function formatINR(rupees) {
    return formatCurrency(rupees, "INR");
}
function aggregateByStage(deals) {
    const map = new Map();
    for (const d of deals) {
        const stage = normalizeStageName(d.stage);
        if (!stage)
            continue;
        const existing = map.get(stage) ?? {
            stage,
            dealCount: 0,
            totalValue: 0,
            totalInactivity: 0,
            totalAge: 0,
            dealIds: [],
        };
        existing.dealCount += 1;
        existing.totalValue += d.value;
        existing.totalInactivity += d.lastActivityDays;
        existing.totalAge += d.ageDays ?? 0;
        if (d.dealId !== undefined)
            existing.dealIds.push(d.dealId);
        map.set(stage, existing);
    }
    return map;
}
function buildStageMetrics(aggregates, totalPipelineValue) {
    const result = [];
    for (const agg of aggregates.values()) {
        result.push({
            stage: agg.stage,
            dealCount: agg.dealCount,
            totalValue: agg.totalValue,
            avgValue: agg.dealCount > 0 ? Math.round(agg.totalValue / agg.dealCount) : 0,
            avgInactivityDays: agg.dealCount > 0
                ? Math.round((agg.totalInactivity / agg.dealCount) * 10) / 10
                : 0,
            avgAgeDays: agg.dealCount > 0
                ? Math.round((agg.totalAge / agg.dealCount) * 10) / 10
                : 0,
            shareOfPipeline: totalPipelineValue > 0
                ? Math.round((agg.totalValue / totalPipelineValue) * 1000) / 1000
                : 0,
        });
    }
    result.sort((a, b) => b.totalValue - a.totalValue);
    return result;
}
// ============================================================
// LEAK DETECTORS
// currency is the org's currency for the whole run, passed down
// from detectPipelineLeaks's top-level parameter.
// ============================================================
function detectStageClog(agg, currency) {
    const avgInactivity = agg.totalInactivity / agg.dealCount;
    // Check severe first
    if (agg.totalValue >= PIPELINE_LEAK_CONFIG.severeClog.minValue &&
        agg.dealCount >= PIPELINE_LEAK_CONFIG.severeClog.minDealCount &&
        avgInactivity >= PIPELINE_LEAK_CONFIG.severeClog.minAvgInactivity) {
        return {
            type: PIPELINE_LEAK_TYPES.SEVERE_STAGE_CLOG,
            stage: agg.stage,
            severity: "critical",
            totalValue: agg.totalValue,
            dealCount: agg.dealCount,
            avgInactivityDays: Math.round(avgInactivity * 10) / 10,
            message: formatCurrency(agg.totalValue, currency) + " across " + agg.dealCount +
                " deals severely stuck in " + humanizeStage(agg.stage) +
                " (" + Math.round(avgInactivity) + " days avg inactivity)",
            recommendedAction: "Audit each deal in " + humanizeStage(agg.stage) +
                " — many will need escalation, repricing, or closing out",
            ...(agg.dealIds.length > 0 && { dealIds: agg.dealIds }),
        };
    }
    // Then regular clog
    if (agg.totalValue >= PIPELINE_LEAK_CONFIG.stageClog.minValue &&
        agg.dealCount >= PIPELINE_LEAK_CONFIG.stageClog.minDealCount &&
        avgInactivity >= PIPELINE_LEAK_CONFIG.stageClog.minAvgInactivity) {
        return {
            type: PIPELINE_LEAK_TYPES.STAGE_CLOG,
            stage: agg.stage,
            severity: "high",
            totalValue: agg.totalValue,
            dealCount: agg.dealCount,
            avgInactivityDays: Math.round(avgInactivity * 10) / 10,
            message: formatCurrency(agg.totalValue, currency) + " stuck in " + humanizeStage(agg.stage) +
                " across " + agg.dealCount + " deals (avg " +
                Math.round(avgInactivity) + " days inactive)",
            recommendedAction: "Run a stage-specific cleanup — push deals forward, close out stalled ones",
            ...(agg.dealIds.length > 0 && { dealIds: agg.dealIds }),
        };
    }
    return null;
}
function detectStarvation(aggregates, totalPipelineValue) {
    if (totalPipelineValue < PIPELINE_LEAK_CONFIG.starvation.minPipelineForCheck) {
        return null;
    }
    const earlyStages = PIPELINE_LEAK_CONFIG.starvation.earlyStages;
    let earlyValue = 0;
    let earlyCount = 0;
    for (const stage of earlyStages) {
        const agg = aggregates.get(stage);
        if (agg) {
            earlyValue += agg.totalValue;
            earlyCount += agg.dealCount;
        }
    }
    const earlyShare = totalPipelineValue > 0 ? earlyValue / totalPipelineValue : 0;
    if (earlyShare < PIPELINE_LEAK_CONFIG.starvation.earlyShareMin) {
        return {
            type: PIPELINE_LEAK_TYPES.STAGE_STARVATION,
            severity: "high",
            totalValue: earlyValue,
            dealCount: earlyCount,
            message: "Only " + Math.round(earlyShare * 100) + "% of pipeline is in early stages — " +
                "next quarter's revenue is at risk",
            recommendedAction: "Step up top-of-funnel: outbound, marketing, partner referrals — " +
                "your future pipeline starts now",
        };
    }
    return null;
}
function detectLateStageConcentration(aggregates, totalPipelineValue) {
    if (totalPipelineValue === 0)
        return null;
    const lateStages = PIPELINE_LEAK_CONFIG.lateStageConcentration.lateStages;
    let lateValue = 0;
    let lateCount = 0;
    for (const stage of lateStages) {
        const agg = aggregates.get(stage);
        if (agg) {
            lateValue += agg.totalValue;
            lateCount += agg.dealCount;
        }
    }
    const lateShare = lateValue / totalPipelineValue;
    if (lateShare > PIPELINE_LEAK_CONFIG.lateStageConcentration.lateShareMax) {
        return {
            type: PIPELINE_LEAK_TYPES.LATE_STAGE_CONCENTRATION,
            severity: "medium",
            totalValue: lateValue,
            dealCount: lateCount,
            message: Math.round(lateShare * 100) + "% of pipeline value is in late stages — " +
                "drought coming once they close",
            recommendedAction: "Backfill the pipeline now — focus reps on early-stage prospecting alongside closing",
        };
    }
    return null;
}
function detectOldDealCluster(deals, currency) {
    const oldDeals = deals.filter((d) => (d.ageDays ?? 0) >= PIPELINE_LEAK_CONFIG.oldDeals.ageDaysThreshold);
    if (oldDeals.length < PIPELINE_LEAK_CONFIG.oldDeals.minCount)
        return null;
    const totalValue = oldDeals.reduce((sum, d) => sum + d.value, 0);
    const avgAge = oldDeals.reduce((sum, d) => sum + (d.ageDays ?? 0), 0) / oldDeals.length;
    const dealIds = oldDeals
        .map((d) => d.dealId)
        .filter((id) => id !== undefined);
    return {
        type: PIPELINE_LEAK_TYPES.OLD_DEAL_CLUSTER,
        severity: "medium",
        totalValue,
        dealCount: oldDeals.length,
        message: oldDeals.length + " deals (" + formatCurrency(totalValue, currency) +
            ") older than " + PIPELINE_LEAK_CONFIG.oldDeals.ageDaysThreshold +
            " days — avg age " + Math.round(avgAge) + " days",
        recommendedAction: "Decision time on old deals — either escalate, reprice, or close as lost. " +
            "Pipeline credibility depends on it.",
        ...(dealIds.length > 0 && { dealIds }),
    };
}
function detectWhaleConcentration(deals, totalPipelineValue, currency) {
    if (totalPipelineValue === 0 || deals.length < 3)
        return null;
    // Find single largest deal
    let largest = null;
    for (const d of deals) {
        if (!largest || d.value > largest.value)
            largest = d;
    }
    if (!largest)
        return null;
    const share = largest.value / totalPipelineValue;
    if (share < PIPELINE_LEAK_CONFIG.whaleConcentration.pipelineShareMin)
        return null;
    return {
        type: PIPELINE_LEAK_TYPES.WHALE_CONCENTRATION,
        severity: "high",
        totalValue: largest.value,
        dealCount: 1,
        message: "Single deal '" + largest.name + "' (" + formatCurrency(largest.value, currency) +
            ") is " + Math.round(share * 100) + "% of your pipeline",
        recommendedAction: "Pipeline is fragile — protect this deal AND build depth so one slip doesn't sink the quarter",
        ...(largest.dealId !== undefined && { dealIds: [largest.dealId] }),
    };
}
// ============================================================
// HEALTH SCORE
// ============================================================
/**
 * Compute an overall pipeline health score (0-100, higher = better).
 * Penalizes by leak severity and revenue impact.
 */
function computeHealthScore(leaks, totalPipelineValue) {
    if (totalPipelineValue === 0)
        return 50; // empty pipeline — neutral
    let penalty = 0;
    for (const leak of leaks) {
        // Severity weight
        const severityPenalty = SEVERITY_RANK[leak.severity] * 5;
        // Revenue impact weight (capped to avoid one mega-leak zeroing out score)
        const revenueImpact = Math.min((leak.totalValue / totalPipelineValue) * 30, 30);
        penalty += severityPenalty + revenueImpact;
    }
    const score = Math.max(0, Math.min(100, 100 - penalty));
    return Math.round(score);
}
// ============================================================
// CORE ENGINE
// ============================================================
/**
 * Analyze the full pipeline for structural leaks.
 *
 * @param deals    Deals to analyze (typically an org's open pipeline)
 * @param currency Org's currency for formatted messages. Defaults to
 *                 INR if not passed — safe for existing callers.
 *
 * Returns:
 *   - leaks: detected leak patterns sorted by severity
 *   - stageMetrics: per-stage breakdown for dashboard rendering
 *   - healthScore: 0-100 overall pipeline health
 *   - summary: human-readable hero message
 */
export function detectPipelineLeaks(deals, currency = "INR") {
    const computedAt = new Date();
    // Filter to open deals only
    const openDeals = deals.filter(isOpenDeal);
    const aggregates = aggregateByStage(openDeals);
    const totalPipelineValue = openDeals.reduce((sum, d) => sum + d.value, 0);
    const stageMetrics = buildStageMetrics(aggregates, totalPipelineValue);
    const leaks = [];
    // -----------------------------------------------------------
    // PER-STAGE LEAK DETECTION
    // -----------------------------------------------------------
    for (const agg of aggregates.values()) {
        const clog = detectStageClog(agg, currency);
        if (clog)
            leaks.push(clog);
    }
    // -----------------------------------------------------------
    // PORTFOLIO-LEVEL LEAK DETECTION
    // -----------------------------------------------------------
    const starvation = detectStarvation(aggregates, totalPipelineValue);
    if (starvation)
        leaks.push(starvation);
    const lateConc = detectLateStageConcentration(aggregates, totalPipelineValue);
    if (lateConc)
        leaks.push(lateConc);
    const oldCluster = detectOldDealCluster(openDeals, currency);
    if (oldCluster)
        leaks.push(oldCluster);
    const whale = detectWhaleConcentration(openDeals, totalPipelineValue, currency);
    if (whale)
        leaks.push(whale);
    // -----------------------------------------------------------
    // SORT + CAP
    // -----------------------------------------------------------
    leaks.sort((a, b) => {
        const s = compareSeverity(b.severity, a.severity);
        if (s !== 0)
            return s;
        return b.totalValue - a.totalValue;
    });
    const capped = leaks.slice(0, PIPELINE_LEAK_CONFIG.maxLeaksReturned);
    // -----------------------------------------------------------
    // BREAKDOWNS
    // -----------------------------------------------------------
    const bySeverity = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
    };
    const byType = {
        [PIPELINE_LEAK_TYPES.STAGE_CLOG]: 0,
        [PIPELINE_LEAK_TYPES.SEVERE_STAGE_CLOG]: 0,
        [PIPELINE_LEAK_TYPES.STAGE_STARVATION]: 0,
        [PIPELINE_LEAK_TYPES.LATE_STAGE_CONCENTRATION]: 0,
        [PIPELINE_LEAK_TYPES.OLD_DEAL_CLUSTER]: 0,
        [PIPELINE_LEAK_TYPES.WHALE_CONCENTRATION]: 0,
    };
    for (const leak of capped) {
        bySeverity[leak.severity] += 1;
        byType[leak.type] += 1;
    }
    // -----------------------------------------------------------
    // WORST STAGE (where most leak revenue concentrates)
    // -----------------------------------------------------------
    const stageLeakValue = new Map();
    for (const leak of capped) {
        if (!leak.stage)
            continue;
        const existing = stageLeakValue.get(leak.stage) ?? 0;
        stageLeakValue.set(leak.stage, existing + leak.totalValue);
    }
    let worstStage;
    let worstValue = 0;
    for (const [stage, value] of stageLeakValue.entries()) {
        if (value > worstValue) {
            worstStage = stage;
            worstValue = value;
        }
    }
    // -----------------------------------------------------------
    // HEALTH SCORE + SUMMARY
    // -----------------------------------------------------------
    const healthScore = computeHealthScore(capped, totalPipelineValue);
    const summary = buildSummary(capped, totalPipelineValue, openDeals.length, healthScore, currency);
    const result = {
        leaks: capped,
        stageMetrics,
        totalPipelineValue,
        totalOpenDeals: openDeals.length,
        bySeverity,
        byType,
        healthScore,
        summary,
        engineVersion: PIPELINE_LEAK_ENGINE_VERSION,
        computedAt,
    };
    if (worstStage) {
        result.worstStage = worstStage;
    }
    return result;
}
// ============================================================
// SUMMARY BUILDER
// ============================================================
function buildSummary(leaks, totalPipelineValue, totalOpenDeals, healthScore, currency) {
    if (totalOpenDeals === 0) {
        return "No open deals in pipeline — focus on prospecting";
    }
    if (leaks.length === 0) {
        return "Pipeline is healthy — " + totalOpenDeals + " open deals worth " +
            formatCurrency(totalPipelineValue, currency) + ", health score " + healthScore + "/100";
    }
    const criticalCount = leaks.filter((l) => l.severity === "critical").length;
    const highCount = leaks.filter((l) => l.severity === "high").length;
    if (criticalCount > 0) {
        return criticalCount + " critical leak" + (criticalCount === 1 ? "" : "s") +
            " detected — pipeline health " + healthScore + "/100";
    }
    if (highCount > 0) {
        return highCount + " significant leak" + (highCount === 1 ? "" : "s") +
            " in pipeline — health score " + healthScore + "/100";
    }
    return leaks.length + " minor leak" + (leaks.length === 1 ? "" : "s") +
        " detected — health " + healthScore + "/100, manageable";
}
// ============================================================
// SIGNAL EXTRACTION
// ============================================================
/**
 * Extract PipelineLeakSignals from a Mongoose Deal document.
 * Caller resolves stageId → stageName via Pipeline lookup first.
 */
export function extractPipelineLeakSignals(input) {
    const lastActivityDays = input.lastActivityAt
        ? Math.max(0, Math.floor((Date.now() - input.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
    const signals = {
        name: input.title ?? "Untitled Deal",
        value: input.value ?? 0,
        stage: input.stageName,
        lastActivityDays,
    };
    if (input._id !== undefined)
        signals.dealId = input._id;
    if (input.ageDays !== undefined)
        signals.ageDays = input.ageDays;
    if (input.status !== undefined)
        signals.status = input.status;
    return signals;
}
// ============================================================
// LEGACY-COMPATIBLE WRAPPER
// Preserves original frontend signature during cutover.
// ============================================================
/**
 * @deprecated Use detectPipelineLeaks() for full structured result.
 * Returns the original flat array of leaks matching the frontend type.
 */
export function detectPipelineLeaksLegacy(deals) {
    const signals = deals.map((d) => ({
        name: d.name,
        value: d.value,
        stage: d.stage,
        lastActivityDays: d.lastActivityDays,
    }));
    const result = detectPipelineLeaks(signals);
    // Filter to stage-specific leaks for legacy compatibility
    const stageLeaks = [];
    for (const leak of result.leaks) {
        if (!leak.stage)
            continue;
        if (leak.type !== PIPELINE_LEAK_TYPES.STAGE_CLOG &&
            leak.type !== PIPELINE_LEAK_TYPES.SEVERE_STAGE_CLOG) {
            continue;
        }
        stageLeaks.push({
            stage: leak.stage,
            totalValue: leak.totalValue,
            dealCount: leak.dealCount,
            message: leak.message,
        });
    }
    return stageLeaks;
}
export default detectPipelineLeaks;
//# sourceMappingURL=pipeline-leak-engine.js.map