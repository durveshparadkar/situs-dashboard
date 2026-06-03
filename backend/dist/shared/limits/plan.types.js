// plan.types.ts
//
// @deprecated Backward-compatibility shim for legacy plan typing.
//
// The canonical types live in plans.ts:
//   import type { PlanTier, PlanFeatures } from "../billing/plans.js";
//
// This file re-exports legacy aliases so existing callers compile
// without changes. Delete once:
//   grep -rn "from.*plan.types" backend/src
// returns empty.
// ============================================================
// LEGACY HELPERS
// ============================================================
/**
 * @deprecated Use getPlan(tier).features from plans.ts.
 *
 * Project the canonical PlanFeatures into the legacy PlanLimits shape.
 * Useful when migrating: lets you keep the old interface while reading
 * from the new source of truth.
 */
export function toPlanLimits(features) {
    return {
        teams: features.maxTeams,
        users: features.maxUsers,
        projects: features.maxPipelines,
    };
}
/**
 * @deprecated Use PlanTier directly.
 *
 * Normalize a legacy Plan value (which may use "SMALL_BUSINESS") to
 * the canonical PlanTier value ("SMALL"). Use at boundaries where
 * you receive a legacy Plan and need to call plans.ts functions.
 */
export function toPlanTier(plan) {
    if (plan === "SMALL_BUSINESS")
        return "SMALL";
    return plan;
}
//# sourceMappingURL=plan.types.js.map