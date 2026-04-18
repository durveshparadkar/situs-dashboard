import { ILead } from "./lead.model.js";

export type PriorityLevel =
  | "low"
  | "medium"
  | "high"
  | "critical";

interface PriorityResult {
  priority: PriorityLevel;
  isStale: boolean;
}

interface PriorityConfig {
  staleAfterDays: number;
  highBudgetThreshold: number;
  criticalScore: number;
  highScore: number;
}

/* =====================================================
   DEFAULT CONFIG (Can Be Made Org-Level Later)
===================================================== */

const defaultConfig: PriorityConfig = {
  staleAfterDays: 5,
  highBudgetThreshold: 1000000,
  criticalScore: 85,
  highScore: 70,
};

/* =====================================================
   SMART PRIORITY ENGINE
===================================================== */

export function recalculatePriority(
  lead: ILead,
  config: PriorityConfig = defaultConfig
): PriorityResult {
  const now = new Date();
  const lastActivity = new Date(lead.lastActivityAt);

  const daysInactive =
    (now.getTime() - lastActivity.getTime()) /
    (1000 * 60 * 60 * 24);

  const isStale = daysInactive >= config.staleAfterDays;

  let priority: PriorityLevel = "low";

  /* =====================================================
     1️⃣ SCORE-BASED RULES
  ===================================================== */

  if (lead.leadScore >= config.criticalScore) {
    priority = "critical";
  } else if (lead.leadScore >= config.highScore) {
    priority = "high";
  } else if (lead.leadScore >= 40) {
    priority = "medium";
  }

  /* =====================================================
     2️⃣ HIGH BUDGET FLOOR RULE
  ===================================================== */

  if (
    lead.budget >= config.highBudgetThreshold &&
    priority === "low"
  ) {
    priority = "medium";
  }

  /* =====================================================
     3️⃣ STALE ESCALATION RULE
     (We escalate instead of downgrade)
  ===================================================== */

  if (isStale) {
    if (priority === "low") priority = "medium";
    else if (priority === "medium") priority = "high";
  }

  /* =====================================================
     4️⃣ CRITICAL SIGNAL OVERRIDE
  ===================================================== */

  const hasCriticalSignal =
    lead.brainSnapshot?.signals?.some(
      (s) => s.severity === "critical"
    );

  if (hasCriticalSignal) {
    priority = "critical";
  }

  return {
    priority,
    isStale,
  };
}