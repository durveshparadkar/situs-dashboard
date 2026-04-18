export type Deal = {
  name: string;
  value: number;
  stage: string;
  lastActivityDays: number;
  stageDays?: number;
  ageDays?: number;
};

export type DealRiskResult = {
  name: string;
  riskScore: number;
  reasons: string[];
};

export function calculateDealRisk(deal: Deal): DealRiskResult {

  let risk = 0;
  const reasons: string[] = [];

  if (deal.lastActivityDays >= 15) {
    risk += 40;
    reasons.push("No activity for 15+ days");
  } else if (deal.lastActivityDays >= 8) {
    risk += 25;
    reasons.push("No activity for 8+ days");
  } else if (deal.lastActivityDays >= 4) {
    risk += 10;
    reasons.push("Low activity in last few days");
  }

  if (deal.stage === "Negotiation" && (deal.stageDays ?? 0) > 14) {
    risk += 20;
    reasons.push("Negotiation stage delay");
  }

  if (deal.stage === "Proposal" && (deal.stageDays ?? 0) > 10) {
    risk += 15;
    reasons.push("Proposal stage slower than normal");
  }

  if ((deal.ageDays ?? 0) > 45) {
    risk += 15;
    reasons.push("Deal older than typical sales cycle");
  }

  risk = Math.min(risk, 100);

  return {
    name: deal.name,
    riskScore: risk,
    reasons
  };
}

/* 🔥 RANK DEALS BY RISK */

export function rankDealsByRisk(deals: Deal[]) {

  const results = deals.map(calculateDealRisk);

  return results.sort((a, b) => b.riskScore - a.riskScore);
}

/* 🔥 RISK LEVEL SYSTEM */

export function getRiskLevel(score: number) {

  if (score >= 80) {
    return {
      label: "Critical",
      color: "text-red-600"
    };
  }

  if (score >= 50) {
    return {
      label: "Watch",
      color: "text-orange-500"
    };
  }

  return {
    label: "Healthy",
    color: "text-green-600"
  };
}

/* 🔥 NEW: DEAL MOMENTUM SYSTEM */

export function getDealMomentum(deal: Deal) {

  if (deal.lastActivityDays <= 2) {
    return {
      label: "Improving",
      arrow: "↑",
      color: "text-green-600"
    };
  }

  if (deal.lastActivityDays <= 7) {
    return {
      label: "Stable",
      arrow: "→",
      color: "text-slate-500"
    };
  }

  return {
    label: "Falling",
    arrow: "↓",
    color: "text-red-600"
  };
}