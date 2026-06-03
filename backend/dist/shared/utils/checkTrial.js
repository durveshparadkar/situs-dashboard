import { PLAN_LIMITS } from "../plans/plan-limits.js";
export function checkTrialValidity(organization) {
    const planConfig = PLAN_LIMITS[organization.plan];
    if (!planConfig.trial)
        return null;
    if (organization.isTrial &&
        organization.trialEndsAt &&
        new Date() > new Date(organization.trialEndsAt)) {
        return "Trial expired. Please upgrade your plan.";
    }
    return null;
}
//# sourceMappingURL=checkTrial.js.map