// pipeline-intelligence.rules.ts
import { DealDocument, RiskLevel } from "../deals/deal.model.js";

/* =====================================================
   PIPELINE INTELLIGENCE RULES
   
   Pure functions that analyze deals and emit recommendations.
   No DB access, no side effects — just deterministic logic.
   This makes every rule independently testable.
===================================================== */

/* ================= TYPES ================= */

export type RecommendationCategory =
  | "follow_up"        // contact the prospect
  | "stage_action"     // move/update stage
  | "risk_mitigation"  // address a risk signal
  | "forecast"         // forecast adjustment needed
  | "qualification"    // qualify or disqualify
  | "engagement"       // re-engage stalled deal
  | "competitive"      // competitor action needed
  | "process"          // pipeline hygiene
  | "celebration";     // momentum / wins

export type RecommendationPriority = "low" | "medium" | "high" | "urgent";

export type RecommendationAction =
  | "schedule_call"
  | "send_email"
  | "schedule_meeting"
  | "send_proposal"
  | "request_decision"
  | "escalate_to_manager"
  | "update_close_date"
  | "update_probability"
  | "advance_stage"
  | "mark_lost"
  | "qualify"
  | "disqualify"
  | "log_activity"
  | "review_competitor"
  | "no_action_needed";

export interface Recommendation {
  /* Identity */
  id: string;                                  // stable rule-derived id (deduplicates across runs)
  ruleCode: string;                            // which rule fired (machine-readable)

  /* Classification */
  category: RecommendationCategory;
  priority: RecommendationPriority;
  action: RecommendationAction;

  /* Display */
  title: string;                               // short headline for the UI
  message: string;                             // full explanation for the rep
  reasoning: string[];                         // why this fired (transparency)

  /* Context */
  confidence: number;                          // 0-100, how confident the rule is
  expectedImpact?: "low" | "medium" | "high";  // potential business impact
  estimatedValueAtRisk?: number;               // INR value the deal could lose

  /* Suggested due date */
  suggestedDueAt?: Date;
}

export interface RuleContext {
  /* The deal under analysis */
  deal: DealDocument;

  /* Optional cross-deal context (passed by the service) */
  orgAvgVelocity?: number | undefined;          // average days-per-stage for the org
  orgAvgDealSize?: number | undefined;          // average deal value
  repWinRate?: number | undefined;              // assigned rep's win rate (0-100)
}

/**
 * A rule takes context and returns 0+ recommendations.
 * Rules are PURE — same input always produces same output.
 */
export type IntelligenceRule = (ctx: RuleContext) => Recommendation[];

/* ================= HELPERS ================= */

function daysSince(date: Date | undefined | null): number {
  if (!date) return Infinity;
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
}

function daysUntil(date: Date | undefined | null): number {
  if (!date) return Infinity;
  return (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
}

function addDays(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function makeRecId(dealId: string, ruleCode: string): string {
  // Deterministic ID — same rule on same deal yields same ID,
  // so re-runs naturally deduplicate.
  return `${dealId}:${ruleCode}`;
}

/* =====================================================
   RULE 1 — STALE DEAL RE-ENGAGEMENT
   Trigger: open deal with no activity for 7+ days
===================================================== */

export const staleDealRule: IntelligenceRule = ({ deal }) => {
  if (deal.status !== "open") return [];

  const inactivityDays = daysSince(deal.lastActivityAt);
  if (inactivityDays < 7) return [];

  let priority: RecommendationPriority = "medium";
  let confidence = 70;

  if (inactivityDays >= 21) {
    priority = "urgent";
    confidence = 95;
  } else if (inactivityDays >= 14) {
    priority = "high";
    confidence = 85;
  }

  return [
    {
      id: makeRecId(deal._id.toString(), "stale_deal"),
      ruleCode: "stale_deal",
      category: "engagement",
      priority,
      action: "send_email",
      title: `Re-engage ${deal.title}`,
      message: `This deal has gone quiet for ${Math.floor(inactivityDays)} days. A short re-engagement email today is the highest-ROI action.`,
      reasoning: [
        `No activity logged for ${Math.floor(inactivityDays)} days`,
        `Deal value: ₹${deal.value.toLocaleString("en-IN")}`,
        deal.probability < 50
          ? `Probability is only ${deal.probability}% — momentum loss likely`
          : `Probability still healthy at ${deal.probability}% — recoverable`,
      ],
      confidence,
      expectedImpact: deal.value > 1_000_000 ? "high" : "medium",
      estimatedValueAtRisk: Math.round(deal.value * (deal.probability / 100) * 0.4),
      suggestedDueAt: addDays(1),
    },
  ];
};

/* =====================================================
   RULE 2 — CLOSE DATE SLIPPAGE
   Trigger: expectedCloseDate has passed or is imminent without momentum
===================================================== */

export const closeDateSlippageRule: IntelligenceRule = ({ deal }) => {
  if (deal.status !== "open" || !deal.expectedCloseDate) return [];

  const daysToClose = daysUntil(deal.expectedCloseDate);
  const recs: Recommendation[] = [];

  // Already overdue
  if (daysToClose < 0) {
    const overdueDays = Math.floor(-daysToClose);
    recs.push({
      id: makeRecId(deal._id.toString(), "close_date_overdue"),
      ruleCode: "close_date_overdue",
      category: "forecast",
      priority: overdueDays > 14 ? "urgent" : "high",
      action: "update_close_date",
      title: `${deal.title} is ${overdueDays} days overdue`,
      message: `Update the expected close date or move this deal to a realistic stage. Overdue deals distort the forecast.`,
      reasoning: [
        `Expected close date passed ${overdueDays} days ago`,
        `Current probability: ${deal.probability}%`,
        `Forecast accuracy is impacted while this stays unresolved`,
      ],
      confidence: 95,
      expectedImpact: "high",
      suggestedDueAt: addDays(0), // same day
    });
    return recs;
  }

  // Closing soon but momentum is weak
  if (daysToClose <= 7) {
    const recentlyActive = daysSince(deal.lastActivityAt) <= 3;
    const isHighProb = deal.probability >= 70;

    if (!recentlyActive || !isHighProb) {
      recs.push({
        id: makeRecId(deal._id.toString(), "close_imminent_unprepared"),
        ruleCode: "close_imminent_unprepared",
        category: "follow_up",
        priority: "urgent",
        action: "schedule_call",
        title: `${deal.title} closes in ${Math.floor(daysToClose)} days`,
        message: `This deal is supposed to close this week but momentum is weak. Get on a call today to confirm or adjust.`,
        reasoning: [
          `Only ${Math.floor(daysToClose)} days to expected close`,
          recentlyActive
            ? `Probability is ${deal.probability}% (need 70%+ for a real commit)`
            : `Last activity ${Math.floor(daysSince(deal.lastActivityAt))} days ago`,
          `Value at risk: ₹${deal.value.toLocaleString("en-IN")}`,
        ],
        confidence: 90,
        expectedImpact: "high",
        estimatedValueAtRisk: Math.round(deal.value * (deal.probability / 100)),
        suggestedDueAt: addDays(0),
      });
    }
  }

  return recs;
};

/* =====================================================
   RULE 3 — STAGE STAGNATION
   Trigger: deal stuck in same stage for unusually long
===================================================== */

export const stageStagnationRule: IntelligenceRule = ({ deal, orgAvgVelocity }) => {
  if (deal.status !== "open") return [];

  const lastTransition =
    deal.stageHistory?.[deal.stageHistory.length - 1]?.enteredAt ??
    deal.updatedAt;

  const daysInStage = daysSince(lastTransition);
  const benchmark   = orgAvgVelocity ?? 14; // fallback
  const ratio       = daysInStage / benchmark;

  if (ratio < 1.5) return []; // not stagnant yet

  let priority: RecommendationPriority;
  let confidence: number;

  if (ratio >= 4)        { priority = "urgent"; confidence = 92; }
  else if (ratio >= 2.5) { priority = "high";   confidence = 82; }
  else                   { priority = "medium"; confidence = 70; }

  return [
    {
      id: makeRecId(deal._id.toString(), "stage_stagnation"),
      ruleCode: "stage_stagnation",
      category: "stage_action",
      priority,
      action: priority === "urgent" ? "escalate_to_manager" : "request_decision",
      title: `${deal.title} stuck in current stage`,
      message: `Deal has been in this stage for ${Math.floor(daysInStage)} days — ${ratio.toFixed(1)}x your team's average. Push for a decision or move it forward.`,
      reasoning: [
        `${Math.floor(daysInStage)} days in current stage`,
        `Team average: ${benchmark} days per stage`,
        `Stagnation ratio: ${ratio.toFixed(1)}x`,
        `Probability: ${deal.probability}%`,
      ],
      confidence,
      expectedImpact: deal.value > 500_000 ? "high" : "medium",
      estimatedValueAtRisk: Math.round(deal.value * (deal.probability / 100) * 0.3),
      suggestedDueAt: addDays(2),
    },
  ];
};

/* =====================================================
   RULE 4 — HIGH-VALUE AT RISK
   Trigger: high-value deal at high or critical risk level
===================================================== */

export const highValueAtRiskRule: IntelligenceRule = ({ deal, orgAvgDealSize }) => {
  if (deal.status !== "open") return [];

  const benchmark    = orgAvgDealSize ?? 500_000;
  const isHighValue  = deal.value >= benchmark * 2;
  const isAtRisk: boolean = (["high", "critical"] as RiskLevel[]).includes(deal.riskLevel);

  if (!isHighValue || !isAtRisk) return [];

  const isCritical = deal.riskLevel === "critical";

  return [
    {
      id: makeRecId(deal._id.toString(), "high_value_at_risk"),
      ruleCode: "high_value_at_risk",
      category: "risk_mitigation",
      priority: isCritical ? "urgent" : "high",
      action: "escalate_to_manager",
      title: `High-value deal at ${deal.riskLevel} risk: ${deal.title}`,
      message: `This is a ${(deal.value / benchmark).toFixed(1)}x average-sized deal showing ${deal.riskLevel} risk. Loop in your manager today.`,
      reasoning: [
        `Deal value: ₹${deal.value.toLocaleString("en-IN")} (${(deal.value / benchmark).toFixed(1)}x team average)`,
        `Risk level: ${deal.riskLevel} (score ${deal.riskScore})`,
        `Top risk factors: ${(deal.riskFactors ?? [])
          .slice(0, 2)
          .map(f => f.factor)
          .join(", ") || "see risk panel"}`,
      ],
      confidence: 90,
      expectedImpact: "high",
      estimatedValueAtRisk: deal.value,
      suggestedDueAt: addDays(0),
    },
  ];
};

/* =====================================================
   RULE 5 — LOW PROBABILITY IN LATE STAGE
   Trigger: deal in late stage with low probability — qualification mismatch
===================================================== */

export const lowProbabilityLateStageRule: IntelligenceRule = ({ deal }) => {
  if (deal.status !== "open") return [];

  // "Late stage" is anything with probability >= 60% expected.
  // We use the stage's intended probability via deal.probability —
  // if it's been manually dropped low while in late stage, that's our signal.
  // Heuristic: probability < 30% but deal exists for 30+ days → likely should be marked lost
  const ageDays = deal.ageDays ?? daysSince(deal.createdAt);
  if (ageDays < 30 || deal.probability >= 30) return [];

  return [
    {
      id: makeRecId(deal._id.toString(), "low_probability_late"),
      ruleCode: "low_probability_late",
      category: "qualification",
      priority: "high",
      action: "mark_lost",
      title: `Consider closing ${deal.title} as lost`,
      message: `This deal is ${Math.floor(ageDays)} days old with only ${deal.probability}% probability. Closing it as lost cleans up your pipeline and improves forecast accuracy.`,
      reasoning: [
        `Deal age: ${Math.floor(ageDays)} days`,
        `Current probability: ${deal.probability}%`,
        `Forecast distortion: deals like this hurt commit accuracy`,
      ],
      confidence: 78,
      expectedImpact: "medium",
      suggestedDueAt: addDays(3),
    },
  ];
};

/* =====================================================
   RULE 6 — COMPETITIVE THREAT
   Trigger: strong competitor flagged on the deal
===================================================== */

export const competitiveThreatRule: IntelligenceRule = ({ deal }) => {
  if (deal.status !== "open") return [];

  const strongCompetitors = (deal.competitors ?? []).filter(
    c => c.strength === "strong"
  );

  if (!strongCompetitors.length) return [];

  return [
    {
      id: makeRecId(deal._id.toString(), "competitive_threat"),
      ruleCode: "competitive_threat",
      category: "competitive",
      priority: "high",
      action: "review_competitor",
      title: `Strong competitor on ${deal.title}`,
      message: `${strongCompetitors.map(c => c.name).join(", ")} is positioned as a strong alternative. Send a battle-card-backed differentiation note within 48 hours.`,
      reasoning: [
        `Strong competitors: ${strongCompetitors.map(c => c.name).join(", ")}`,
        `Deal value: ₹${deal.value.toLocaleString("en-IN")}`,
        `Probability: ${deal.probability}%`,
      ],
      confidence: 85,
      expectedImpact: "high",
      estimatedValueAtRisk: Math.round(deal.value * (deal.probability / 100) * 0.5),
      suggestedDueAt: addDays(2),
    },
  ];
};

/* =====================================================
   RULE 7 — MOMENTUM CELEBRATION (positive signal)
   Trigger: high probability, recent activity, advancing stages
===================================================== */

export const momentumRule: IntelligenceRule = ({ deal }) => {
  if (deal.status !== "open") return [];

  const recentActivity = daysSince(deal.lastActivityAt) <= 2;
  const highProb       = deal.probability >= 70;
  const lowRisk        = deal.riskLevel === "low";

  if (!recentActivity || !highProb || !lowRisk) return [];

  // Only celebrate meaningful deals
  if (deal.value < 500_000) return [];

  return [
    {
      id: makeRecId(deal._id.toString(), "momentum_strong"),
      ruleCode: "momentum_strong",
      category: "celebration",
      priority: "low",
      action: "no_action_needed",
      title: `${deal.title} is trending strong`,
      message: `Excellent momentum — high probability, recent activity, and clean risk profile. Keep the cadence and prepare contracting in parallel.`,
      reasoning: [
        `Probability: ${deal.probability}%`,
        `Last activity: ${Math.floor(daysSince(deal.lastActivityAt))} days ago`,
        `Risk level: low`,
      ],
      confidence: 80,
      expectedImpact: "high",
    },
  ];
};

/* =====================================================
   RULE 8 — MISSING NEXT STEP
   Trigger: open deal without a scheduled follow-up
===================================================== */

export const missingNextStepRule: IntelligenceRule = ({ deal }) => {
  if (deal.status !== "open") return [];
  if (deal.nextFollowUpAt) return [];

  // Only flag if deal is past initial qualification
  if (deal.probability < 30) return [];

  return [
    {
      id: makeRecId(deal._id.toString(), "missing_next_step"),
      ruleCode: "missing_next_step",
      category: "process",
      priority: "medium",
      action: "log_activity",
      title: `No next step on ${deal.title}`,
      message: `Every active deal should have a scheduled next step. Log a follow-up today so this doesn't slip.`,
      reasoning: [
        `No nextFollowUpAt set`,
        `Deal at ${deal.probability}% probability`,
        `Pipeline hygiene best practice`,
      ],
      confidence: 75,
      expectedImpact: "medium",
      suggestedDueAt: addDays(1),
    },
  ];
};

/* =====================================================
   RULE REGISTRY
   The service iterates this list to evaluate every rule.
===================================================== */

export const ALL_RULES: IntelligenceRule[] = [
  staleDealRule,
  closeDateSlippageRule,
  stageStagnationRule,
  highValueAtRiskRule,
  lowProbabilityLateStageRule,
  competitiveThreatRule,
  momentumRule,
  missingNextStepRule,
];

/* Optional: rule metadata for admin UIs / per-org tuning */
export const RULE_METADATA: Record<
  string,
  { description: string; category: RecommendationCategory; defaultEnabled: boolean }
> = {
  stale_deal: {
    description: "Detects deals with no activity for 7+ days",
    category: "engagement",
    defaultEnabled: true,
  },
  close_date_overdue: {
    description: "Flags deals past their expected close date",
    category: "forecast",
    defaultEnabled: true,
  },
  close_imminent_unprepared: {
    description: "Flags deals closing this week without momentum",
    category: "follow_up",
    defaultEnabled: true,
  },
  stage_stagnation: {
    description: "Detects deals stuck in a stage longer than team average",
    category: "stage_action",
    defaultEnabled: true,
  },
  high_value_at_risk: {
    description: "Escalates high-value deals at high/critical risk",
    category: "risk_mitigation",
    defaultEnabled: true,
  },
  low_probability_late: {
    description: "Suggests closing aged low-probability deals as lost",
    category: "qualification",
    defaultEnabled: true,
  },
  competitive_threat: {
    description: "Alerts when a strong competitor is on the deal",
    category: "competitive",
    defaultEnabled: true,
  },
  momentum_strong: {
    description: "Surfaces deals with strong positive momentum",
    category: "celebration",
    defaultEnabled: true,
  },
  missing_next_step: {
    description: "Flags deals without a scheduled next step",
    category: "process",
    defaultEnabled: true,
  },
};