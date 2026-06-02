export type RiskScoreDeal = {
  value?: number;
  stage?: string;
  lastActivityDays?: number;
  stageDays?: number;
  ageDays?: number;
  probability?: number;
};

export function calculateRiskScore(deal: RiskScoreDeal): number {
  let risk = 0;

  const lastActivityDays = deal.lastActivityDays ?? 0;
  const stageDays = deal.stageDays ?? 0;
  const ageDays = deal.ageDays ?? 0;
  const probability = deal.probability ?? 50;

  if (lastActivityDays >= 15) risk += 40;
  else if (lastActivityDays >= 8) risk += 25;
  else if (lastActivityDays >= 4) risk += 10;

  if (deal.stage === "Negotiation" && stageDays > 14) risk += 20;
  if (deal.stage === "Proposal" && stageDays > 10) risk += 15;
  if (ageDays > 45) risk += 15;
  if (probability < 35) risk += 15;
  if ((deal.value ?? 0) > 100000) risk += 5;

  return Math.min(risk, 100);
}
