export const PLAN_LIMITS = {
  SMALL: {
    users: 5,
    teams: 2,
  },
  PRO: {
    users: 25,
    teams: 10,
  },
  ENTERPRISE: {
    users: Infinity,
    teams: Infinity,
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;
