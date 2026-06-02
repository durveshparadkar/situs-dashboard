export type ForecastDeal = {
  value?: number;
  probability?: number;
  riskScore?: number;
};

export type RevenueForecast = {
  pipelineValue: number;
  weightedForecast: number;
  confidence: number;
};

export function generateForecast(deals: ForecastDeal[]): RevenueForecast {
  const pipelineValue = deals.reduce((sum, deal) => sum + (deal.value ?? 0), 0);
  const weightedForecast = deals.reduce((sum, deal) => {
    const probability = deal.probability ?? Math.max(0, 100 - (deal.riskScore ?? 50));
    return sum + (deal.value ?? 0) * (probability / 100);
  }, 0);

  const confidence =
    deals.length > 0
      ? Math.round(
          deals.reduce((sum, deal) => sum + Math.max(0, 100 - (deal.riskScore ?? 50)), 0) /
            deals.length
        )
      : 0;

  return {
    pipelineValue,
    weightedForecast: Math.round(weightedForecast),
    confidence,
  };
}
