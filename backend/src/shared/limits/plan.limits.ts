export const PLAN_LIMITS = {
  SMALL_BUSINESS: {
    users: 5,
    teams: 2,
  },
  PRO: {
    users: 20,
    teams: 5,
  },
  ENTERPRISE: {
    users: 100,
    teams: 20,
  },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;



