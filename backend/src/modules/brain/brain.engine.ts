// brain.core.ts (or wherever this lives — confirm path before saving)
import {
  LeadContext,
  BrainDecision,
  PriorityLevel,
} from "./brain.types.js";

import { calculateScore } from "./scoring.engine.js";
import { detectSignals } from "./signals.engine.js";
import { formatCurrency } from "../../shared/utils/currency.js";
import type { OrganizationCurrency } from "../organizations/organization.model.js";

/* =====================================================
   CONFIG — all tunable thresholds in one place
===================================================== */

export const BRAIN_CONFIG = {
  /* Priority thresholds */
  inactivityCriticalDays: 10,
  inactivityDowngradeDays: 20,
  highValueThreshold: 500_000,        // INR
  enterpriseValueThreshold: 1_000_000, // INR

  /* Score-based priority cutoffs */
  scoreHigh: 80,
  scoreMedium: 55,

  /* Inactivity action triggers */
  inactivityReminderDays: 7,
  inactivityUrgentDays: 14,

  /* Confidence calculation */
  baseConfidence: 60,
  signalConfidenceBonus: 8,    // per high/critical signal
  highScoreConfidenceBonus: 15,
} as const;

/* =====================================================
   TYPES
===================================================== */

interface Signal {
  type: string;
  severity: PriorityLevel;
  message?: string;
  detectedAt?: Date;
}

interface RecommendedAction {
  action: string;
  reason: string;
  priority: PriorityLevel;
  category: ActionCategory;
}

type ActionCategory =
  | "follow_up"
  | "escalation"
  | "engagement"
  | "qualification"
  | "process";

interface BrainDecisionMeta {
  generatedAt: Date;
  durationMs: number;
  signalsCount: number;
  topSignal?: string;
  reasoning: string[];
}

/* =====================================================
   CURRENCY HELPER
   LeadContext may not have a currency field yet (added
   defensively here so this compiles regardless — add
   currency?: OrganizationCurrency to brain.types.ts's
   LeadContext for full type safety when convenient). Falls
   back to INR, same as before this refactor.
===================================================== */

function getContextCurrency(context: LeadContext): OrganizationCurrency {
  return (context as unknown as { currency?: OrganizationCurrency }).currency ?? "INR";
}

/* =====================================================
   PRIORITY ORDER — for comparisons
===================================================== */

const PRIORITY_RANK: Record<PriorityLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function maxPriority(a: PriorityLevel, b: PriorityLevel): PriorityLevel {
  return PRIORITY_RANK[a] <= PRIORITY_RANK[b] ? a : b;
}

/* =====================================================
   PRIORITY DERIVATION ENGINE
===================================================== */

interface PriorityResult {
  priority: PriorityLevel;
  reasoning: string[];
}

function derivePriority(
  context: LeadContext,
  score: number,
  signals: Signal[]
): PriorityResult {
  const dealValue      = context.dealValue ?? 0;
  const inactivityDays = context.daysSinceLastActivity;
  const currency        = getContextCurrency(context);
  const reasoning: string[] = [];

  // 1️⃣ Critical signal overrides everything
  if (signals.some(s => s.severity === "critical")) {
    const criticalSignals = signals.filter(s => s.severity === "critical").map(s => s.type);
    reasoning.push(`Critical signal(s) detected: ${criticalSignals.join(", ")}`);
    return { priority: "critical", reasoning };
  }

  // 2️⃣ Long inactivity + high deal value = critical
  if (
    inactivityDays > BRAIN_CONFIG.inactivityCriticalDays &&
    dealValue > BRAIN_CONFIG.highValueThreshold
  ) {
    reasoning.push(
      `High-value deal (${formatCurrency(dealValue, currency)}) inactive for ${inactivityDays} days`
    );
    
    return { priority: "critical", reasoning };
  }

  // 3️⃣ High-severity signal present
  if (signals.some(s => s.severity === "high")) {
    const highSignals = signals.filter(s => s.severity === "high").map(s => s.type);
    reasoning.push(`High-severity signal(s): ${highSignals.join(", ")}`);
    return { priority: "high", reasoning };
  }

  // 4️ Inactive lead downgrade
  if (inactivityDays > BRAIN_CONFIG.inactivityDowngradeDays) {
    reasoning.push(`Lead inactive for ${inactivityDays} days — deprioritized`);
    return { priority: "low", reasoning };
  }

  // 5️⃣ Score-based fallback
  if (score >= BRAIN_CONFIG.scoreHigh) {
    reasoning.push(`High lead score (${score})`);
    return { priority: "high", reasoning };
  }
  if (score >= BRAIN_CONFIG.scoreMedium) {
    reasoning.push(`Medium lead score (${score})`);
    return { priority: "medium", reasoning };
  }

  reasoning.push(`Low engagement signals and score (${score})`);
  return { priority: "low", reasoning };
}

/* =====================================================
   ACTION BUILDER — returns rich actions, not just strings
===================================================== */

function buildRecommendedActions(
  context: LeadContext,
  signals: Signal[],
  priority: PriorityLevel
): RecommendedAction[] {
  // Use a Map keyed by action text to dedupe while preserving order
  const actionMap = new Map<string, RecommendedAction>();

  const dealValue      = context.dealValue ?? 0;
  const inactivityDays = context.daysSinceLastActivity;
  const currency        = getContextCurrency(context);

  /* ── Signal-driven actions ── */
  for (const signal of signals) {
    switch (signal.type) {
      case "STALLED":
        actionMap.set("follow_up_immediate", {
          action: "Follow up with the lead immediately",
          reason: "Lead has stalled and momentum is lost",
          priority: signal.severity,
          category: "follow_up",
        });
        break;

      case "HIGH_VALUE_NO_REPLY":
        actionMap.set("escalate_no_reply", {
          action: "Escalate high-value deal and re-engage client",
          reason: `High-value deal (${formatCurrency(dealValue, currency)}) without response`,
          priority: "high",
          category: "escalation",
        });
        break;

      case "FAST_MOVING":
        actionMap.set("prioritize_close", {
          action: "Prioritize this deal to close quickly",
          reason: "Deal is moving fast — strike while iron is hot",
          priority: "high",
          category: "follow_up",
        });
        break;

      case "HOT":
        actionMap.set("schedule_close_call", {
          action: "Schedule a call to move toward closing",
          reason: "Lead is hot and showing strong buying signals",
          priority: "high",
          category: "follow_up",
        });
        break;

      case "COLD":
        actionMap.set("reactivate_or_archive", {
          action: "Consider reactivation campaign or archive",
          reason: "Lead has gone cold and is unlikely to convert",
          priority: "low",
          category: "qualification",
        });
        break;

      case "QUALIFICATION_GAP":
        actionMap.set("requalify_lead", {
          action: "Run discovery call to re-qualify lead fit",
          reason: "Qualification data is incomplete or stale",
          priority: "medium",
          category: "qualification",
        });
        break;

      case "COMPETITOR_THREAT":
        actionMap.set("competitive_response", {
          action: "Send differentiation note and battle card",
          reason: "Strong competitor identified on this deal",
          priority: "high",
          category: "engagement",
        });
        break;
    }
  }

  /* ── Inactivity-based actions ── */
  if (inactivityDays > BRAIN_CONFIG.inactivityUrgentDays) {
    actionMap.set("urgent_reengagement", {
      action: "Send urgent re-engagement message via preferred channel",
      reason: `No activity for ${inactivityDays} days`,
      priority: "high",
      category: "engagement",
    });
  } else if (inactivityDays > BRAIN_CONFIG.inactivityReminderDays) {
    actionMap.set("reminder_follow_up", {
      action: "Send reminder or WhatsApp follow-up",
      reason: `No activity for ${inactivityDays} days`,
      priority: "medium",
      category: "engagement",
    });
  }

  /* ── Value-based escalation ── */
  if (dealValue > BRAIN_CONFIG.enterpriseValueThreshold) {
    actionMap.set("senior_assignment", {
      action: "Assign senior sales rep for strategic handling",
      reason: `Enterprise-tier deal value (${formatCurrency(dealValue, currency)})`,
      priority: "high",
      category: "escalation",
    });
  }

  /* ── Default action if nothing else fired ── */
  if (actionMap.size === 0) {
    actionMap.set("continue_cadence", {
      action: "Continue current outreach cadence",
      reason: `No urgent signals detected`,
      priority,
      category: "follow_up",
    });
  }

  /* Sort by priority (critical first), then return */
  return Array.from(actionMap.values()).sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  );
}

/* =====================================================
   CONFIDENCE CALCULATION
   Reflects how certain the brain is of its output.
===================================================== */

function calculateConfidence(
  score: number,
  signals: Signal[]
): number {
  let confidence = BRAIN_CONFIG.baseConfidence;

  // High/critical signals add certainty (clearer evidence)
  const strongSignals = signals.filter(
    s => s.severity === "high" || s.severity === "critical"
  ).length;
  confidence += strongSignals * BRAIN_CONFIG.signalConfidenceBonus;

  // Extreme scores (very high or very low) are more confident
  if (score >= 80 || score <= 20) {
    confidence += BRAIN_CONFIG.highScoreConfidenceBonus;
  }

  return Math.max(0, Math.min(100, Math.round(confidence)));
}

/* =====================================================
   MAIN BRAIN EXECUTION
===================================================== */

export function runBrain(context: LeadContext): BrainDecision & { meta: BrainDecisionMeta } {
  const startedAt = Date.now();

  /* ── Validation ── */
  if (!context) {
    throw new Error("LeadContext is required");
  }

  /* ── 1. Score the lead ── */
  const score = calculateScore(context);

  /* ── 2. Detect signals (with safety wrapper) ── */
  let signals: Signal[];
  try {
    signals = detectSignals(context, score) as Signal[];
  } catch (err) {
    // If signal detection fails, continue with no signals rather than break the whole brain
    signals = [];
  }

  /* ── 3. Derive priority ── */
  const { priority, reasoning } = derivePriority(context, score, signals);

  /* ── 4. Build recommended actions ── */
  const recommendedActions = buildRecommendedActions(context, signals, priority);

  /* ── 5. Calculate confidence ── */
  const confidence = calculateConfidence(score, signals);

  /* ── 6. Identify top signal for quick UI display ── */
  const topSignal = signals.length
    ? [...signals].sort(
        (a, b) => PRIORITY_RANK[a.severity] - PRIORITY_RANK[b.severity]
      )[0]?.type
    : undefined;

  /* ── 7. Assemble decision ── */
  const decision: BrainDecision & { meta: BrainDecisionMeta } = {
    score,
    priority,
    signals,
    confidence,
    recommendedActions: recommendedActions.map(a => a.action), // backward-compat: string array
    detailedActions: recommendedActions,                       // new: rich action objects
    meta: {
      generatedAt: new Date(),
      durationMs: Date.now() - startedAt,
      signalsCount: signals.length,
      reasoning,
      ...(topSignal !== undefined && { topSignal }),
    },
  } as BrainDecision & { meta: BrainDecisionMeta };

  return decision;
}

/* =====================================================
   TEST HELPERS — exported for unit tests only
===================================================== */

export const _internal = {
  derivePriority,
  buildRecommendedActions,
  calculateConfidence,
};