// brain.types.ts
export const PRIORITY_LEVELS = [
    "low",
    "medium",
    "high",
    "critical",
];
/** Numeric rank — lower number = more urgent. Useful for sorting. */
export const PRIORITY_RANK = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};
export const BRAIN_SIGNAL_TYPES = [
    "STALLED",
    "COLD",
    "HOT",
    "RE_ENGAGED",
    "HIGH_VALUE_NO_REPLY",
    "ENTERPRISE_DEAL",
    "FAST_MOVING",
    "STAGE_STAGNATION",
    "RAPID_STAGE_PROGRESSION",
    "HIGH_RISK",
    "CLOSE_DATE_OVERDUE",
    "CLOSE_DATE_AT_RISK",
    "CHURN_RISK",
    "QUALIFICATION_GAP",
    "FIT_MISMATCH",
    "COMPETITOR_THREAT",
    "PRICING_OBJECTION",
    "AI_RECOMMENDATION",
    "ANOMALY_DETECTED",
];
export const SIGNAL_CATEGORY_MAP = {
    STALLED: "engagement",
    COLD: "engagement",
    HOT: "engagement",
    RE_ENGAGED: "engagement",
    HIGH_VALUE_NO_REPLY: "value",
    ENTERPRISE_DEAL: "value",
    FAST_MOVING: "velocity",
    STAGE_STAGNATION: "velocity",
    RAPID_STAGE_PROGRESSION: "velocity",
    HIGH_RISK: "risk",
    CLOSE_DATE_OVERDUE: "risk",
    CLOSE_DATE_AT_RISK: "risk",
    CHURN_RISK: "risk",
    QUALIFICATION_GAP: "qualification",
    FIT_MISMATCH: "qualification",
    COMPETITOR_THREAT: "competitive",
    PRICING_OBJECTION: "competitive",
    AI_RECOMMENDATION: "ai",
    ANOMALY_DETECTED: "ai",
};
/* =====================================================
   TYPE GUARDS — runtime validation helpers
===================================================== */
export function isPriorityLevel(value) {
    return typeof value === "string" && PRIORITY_LEVELS.includes(value);
}
export function isBrainSignalType(value) {
    return typeof value === "string" && BRAIN_SIGNAL_TYPES.includes(value);
}
export function isBrainSignal(value) {
    if (!value || typeof value !== "object")
        return false;
    const v = value;
    return (isBrainSignalType(v.type) &&
        isPriorityLevel(v.severity) &&
        typeof v.message === "string");
}
/* =====================================================
   UTILITY HELPERS
===================================================== */
/**
 * Compare two priority levels.
 * Returns negative if a is more urgent than b, positive if less.
 */
export function comparePriorityLevels(a, b) {
    return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}
/** Get the more urgent of two priorities. */
export function maxPriority(a, b) {
    return PRIORITY_RANK[a] <= PRIORITY_RANK[b] ? a : b;
}
/** Auto-derive category from signal type */
export function getSignalCategory(type) {
    return SIGNAL_CATEGORY_MAP[type];
}
//# sourceMappingURL=brain.types.js.map