export const PLANS = {
  SMALL: {
    priceMonthly: 19,
    users: 5,
    teams: 2,
  },
  PRO: {
    priceMonthly: 49,
    users: 25,
    teams: 10,
  },
  ENTERPRISE: {
    priceMonthly: 199,
    users: 30,
    teams: 20,
  },
} as const;

export type Plan = keyof typeof PLANS;
