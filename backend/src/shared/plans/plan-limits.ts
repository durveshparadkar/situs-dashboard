export const PLAN_LIMITS = {
  SMALL_BUSINESS: {
    maxUsers: 5,
    maxTeams: 2,
    trial: true,
    trialDays: 14,
  },
  PRO: {
    maxUsers: 20,
    maxTeams: 10,
    trial: true,
    trialDays: 14,
  },
  ENTERPRISE: {
    maxUsers: 50,
    maxTeams: 30,
    trial: false,
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;
