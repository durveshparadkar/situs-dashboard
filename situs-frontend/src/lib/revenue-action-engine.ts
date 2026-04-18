type Deal = {
  name: string
  stage: string
  riskScore: number
  lastActivityDays: number
  healthScore: number
  value?: number
}

export type RevenueAction = {
  type: "critical" | "warning" | "opportunity"
  title: string
  action: string
  reason: string
  priority: number
  revenueImpact?: number
}

export function generateRevenueActions(deals: Deal[]): RevenueAction[] {

  const actions: RevenueAction[] = []

  deals.forEach((deal) => {

    let priority = 0
    const valueWeight = (deal.value ?? 0) / 1000

    /* CRITICAL RISK */

    if (deal.riskScore >= 75) {

      priority = deal.riskScore + valueWeight

      actions.push({
        type: "critical",
        title: `Immediate attention: ${deal.name}`,
        action: `Schedule executive intervention to unblock ${deal.stage} stage.`,
        reason: `High risk score (${deal.riskScore})`,
        priority,
        revenueImpact: deal.value
      })

    }

    /* INACTIVITY */

    if (deal.lastActivityDays >= 10) {

      priority = deal.lastActivityDays * 5 + valueWeight

      actions.push({
        type: "warning",
        title: `Deal inactive: ${deal.name}`,
        action: "Follow up with customer immediately.",
        reason: `${deal.lastActivityDays} days since last activity`,
        priority,
        revenueImpact: deal.value
      })

    }

    /* LATE STAGE RISK */

    if (
      (deal.stage === "Negotiation" || deal.stage === "Proposal") &&
      deal.healthScore < 40
    ) {

      priority = 80 + valueWeight

      actions.push({
        type: "critical",
        title: `Late-stage deal at risk: ${deal.name}`,
        action: "Engage leadership to push deal toward close.",
        reason: `Low deal health (${deal.healthScore}) in ${deal.stage}`,
        priority,
        revenueImpact: deal.value
      })

    }

    /* STRONG OPPORTUNITY */

    if (
      deal.stage === "Negotiation" &&
      deal.healthScore > 75 &&
      deal.riskScore < 40
    ) {

      priority = 50 + valueWeight

      actions.push({
        type: "opportunity",
        title: `Strong closing opportunity: ${deal.name}`,
        action: "Accelerate closing and confirm decision timeline.",
        reason: "Healthy late-stage deal",
        priority,
        revenueImpact: deal.value
      })

    }

  })

  /* SORT BY PRIORITY */

  actions.sort((a, b) => b.priority - a.priority)

  /* RETURN TOP 5 ACTIONS */

  return actions.slice(0, 5)

}