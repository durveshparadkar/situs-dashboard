export type Decision = {
  id: string;
  title: string;
  insight: string;
  reason: string;
  action: string;
  priority: "critical" | "watch" | "normal";
};

type Deal = {
  name: string;
  value: number;
  stage: string;
  lastActivityDays: number;
};

type PipelineLeak = {
  stage: string;
  totalValue: number;
  dealCount: number;
  message: string;
};

type ForecastRisk = {
  totalRevenueAtRisk: number;
  riskyDeals: number;
  message: string;
};

export function generateRevenueDecisions(
  deals: Deal[],
  pipelineLeaks: PipelineLeak[],
  forecastRisk: ForecastRisk | null
): Decision[] {

  const decisions: Decision[] = [];

  /* Deal inactivity decisions */

  deals.forEach((deal) => {

    if (deal.stage === "Negotiation" && deal.lastActivityDays >= 10) {

      decisions.push({
        id: `decision-escalate-${deal.name}`,
        title: "Escalate Deal",
        insight: `${deal.name} has been inactive for ${deal.lastActivityDays} days in negotiation.`,
        reason: "Late-stage deal inactivity detected",
        action: "Schedule executive alignment call and re-engage decision makers.",
        priority: "critical"
      });

    }

  });

  /* Pipeline leak decisions */

  pipelineLeaks.forEach((leak) => {

    decisions.push({
      id: `decision-pipeline-${leak.stage}`,
      title: "Pipeline Bottleneck",
      insight: leak.message,
      reason: `${leak.dealCount} deals accumulating in ${leak.stage}`,
      action: "Investigate stage bottlenecks and accelerate deal progression.",
      priority: "watch"
    });

  });

  /* Forecast risk decisions */

  if (forecastRisk) {

    decisions.push({
      id: "decision-forecast-risk",
      title: "Revenue Forecast Risk",
      insight: forecastRisk.message,
      reason: "Late-stage deals showing inactivity",
      action: "Prioritize support for negotiation-stage deals and re-engage stakeholders.",
      priority: "critical"
    });

  }

  return decisions;

}