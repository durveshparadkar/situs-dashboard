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

import type { PlanTier, PlanFeatures } from "../billing/plan.js";

// ============================================================
// LEGACY TYPE ALIASES
// ============================================================

/**
 * @deprecated Use PlanTier from plans.ts. Includes FREE which this
 * legacy type didn't have.
 *
 * Migration:
 *   - import type { PlanTier } from "../billing/plans.js";
 *   - Replace Plan with PlanTier at call sites.
 */
export type Plan = Extract<PlanTier, "SMALL" | "PRO" | "ENTERPRISE"> | "SMALL_BUSINESS";

/**
 * @deprecated Use PlanFeatures from plans.ts for full plan capability.
 *
 * The canonical PlanFeatures interface includes:
 *   - 6 numeric quotas (maxUsers, maxTeams, maxPipelines, maxActiveDeals,
 *                       maxAiCallsPerMonth, maxStorageMb)
 *   - 9 boolean capability flags (customRoles, ssoEnabled, apiAccess, etc.)
 *
 * The legacy PlanLimits shape below is preserved for backward
 * compatibility, but new code should use PlanFeatures directly.
 */
export interface PlanLimits {
  /** Max teams per organization (required field — every plan has this) */
  teams:     number;

  /** Max active users (optional in legacy shape, always present in PlanFeatures) */
  users?:    number;

  /** Max projects/pipelines (optional — maps to maxPipelines in PlanFeatures) */
  projects?: number;
}

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
export function toPlanLimits(features: PlanFeatures): PlanLimits {
  return {
    teams:    features.maxTeams,
    users:    features.maxUsers,
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
export function toPlanTier(plan: Plan): PlanTier {
  if (plan === "SMALL_BUSINESS") return "SMALL";
  return plan as PlanTier;
}