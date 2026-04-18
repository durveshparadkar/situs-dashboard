export type Deal = {
  name: string;
  value: number;
  stage: string;
  winProbability: number;
};

const stageWeights: Record<string, number> = {
  Prospect: 0.2,
  Qualified: 0.4,
  Proposal: 0.6,
  Negotiation: 0.8,
  Closing: 1
};

export function calculateImpactScore(deal: Deal) {

  const stageWeight = stageWeights[deal.stage] ?? 0.5;

  const impactScore =
    deal.value *
    deal.winProbability *
    stageWeight;

  return Math.round(impactScore);

}

export function rankDealsByImpact(deals: Deal[]) {

  return deals
    .map((deal) => ({
      ...deal,
      impactScore: calculateImpactScore(deal)
    }))
    .sort((a, b) => b.impactScore - a.impactScore);

}