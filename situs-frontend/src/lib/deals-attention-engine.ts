export type Deal = {
  name: string;
  value: number;
  stage: string;
  lastActivityDays: number;
};

export type DealAlert = {
  type: "inactivity" | "stalled" | "high_value_risk";
  dealName: string;
  message: string;
};

export function detectDealAttention(deals: Deal[]): DealAlert[] {

  const alerts: DealAlert[] = [];

  deals.forEach((deal) => {

    // Deal inactive
    if (deal.lastActivityDays >= 7) {
      alerts.push({
        type: "inactivity",
        dealName: deal.name,
        message: `${deal.name} inactive for ${deal.lastActivityDays} days`
      });
    }

    // Deal stuck in negotiation
    if (deal.stage === "Negotiation" && deal.lastActivityDays >= 10) {
      alerts.push({
        type: "stalled",
        dealName: deal.name,
        message: `${deal.name} negotiation stalled`
      });
    }

    // High value risk
    if (deal.value >= 150000 && deal.lastActivityDays >= 5) {
      alerts.push({
        type: "high_value_risk",
        dealName: deal.name,
        message: `${deal.name} is a high-value deal that needs attention`
      });
    }

  });

  return alerts;

}