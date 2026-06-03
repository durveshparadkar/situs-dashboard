// deals-attention.engine.ts
//
// "Shoot your shot today" engine — surfaces deals that need a rep's
// attention right now. Pure heuristic, deterministic, no I/O.
//
// Different from deal-risk.engine.ts:
//   - Risk engine: "this deal might slip" (numeric score 0-100)
//   - Attention engine: "act on this deal today" (boolean alerts with
//     specific recommended actions)
//
// A deal can be low-risk but still need attention (e.g., proposal sent
// 3 days ago, time for a follow-up). Likewise, a deal can be high-risk
// but not need immediate attention (already lost cause, accept and move on).
//
// Each alert carries:
//   - priority: routes critical ones to the top of the rep's day
//   - recommendedAction: tells the rep WHAT to do, not just WHAT's wrong
//   - actionUrl: deep-link target (filled in by the caller — engine
//     doesn't know your routing)
//
// Used by:
//   - Decision engine → composes alerts into prioritized "today's actions"
//   - Alert subsystem → persists notable alerts to Alert collection
//   - Dashboard → renders "Deals Requiring Attention" widget
//   - Notification service → optionally emails high-priority alerts

import type { Types } from "mongoose";

// ============================================================
// VERSIONING
// ============================================================

export const DEALS_ATTENTION_ENGINE_VERSION = "1.0.0" as const;

// ============================================================
// CONFIG
// ============================================================

const ATTENTION_CONFIG = {
  /** Days of inactivity before generic "follow up" alert */
  inactivity: {
    days: 7,
  },

  /** Stalled negotiation — high-impact, action needed */
  stalledNegotiation: {
    days: 10,
  },

  /** Stalled proposal — proposal sent but no response */
  stalledProposal: {
    days: 7,
  },

  /** Stalled discovery — early stage going cold */
  stalledDiscovery: {
    days: 14,
  },

  /** High-value threshold and inactivity tolerance */
  highValue: {
    valueMin:               150_000, // ₹1.5 Lakh+
    inactivityDays:         5,
    enterpriseValueMin:     1_000_000, // ₹10 Lakh+ — higher urgency
    enterpriseInactivityDays: 3,
  },

  /** Hot lead going cold — high probability deal getting quiet */
  hotLeadCooling: {
    probabilityMin:    70,
    inactivityDays:    5,
  },

  /** Late-stage deals — closer to close, more urgent */
  lateStageInactivity: {
    inactivityDays: 4,
  },

  /** Deal too old in current stage */
  stageOverdue: {
    daysInStage: 21,
  },

  /** Cap alerts per deal to avoid noise — pick top N by priority */
  maxAlertsPerDeal: 3,
} as const;

// ============================================================
// TYPES
// ============================================================

/**
 * Categories of attention alerts. Matches your alert.model.ts vocabulary
 * so alerts can flow into the Alert collection directly.
 */
export const ATTENTION_ALERT_TYPES = {
  INACTIVITY:           "inactivity",
  STALLED_NEGOTIATION:  "stalled_negotiation",
  STALLED_PROPOSAL:     "stalled_proposal",
  STALLED_DISCOVERY:    "stalled_discovery",
  HIGH_VALUE_RISK:      "high_value_risk",
  ENTERPRISE_AT_RISK:   "enterprise_at_risk",
  HOT_LEAD_COOLING:     "hot_lead_cooling",
  LATE_STAGE_QUIET:     "late_stage_quiet",
  STAGE_OVERDUE:        "stage_overdue",
} as const;

export type AttentionAlertType =
  (typeof ATTENTION_ALERT_TYPES)[keyof typeof ATTENTION_ALERT_TYPES];

/**
 * Priority levels — controls ordering and notification routing.
 * Matches alert.model.ts severity vocabulary for direct mapping.
 */
export type AttentionPriority = "low" | "medium" | "high" | "critical";

/**
 * Canonical stage names — same as deal-risk.engine.ts.
 */
export const ATTENTION_KNOWN_STAGES = {
  DISCOVERY:     "DISCOVERY",
  QUALIFICATION: "QUALIFICATION",
  PROPOSAL_SENT: "PROPOSAL_SENT",
  NEGOTIATION:   "NEGOTIATION",
  VERBAL_COMMIT: "VERBAL_COMMIT",
  CONTRACT_SENT: "CONTRACT_SENT",
} as const;

const LATE_STAGES: readonly string[] = [
  ATTENTION_KNOWN_STAGES.NEGOTIATION,
  ATTENTION_KNOWN_STAGES.VERBAL_COMMIT,
  ATTENTION_KNOWN_STAGES.CONTRACT_SENT,
];

/**
 * Input signals — normalized deal data. Service code extracts these
 * from the Mongoose Deal document via extractAttentionSignals().
 */
export interface DealAttentionSignals {
  /** Stable identifier */
  dealId?: string | Types.ObjectId;

  /** Display name for human-readable alerts */
  name: string;

  /** Deal value in rupees (whole units, not paise) */
  value: number;

  /** Canonical stage name (uppercase, snake_case) */
  stage: string;

  /** Days since last logged activity */
  lastActivityDays: number;

  /** Optional: days in current stage */
  daysInCurrentStage?: number;

  /** Optional: win probability 0–100 */
  probability?: number;

  /** Optional: assigned rep — used in action suggestions */
  assignedToName?: string;

  /** Status — closed deals generate no alerts */
  status?: "open" | "won" | "lost" | "stalled" | "abandoned";
}

/**
 * Single attention alert. The engine produces these; alert.service.ts
 * persists notable ones, dashboard renders the rest.
 */
export interface DealAttentionAlert {
  /** Echo dealId for caller convenience */
  dealId?: string | Types.ObjectId;

  /** Categorical type */
  type: AttentionAlertType;

  /** Display name of the deal */
  dealName: string;

  /** Human-readable message */
  message: string;

  /** Concrete next action to take */
  recommendedAction: string;

  /** Priority — drives sort + notification routing */
  priority: AttentionPriority;

  /** Numeric impact score (0-100) for fine-grained ranking */
  impactScore: number;

  /** Engine version */
  engineVersion: string;

  /** When the alert was generated */
  computedAt: Date;
}

// ============================================================
// PRIORITY HELPERS
// ============================================================

const PRIORITY_RANK: Record<AttentionPriority, number> = {
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
};

function comparePriority(a: AttentionPriority, b: AttentionPriority): number {
  return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}

// ============================================================
// CORE ENGINE
// ============================================================

/**
 * Generate attention alerts for a single deal. Returns 0 or more alerts
 * sorted highest-priority first, capped at maxAlertsPerDeal.
 *
 * Closed deals (won/lost/abandoned) generate no alerts.
 */
export function detectDealAttention(
  signals: DealAttentionSignals
): DealAttentionAlert[] {
  // Closed deals don't need attention
  if (
    signals.status === "won" ||
    signals.status === "lost" ||
    signals.status === "abandoned"
  ) {
    return [];
  }

  const computedAt = new Date();
  const alerts: DealAttentionAlert[] = [];
  const stage = normalizeStageName(signals.stage);
  const a     = signals.lastActivityDays;
  const stageDays = signals.daysInCurrentStage ?? 0;

  // -----------------------------------------------------------
  // ENTERPRISE AT RISK — highest priority
  // Big-ticket deals going quiet are critical for forecast
  // -----------------------------------------------------------
  if (
    signals.value >= ATTENTION_CONFIG.highValue.enterpriseValueMin &&
    a >= ATTENTION_CONFIG.highValue.enterpriseInactivityDays
  ) {
    alerts.push(
      buildAlert({
        signals,
        type:    ATTENTION_ALERT_TYPES.ENTERPRISE_AT_RISK,
        message: signals.name + " (" + formatINR(signals.value) +
                 ") quiet for " + a + " days",
        recommendedAction: "Call decision-maker today — protect this deal",
        priority:    "critical",
        impactScore: 95,
        computedAt,
      })
    );
  }
  // -----------------------------------------------------------
  // HIGH-VALUE RISK
  // -----------------------------------------------------------
  else if (
    signals.value >= ATTENTION_CONFIG.highValue.valueMin &&
    a >= ATTENTION_CONFIG.highValue.inactivityDays
  ) {
    alerts.push(
      buildAlert({
        signals,
        type:    ATTENTION_ALERT_TYPES.HIGH_VALUE_RISK,
        message: signals.name + " is high-value (" +
                 formatINR(signals.value) + ") and needs attention",
        recommendedAction: "Send a follow-up email or schedule a check-in call",
        priority:    "high",
        impactScore: 80,
        computedAt,
      })
    );
  }

  // -----------------------------------------------------------
  // STALLED NEGOTIATION — late stage, critical for revenue
  // -----------------------------------------------------------
  if (
    stage === ATTENTION_KNOWN_STAGES.NEGOTIATION &&
    a >= ATTENTION_CONFIG.stalledNegotiation.days
  ) {
    alerts.push(
      buildAlert({
        signals,
        type:    ATTENTION_ALERT_TYPES.STALLED_NEGOTIATION,
        message: signals.name + " negotiation stalled for " + a + " days",
        recommendedAction: "Address blockers directly — propose terms or escalate",
        priority:    "high",
        impactScore: 85,
        computedAt,
      })
    );
  }

  // -----------------------------------------------------------
  // STALLED PROPOSAL
  // -----------------------------------------------------------
  if (
    stage === ATTENTION_KNOWN_STAGES.PROPOSAL_SENT &&
    a >= ATTENTION_CONFIG.stalledProposal.days
  ) {
    alerts.push(
      buildAlert({
        signals,
        type:    ATTENTION_ALERT_TYPES.STALLED_PROPOSAL,
        message: signals.name + " proposal pending response for " + a + " days",
        recommendedAction: "Follow up on the proposal — confirm review status",
        priority:    "high",
        impactScore: 75,
        computedAt,
      })
    );
  }

  // -----------------------------------------------------------
  // STALLED DISCOVERY — early stage going cold
  // -----------------------------------------------------------
  if (
    stage === ATTENTION_KNOWN_STAGES.DISCOVERY &&
    a >= ATTENTION_CONFIG.stalledDiscovery.days
  ) {
    alerts.push(
      buildAlert({
        signals,
        type:    ATTENTION_ALERT_TYPES.STALLED_DISCOVERY,
        message: signals.name + " discovery stalled for " + a + " days",
        recommendedAction: "Re-engage with a discovery question or value insight",
        priority:    "medium",
        impactScore: 50,
        computedAt,
      })
    );
  }

  // -----------------------------------------------------------
  // HOT LEAD COOLING — high probability deal getting quiet
  // -----------------------------------------------------------
  if (
    typeof signals.probability === "number" &&
    signals.probability >= ATTENTION_CONFIG.hotLeadCooling.probabilityMin &&
    a >= ATTENTION_CONFIG.hotLeadCooling.inactivityDays
  ) {
    alerts.push(
      buildAlert({
        signals,
        type:    ATTENTION_ALERT_TYPES.HOT_LEAD_COOLING,
        message: signals.name + " is " + signals.probability +
                 "% likely to close but quiet for " + a + " days",
        recommendedAction: "Reach out today — high-probability deals shouldn't go silent",
        priority:    "high",
        impactScore: 82,
        computedAt,
      })
    );
  }

  // -----------------------------------------------------------
  // LATE-STAGE QUIET — any late stage with reduced activity
  // -----------------------------------------------------------
  if (
    LATE_STAGES.includes(stage) &&
    a >= ATTENTION_CONFIG.lateStageInactivity.inactivityDays &&
    // Don't double up if stalled-negotiation already fired
    !alerts.some((al) => al.type === ATTENTION_ALERT_TYPES.STALLED_NEGOTIATION)
  ) {
    alerts.push(
      buildAlert({
        signals,
        type:    ATTENTION_ALERT_TYPES.LATE_STAGE_QUIET,
        message: signals.name + " in " + humanizeStage(stage) +
                 " went quiet — " + a + " days",
        recommendedAction: "Maintain momentum — touch base today",
        priority:    "medium",
        impactScore: 65,
        computedAt,
      })
    );
  }

  // -----------------------------------------------------------
  // STAGE OVERDUE — deal sitting too long in current stage
  // -----------------------------------------------------------
  if (stageDays >= ATTENTION_CONFIG.stageOverdue.daysInStage) {
    alerts.push(
      buildAlert({
        signals,
        type:    ATTENTION_ALERT_TYPES.STAGE_OVERDUE,
        message: signals.name + " stuck in " + humanizeStage(stage) +
                 " for " + stageDays + " days",
        recommendedAction: "Identify the blocker — should the stage advance or close out?",
        priority:    "medium",
        impactScore: 55,
        computedAt,
      })
    );
  }

  // -----------------------------------------------------------
  // GENERIC INACTIVITY — only if no other alert fired
  // (otherwise it's redundant noise)
  // -----------------------------------------------------------
  if (
    a >= ATTENTION_CONFIG.inactivity.days &&
    alerts.length === 0
  ) {
    alerts.push(
      buildAlert({
        signals,
        type:    ATTENTION_ALERT_TYPES.INACTIVITY,
        message: signals.name + " inactive for " + a + " days",
        recommendedAction: "Send a quick check-in — re-engage the conversation",
        priority:    "low",
        impactScore: 35,
        computedAt,
      })
    );
  }

  // -----------------------------------------------------------
  // SORT + CAP
  // -----------------------------------------------------------
  alerts.sort((x, y) => {
    const p = comparePriority(y.priority, x.priority); // priority desc
    if (p !== 0) return p;
    return y.impactScore - x.impactScore;              // then impact desc
  });

  return alerts.slice(0, ATTENTION_CONFIG.maxAlertsPerDeal);
}

// ============================================================
// HELPERS
// ============================================================

function buildAlert(args: {
  signals:           DealAttentionSignals;
  type:              AttentionAlertType;
  message:           string;
  recommendedAction: string;
  priority:          AttentionPriority;
  impactScore:       number;
  computedAt:        Date;
}): DealAttentionAlert {
  const alert: DealAttentionAlert = {
    type:              args.type,
    dealName:          args.signals.name,
    message:           args.message,
    recommendedAction: args.recommendedAction,
    priority:          args.priority,
    impactScore:       args.impactScore,
    engineVersion:     DEALS_ATTENTION_ENGINE_VERSION,
    computedAt:        args.computedAt,
  };
  if (args.signals.dealId !== undefined) {
    alert.dealId = args.signals.dealId;
  }
  return alert;
}

function normalizeStageName(stage: string): string {
  if (!stage) return "";
  const upper = stage.trim().toUpperCase().replace(/\s+/g, "_");
  if (upper === "PROPOSAL")   return ATTENTION_KNOWN_STAGES.PROPOSAL_SENT;
  if (upper === "QUALIFYING") return ATTENTION_KNOWN_STAGES.QUALIFICATION;
  if (upper === "QUALIFY")    return ATTENTION_KNOWN_STAGES.QUALIFICATION;
  if (upper === "DISCOVER")   return ATTENTION_KNOWN_STAGES.DISCOVERY;
  return upper;
}

function humanizeStage(stage: string): string {
  return stage.toLowerCase().replace(/_/g, " ");
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

// ============================================================
// BATCH PROCESSING
// ============================================================

/**
 * Scan many deals at once. Returns alerts sorted by priority + impact
 * across the entire batch — call this for the dashboard's
 * "Today's Top Actions" widget.
 */
export function detectAttentionAcrossDeals(
  deals: DealAttentionSignals[]
): DealAttentionAlert[] {
  const all: DealAttentionAlert[] = [];

  for (const deal of deals) {
    const dealAlerts = detectDealAttention(deal);
    for (const alert of dealAlerts) {
      all.push(alert);
    }
  }

  all.sort((x, y) => {
    const p = comparePriority(y.priority, x.priority);
    if (p !== 0) return p;
    return y.impactScore - x.impactScore;
  });

  return all;
}

/**
 * Group alerts by deal — useful for the dashboard's per-deal accordion view.
 */
export function groupAttentionByDeal(
  alerts: DealAttentionAlert[]
): Map<string, DealAttentionAlert[]> {
  const grouped = new Map<string, DealAttentionAlert[]>();

  for (const alert of alerts) {
    const key = String(alert.dealId ?? alert.dealName);
    const list = grouped.get(key) ?? [];
    list.push(alert);
    grouped.set(key, list);
  }

  return grouped;
}

// ============================================================
// SIGNAL EXTRACTION
// ============================================================

/**
 * Extract DealAttentionSignals from a Mongoose-shaped Deal document.
 * The scoring service uses this to bridge from DB to engine.
 */
export function extractAttentionSignals(input: {
  _id?:                Types.ObjectId | string;
  title?:              string;
  value?:              number;
  stageName:           string;
  lastActivityAt?:     Date | null;
  daysInCurrentStage?: number;
  probability?:        number;
  assignedToName?:     string;
  status?:             "open" | "won" | "lost" | "stalled" | "abandoned";
}): DealAttentionSignals {
  const lastActivityDays = input.lastActivityAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - input.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  const signals: DealAttentionSignals = {
    name:             input.title ?? "Untitled Deal",
    value:            input.value ?? 0,
    stage:            input.stageName,
    lastActivityDays,
  };

  if (input._id !== undefined) signals.dealId = input._id;
  if (input.daysInCurrentStage !== undefined) signals.daysInCurrentStage = input.daysInCurrentStage;
  if (input.probability !== undefined) signals.probability = input.probability;
  if (input.assignedToName !== undefined) signals.assignedToName = input.assignedToName;
  if (input.status !== undefined) signals.status = input.status;

  return signals;
}

// ============================================================
// LEGACY-COMPATIBLE WRAPPER
// Keeps the frontend signature working so existing call sites
// in situs-frontend/src/lib/intelligence/ don't break during cutover.
// ============================================================

/**
 * @deprecated Use detectDealAttention(signals) for richer output.
 *
 * Original frontend signature — accepts array of simple deals, returns
 * flat array of basic alerts with the original 3 types only.
 */
export function detectDealAttentionLegacy(
  deals: Array<{
    name:             string;
    value:            number;
    stage:            string;
    lastActivityDays: number;
  }>
): Array<{
  type:     "inactivity" | "stalled" | "high_value_risk";
  dealName: string;
  message:  string;
}> {
  const result: Array<{
    type:     "inactivity" | "stalled" | "high_value_risk";
    dealName: string;
    message:  string;
  }> = [];

  for (const d of deals) {
    const alerts = detectDealAttention({
      name:             d.name,
      value:            d.value,
      stage:            d.stage,
      lastActivityDays: d.lastActivityDays,
    });

    for (const a of alerts) {
      // Map new types back to original 3
      let legacyType: "inactivity" | "stalled" | "high_value_risk";
      if (
        a.type === ATTENTION_ALERT_TYPES.STALLED_NEGOTIATION ||
        a.type === ATTENTION_ALERT_TYPES.STALLED_PROPOSAL    ||
        a.type === ATTENTION_ALERT_TYPES.STALLED_DISCOVERY   ||
        a.type === ATTENTION_ALERT_TYPES.LATE_STAGE_QUIET    ||
        a.type === ATTENTION_ALERT_TYPES.STAGE_OVERDUE
      ) {
        legacyType = "stalled";
      } else if (
        a.type === ATTENTION_ALERT_TYPES.HIGH_VALUE_RISK ||
        a.type === ATTENTION_ALERT_TYPES.ENTERPRISE_AT_RISK ||
        a.type === ATTENTION_ALERT_TYPES.HOT_LEAD_COOLING
      ) {
        legacyType = "high_value_risk";
      } else {
        legacyType = "inactivity";
      }

      result.push({
        type:     legacyType,
        dealName: a.dealName,
        message:  a.message,
      });
    }
  }

  return result;
}

export default detectDealAttention;