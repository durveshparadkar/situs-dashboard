import {
  LeadContext,
  BrainDecision,
  PriorityLevel,
} from "./brain.types.js";

import { calculateScore } from "./scoring.engine.js";
import { detectSignals } from "./signals.engine.js";

/* =====================================================
   PRIORITY DERIVATION ENGINE
===================================================== */

function derivePriority(
  context: LeadContext,
  score: number,
  signals: { severity: PriorityLevel }[]
): PriorityLevel {
  const dealValue = context.dealValue ?? 0;
  const inactivityDays = context.daysSinceLastActivity;

  // 1️⃣ Critical signal overrides everything
  if (signals.some((s) => s.severity === "critical")) {
    return "critical";
  }

  // 2️⃣ High signal present
  if (signals.some((s) => s.severity === "high")) {
    return "high";
  }

  // 3️⃣ Long inactivity + high deal value = critical
  if (inactivityDays > 10 && dealValue > 500000) {
    return "critical";
  }

  // 4️⃣ Inactive lead downgrade
  if (inactivityDays > 20) {
    return "low";
  }

  // 5️⃣ Score-based fallback
  if (score >= 80) return "high";
  if (score >= 55) return "medium";

  return "low";
}

/* =====================================================
   RECOMMENDED ACTION BUILDER
===================================================== */

function buildRecommendedActions(
  context: LeadContext,
  signals: { type: string }[]
): string[] {
  const actions = new Set<string>();

  const dealValue = context.dealValue ?? 0;
  const inactivityDays = context.daysSinceLastActivity;

  for (const signal of signals) {
    switch (signal.type) {
      case "STALLED":
        actions.add("Follow up with the lead immediately.");
        break;

      case "HIGH_VALUE_NO_REPLY":
        actions.add(
          "Escalate high value deal and re-engage client."
        );
        break;

      case "FAST_MOVING":
        actions.add(
          "Prioritize this deal to close quickly."
        );
        break;

      case "HOT":
        actions.add(
          "Schedule a call to move toward closing."
        );
        break;

      case "COLD":
        actions.add(
          "Consider reactivation campaign or archive."
        );
        break;
    }
  }

  // Inactivity reminder
  if (inactivityDays > 7) {
    actions.add("Send reminder or WhatsApp follow-up.");
  }

  // High value escalation
  if (dealValue > 1000000) {
    actions.add(
      "Assign senior sales rep for strategic handling."
    );
  }

  return Array.from(actions);
}

/* =====================================================
   MAIN BRAIN EXECUTION
===================================================== */

export function runBrain(
  context: LeadContext
): BrainDecision {
  const score = calculateScore(context);

  const signals = detectSignals(context, score);

  const priority = derivePriority(
    context,
    score,
    signals
  );

  const recommendedActions =
    buildRecommendedActions(context, signals);

  return {
    score,
    priority,
    signals,
    recommendedActions,
  };
}