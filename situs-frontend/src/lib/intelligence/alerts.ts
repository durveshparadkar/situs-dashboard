export type IntelligenceAlertDeal = {
  _id?: string;
  id?: string;
  name?: string;
  title?: string;
  value?: number;
  riskScore?: number;
  momentum?: string;
};

export type IntelligenceAlert = {
  dealId?: string;
  title: string;
  severity: "low" | "medium" | "high";
  message: string;
};

export function generateAlerts(deals: IntelligenceAlertDeal[]): IntelligenceAlert[] {
  return deals
    .filter((deal) => (deal.riskScore ?? 0) >= 60 || deal.momentum === "stalled")
    .map((deal) => {
      const name = deal.name ?? deal.title ?? "Untitled deal";
      const riskScore = deal.riskScore ?? 0;

      return {
        dealId: deal._id ?? deal.id,
        title: riskScore >= 80 ? "Critical deal risk" : "Deal needs attention",
        severity: riskScore >= 80 ? "high" : "medium",
        message: `${name} has a risk score of ${riskScore}.`,
      };
    });
}
