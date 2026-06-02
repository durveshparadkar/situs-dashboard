export type PipelineDeal = {
  value?: number;
  stage?: string;
  riskScore?: number;
};

export type PipelineHealth = {
  score: number;
  totalValue: number;
  atRiskValue: number;
  openDeals: number;
  byStage: Record<string, { count: number; value: number }>;
};

export function calculatePipelineHealth(deals: PipelineDeal[]): PipelineHealth {
  const byStage: PipelineHealth["byStage"] = {};
  let totalValue = 0;
  let atRiskValue = 0;

  for (const deal of deals) {
    const value = deal.value ?? 0;
    const stage = deal.stage ?? "Unknown";

    totalValue += value;

    if (!byStage[stage]) {
      byStage[stage] = { count: 0, value: 0 };
    }

    byStage[stage].count += 1;
    byStage[stage].value += value;

    if ((deal.riskScore ?? 0) >= 60) {
      atRiskValue += value;
    }
  }

  const riskRatio = totalValue > 0 ? atRiskValue / totalValue : 0;
  const score = Math.max(0, Math.round(100 - riskRatio * 100));

  return {
    score,
    totalValue,
    atRiskValue,
    openDeals: deals.length,
    byStage,
  };
}
