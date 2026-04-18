export type Deal = {
  name: string;
  value: number;
  stage: string;
  lastActivityDays: number;
};

export type ForecastRisk = {
  totalRevenueAtRisk: number;
  riskyDeals: number;
  message: string;
};

export function detectForecastRisk(deals: Deal[]): ForecastRisk | null {

  let revenueAtRisk = 0;
  let riskyDeals = 0;

  for (const deal of deals) {

    const isLateStage =
      deal.stage === "Negotiation" || deal.stage === "Proposal";

    const isInactive = deal.lastActivityDays >= 7;

    if (isLateStage && isInactive) {
      revenueAtRisk += deal.value;
      riskyDeals += 1;
    }

  }

  if (revenueAtRisk === 0) return null;

  return {
    totalRevenueAtRisk: revenueAtRisk,
    riskyDeals,
    message: `$${Math.round(revenueAtRisk / 1000)}K expected revenue at risk across ${riskyDeals} deals`
  };
}