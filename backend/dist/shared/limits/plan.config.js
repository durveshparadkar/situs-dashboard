// plan.limits.ts
//
// @deprecated This file exists for backward compatibility with existing
// imports. New code should import directly from plans.ts:
//
//   import { getPlan, hasFeature, getQuota } from "../billing/plans.js";
//
// This file is a thin shim over plans.ts — it reads the canonical
// feature quotas and exposes them in the legacy shape.
//
// MIGRATION PATH:
//   1. Update callers to import from plans.ts directly
//   2. Once no callers remain, delete this file
//   3. Remove the PlanType alias from any remaining shared code
import { getPlan, } from "../billing/plan.js";
/**
 * Build the legacy limits object for a given tier from the canonical
 * PlanFeatures. ENTERPRISE used to expose Infinity — we preserve that
 * sentinel behavior for callers that check if (limit === Infinity).
 */
function toLegacyLimits(tier) {
    const plan = getPlan(tier);
    if (!plan) {
        return { users: 0, teams: 0, pipelines: 0, activeDeals: 0 };
    }
    return {
        users: plan.features.maxUsers,
        teams: plan.features.maxTeams,
        pipelines: plan.features.maxPipelines,
        activeDeals: plan.features.maxActiveDeals,
    };
}
// ============================================================
// LEGACY EXPORTS
// ============================================================
/**
 * @deprecated Use getPlan(tier).features from plans.ts instead.
 *
 * Legacy plan-limits map. Auto-derived from plans.ts so it stays in
 * sync with the canonical source.
 *
 * Note: the legacy file used "SMALL" — the canonical tier is "SMALL".
 * If your callers used SMALL_BUSINESS, both keys are provided.
 */
export const PLAN_LIMITS = {
    FREE: toLegacyLimits("FREE"),
    SMALL: toLegacyLimits("SMALL"),
    SMALL_BUSINESS: toLegacyLimits("SMALL"), // alias for legacy callers
    PRO: toLegacyLimits("PRO"),
    ENTERPRISE: toLegacyLimits("ENTERPRISE"),
};
/**
 * @deprecated Use getQuota(tier, key) from plans.ts instead.
 *
 * Safe accessor — returns 0 for unknown tiers rather than throwing.
 */
export function getLegacyLimit(tier, resource) {
    if (!tier)
        return 0;
    const limits = PLAN_LIMITS[tier.toUpperCase()];
    if (!limits)
        return 0;
    return limits[resource] ?? 0;
}
export default PLAN_LIMITS;
//# sourceMappingURL=plan.config.js.map