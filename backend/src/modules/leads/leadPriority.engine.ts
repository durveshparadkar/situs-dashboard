import { ILead } from "./lead.model.js";

/* ================= TYPES ================= */

export type PriorityLevel = "low" | "medium" | "high" | "critical";

interface PriorityResult {
  priority: PriorityLevel;
  isStale: boolean;
  daysInactive: number;
}

interface PriorityConfig {
  staleAfterDays: number;
  highBudgetThreshold: number;
  criticalScore: number;
  highScore: number;
  mediumScore: number;
}

/* =====================================================
   DEFAULT CONFIG (READY FOR DB OVERRIDE)
===================================================== */

const DEFAULT_CONFIG: PriorityConfig = {
  staleAfterDays: 5,
  highBudgetThreshold: 1_000_000,
  criticalScore: 85,
  highScore: 70,
  mediumScore: 40,
};

/* =====================================================
   HELPERS
===================================================== */

function safeDate(date?: Date): Date {
  return date ? new Date(date) : new Date();
}

function calculateDaysInactive(date: Date): number {
  const diff =
    Date.now() - date.getTime();

  return Math.max(0, diff / (1000 * 60 * 60 * 24));
}

/* =====================================================
   🚀 PRIORITY ENGINE (ENTERPRISE SAFE)
===================================================== */

export function recalculatePriority(
  lead: ILead,
  config: PriorityConfig = DEFAULT_CONFIG
): PriorityResult {
  /* ================= SAFE VALUES ================= */

  const lastActivity = safeDate(lead.lastActivityAt || lead.createdAt);

  const daysInactive = calculateDaysInactive(lastActivity);

  const isStale = daysInactive >= config.staleAfterDays;

  let priority: PriorityLevel = "low";

  const score = lead.leadScore ?? 0;
  const budget = lead.budget ?? 0;

  /* =====================================================
     1️⃣ SCORE BASED
  ===================================================== */

  if (score >= config.criticalScore) {
    priority = "critical";
  } else if (score >= config.highScore) {
    priority = "high";
  } else if (score >= config.mediumScore) {
    priority = "medium";
  }

  /* =====================================================
     2️⃣ HIGH VALUE FLOOR
  ===================================================== */

  if (budget >= config.highBudgetThreshold && priority === "low") {
    priority = "medium";
  }

  /* =====================================================
     3️⃣ STALE ESCALATION (SMART)
  ===================================================== */

  if (isStale) {
    const escalationMap: Record<PriorityLevel, PriorityLevel> = {
      low: "medium",
      medium: "high",
      high: "high",
      critical: "critical",
    };

    priority = escalationMap[priority];
  }

  /* =====================================================
     4️⃣ AI SIGNAL OVERRIDE
  ===================================================== */

  const hasCriticalSignal =
    lead.brainSnapshot?.signals?.some(
      (s) => s.severity === "critical"
    ) ?? false;

  if (hasCriticalSignal) {
    priority = "critical";
  }

  /* =====================================================
     FINAL
  ===================================================== */

  return {
    priority,
    isStale,
    daysInactive: Number(daysInactive.toFixed(1)),
  };
}