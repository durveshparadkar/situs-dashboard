// revenue-decision.engine.ts
//
// The COMPOSER engine. Takes the outputs of the other intelligence engines
// (risk, attention, forecast, leaks, health) and produces a prioritized
// list of concrete revenue actions: "what should this sales rep do today
// to maximize revenue?"
//
// This is the engine that powers:
//   - Dashboard "Today's Top Actions" widget
//   - Daily email digest: "5 things to focus on this morning"
//   - Manager-level views: "what's blocking my team's revenue this week?"
//   - The narrative LLM layer (consumes actions + generates explanations)
//
// Unlike the other engines, this one DOES NOT compute its own signals.
// It receives:
//   - Pre-computed risk scores (from deal-risk.engine.ts)
//   - Pre-computed health scores (from deal-health.engine.ts when available)
//   - Pre-computed attention alerts (from deals-attention.engine.ts)
// And composes them into a ranked action list.
//
// Pure function. No I/O. Deterministic given same inputs.

import type { Types } from "mongoose";

// ============================================================
// VERSIONING
// ============================================================

export const REVENUE_DECISION_ENGINE_VERSION = "1.0.0" as const;

// ============================================================
// CONFIG
// ============================================================

const REVENUE_DECISION_CONFIG = {
  /** Critical risk threshold — overrides everything else */
  criticalRisk: {
    riskScoreMin: 75,
    basePriority: 100,
  },

  /** Stalled deal inactivity */
  inactivity: {
    daysMin:           10,
    severeDaysMin:     20,
    basePriority:      40,
    severeBasePriority: 70,
  },

  /** Late-stage deal in trouble */
  lateStageAtRisk: {
    healthScoreMax: 40,
    basePriority:   80,
  },

  /** Late-stage strong opportunity */
  lateStageOpportunity: {
    healthScoreMin: 75,
    riskScoreMax:   40,
    basePriority:   50,
  },

  /** Hot deal (high health, mid-stage) — push to close */
  hotDealOpportunity: {
    healthScoreMin: 80,
    probabilityMin: 60,
    basePriority:   55,
  },

  /** Quick win — low value but healthy + late stage */
  quickWin: {
    healthScoreMin:    65,
    valueMax:          200_000, // ₹2 Lakh and below
    basePriority:      35,
  },

  /** Coaching signal — many low-health deals from same rep */
  coachingThreshold: {
    minLowHealthDeals:  5,
    healthScoreMax:    50,
  },

  /** Value-based priority weighting */
  valueWeight: {
    /** Per-rupee priority bump — small but meaningful for large deals */
    perRupeeFactor: 1 / 100_000, // ₹1 Lakh = +1 priority point
    /** Cap to prevent mega-deals from dominating */
    maxBoost: 30,
  },

  /** Output cap — show top N actions */
  maxActionsReturned: 10,

  /** Recommend max N critical per rep so they don't get overwhelmed */
  maxCriticalPerRep: 3,
} as const;

// ============================================================
// TYPES
// ============================================================

export type RevenueActionType =
  | "critical"
  | "warning"
  | "opportunity"
  | "quick_win"
  | "coaching";

export type RevenueActionPriority = "low" | "medium" | "high" | "critical";

/**
 * Canonical stages — same vocabulary as other engines.
 */
export const REVENUE_DECISION_STAGES = {
  DISCOVERY:     "DISCOVERY",
  QUALIFICATION: "QUALIFICATION",
  PROPOSAL_SENT: "PROPOSAL_SENT",
  NEGOTIATION:   "NEGOTIATION",
  VERBAL_COMMIT: "VERBAL_COMMIT",
  CONTRACT_SENT: "CONTRACT_SENT",
} as const;

const LATE_STAGES: readonly string[] = [
  REVENUE_DECISION_STAGES.PROPOSAL_SENT,
  REVENUE_DECISION_STAGES.NEGOTIATION,
  REVENUE_DECISION_STAGES.VERBAL_COMMIT,
  REVENUE_DECISION_STAGES.CONTRACT_SENT,
];

const MID_STAGES: readonly string[] = [
  REVENUE_DECISION_STAGES.QUALIFICATION,
  REVENUE_DECISION_STAGES.PROPOSAL_SENT,
];

/**
 * Input — a deal with all its pre-computed scores. The orchestrator
 * runs the other engines first, packages the results into this shape,
 * then calls this engine.
 */
export interface RevenueDecisionSignals {
  dealId?: string | Types.ObjectId;
  name:    string;

  /** Deal value in rupees */
  value?: number;

  /** Canonical stage name (uppercase, snake_case) */
  stage: string;

  /** Days since last activity */
  lastActivityDays: number;

  /** Pre-computed risk score from deal-risk.engine.ts (0-100) */
  riskScore: number;

  /** Pre-computed health score from deal-health.engine.ts (0-100, higher = healthier) */
  healthScore: number;

  /** Win probability (from Deal model) */
  probability?: number;

  /** Optional: assigned rep ID — used for coaching aggregation */
  assignedToId?: string | Types.ObjectId;

  /** Optional: assigned rep name — used in recommended action text */
  assignedToName?: string;

  /** Status — closed deals generate no actions */
  status?: "open" | "won" | "lost" | "stalled" | "abandoned";

  /** Optional: forecast category from Deal model */
  forecastCategory?: "pipeline" | "best_case" | "commit" | "closed";
}

/**
 * A single recommended action.
 */
export interface RevenueAction {
  /** Stable identifier — useful for dedup across recompute runs */
  actionId: string;

  /** Category */
  type: RevenueActionType;

  /** Severity for sorting + notification routing */
  priority: RevenueActionPriority;

  /** Deal this action targets */
  dealId?:  string | Types.ObjectId;
  dealName: string;

  /** Headline */
  title: string;

  /** Concrete next step the rep should take */
  action: string;

  /** Why this matters — explanation for the rep */
  reason: string;

  /** Numeric priority for fine-grained ranking */
  priorityScore: number;

  /** Revenue impact if acted on / lost if ignored */
  revenueImpact: number;

  /** Optional: who should take this action */
  assignedToId?:   string | Types.ObjectId;
  assignedToName?: string;

  /** Stage of the underlying deal — useful for UI grouping */
  stage?: string;
}

/**
 * Full engine output.
 */
export interface RevenueDecisionResult {
  /** Top actions, sorted by priority desc */
  topActions: RevenueAction[];

  /** All generated actions (uncapped) — useful for "show all" views */
  allActions: RevenueAction[];

  /** Total potential revenue across all actions */
  totalRevenueImpact: number;

  /** Critical revenue at risk (sum of revenueImpact on critical actions) */
  criticalRevenueAtRisk: number;

  /** Opportunity revenue (sum of revenueImpact on opportunity/quick_win actions) */
  opportunityRevenue: number;

  /** Count by type */
  byType: Record<RevenueActionType, number>;

  /** Count by priority */
  byPriority: Record<RevenueActionPriority, number>;

  /** Coaching insights — patterns spotted across reps */
  coachingSignals: CoachingSignal[];

  /** Top-line summary for hero card */
  summary: string;

  /** Engine version */
  engineVersion: string;

  /** When computed */
  computedAt: Date;
}

/**
 * Coaching signal — pattern across multiple deals for the same rep.
 * Surfaced to managers, not individual reps.
 */
export interface CoachingSignal {
  assignedToId?:   string | Types.ObjectId;
  assignedToName:  string;
  pattern:         "low_health_cluster" | "stale_pipeline" | "high_risk_concentration";
  affectedDeals:   number;
  message:         string;
  recommendedAction: string;
}

// ============================================================
// HELPERS
// ============================================================

const PRIORITY_RANK: Record<RevenueActionPriority, number> = {
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
};

function comparePriority(
  a: RevenueActionPriority,
  b: RevenueActionPriority
): number {
  return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}

function normalizeStageName(stage: string): string {
  if (!stage) return "";
  const upper = stage.trim().toUpperCase().replace(/\s+/g, "_");
  if (upper === "PROPOSAL")   return REVENUE_DECISION_STAGES.PROPOSAL_SENT;
  if (upper === "QUALIFYING") return REVENUE_DECISION_STAGES.QUALIFICATION;
  if (upper === "CONTRACT")   return REVENUE_DECISION_STAGES.CONTRACT_SENT;
  return upper;
}

function humanizeStage(stage: string): string {
  return stage.toLowerCase().replace(/_/g, " ");
}

function isOpenDeal(s: RevenueDecisionSignals): boolean {
  return (
    s.status !== "won" &&
    s.status !== "lost" &&
    s.status !== "abandoned"
  );
}

function formatINR(rupees: number): string {
  if (rupees >= 10_000_000) {
    return "\u20B9" + (rupees / 10_000_000).toFixed(1) + " Cr";
  }
  if (rupees >= 100_000) {
    return "\u20B9" + (rupees / 100_000).toFixed(1) + " Lakh";
  }
  return "\u20B9" + rupees.toLocaleString("en-IN");
}

/**
 * Compute value-weighted priority boost. Caps at maxBoost so a single
 * mega-deal doesn't dominate the list — we want a healthy mix of
 * actions, not just "save the whale."
 */
function valueBoost(value: number): number {
  const raw = value * REVENUE_DECISION_CONFIG.valueWeight.perRupeeFactor;
  return Math.min(raw, REVENUE_DECISION_CONFIG.valueWeight.maxBoost);
}

/**
 * Derive priority bucket from numeric score for routing/sorting.
 */
function priorityBucket(score: number): RevenueActionPriority {
  if (score >= 100) return "critical";
  if (score >= 70)  return "high";
  if (score >= 40)  return "medium";
  return "low";
}

/**
 * Build a stable action ID for dedup across runs.
 * Same deal + same action type = same ID.
 */
function buildActionId(
  dealId: string | Types.ObjectId | undefined,
  type:   string
): string {
  const idPart = dealId !== undefined ? String(dealId) : "anon";
  return "action:" + type + ":" + idPart;
}

// ============================================================
// ACTION GENERATORS
// Each returns an action or null. Pure functions.
// ============================================================

function detectCriticalRisk(
  s: RevenueDecisionSignals
): RevenueAction | null {
  if (s.riskScore < REVENUE_DECISION_CONFIG.criticalRisk.riskScoreMin) return null;

  const value     = s.value ?? 0;
  const stage     = normalizeStageName(s.stage);
  const score     =
    REVENUE_DECISION_CONFIG.criticalRisk.basePriority +
    s.riskScore +
    valueBoost(value);

  const action: RevenueAction = {
    actionId:      buildActionId(s.dealId, "critical_risk"),
    type:          "critical",
    priority:      priorityBucket(score),
    dealName:      s.name,
    title:         "Immediate attention: " + s.name,
    action:        "Schedule executive intervention to unblock " +
                   humanizeStage(stage) + " stage today",
    reason:        "Critical risk score (" + s.riskScore +
                   ") — deal likely to slip without intervention",
    priorityScore: Math.round(score),
    revenueImpact: value,
    ...(s.dealId !== undefined && { dealId: s.dealId }),
    ...(s.assignedToId !== undefined && { assignedToId: s.assignedToId }),
    ...(s.assignedToName !== undefined && { assignedToName: s.assignedToName }),
    ...(stage && { stage }),
  };
  return action;
}

function detectInactivity(
  s: RevenueDecisionSignals
): RevenueAction | null {
  if (s.lastActivityDays < REVENUE_DECISION_CONFIG.inactivity.daysMin) return null;

  const value = s.value ?? 0;
  const stage = normalizeStageName(s.stage);
  const isSevere = s.lastActivityDays >= REVENUE_DECISION_CONFIG.inactivity.severeDaysMin;

  const basePriority = isSevere
    ? REVENUE_DECISION_CONFIG.inactivity.severeBasePriority
    : REVENUE_DECISION_CONFIG.inactivity.basePriority;

  const score =
    basePriority +
    s.lastActivityDays * 2 +
    valueBoost(value);

  const action: RevenueAction = {
    actionId:      buildActionId(s.dealId, isSevere ? "severe_inactivity" : "inactivity"),
    type:          isSevere ? "critical" : "warning",
    priority:      priorityBucket(score),
    dealName:      s.name,
    title:         (isSevere ? "Severely inactive: " : "Inactive: ") + s.name,
    action:        isSevere
      ? "Send a direct outreach today — this deal may already be lost"
      : "Follow up with the customer this week to maintain momentum",
    reason:        s.lastActivityDays + " days since last activity",
    priorityScore: Math.round(score),
    revenueImpact: value,
    ...(s.dealId !== undefined && { dealId: s.dealId }),
    ...(s.assignedToId !== undefined && { assignedToId: s.assignedToId }),
    ...(s.assignedToName !== undefined && { assignedToName: s.assignedToName }),
    ...(stage && { stage }),
  };
  return action;
}

function detectLateStageAtRisk(
  s: RevenueDecisionSignals
): RevenueAction | null {
  const stage = normalizeStageName(s.stage);
  if (!LATE_STAGES.includes(stage)) return null;
  if (s.healthScore >= REVENUE_DECISION_CONFIG.lateStageAtRisk.healthScoreMax) return null;

  const value = s.value ?? 0;
  const score =
    REVENUE_DECISION_CONFIG.lateStageAtRisk.basePriority +
    (100 - s.healthScore) +
    valueBoost(value);

  const action: RevenueAction = {
    actionId:      buildActionId(s.dealId, "late_stage_at_risk"),
    type:          "critical",
    priority:      priorityBucket(score),
    dealName:      s.name,
    title:         "Late-stage at risk: " + s.name,
    action:        "Engage leadership today to push deal toward close",
    reason:        "Low deal health (" + s.healthScore + ") in " + humanizeStage(stage),
    priorityScore: Math.round(score),
    revenueImpact: value,
    ...(s.dealId !== undefined && { dealId: s.dealId }),
    ...(s.assignedToId !== undefined && { assignedToId: s.assignedToId }),
    ...(s.assignedToName !== undefined && { assignedToName: s.assignedToName }),
    stage,
  };
  return action;
}

function detectLateStageOpportunity(
  s: RevenueDecisionSignals
): RevenueAction | null {
  const stage = normalizeStageName(s.stage);
  if (!LATE_STAGES.includes(stage)) return null;
  if (s.healthScore < REVENUE_DECISION_CONFIG.lateStageOpportunity.healthScoreMin) return null;
  if (s.riskScore  > REVENUE_DECISION_CONFIG.lateStageOpportunity.riskScoreMax)  return null;

  const value = s.value ?? 0;
  const score =
    REVENUE_DECISION_CONFIG.lateStageOpportunity.basePriority +
    s.healthScore * 0.3 +
    valueBoost(value);

  const action: RevenueAction = {
    actionId:      buildActionId(s.dealId, "late_stage_opportunity"),
    type:          "opportunity",
    priority:      priorityBucket(score),
    dealName:      s.name,
    title:         "Closing opportunity: " + s.name,
    action:        "Confirm decision timeline and accelerate to close this week",
    reason:        "Healthy " + humanizeStage(stage) + " — health " + s.healthScore +
                   ", risk only " + s.riskScore,
    priorityScore: Math.round(score),
    revenueImpact: value,
    ...(s.dealId !== undefined && { dealId: s.dealId }),
    ...(s.assignedToId !== undefined && { assignedToId: s.assignedToId }),
    ...(s.assignedToName !== undefined && { assignedToName: s.assignedToName }),
    stage,
  };
  return action;
}

function detectHotDealOpportunity(
  s: RevenueDecisionSignals
): RevenueAction | null {
  if (s.healthScore < REVENUE_DECISION_CONFIG.hotDealOpportunity.healthScoreMin) return null;
  if (typeof s.probability !== "number") return null;
  if (s.probability < REVENUE_DECISION_CONFIG.hotDealOpportunity.probabilityMin) return null;

  const stage = normalizeStageName(s.stage);
  if (!MID_STAGES.includes(stage) && !LATE_STAGES.includes(stage)) return null;

  // Skip if late-stage-opportunity already fires for this one
  if (LATE_STAGES.includes(stage) && s.riskScore <= REVENUE_DECISION_CONFIG.lateStageOpportunity.riskScoreMax) {
    return null;
  }

  const value = s.value ?? 0;
  const score =
    REVENUE_DECISION_CONFIG.hotDealOpportunity.basePriority +
    (s.probability * 0.2) +
    valueBoost(value);

  const action: RevenueAction = {
    actionId:      buildActionId(s.dealId, "hot_deal"),
    type:          "opportunity",
    priority:      priorityBucket(score),
    dealName:      s.name,
    title:         "Hot deal: " + s.name,
    action:        "Push for next-step commitment — discovery to proposal, or proposal to commit",
    reason:        s.probability + "% probability with health " + s.healthScore,
    priorityScore: Math.round(score),
    revenueImpact: value,
    ...(s.dealId !== undefined && { dealId: s.dealId }),
    ...(s.assignedToId !== undefined && { assignedToId: s.assignedToId }),
    ...(s.assignedToName !== undefined && { assignedToName: s.assignedToName }),
    stage,
  };
  return action;
}

function detectQuickWin(
  s: RevenueDecisionSignals
): RevenueAction | null {
  const value = s.value ?? 0;
  if (value === 0) return null;
  if (value > REVENUE_DECISION_CONFIG.quickWin.valueMax) return null;
  if (s.healthScore < REVENUE_DECISION_CONFIG.quickWin.healthScoreMin) return null;

  const stage = normalizeStageName(s.stage);
  if (!LATE_STAGES.includes(stage)) return null;

  const score = REVENUE_DECISION_CONFIG.quickWin.basePriority + s.healthScore * 0.2;

  const action: RevenueAction = {
    actionId:      buildActionId(s.dealId, "quick_win"),
    type:          "quick_win",
    priority:      priorityBucket(score),
    dealName:      s.name,
    title:         "Quick win: " + s.name,
    action:        "Close this deal fast — small but healthy, low effort to convert",
    reason:        "Healthy late-stage deal under " +
                   formatINR(REVENUE_DECISION_CONFIG.quickWin.valueMax),
    priorityScore: Math.round(score),
    revenueImpact: value,
    ...(s.dealId !== undefined && { dealId: s.dealId }),
    ...(s.assignedToId !== undefined && { assignedToId: s.assignedToId }),
    ...(s.assignedToName !== undefined && { assignedToName: s.assignedToName }),
    stage,
  };
  return action;
}

// ============================================================
// COACHING SIGNALS
// Aggregate patterns across deals per rep — manager-level insights
// ============================================================

function detectCoachingSignals(
  deals: RevenueDecisionSignals[]
): CoachingSignal[] {
  const signals: CoachingSignal[] = [];

  // Group by rep
  const byRep = new Map<string, {
    name:           string;
    id?:            string | Types.ObjectId;
    lowHealth:      RevenueDecisionSignals[];
    highRisk:       RevenueDecisionSignals[];
    inactive:       RevenueDecisionSignals[];
  }>();

  for (const d of deals) {
    if (!d.assignedToName) continue;
    const key = d.assignedToName;
    const entry = byRep.get(key) ?? {
      name:      d.assignedToName,
      ...(d.assignedToId !== undefined && { id: d.assignedToId }),
      lowHealth: [] as RevenueDecisionSignals[],
      highRisk:  [] as RevenueDecisionSignals[],
      inactive:  [] as RevenueDecisionSignals[],
    };
    if (d.healthScore < REVENUE_DECISION_CONFIG.coachingThreshold.healthScoreMax) {
      entry.lowHealth.push(d);
    }
    if (d.riskScore >= 60) entry.highRisk.push(d);
    if (d.lastActivityDays >= 14) entry.inactive.push(d);
    byRep.set(key, entry);
  }

  for (const rep of byRep.values()) {
    // Low health cluster
    if (rep.lowHealth.length >= REVENUE_DECISION_CONFIG.coachingThreshold.minLowHealthDeals) {
      signals.push({
        ...(rep.id !== undefined && { assignedToId: rep.id }),
        assignedToName: rep.name,
        pattern:        "low_health_cluster",
        affectedDeals:  rep.lowHealth.length,
        message:        rep.name + " has " + rep.lowHealth.length +
                        " deals with low health — pattern of quality issues",
        recommendedAction:
          "1:1 with " + rep.name + " on qualification rigor and stakeholder engagement",
      });
    }

    // High-risk concentration
    if (rep.highRisk.length >= 3) {
      signals.push({
        ...(rep.id !== undefined && { assignedToId: rep.id }),
        assignedToName: rep.name,
        pattern:        "high_risk_concentration",
        affectedDeals:  rep.highRisk.length,
        message:        rep.name + " has " + rep.highRisk.length +
                        " high-risk deals — pipeline at risk of underperformance",
        recommendedAction:
          "Review " + rep.name + "'s pipeline together — identify which deals to save vs cut",
      });
    }

    // Stale pipeline
    if (rep.inactive.length >= 3) {
      signals.push({
        ...(rep.id !== undefined && { assignedToId: rep.id }),
        assignedToName: rep.name,
        pattern:        "stale_pipeline",
        affectedDeals:  rep.inactive.length,
        message:        rep.name + " has " + rep.inactive.length +
                        " deals with 14+ days inactivity — activity discipline issue",
        recommendedAction:
          "Coach " + rep.name + " on activity cadence — daily touch on top 3 deals minimum",
      });
    }
  }

  return signals;
}

// ============================================================
// CORE ENGINE
// ============================================================

/**
 * Generate prioritized revenue actions from pre-scored deals.
 *
 * Returns:
 *   - topActions: capped, ranked actions (best for dashboards)
 *   - allActions: full uncapped list (for "show all" views)
 *   - revenue impact aggregates
 *   - coaching signals for managers
 *   - summary message
 */
export function generateRevenueActions(
  deals: RevenueDecisionSignals[]
): RevenueDecisionResult {
  const computedAt = new Date();
  const allActions: RevenueAction[] = [];

  // Filter to open deals
  const openDeals = deals.filter(isOpenDeal);

  // -----------------------------------------------------------
  // GENERATE ACTIONS PER DEAL
  // Each generator returns 0 or 1 action — multiple can fire per deal
  // -----------------------------------------------------------
  for (const d of openDeals) {
    const dealActions: RevenueAction[] = [];

    const criticalRisk = detectCriticalRisk(d);
    if (criticalRisk) dealActions.push(criticalRisk);

    const inactivity = detectInactivity(d);
    if (inactivity) dealActions.push(inactivity);

    const lateStageAtRisk = detectLateStageAtRisk(d);
    if (lateStageAtRisk) dealActions.push(lateStageAtRisk);

    const lateStageOpp = detectLateStageOpportunity(d);
    if (lateStageOpp) dealActions.push(lateStageOpp);

    const hotDeal = detectHotDealOpportunity(d);
    if (hotDeal) dealActions.push(hotDeal);

    const quickWin = detectQuickWin(d);
    if (quickWin) dealActions.push(quickWin);

    // De-dup: critical-risk + late-stage-at-risk on same deal = redundant.
    // Keep critical-risk only.
    const hasCritical = dealActions.some((a) => a.type === "critical" && a.actionId.includes(":critical_risk:"));
    const filtered = hasCritical
      ? dealActions.filter((a) =>
          a.type !== "critical" || a.actionId.includes(":critical_risk:")
        )
      : dealActions;

    for (const a of filtered) allActions.push(a);
  }

  // -----------------------------------------------------------
  // SORT BY PRIORITY SCORE DESC
  // -----------------------------------------------------------
  allActions.sort((a, b) => b.priorityScore - a.priorityScore);

  // -----------------------------------------------------------
  // CAP TOP ACTIONS — but ensure critical-per-rep limit
  // A single rep can't have more than maxCriticalPerRep critical actions
  // in the top list (prevents one rep's pipeline from dominating)
  // -----------------------------------------------------------
  const criticalPerRep = new Map<string, number>();
  const topActions: RevenueAction[] = [];

  for (const action of allActions) {
    if (topActions.length >= REVENUE_DECISION_CONFIG.maxActionsReturned) break;

    if (action.type === "critical" && action.assignedToName) {
      const count = criticalPerRep.get(action.assignedToName) ?? 0;
      if (count >= REVENUE_DECISION_CONFIG.maxCriticalPerRep) continue;
      criticalPerRep.set(action.assignedToName, count + 1);
    }

    topActions.push(action);
  }

  // -----------------------------------------------------------
  // AGGREGATES
  // -----------------------------------------------------------
  let totalRevenueImpact     = 0;
  let criticalRevenueAtRisk  = 0;
  let opportunityRevenue     = 0;

  const byType: Record<RevenueActionType, number> = {
    critical:    0,
    warning:     0,
    opportunity: 0,
    quick_win:   0,
    coaching:    0,
  };

  const byPriority: Record<RevenueActionPriority, number> = {
    critical: 0,
    high:     0,
    medium:   0,
    low:      0,
  };

  // De-dup deal revenue impact (each deal counts once toward totals)
  const countedDeals = new Set<string>();
  for (const a of allActions) {
    byType[a.type] += 1;
    byPriority[a.priority] += 1;

    const dealKey = String(a.dealId ?? a.dealName);
    if (!countedDeals.has(dealKey)) {
      countedDeals.add(dealKey);
      totalRevenueImpact += a.revenueImpact;
      if (a.type === "critical")              criticalRevenueAtRisk += a.revenueImpact;
      if (a.type === "opportunity" || a.type === "quick_win") {
        opportunityRevenue += a.revenueImpact;
      }
    }
  }

  // -----------------------------------------------------------
  // COACHING SIGNALS
  // -----------------------------------------------------------
  const coachingSignals = detectCoachingSignals(openDeals);

  // -----------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------
  const summary = buildSummary(
    topActions,
    criticalRevenueAtRisk,
    opportunityRevenue
  );

  return {
    topActions,
    allActions,
    totalRevenueImpact,
    criticalRevenueAtRisk,
    opportunityRevenue,
    byType,
    byPriority,
    coachingSignals,
    summary,
    engineVersion: REVENUE_DECISION_ENGINE_VERSION,
    computedAt,
  };
}

// ============================================================
// SUMMARY BUILDER
// ============================================================

function buildSummary(
  actions: RevenueAction[],
  criticalRevenue: number,
  opportunityRevenue: number
): string {
  if (actions.length === 0) {
    return "All clear — no critical actions needed today";
  }

  const criticalCount = actions.filter((a) => a.type === "critical").length;
  const oppCount      = actions.filter(
    (a) => a.type === "opportunity" || a.type === "quick_win"
  ).length;

  const parts: string[] = [];

  if (criticalCount > 0) {
    parts.push(
      criticalCount + " critical action" + (criticalCount === 1 ? "" : "s") +
      " (" + formatINR(criticalRevenue) + " at risk)"
    );
  }

  if (oppCount > 0) {
    parts.push(
      oppCount + " opportunity" + (oppCount === 1 ? "" : " opportunities") +
      " (" + formatINR(opportunityRevenue) + " potential)"
    );
  }

  if (parts.length === 0) {
    return actions.length + " action" + (actions.length === 1 ? "" : "s") + " for today";
  }

  return parts.join(" • ");
}

// ============================================================
// SIGNAL ASSEMBLY HELPER
// Bridges from raw Deal + pre-computed engine outputs to engine input.
// ============================================================

/**
 * Build RevenueDecisionSignals from a Mongoose Deal doc and the
 * pre-computed scores produced by deal-risk.engine.ts and (optionally)
 * deal-health.engine.ts.
 *
 * The orchestrator calls this for each deal after running upstream
 * engines, then feeds the results into generateRevenueActions().
 */
export function assembleDecisionSignals(input: {
  _id?:                Types.ObjectId | string;
  title?:              string;
  value?:              number;
  stageName:           string;
  lastActivityAt?:     Date | null;
  riskScore?:          number;
  healthScore?:        number;
  probability?:        number;
  assignedToId?:       string | Types.ObjectId;
  assignedToName?:     string;
  status?:             "open" | "won" | "lost" | "stalled" | "abandoned";
  forecastCategory?:   "pipeline" | "best_case" | "commit" | "closed";
}): RevenueDecisionSignals {
  const lastActivityDays = input.lastActivityAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - input.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  const signals: RevenueDecisionSignals = {
    name:             input.title ?? "Untitled Deal",
    stage:            input.stageName,
    lastActivityDays,
    riskScore:        input.riskScore   ?? 0,
    healthScore:      input.healthScore ?? 50,
  };

  if (input._id !== undefined)            signals.dealId = input._id;
  if (input.value !== undefined)          signals.value = input.value;
  if (input.probability !== undefined)    signals.probability = input.probability;
  if (input.assignedToId !== undefined)   signals.assignedToId = input.assignedToId;
  if (input.assignedToName !== undefined) signals.assignedToName = input.assignedToName;
  if (input.status !== undefined)         signals.status = input.status;
  if (input.forecastCategory !== undefined) signals.forecastCategory = input.forecastCategory;

  return signals;
}

// ============================================================
// LEGACY-COMPATIBLE WRAPPER
// ============================================================

/**
 * @deprecated Use generateRevenueActions() for the full structured result.
 * Returns the original frontend's top-5 list with simplified shape.
 */
export function generateRevenueActionsLegacy(
  deals: Array<{
    name:             string;
    stage:            string;
    riskScore:        number;
    lastActivityDays: number;
    healthScore:      number;
    value?:           number;
  }>
): Array<{
  type:           "critical" | "warning" | "opportunity";
  title:          string;
  action:         string;
  reason:         string;
  priority:       number;
  revenueImpact?: number;
}> {
  const signals: RevenueDecisionSignals[] = deals.map((d) => ({
    name:             d.name,
    stage:            d.stage,
    riskScore:        d.riskScore,
    lastActivityDays: d.lastActivityDays,
    healthScore:      d.healthScore,
    ...(d.value !== undefined && { value: d.value }),
  }));

  const result = generateRevenueActions(signals);

  return result.topActions.slice(0, 5).map((a) => {
    // Map new types back to legacy 3
    let legacyType: "critical" | "warning" | "opportunity";
    if (a.type === "critical")                       legacyType = "critical";
    else if (a.type === "warning")                   legacyType = "warning";
    else                                             legacyType = "opportunity";

    return {
      type:          legacyType,
      title:         a.title,
      action:        a.action,
      reason:        a.reason,
      priority:      a.priorityScore,
      ...(a.revenueImpact !== undefined && { revenueImpact: a.revenueImpact }),
    };
  });
}

export default generateRevenueActions;