// brain.types.ts

/* =====================================================
   PRIORITY LEVEL
===================================================== */

export type PriorityLevel = "low" | "medium" | "high" | "critical";

export const PRIORITY_LEVELS: readonly PriorityLevel[] = [
  "low",
  "medium",
  "high",
  "critical",
] as const;

/** Numeric rank — lower number = more urgent. Useful for sorting. */
export const PRIORITY_RANK: Record<PriorityLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/* =====================================================
   SIGNAL TYPES — extensible registry
===================================================== */

export type BrainSignalType =
  /* ── Engagement ── */
  | "STALLED"
  | "COLD"
  | "HOT"
  | "RE_ENGAGED"

  /* ── Value-based ── */
  | "HIGH_VALUE_NO_REPLY"
  | "ENTERPRISE_DEAL"

  /* ── Velocity ── */
  | "FAST_MOVING"
  | "STAGE_STAGNATION"
  | "RAPID_STAGE_PROGRESSION"

  /* ── Risk ── */
  | "HIGH_RISK"
  | "CLOSE_DATE_OVERDUE"
  | "CLOSE_DATE_AT_RISK"
  | "CHURN_RISK"

  /* ── Qualification ── */
  | "QUALIFICATION_GAP"
  | "FIT_MISMATCH"

  /* ── Competitive ── */
  | "COMPETITOR_THREAT"
  | "PRICING_OBJECTION"

  /* ── AI / system ── */
  | "AI_RECOMMENDATION"
  | "ANOMALY_DETECTED";

export const BRAIN_SIGNAL_TYPES: readonly BrainSignalType[] = [
  "STALLED",
  "COLD",
  "HOT",
  "RE_ENGAGED",
  "HIGH_VALUE_NO_REPLY",
  "ENTERPRISE_DEAL",
  "FAST_MOVING",
  "STAGE_STAGNATION",
  "RAPID_STAGE_PROGRESSION",
  "HIGH_RISK",
  "CLOSE_DATE_OVERDUE",
  "CLOSE_DATE_AT_RISK",
  "CHURN_RISK",
  "QUALIFICATION_GAP",
  "FIT_MISMATCH",
  "COMPETITOR_THREAT",
  "PRICING_OBJECTION",
  "AI_RECOMMENDATION",
  "ANOMALY_DETECTED",
] as const;

/* =====================================================
   SIGNAL CATEGORIES — for grouped analytics & filtering
===================================================== */

export type SignalCategory =
  | "engagement"
  | "value"
  | "velocity"
  | "risk"
  | "qualification"
  | "competitive"
  | "ai";

export const SIGNAL_CATEGORY_MAP: Record<BrainSignalType, SignalCategory> = {
  STALLED: "engagement",
  COLD: "engagement",
  HOT: "engagement",
  RE_ENGAGED: "engagement",
  HIGH_VALUE_NO_REPLY: "value",
  ENTERPRISE_DEAL: "value",
  FAST_MOVING: "velocity",
  STAGE_STAGNATION: "velocity",
  RAPID_STAGE_PROGRESSION: "velocity",
  HIGH_RISK: "risk",
  CLOSE_DATE_OVERDUE: "risk",
  CLOSE_DATE_AT_RISK: "risk",
  CHURN_RISK: "risk",
  QUALIFICATION_GAP: "qualification",
  FIT_MISMATCH: "qualification",
  COMPETITOR_THREAT: "competitive",
  PRICING_OBJECTION: "competitive",
  AI_RECOMMENDATION: "ai",
  ANOMALY_DETECTED: "ai",
};

/* =====================================================
   BRAIN SIGNAL
===================================================== */

export interface BrainSignal {
  /* Identity */
  type: BrainSignalType;
  category?: SignalCategory;        // auto-derivable via SIGNAL_CATEGORY_MAP

  /* Classification */
  severity: PriorityLevel;
  confidence?: number;              // 0-100 — how sure the engine is

  /* Display */
  message: string;
  reasoning?: string[];             // why this signal fired (transparency)

  /* Behavior */
  isPositive?: boolean;             // true for HOT/RE_ENGAGED/etc
  detectedAt?: Date;                // when this signal was raised
  expiresAt?: Date;                 // when this signal becomes stale

  /* Linkage */
  relatedActivityIds?: string[];    // activities that triggered this signal

  /* Future extensibility */
  metadata?: Record<string, unknown>;
}

/* =====================================================
   RECOMMENDED ACTION — rich, structured
===================================================== */

export type ActionCategory =
  | "follow_up"
  | "escalation"
  | "engagement"
  | "qualification"
  | "process"
  | "competitive"
  | "celebration";

export type ActionType =
  | "schedule_call"
  | "send_email"
  | "send_whatsapp"
  | "schedule_meeting"
  | "send_proposal"
  | "request_decision"
  | "escalate_to_manager"
  | "assign_senior_rep"
  | "update_close_date"
  | "update_probability"
  | "advance_stage"
  | "mark_lost"
  | "qualify"
  | "disqualify"
  | "reactivate_or_archive"
  | "log_activity"
  | "review_competitor"
  | "no_action_needed";

export interface RecommendedAction {
  /* Identity */
  id?: string;                      // stable id for dedup/dismiss tracking
  type: ActionType;

  /* Display */
  action: string;                   // human-readable action text
  reason: string;                   // why this action is recommended

  /* Classification */
  priority: PriorityLevel;
  category: ActionCategory;

  /* Confidence & impact */
  confidence?: number;              // 0-100
  expectedImpact?: "low" | "medium" | "high";
  estimatedValueAtRisk?: number;    // INR

  /* Scheduling */
  suggestedDueAt?: Date;

  /* Future extensibility */
  metadata?: Record<string, unknown>;
}

/* =====================================================
   LEAD CONTEXT — input to the brain engine
===================================================== */

export interface LeadContext {
  /* Identity */
  leadId: string;
  organizationId?: string;

  /* Financial */
  dealValue?: number;
  currency?: string;

  /* Pipeline */
  stage: string;
  stageId?: string;
  stageProbability?: number;
  pipelineId?: string;

  /* Activity */
  activityCount: number;
  daysSinceLastActivity: number;
  stageChangedRecently: boolean;
  daysInCurrentStage?: number;

  /* Lifecycle */
  ageDays?: number;                 // how long the lead has existed
  expectedCloseDate?: Date | null;
  lastContactedAt?: Date | null;
  nextFollowUpAt?: Date | null;

  /* Scoring */
  leadScore?: number;
  riskScore?: number;

  /* Categorical */
  source?: string;
  industry?: string;
  tags?: string[];

  /* Ownership context */
  assignedToUserId?: string;
  repWinRate?: number;              // 0-100 — used by some rules

  /* Signals already detected (for compounding rules) */
  prevSignals?: BrainSignalType[];
}

/* =====================================================
   AI PREDICTION
===================================================== */

export interface AIPrediction {
  /* Core prediction */
  predictedCloseProbability: number; // 0-100
  riskLevel: Exclude<PriorityLevel, "critical">; // AI uses low/medium/high
  reasoning: string;
  nextBestActions: string[];

  /* Provenance — for trust & cost tracking */
  source?: "ai" | "fallback" | "cache" | "circuit_breaker";
  modelVersion?: string;            // e.g. "gpt-4o-mini-2024-07-18"
  generatedAt?: Date;
  tokensUsed?: number;
  confidence?: number;              // 0-100

  /* Future extensibility */
  metadata?: Record<string, unknown>;
}

/* =====================================================
   BRAIN DECISION — final output
===================================================== */

export interface BrainDecisionMeta {
  generatedAt: Date;
  durationMs?: number;
  signalsCount: number;
  topSignal?: BrainSignalType;
  reasoning: string[];
  engineVersion?: string;           // for tracking decisions made by older logic
}

export interface BrainDecision {
  /* Core scores */
  score: number;                    // 0-100
  priority: PriorityLevel;
  confidence?: number;              // 0-100 — how sure the brain is

  /* Outputs */
  signals: BrainSignal[];
  recommendedActions: string[];     // backwards-compat: simple strings
  detailedActions?: RecommendedAction[]; // new: rich action objects

  /* Optional AI layer */
  aiPrediction?: AIPrediction;

  /* Optional metadata (added by service layer) */
  meta?: BrainDecisionMeta;
}

/* =====================================================
   SERVICE-LEVEL TYPES — for downstream callers
===================================================== */

/** Returned by analyzeLead in the service layer */
export interface AnalyzeLeadResult extends Omit<BrainDecision, "meta"> {
  meta: BrainDecisionMeta & {
    leadId: string;
    analyzedAt: Date;
    aiUsed: boolean;
    aiSource?: "ai" | "fallback" | "cache" | "circuit_breaker";
    isStale: boolean;
  };
}

/** Returned by batch analysis */
export interface BatchAnalyzeResult {
  total: number;
  succeeded: number;
  failed: number;
  durationMs: number;
}

/* =====================================================
   TYPE GUARDS — runtime validation helpers
===================================================== */

export function isPriorityLevel(value: unknown): value is PriorityLevel {
  return typeof value === "string" && (PRIORITY_LEVELS as readonly string[]).includes(value);
}

export function isBrainSignalType(value: unknown): value is BrainSignalType {
  return typeof value === "string" && (BRAIN_SIGNAL_TYPES as readonly string[]).includes(value);
}

export function isBrainSignal(value: unknown): value is BrainSignal {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    isBrainSignalType(v.type) &&
    isPriorityLevel(v.severity) &&
    typeof v.message === "string"
  );
}

/* =====================================================
   UTILITY HELPERS
===================================================== */

/**
 * Compare two priority levels.
 * Returns negative if a is more urgent than b, positive if less.
 */
export function comparePriorityLevels(
  a: PriorityLevel,
  b: PriorityLevel
): number {
  return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}

/** Get the more urgent of two priorities. */
export function maxPriority(
  a: PriorityLevel,
  b: PriorityLevel
): PriorityLevel {
  return PRIORITY_RANK[a] <= PRIORITY_RANK[b] ? a : b;
}

/** Auto-derive category from signal type */
export function getSignalCategory(type: BrainSignalType): SignalCategory {
  return SIGNAL_CATEGORY_MAP[type];
}