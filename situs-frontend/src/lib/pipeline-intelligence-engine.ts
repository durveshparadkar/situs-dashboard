export interface Deal {
  id?: string
  name: string
  value?: number
  stage?: string
  lastActivity?: string
}

export interface PipelineSignal {
  type: "pipeline_leak"
  message: string
  stage?: string
  stuckDeals: number
  revenueAtRisk: number
}

export interface StageDistribution {
  stage: string
  count: number
  revenue: number
}

const STUCK_DAYS_THRESHOLD = 14

export function pipelineIntelligenceEngine(deals: Deal[]) {

  const now = new Date()

  const stageMap: Record<string, StageDistribution> = {}
  const stuckDeals: Deal[] = []

  for (const deal of deals) {

    const stage = deal.stage ?? "unknown"

    if (!stageMap[stage]) {
      stageMap[stage] = {
        stage,
        count: 0,
        revenue: 0,
      }
    }

    stageMap[stage].count += 1
    stageMap[stage].revenue += deal.value ?? 0

    if (deal.lastActivity) {

      const lastActivity = new Date(deal.lastActivity)

      const daysInactive =
        (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)

      if (daysInactive > STUCK_DAYS_THRESHOLD) {
        stuckDeals.push(deal)
      }

    }

  }

  const revenueAtRisk = stuckDeals.reduce(
    (sum, deal) => sum + (deal.value ?? 0),
    0
  )

  const pipelineLeakSignal: PipelineSignal | null =
    stuckDeals.length > 0
      ? {
          type: "pipeline_leak",
          message: `${stuckDeals.length} deals inactive for more than ${STUCK_DAYS_THRESHOLD} days`,
          stuckDeals: stuckDeals.length,
          revenueAtRisk,
        }
      : null

  const stageDistribution = Object.values(stageMap)

  const pipelineImbalance =
    stageDistribution.length > 0
      ? [...stageDistribution].sort((a, b) => b.count - a.count)
      : []

  return {
    pipelineLeakSignal,
    stageDistribution,
    pipelineImbalance,
  }

}