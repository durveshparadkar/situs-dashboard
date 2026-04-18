/* =====================================================
   PRIORITY LEVEL
===================================================== */

export type PriorityLevel =
  | "low"
  | "medium"
  | "high"
  | "critical";

/* =====================================================
   SIGNAL TYPES (EXTENSIBLE)
===================================================== */

export type BrainSignalType =
  | "STALLED"
  | "HIGH_VALUE_NO_REPLY"
  | "FAST_MOVING"
  | "HOT"
  | "COLD"
  | "HIGH_RISK";

/* =====================================================
   BRAIN SIGNAL
===================================================== */

export interface BrainSignal {
  type: BrainSignalType;
  severity: PriorityLevel;
  message: string;

  // Optional metadata for advanced analytics
  metadata?: Record<string, unknown>;
}

/* =====================================================
   LEAD CONTEXT (INTELLIGENCE INPUT)
===================================================== */

export interface LeadContext {
  leadId: string;

  // Financial
  dealValue?: number;

  // Pipeline
  stage: string;
  stageProbability?: number;

  // Activity behavior
  activityCount: number;
  daysSinceLastActivity: number;
  stageChangedRecently: boolean;

  // Optional future intelligence hooks
  leadScore?: number;
}

/* =====================================================
   AI PREDICTION LAYER
===================================================== */

export interface AIPrediction {
  predictedCloseProbability: number; // 0-100
  riskLevel: PriorityLevel;
  reasoning: string;
  nextBestActions: string[];
}

/* =====================================================
   FINAL DECISION OUTPUT
===================================================== */

export interface BrainDecision {
  score: number;
  priority: PriorityLevel;

  signals: BrainSignal[];
  recommendedActions: string[];

  aiPrediction?: AIPrediction;
}