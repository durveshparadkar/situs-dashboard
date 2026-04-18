import { calculateRiskScore } from "../riskScore"
import { calculateMomentum } from "./dealMomentum"
import { calculatePipelineHealth } from "./pipelineHealth"
import { generateForecast } from "./forecastEngine"
import { generateAlerts } from "./alerts"

export function runRevenueIntelligence(deals: any[]) {

  const dealsWithRisk = deals.map((deal) => ({
    ...deal,
    riskScore: calculateRiskScore(deal)
  }))

  const dealsWithMomentum = dealsWithRisk.map((deal) => ({
    ...deal,
    momentum: calculateMomentum(deal)
  }))

  const pipelineHealth = calculatePipelineHealth(dealsWithMomentum)

  const forecast = generateForecast(dealsWithMomentum)

  const alerts = generateAlerts(dealsWithMomentum)

  return {
    deals: dealsWithMomentum,
    pipelineHealth,
    forecast,
    alerts
  }
}