// plan.limits.ts
//
// @deprecated Backward-compatibility shim. The canonical source for
// plan quotas is plans.ts. New code should import directly from there:
//
//   import { getPlan, getQuota } from "../billing/plans.js";
//
// This file re-exports limits in the legacy shape so existing callers
// keep working while you migrate them. Delete this file once
// grep -rn "PLAN_LIMITS\|from.*plan.limits" backend/src returns empty.
import { getPlan } from "../billing/plan.js";
/**
 * Build legacy limits for a tier by reading the canonical PlanFeatures
 * from plans.ts. Any change there propagates here automatically.
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
 * Multi-key shape that accepts both old naming conventions. Whatever
 * key your callers use (SMALL_BUSINESS, SMALL, PRO, ENTERPRISE, FREE),
 * they get the canonical limits from plans.ts.
 */
export const PLAN_LIMITS = {
    FREE: toLegacyLimits("FREE"),
    SMALL: toLegacyLimits("SMALL"),
    SMALL_BUSINESS: toLegacyLimits("SMALL"), // alias
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
//# sourceMappingURL=plan.limits.js.map