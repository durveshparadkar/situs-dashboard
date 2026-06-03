/* =====================================================
   DEFAULT CONFIG (READY FOR DB OVERRIDE)
===================================================== */
const DEFAULT_CONFIG = {
    staleAfterDays: 5,
    highBudgetThreshold: 1_000_000,
    criticalScore: 85,
    highScore: 70,
    mediumScore: 40,
};
/* =====================================================
   HELPERS
===================================================== */
function safeDate(date) {
    return date ? new Date(date) : new Date();
}
function calculateDaysInactive(date) {
    const diff = Date.now() - date.getTime();
    return Math.max(0, diff / (1000 * 60 * 60 * 24));
}
/* =====================================================
   🚀 PRIORITY ENGINE (ENTERPRISE SAFE)
===================================================== */
export function recalculatePriority(lead, config = DEFAULT_CONFIG) {
    /* ================= SAFE VALUES ================= */
    const lastActivity = safeDate(lead.lastActivityAt || lead.createdAt);
    const daysInactive = calculateDaysInactive(lastActivity);
    const isStale = daysInactive >= config.staleAfterDays;
    let priority = "low";
    const score = lead.leadScore ?? 0;
    const budget = lead.budget ?? 0;
    /* =====================================================
       1️⃣ SCORE BASED
    ===================================================== */
    if (score >= config.criticalScore) {
        priority = "critical";
    }
    else if (score >= config.highScore) {
        priority = "high";
    }
    else if (score >= config.mediumScore) {
        priority = "medium";
    }
    /* =====================================================
       2️⃣ HIGH VALUE FLOOR
    ===================================================== */
    if (budget >= config.highBudgetThreshold && priority === "low") {
        priority = "medium";
    }
    /* =====================================================
       3️⃣ STALE ESCALATION (SMART)
    ===================================================== */
    if (isStale) {
        const escalationMap = {
            low: "medium",
            medium: "high",
            high: "high",
            critical: "critical",
        };
        priority = escalationMap[priority];
    }
    /* =====================================================
       4️⃣ AI SIGNAL OVERRIDE
    ===================================================== */
    const hasCriticalSignal = lead.brainSnapshot?.signals?.some((s) => s.severity === "critical") ?? false;
    if (hasCriticalSignal) {
        priority = "critical";
    }
    /* =====================================================
       FINAL
    ===================================================== */
    return {
        priority,
        isStale,
        daysInactive: Number(daysInactive.toFixed(1)),
    };
}
//# sourceMappingURL=leadPriority.engine.js.map