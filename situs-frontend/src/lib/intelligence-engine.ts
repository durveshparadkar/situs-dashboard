/* ================= TYPES ================= */

export type Deal = {
  id: string;
  name: string;
  value: number;
  stage?: string;
  lastActivityDays?: number;
  daysInStage?: number;
  closeDateDays?: number;
};

export type DealIntelligence = {
  value: number;
  id: string;
  name: string;
  riskScore: number;        // 0–100
  winProbability: number;   // 0–100
  urgency: "high" | "medium" | "low";
  action: string;
  impact: string;
  reasons: string[];
};

/* ================= HELPERS ================= */

function safeNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" && !isNaN(v) ? v : fallback;
}

function safeString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/* ================= CORE ENGINE ================= */

export function generateDealIntelligence(
  deals: unknown
): DealIntelligence[] {
  // ✅ HARD GUARD (fixes your crash class of bugs)
  if (!Array.isArray(deals)) return [];

  return deals.map((raw, index) => {
    // ✅ SAFE PARSING (handles bad backend data)
    const deal: Deal = {
      id: safeString(raw?.id, String(index)),
      name: safeString(raw?.name, "Unnamed Deal"),
      value: safeNumber(raw?.value),
      stage: safeString(raw?.stage, "unknown"),
      lastActivityDays: safeNumber(raw?.lastActivityDays),
      daysInStage: safeNumber(raw?.daysInStage),
      closeDateDays: safeNumber(raw?.closeDateDays),
    };

    let riskScore = 0;
    const reasons: string[] = [];

    /* 🔴 RISK CALCULATION */

    if (deal.lastActivityDays! > 7) {
      riskScore += 30;
      reasons.push("No activity for several days");
    }

    if (deal.daysInStage! > 10) {
      riskScore += 25;
      reasons.push("Deal stuck in same stage");
    }

    if (deal.closeDateDays! < 10 && deal.lastActivityDays! > 5) {
      riskScore += 30;
      reasons.push("Close date near but no engagement");
    }

    if (deal.value > 100000) {
      riskScore += 10;
      reasons.push("High-value deal at risk");
    }

    riskScore = Math.min(riskScore, 100);

    /* 🟢 WIN PROBABILITY */

    let winProbability = 100 - riskScore;

    if (deal.stage === "Negotiation") winProbability += 10;
    if (deal.stage === "Proposal") winProbability += 5;

    winProbability = Math.max(0, Math.min(winProbability, 100));

    /* ⚡ URGENCY */

    let urgency: "high" | "medium" | "low" = "low";

    if (riskScore >= 70) urgency = "high";
    else if (riskScore >= 40) urgency = "medium";

    /* 🎯 ACTION ENGINE */

    let action = "Monitor deal";

    if (urgency === "high") {
      action = "Immediate follow-up call";
    } else if (deal.lastActivityDays! > 5) {
      action = "Send follow-up email";
    } else if (deal.daysInStage! > 10) {
      action = "Push deal to next stage";
    }

    /* 💰 IMPACT */

    const impact =
      deal.value > 0
        ? `₹${deal.value.toLocaleString()} potential`
        : "No value data";

    return {
      value: deal.value,
      id: deal.id,
      name: deal.name,
      riskScore,
      winProbability,
      urgency,
      action,
      impact,
      reasons,
    };
  });
}