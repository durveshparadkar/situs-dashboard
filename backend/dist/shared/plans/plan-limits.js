// plan.limits.ts (or wherever this file lives)
//
// @deprecated Backward-compatibility shim. The canonical plan data
// lives in plans.ts. This file re-derives the legacy API surface
// from there so existing callers compile without changes.
//
// Migration:
//   - import { getPlan, hasFeature, getQuota } from "../billing/plans.js";
//   - Replace calls to canAddUser/canAddTeam/isTrialPlan with the
//     equivalents above.
//   - Delete this file once grep -rn "from.*plan.limits" backend/src
//     returns empty.
import { getPlan, hasFeature as canonicalHasFeature, } from "../billing/plan.js";
/**
 * Normalize legacy "SMALL_BUSINESS" to canonical "SMALL", pass others
 * through. Used at the boundary between legacy callers and plans.ts.
 */
function toPlanTier(plan) {
    if (plan === "SMALL_BUSINESS")
        return "SMALL";
    return plan;
}
/**
 * Project canonical PlanFeatures into the legacy PlanConfig shape.
 * Features list is derived from boolean capability flags — the names
 * match the legacy taxonomy where possible.
 */
function toPlanConfig(tier) {
    const plan = getPlan(tier);
    if (!plan) {
        return {
            maxUsers: 0,
            maxTeams: 0,
            trial: false,
            trialDays: 0,
            features: [],
        };
    }
    // Derive legacy feature list from canonical capability flags
    const features = ["basic_crm"];
    if (plan.features.advancedAnalytics)
        features.push("analytics");
    if (plan.features.apiAccess)
        features.push("automation");
    if (plan.features.auditLogsEnabled)
        features.push("ai_insights");
    if (plan.features.prioritySupport)
        features.push("priority_support");
    if (plan.features.ssoEnabled)
        features.push("sso");
    if (plan.features.whiteLabel)
        features.push("white_label");
    return {
        maxUsers: plan.features.maxUsers,
        maxTeams: plan.features.maxTeams,
        trial: plan.trialDays > 0,
        trialDays: plan.trialDays,
        features,
    };
}
// ============================================================
// LEGACY EXPORTS — auto-derived from plans.ts
// ============================================================
/**
 * @deprecated Use PLANS from plans.ts or getPlan(tier).features.
 *
 * Built on demand from canonical PlanFeatures so any change to plans.ts
 * propagates here without manual sync.
 */
export const PLAN_LIMITS = {
    FREE: toPlanConfig("FREE"),
    SMALL: toPlanConfig("SMALL"),
    SMALL_BUSINESS: toPlanConfig("SMALL"),
    PRO: toPlanConfig("PRO"),
    ENTERPRISE: toPlanConfig("ENTERPRISE"),
};
// ============================================================
// LEGACY HELPER FUNCTIONS
// All delegate to plans.ts. Same signatures as before so call sites
// compile without changes.
// ============================================================
/**
 * @deprecated Use getPlan(tier) from plans.ts.
 */
export function getPlanLimits(plan) {
    return PLAN_LIMITS[plan] ?? PLAN_LIMITS.FREE;
}
/**
 * @deprecated Use hasFeature(tier, capability) from plans.ts directly.
 *
 * Note: legacy feature names ("automation", "ai_insights") differ from
 * canonical capability keys ("apiAccess", "auditLogsEnabled"). This
 * function maps the legacy name to the canonical capability.
 */
export function hasFeature(plan, feature) {
    const tier = toPlanTier(plan);
    // Map legacy feature names to canonical PlanFeatures keys
    const featureMap = {
        automation: "apiAccess",
        analytics: "advancedAnalytics",
        ai_insights: "auditLogsEnabled",
        priority_support: "prioritySupport",
        sso: "ssoEnabled",
        white_label: "whiteLabel",
    };
    const canonicalKey = featureMap[feature];
    if (canonicalKey) {
        return canonicalHasFeature(tier, canonicalKey);
    }
    // basic_crm is universal; everything else falls back to feature-list lookup
    if (feature === "basic_crm")
        return true;
    // Unknown feature — fall back to legacy list check
    return PLAN_LIMITS[plan].features.includes(feature);
}
/**
 * @deprecated Use getQuota(tier, "maxUsers") from plans.ts.
 */
export function canAddUser(plan, currentCount) {
    const config = getPlanLimits(plan);
    return currentCount < config.maxUsers;
}
/**
 * @deprecated Use getQuota(tier, "maxTeams") from plans.ts.
 */
export function canAddTeam(plan, currentCount) {
    const config = getPlanLimits(plan);
    return currentCount < config.maxTeams;
}
/**
 * @deprecated Read getPlan(tier).trialDays > 0 from plans.ts.
 */
export function isTrialPlan(plan) {
    return getPlanLimits(plan).trial;
}
/**
 * @deprecated Read getPlan(tier).trialDays from plans.ts.
 */
export function getTrialDays(plan) {
    return getPlanLimits(plan).trialDays;
}
export default PLAN_LIMITS;
//# sourceMappingURL=plan-limits.js.map