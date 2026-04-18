export interface Deal {
  id?: string
  name: string
  value?: number
  stage?: string
  lastActivity?: string
  createdAt?: string
  riskScore?: number
  momentum?: "up" | "down" | "stable"
}

export interface DealHealthResult {
  dealName: string
  healthScore: number
  status: "healthy" | "watch" | "risk" | "critical"
}

const MAX_HEALTH = 100

export function calculateDealHealth(deal: Deal): DealHealthResult {
  let health = MAX_HEALTH
  const now = new Date()

  // inactivity penalty
  if (deal.lastActivity) {
    const last = new Date(deal.lastActivity)
    const daysInactive =
      (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24)

    if (daysInactive > 30) health -= 40
    else if (daysInactive > 14) health -= 25
    else if (daysInactive > 7) health -= 10
  }

  // stage duration penalty
  if (deal.createdAt) {
    const created = new Date(deal.createdAt)
    const ageDays =
      (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)

    if (ageDays > 90) health -= 20
    else if (ageDays > 60) health -= 10
  }

  // risk score penalty
  if (deal.riskScore) {
    health -= deal.riskScore * 0.3
  }

  // momentum bonus / penalty
  if (deal.momentum === "up") health += 10
  if (deal.momentum === "down") health -= 10

  health = Math.max(0, Math.min(100, Math.round(health)))

  let status: DealHealthResult["status"]

  if (health >= 80) status = "healthy"
  else if (health >= 60) status = "watch"
  else if (health >= 40) status = "risk"
  else status = "critical"

  return {
    dealName: deal.name,
    healthScore: health,
    status,
  }
}

export function calculateDealsHealth(deals: Deal[]): DealHealthResult[] {
  return deals.map(calculateDealHealth)
}