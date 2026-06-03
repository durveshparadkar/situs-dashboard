// scoring.engine.ts
import { LeadContext } from "./brain.types.js";

/* =====================================================
   ENGINE VERSION
   Bump this when scoring logic changes meaningfully.
   Stored alongside scores so you can A/B test models.
===================================================== */

export const SCORING_ENGINE_VERSION = "2.0.0";

/* =====================================================
   CONFIG — every weight & threshold in one place
   Tune the engine without touching logic.
===================================================== */

export const SCORING_CONFIG = {
  /* Base score everyone starts at */
  baseScore: 40,

  /* Activity factor — log scale so 100 activities ≠ 100x score */
  activity: {
    multiplier: 12,             // log10(count+1) × 12
    maxBonus: 25,               // hard cap to prevent runaway scores
  },

  /* Inactivity penalty — escalates after a grace period */
  inactivity: {
    gracePeriodDays: 7,         // first 7 days are "soft" penalty
    softMultiplier: 2,          // 2 points per day for first week
    hardMultiplier: 4,          // 4 points per day after that
    maxPenalty: 50,             // can't drag score below baseline + this
  },

  /* Deal value — log scale so ₹1Cr deal gets weight without overwhelming */
  dealValue: {
    multiplier: 6,              // log10(value+1) × 6
    maxBonus: 25,
  },

  /* Stage probability — direct contribution */
  stageProbability: {
    weight: 0.3,                // probability × 0.3 (max 30 pts at 100%)
  },

  /* Velocity bonus — recent stage change + recent activity */
  fastMovement: {
    bonus: 8,
    inactivityCap: 3,           // must have activity within last 3 days
  },

  /* Lead score (external) — incorporated if provided */
  leadScore: {
    weight: 0.15,               // weighted blend with computed score
  },

  /* Risk score — penalty for high risk */
  riskScore: {
    weight: 0.2,                // riskScore × 0.2 = penalty
    threshold: 50,              // only penalize above this
  },

  /* High-value-no-reply penalty */
  highValueNoReply: {
    valueThreshold: 1_000_000,  // INR
    inactivityThreshold: 7,     // days
    penalty: 10,
  },

  /* Tag-based modifiers */
  tags: {
    "hot-lead":     { bonus: 10 },
    "qualified":    { bonus: 8  },
    "champion":     { bonus: 6  },
    "decision-maker": { bonus: 5 },
    "no-budget":    { bonus: -8 },
    "wrong-fit":    { bonus: -10 },
    "do-not-contact": { bonus: -20 },
  } as Record<string, { bonus: number }>,

  /* Source-based modifiers */
  sources: {
    "referral":     { bonus: 5  },
    "inbound":      { bonus: 3  },
    "outbound":     { bonus: 0  },
    "list-import":  { bonus: -3 },
    "scraped":      { bonus: -5 },
  } as Record<string, { bonus: number }>,

  /* Score bounds */
  minScore: 0,
  maxScore: 100,
} as const;

/* =====================================================
   TYPES
===================================================== */

/**
 * Each scoring step contributes a delta and a reason.
 * Collected into a "trace" for explainability.
 */
export interface ScoreFactor {
  factor: string;          // e.g. "activity", "inactivity_penalty"
  delta: number;           // contribution to score (+/-)
  reason: string;          // human-readable explanation
}

export interface ScoreBreakdown {
  score: number;                 // final clamped score
  rawScore: number;              // before clamping (for debug)
  baseScore: number;
  factors: ScoreFactor[];
  engineVersion: string;
  computedAt: Date;
}

/* =====================================================
   HELPERS
===================================================== */

function clampScore(score: number): number {
  return Math.max(
    SCORING_CONFIG.minScore,
    Math.min(SCORING_CONFIG.maxScore, score)
  );
}

function logScale(value: number, multiplier: number): number {
  if (value <= 0) return 0;
  return Math.log10(value + 1) * multiplier;
}

/* =====================================================
   PRIVATE — INDIVIDUAL FACTOR CALCULATORS
   Each is pure, testable, and returns a ScoreFactor.
===================================================== */

function activityFactor(context: LeadContext): ScoreFactor | null {
  const count = context.activityCount ?? 0;
  if (count <= 0) return null;

  const cfg   = SCORING_CONFIG.activity;
  const raw   = logScale(count, cfg.multiplier);
  const delta = Math.min(raw, cfg.maxBonus);

  return {
    factor: "activity",
    delta: Math.round(delta * 10) / 10,
    reason: `${count} ${count === 1 ? "activity" : "activities"} logged`,
  };
}

function inactivityFactor(context: LeadContext): ScoreFactor | null {
  const days = context.daysSinceLastActivity;
  if (days <= 0) return null;

  const cfg = SCORING_CONFIG.inactivity;
  let penalty: number;

  if (days <= cfg.gracePeriodDays) {
    penalty = days * cfg.softMultiplier;
  } else {
    penalty =
      cfg.gracePeriodDays * cfg.softMultiplier +
      (days - cfg.gracePeriodDays) * cfg.hardMultiplier;
  }

  penalty = Math.min(penalty, cfg.maxPenalty);

  return {
    factor: "inactivity_penalty",
    delta: -Math.round(penalty),
    reason: `Inactive for ${days} ${days === 1 ? "day" : "days"}`,
  };
}

function dealValueFactor(context: LeadContext): ScoreFactor | null {
  const value = context.dealValue ?? 0;
  if (value <= 0) return null;

  const cfg   = SCORING_CONFIG.dealValue;
  const raw   = logScale(value, cfg.multiplier);
  const delta = Math.min(raw, cfg.maxBonus);

  // Format value for the reason string
  const formatted =
    value >= 10_000_000
      ? `₹${(value / 10_000_000).toFixed(1)}Cr`
      : value >= 100_000
      ? `₹${(value / 100_000).toFixed(1)}L`
      : `₹${value.toLocaleString("en-IN")}`;

  return {
    factor: "deal_value",
    delta: Math.round(delta * 10) / 10,
    reason: `Deal value: ${formatted}`,
  };
}

function stageProbabilityFactor(context: LeadContext): ScoreFactor | null {
  const prob = context.stageProbability ?? 0;
  if (prob <= 0) return null;

  const delta = prob * SCORING_CONFIG.stageProbability.weight;

  return {
    factor: "stage_probability",
    delta: Math.round(delta * 10) / 10,
    reason: `Stage probability: ${prob}%`,
  };
}

function fastMovementFactor(context: LeadContext): ScoreFactor | null {
  const cfg = SCORING_CONFIG.fastMovement;
  if (!context.stageChangedRecently) return null;
  if (context.daysSinceLastActivity > cfg.inactivityCap) return null;

  return {
    factor: "fast_movement_bonus",
    delta: cfg.bonus,
    reason: "Recent stage change with fresh activity",
  };
}

function leadScoreBlendFactor(context: LeadContext): ScoreFactor | null {
  const externalScore = context.leadScore;
  if (externalScore === undefined || externalScore === null) return null;

  const cfg   = SCORING_CONFIG.leadScore;
  // Blend external score: weighted contribution toward final
  const delta = (externalScore - SCORING_CONFIG.baseScore) * cfg.weight;

  return {
    factor: "lead_score_blend",
    delta: Math.round(delta * 10) / 10,
    reason: `External lead score: ${externalScore}`,
  };
}

function riskScoreFactor(context: LeadContext): ScoreFactor | null {
  const risk = context.riskScore;
  if (risk === undefined || risk === null) return null;

  const cfg = SCORING_CONFIG.riskScore;
  if (risk < cfg.threshold) return null;

  const delta = -((risk - cfg.threshold) * cfg.weight);

  return {
    factor: "risk_penalty",
    delta: Math.round(delta * 10) / 10,
    reason: `Risk score elevated (${risk}/100)`,
  };
}

function highValueNoReplyFactor(context: LeadContext): ScoreFactor | null {
  const cfg = SCORING_CONFIG.highValueNoReply;
  const value = context.dealValue ?? 0;
  const days  = context.daysSinceLastActivity;

  if (value < cfg.valueThreshold) return null;
  if (days < cfg.inactivityThreshold) return null;

  return {
    factor: "high_value_no_reply",
    delta: -cfg.penalty,
    reason: "High-value deal with no recent contact",
  };
}

function tagModifiersFactor(context: LeadContext): ScoreFactor[] {
  if (!context.tags?.length) return [];

  const factors: ScoreFactor[] = [];

  for (const tag of context.tags) {
    const cfg = SCORING_CONFIG.tags[tag.toLowerCase()];
    if (!cfg) continue;

    factors.push({
      factor: `tag:${tag}`,
      delta: cfg.bonus,
      reason: `Tagged "${tag}"`,
    });
  }

  return factors;
}

function sourceFactor(context: LeadContext): ScoreFactor | null {
  if (!context.source) return null;

  const cfg = SCORING_CONFIG.sources[context.source.toLowerCase()];
  if (!cfg || cfg.bonus === 0) return null;

  return {
    factor: `source:${context.source}`,
    delta: cfg.bonus,
    reason: `Lead source: ${context.source}`,
  };
}

/* =====================================================
   PUBLIC — MAIN SCORING ENGINE
===================================================== */

/**
 * Calculate a lead score (0-100) with full breakdown.
 * Returns only the final score; for the breakdown, use calculateScoreWithBreakdown.
 */
export function calculateScore(context: LeadContext): number {
  return calculateScoreWithBreakdown(context).score;
}

/**
 * Calculate a lead score AND return the explainable breakdown.
 * Use this when you want to show "why is this lead scored 67?" in the UI.
 */
export function calculateScoreWithBreakdown(
  context: LeadContext
): ScoreBreakdown {
  /* ── Validation ── */
  if (!context) {
    return {
      score: SCORING_CONFIG.baseScore,
      rawScore: SCORING_CONFIG.baseScore,
      baseScore: SCORING_CONFIG.baseScore,
      factors: [],
      engineVersion: SCORING_ENGINE_VERSION,
      computedAt: new Date(),
    };
  }

  /* ── Collect all factors ── */
  const factors: ScoreFactor[] = [];

  const singleFactorRunners: Array<(ctx: LeadContext) => ScoreFactor | null> = [
    activityFactor,
    inactivityFactor,
    dealValueFactor,
    stageProbabilityFactor,
    fastMovementFactor,
    leadScoreBlendFactor,
    riskScoreFactor,
    highValueNoReplyFactor,
    sourceFactor,
  ];

  for (const runner of singleFactorRunners) {
    try {
      const factor = runner(context);
      if (factor) factors.push(factor);
    } catch {
      // One bad factor calculator should never break scoring
      continue;
    }
  }

  /* Multi-factor runners (return arrays) */
  try {
    factors.push(...tagModifiersFactor(context));
  } catch {
    // Skip on failure
  }

  /* ── Aggregate ── */
  const baseScore = SCORING_CONFIG.baseScore;
  const totalDelta = factors.reduce((sum, f) => sum + f.delta, 0);
  const rawScore = baseScore + totalDelta;
  const score = clampScore(Math.round(rawScore));

  return {
    score,
    rawScore: Math.round(rawScore * 10) / 10,
    baseScore,
    factors,
    engineVersion: SCORING_ENGINE_VERSION,
    computedAt: new Date(),
  };
}

/* =====================================================
   TEST HELPERS — exported for unit tests only
===================================================== */

export const _internal = {
  activityFactor,
  inactivityFactor,
  dealValueFactor,
  stageProbabilityFactor,
  fastMovementFactor,
  leadScoreBlendFactor,
  riskScoreFactor,
  highValueNoReplyFactor,
  tagModifiersFactor,
  sourceFactor,
  clampScore,
  logScale,
};