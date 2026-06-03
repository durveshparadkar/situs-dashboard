// signals.engine.ts
import { SIGNAL_CATEGORY_MAP, } from "./brain.types.js";
/* =====================================================
   ENGINE VERSION
===================================================== */
export const SIGNALS_ENGINE_VERSION = "2.0.0";
/* =====================================================
   CONFIG — every threshold in one place
===================================================== */
export const SIGNALS_CONFIG = {
    /* Inactivity-based detection */
    inactivity: {
        stalledDays: 7,
        extremeStalledDays: 21,
        coldDays: 14,
    },
    /* Deal value thresholds (INR) */
    value: {
        high: 100_000, // 1 Lakh
        veryHigh: 1_000_000, // 10 Lakh
        enterprise: 5_000_000, // 50 Lakh
    },
    /* Score-based thresholds */
    score: {
        hot: 75,
        veryHot: 90,
        cold: 30,
        veryCold: 15,
    },
    /* High-value-no-reply detector */
    highValueNoReply: {
        minValue: 100_000,
        minInactivityDays: 5,
    },
    /* High-risk detector */
    highRisk: {
        minValue: 1_000_000,
        minInactivityDays: 10,
    },
    /* Fast moving detector */
    fastMoving: {
        minActivities: 5,
        maxInactivityDays: 3,
    },
    /* Re-engagement detector — was inactive, now active */
    reEngaged: {
        requiresPrevSignal: true, // needs STALLED or COLD in prevSignals
        maxInactivityDays: 2,
    },
    /* Stage stagnation */
    stageStagnation: {
        extremeDays: 60,
        highDays: 30,
        mediumDays: 14,
    },
    /* Close date risk */
    closeDate: {
        imminentDays: 7, // closing within 7 days
        weakProbabilityThreshold: 60, // % below which "imminent" becomes risky
    },
    /* Confidence thresholds (0-100) */
    confidence: {
        stalled: 90,
        hot: 85,
        cold: 80,
        fastMoving: 75,
        highValueNoReply: 90,
        highRisk: 95,
        closeDateOverdue: 100,
        closeDateAtRisk: 80,
        stageStagnation: 80,
        reEngaged: 70,
        enterpriseDeal: 100,
    },
};
/* =====================================================
   HELPERS
===================================================== */
function buildSignal(type, severity, message, opts = {}) {
    const signal = {
        type,
        category: SIGNAL_CATEGORY_MAP[type],
        severity,
        message,
        detectedAt: new Date(),
    };
    if (opts.confidence !== undefined)
        signal.confidence = opts.confidence;
    if (opts.reasoning?.length)
        signal.reasoning = opts.reasoning;
    if (opts.isPositive !== undefined)
        signal.isPositive = opts.isPositive;
    if (opts.metadata)
        signal.metadata = opts.metadata;
    return signal;
}
function formatINR(value) {
    if (value >= 10_000_000)
        return `₹${(value / 10_000_000).toFixed(1)}Cr`;
    if (value >= 100_000)
        return `₹${(value / 100_000).toFixed(1)}L`;
    return `₹${value.toLocaleString("en-IN")}`;
}
/* =====================================================
   PRIVATE — SIGNAL DETECTORS
   Each is pure, isolated, and returns 0 or 1 signal.
===================================================== */
const detectStalled = (ctx) => {
    const days = ctx.daysSinceLastActivity;
    const cfg = SIGNALS_CONFIG.inactivity;
    if (days < cfg.stalledDays)
        return null;
    const isCritical = days >= cfg.extremeStalledDays;
    const severity = isCritical ? "critical" : "high";
    return buildSignal("STALLED", severity, `Lead inactive for ${days} days`, {
        confidence: SIGNALS_CONFIG.confidence.stalled,
        reasoning: [
            `${days} days since last activity`,
            isCritical ? "Past extreme stagnation threshold" : "Past stalled threshold",
        ],
        isPositive: false,
        metadata: { daysInactive: days },
    });
};
const detectHighValueNoReply = (ctx) => {
    const value = ctx.dealValue ?? 0;
    const days = ctx.daysSinceLastActivity;
    const cfg = SIGNALS_CONFIG.highValueNoReply;
    if (value < cfg.minValue)
        return null;
    if (days < cfg.minInactivityDays)
        return null;
    const isCritical = value >= SIGNALS_CONFIG.value.veryHigh;
    return buildSignal("HIGH_VALUE_NO_REPLY", isCritical ? "critical" : "high", "High-value deal with no recent engagement", {
        confidence: SIGNALS_CONFIG.confidence.highValueNoReply,
        reasoning: [
            `Deal value: ${formatINR(value)}`,
            `Inactive for ${days} days`,
        ],
        isPositive: false,
        metadata: { dealValue: value, daysInactive: days },
    });
};
const detectFastMoving = (ctx) => {
    const cfg = SIGNALS_CONFIG.fastMoving;
    if (ctx.activityCount < cfg.minActivities)
        return null;
    if (!ctx.stageChangedRecently)
        return null;
    if (ctx.daysSinceLastActivity > cfg.maxInactivityDays)
        return null;
    return buildSignal("FAST_MOVING", "medium", "Lead progressing quickly through pipeline", {
        confidence: SIGNALS_CONFIG.confidence.fastMoving,
        reasoning: [
            ` ${ctx.activityCount} recent activities`,
            "Stage changed recently",
            `Last activity ${ctx.daysSinceLastActivity}d ago`,
        ],
        isPositive: true,
    });
};
const detectHot = (ctx, score) => {
    const cfg = SIGNALS_CONFIG.score;
    if (score < cfg.hot)
        return null;
    if (ctx.daysSinceLastActivity > 3)
        return null;
    const isCritical = score >= cfg.veryHot;
    return buildSignal("HOT", isCritical ? "critical" : "high", "Highly engaged and active lead", {
        confidence: SIGNALS_CONFIG.confidence.hot,
        reasoning: [
            `Score: ${score}/100`,
            `Active within last ${ctx.daysSinceLastActivity} day(s)`,
        ],
        isPositive: true,
        metadata: { score },
    });
};
const detectCold = (ctx, score) => {
    const cfg = SIGNALS_CONFIG.score;
    const inactivityDays = ctx.daysSinceLastActivity;
    if (score > cfg.cold)
        return null;
    if (inactivityDays < SIGNALS_CONFIG.inactivity.stalledDays)
        return null;
    const isHigh = inactivityDays >= SIGNALS_CONFIG.inactivity.extremeStalledDays;
    return buildSignal("COLD", isHigh ? "high" : "medium", "Low engagement and inactive lead", {
        confidence: SIGNALS_CONFIG.confidence.cold,
        reasoning: [
            `Score: ${score}/100 (below cold threshold)`,
            `Inactive for ${inactivityDays} days`,
        ],
        isPositive: false,
        metadata: { score, daysInactive: inactivityDays },
    });
};
const detectHighRisk = (ctx) => {
    const value = ctx.dealValue ?? 0;
    const days = ctx.daysSinceLastActivity;
    const cfg = SIGNALS_CONFIG.highRisk;
    if (value < cfg.minValue)
        return null;
    if (days < cfg.minInactivityDays)
        return null;
    return buildSignal("HIGH_RISK", "critical", "High-value deal at risk due to inactivity", {
        confidence: SIGNALS_CONFIG.confidence.highRisk,
        reasoning: [
            `Deal value: ${formatINR(value)}`,
            `Inactive for ${days} days — momentum lost`,
        ],
        isPositive: false,
        metadata: { dealValue: value, daysInactive: days },
    });
};
const detectEnterpriseDeal = (ctx) => {
    const value = ctx.dealValue ?? 0;
    if (value < SIGNALS_CONFIG.value.enterprise)
        return null;
    return buildSignal("ENTERPRISE_DEAL", "high", `Enterprise-tier deal: ${formatINR(value)}`, {
        confidence: SIGNALS_CONFIG.confidence.enterpriseDeal,
        reasoning: [`Deal value: ${formatINR(value)} qualifies as enterprise`],
        isPositive: true,
        metadata: { dealValue: value },
    });
};
const detectReEngaged = (ctx) => {
    const cfg = SIGNALS_CONFIG.reEngaged;
    if (ctx.daysSinceLastActivity > cfg.maxInactivityDays)
        return null;
    if (cfg.requiresPrevSignal) {
        const wasInactive = ctx.prevSignals?.some((s) => s === "STALLED" || s === "COLD");
        if (!wasInactive)
            return null;
    }
    return buildSignal("RE_ENGAGED", "medium", "Lead has re-engaged after period of inactivity", {
        confidence: SIGNALS_CONFIG.confidence.reEngaged,
        reasoning: [
            "Previously stalled or cold",
            `Active within last ${ctx.daysSinceLastActivity} day(s)`,
        ],
        isPositive: true,
    });
};
const detectStageStagnation = (ctx) => {
    const days = ctx.daysInCurrentStage;
    if (days === undefined || days === null)
        return null;
    const cfg = SIGNALS_CONFIG.stageStagnation;
    let severity = null;
    let detail = "";
    if (days >= cfg.extremeDays) {
        severity = "critical";
        detail = `Stuck in stage for ${days} days`;
    }
    else if (days >= cfg.highDays) {
        severity = "high";
        detail = `In stage for ${days} days`;
    }
    else if (days >= cfg.mediumDays) {
        severity = "medium";
        detail = `In stage for ${days} days`;
    }
    if (!severity)
        return null;
    return buildSignal("STAGE_STAGNATION", severity, detail, {
        confidence: SIGNALS_CONFIG.confidence.stageStagnation,
        reasoning: [
            ` ${days} days in current stage (${ctx.stage})`,
            "Above stagnation threshold",
        ],
        isPositive: false,
        metadata: { daysInCurrentStage: days, stage: ctx.stage },
    });
};
const detectCloseDateOverdue = (ctx) => {
    if (!ctx.expectedCloseDate)
        return null;
    const close = new Date(ctx.expectedCloseDate).getTime();
    const now = Date.now();
    const daysOut = (close - now) / (1000 * 60 * 60 * 24);
    if (daysOut >= 0)
        return null; // not overdue
    const overdueDays = Math.floor(-daysOut);
    const severity = overdueDays > 14 ? "critical" : "high";
    return buildSignal("CLOSE_DATE_OVERDUE", severity, `Expected close date passed ${overdueDays} day(s) ago`, {
        confidence: SIGNALS_CONFIG.confidence.closeDateOverdue,
        reasoning: [
            `Expected close date: ${new Date(ctx.expectedCloseDate).toLocaleDateString("en-IN")}`,
            `${overdueDays} days overdue`,
        ],
        isPositive: false,
        metadata: { overdueDays },
    });
};
const detectCloseDateAtRisk = (ctx) => {
    if (!ctx.expectedCloseDate)
        return null;
    const close = new Date(ctx.expectedCloseDate).getTime();
    const now = Date.now();
    const daysOut = (close - now) / (1000 * 60 * 60 * 24);
    const cfg = SIGNALS_CONFIG.closeDate;
    if (daysOut < 0 || daysOut > cfg.imminentDays)
        return null;
    const stageProb = ctx.stageProbability ?? 0;
    const isShaky = stageProb < cfg.weakProbabilityThreshold ||
        ctx.daysSinceLastActivity > 5;
    if (!isShaky)
        return null;
    return buildSignal("CLOSE_DATE_AT_RISK", "high", `Closing in ${Math.floor(daysOut)} day(s) but momentum is weak`, {
        confidence: SIGNALS_CONFIG.confidence.closeDateAtRisk,
        reasoning: [
            `Only ${Math.floor(daysOut)} days to expected close`,
            stageProb < cfg.weakProbabilityThreshold
                ? `Stage probability only ${stageProb}%`
                : `Last activity ${ctx.daysSinceLastActivity}d ago`,
        ],
        isPositive: false,
        metadata: { daysToClose: Math.floor(daysOut), probability: stageProb },
    });
};
/* =====================================================
   DETECTOR REGISTRY
   Order matters — detectors run top-down.
   You can disable any one by commenting it out.
===================================================== */
const ALL_DETECTORS = [
    { name: "stalled", detector: detectStalled },
    { name: "high_value_no_reply", detector: detectHighValueNoReply },
    { name: "fast_moving", detector: detectFastMoving },
    { name: "hot", detector: detectHot },
    { name: "cold", detector: detectCold },
    { name: "high_risk", detector: detectHighRisk },
    { name: "enterprise_deal", detector: detectEnterpriseDeal },
    { name: "re_engaged", detector: detectReEngaged },
    { name: "stage_stagnation", detector: detectStageStagnation },
    { name: "close_date_overdue", detector: detectCloseDateOverdue },
    { name: "close_date_at_risk", detector: detectCloseDateAtRisk },
];
/* =====================================================
   PUBLIC — DETECT SIGNALS
===================================================== */
/**
 * Analyze a lead context and return all detected signals.
 * Each detector runs in isolation — one failure doesn't break the others.
 */
export function detectSignals(context, score) {
    if (!context)
        return [];
    const signals = [];
    for (const { name, detector } of ALL_DETECTORS) {
        try {
            const signal = detector(context, score);
            if (signal)
                signals.push(signal);
        }
        catch {
            // One failing detector should never break the whole signal pipeline.
            // Logged at the brain.engine layer where context is available.
            continue;
        }
    }
    /* Mutually exclusive cleanup: HOT + COLD is contradictory.
       If both somehow fire, keep only the higher-confidence one. */
    const hasHot = signals.some((s) => s.type === "HOT");
    const hasCold = signals.some((s) => s.type === "COLD");
    if (hasHot && hasCold) {
        return signals.filter((s) => s.type !== "COLD");
    }
    /* Sort by severity (most urgent first) for consistent UI rendering */
    const PRIORITY_RANK = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
    };
    return signals.sort((a, b) => PRIORITY_RANK[a.severity] - PRIORITY_RANK[b.severity]);
}
/* =====================================================
   TEST HELPERS
===================================================== */
export const _internal = {
    detectStalled,
    detectHighValueNoReply,
    detectFastMoving,
    detectHot,
    detectCold,
    detectHighRisk,
    detectEnterpriseDeal,
    detectReEngaged,
    detectStageStagnation,
    detectCloseDateOverdue,
    detectCloseDateAtRisk,
    buildSignal,
    formatINR,
};
//# sourceMappingURL=signals.engine.js.map