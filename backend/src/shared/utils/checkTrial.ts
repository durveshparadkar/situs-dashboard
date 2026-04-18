import { PLAN_LIMITS } from "../plans/plan-limits.js";

type PlanKey = keyof typeof PLAN_LIMITS;

interface OrganizationLike {
  plan: PlanKey;
  isTrial: boolean;
  trialEndsAt?: Date | null;
}

export function checkTrialValidity(organization: OrganizationLike): string | null {
  const planConfig = PLAN_LIMITS[organization.plan];

  if (!planConfig.trial) return null;

  if (
    organization.isTrial &&
    organization.trialEndsAt &&
    new Date() > new Date(organization.trialEndsAt)
  ) {
    return "Trial expired. Please upgrade your plan.";
  }

  return null;
}
