// forecast-risk.engine.ts
//
// Forecast risk intelligence. Where deal-risk.engine.ts scores INDIVIDUAL
// deals, this engine evaluates the HEALTH OF THE FORECAST as a whole:
//   - How much expected revenue is genuinely at risk this period?
//   - Which patterns are driving the risk (late-stage stalls, slips,
//     commit deterioration, mega-deal concentration)?
//   - What's the rep / manager's worst-case scenario for the quarter?
//
// Used for:
//   - Sales leader's "Forecast Confidence" dashboard
//   - Weekly forecast review prep ("show me everything that might miss")
//   - Quarter-end alerts ("X at risk, mostly in 3 deals")
//   - Manager 1:1 talking points
//
// Pure heuristic, deterministic. Same input always produces same output.
// No I/O, no DB, no LLM.

import type { Types } from "mongoose";
import { formatCurrency } from "../../shared/utils/currency.js";
import type { OrganizationCurrency } from "../organizations/organization.model.js";

// ============================================================
// VERSIONING
// ============================================================

export const FORECAST_RISK_ENGINE_VERSION = "1.0.0" as const;

// ============================================================
// CONFIG
// ============================================================

const FORECAST_CONFIG = {
  /** Late-stage + inactive — the original frontend rule */
  lateStageInactive: {
    inactivityDays: 7,
    severity:       "high",
  },

  /** Slipping deals — expected close date already passed */
  slipped: {
    severity: "critical",
  },

  /** Slipping soon — expected close date within 7 days but still open */
  slippingSoon: {
    daysToClose: 7,
    severity:    "high",
  },

  /** Stale commits — forecastCategory = "commit" but no recent activity */
  staleCommit: {
    inactivityDays: 5,
    severity:       "critical",  // commits are the rep's promise to leadership
  },

  /** Best-case erosion — forecastCategory = "best_case" with falling probability */
  bestCaseErosion: {
    probabilityMax: 30,
    inactivityDays: 10,
    severity:       "medium",
  },

  /** Mega-deal threshold — single deal so large its slip wrecks the forecast */
  megaDeal: {
    valueMin: 5_000_000, // ₹50 Lakh+ (or equivalent in org's currency)
  },

  /**
   * Concentration risk — when N% of at-risk revenue sits in K% of deals.
   * Diversified pipeline can absorb individual misses; concentrated
   * pipeline can't.
   */
  concentration: {
    /** If top 20% of deals hold 60%+ of risk → flag concentration */
    topDealsRatio:    0.2,
    revenueShareMin:  0.6,
  },

  /** Confidence level mapping based on % of forecast at risk */
  confidence: {
    highRiskThreshold:     0.3,  // 30%+ of forecast at risk → low confidence
    mediumRiskThreshold:   0.15, // 15-30% → medium confidence
    // below 15% → high confidence
  },
} as const;

// ============================================================
// TYPES
// ============================================================

export type ForecastRiskSeverity = "low" | "medium" | "high" | "critical";

export type ForecastConfidence = "low" | "medium" | "high";

/**
 * Categories of forecast risk patterns. Each detected occurrence becomes
 * a factor in the engine output.
 */
export const FORECAST_RISK_TYPES = {
  LATE_STAGE_INACTIVE: "late_stage_inactive",
  SLIPPED:             "slipped",
  SLIPPING_SOON:       "slipping_soon",
  STALE_COMMIT:        "stale_commit",
  BEST_CASE_EROSION:   "best_case_erosion",
  MEGA_DEAL_AT_RISK:   "mega_deal_at_risk",
  CONCENTRATION:       "concentration",
} as const;

export type ForecastRiskType =
  (typeof FORECAST_RISK_TYPES)[keyof typeof FORECAST_RISK_TYPES];

/**
 * Canonical stage names. Same as the other engines.
 */
export const FORECAST_KNOWN_STAGES = {
  PROPOSAL_SENT: "PROPOSAL_SENT",
  NEGOTIATION:   "NEGOTIATION",
  VERBAL_COMMIT: "VERBAL_COMMIT",
  CONTRACT_SENT: "CONTRACT_SENT",
} as const;

const LATE_STAGES: readonly string[] = [
  FORECAST_KNOWN_STAGES.PROPOSAL_SENT,
  FORECAST_KNOWN_STAGES.NEGOTIATION,
  FORECAST_KNOWN_STAGES.VERBAL_COMMIT,
  FORECAST_KNOWN_STAGES.CONTRACT_SENT,
];

/**
 * Input signals for forecast-risk scoring. Service code extracts from
 * Deal documents via extractForecastSignals().
 */
export interface ForecastDealSignals {
  dealId?: string | Types.ObjectId;
  name:    string;
  value:   number;

  /** Canonical stage name */
  stage: string;

  /** Days since last logged activity */
  lastActivityDays: number;

  /** Win probability 0-100 */
  probability?: number;

  /** Expected close date — null if not set */
  expectedCloseDate?: Date | null;

  /** Forecast bucket from your Deal model */
  forecastCategory?: "pipeline" | "best_case" | "commit" | "closed";

  /** Status — closed/lost deals don't contribute to future forecast risk */
  status?: "open" | "won" | "lost" | "stalled" | "abandoned";

  /** Optional: weighted value (value × probability/100) — pre-computed in Deal model */
  weightedValue?: number;
}

/**
 * Individual risk factor — one detected pattern.
 */
export interface ForecastRiskFactor {
  /** Pattern type — stable identifier */
  type: ForecastRiskType;

  /** Deal that triggered this factor */
  dealId?:   string | Types.ObjectId;
  dealName:  string;

  /** Severity from FORECAST_CONFIG */
  severity: ForecastRiskSeverity;

  /** Revenue impact if this risk materializes */
  revenueImpact: number;

  /** Weighted impact (value × probability) — for forecast math */
  weightedImpact: number;

  /** Human-readable explanation */
  message: string;

  /** What the rep should do about it */
  recommendedAction: string;
}

/**
 * Top-line forecast-risk summary used by dashboards.
 */
export interface ForecastRiskSummary {
  /** Total potential revenue exposed across all risk patterns */
  totalRevenueAtRisk: number;

  /** Weighted version — multiplied by probability where available */
  totalWeightedAtRisk: number;

  /** Count of distinct deals contributing to risk */
  riskyDealsCount: number;

  /** Pipeline total — denominator for "% at risk" math */
  totalPipelineValue: number;

  /** % of pipeline at risk — 0-100 */
  percentAtRisk: number;

  /** Forecast confidence derived from percentAtRisk */
  confidence: ForecastConfidence;

  /** Human-readable summary for the hero card */
  message: string;
}

/**
 * Full engine output.
 */
export interface ForecastRiskResult {
  /** Aggregate summary */
  summary: ForecastRiskSummary;

  /** Individual risk factors, sorted by severity + revenue impact desc */
  factors: ForecastRiskFactor[];

  /** Factor count by severity, useful for badge UI */
  bySeverity: Record<ForecastRiskSeverity, number>;

  /** Factor count by type, useful for breakdown UI */
  byType: Record<ForecastRiskType, number>;

  /** Top 3 deals to focus on — driven by severity + impact */
  topDealsToWatch: Array<{
    dealId?:   string | Types.ObjectId;
    dealName:  string;
    riskScore: number;
    reason:    string;
  }>;

  /** Engine version */
  engineVersion: string;

  /** When this was computed */
  computedAt: Date;
}

// ============================================================
// HELPERS
// ============================================================

const SEVERITY_RANK: Record<ForecastRiskSeverity, number> = {
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
};

function compareSeverity(a: ForecastRiskSeverity, b: ForecastRiskSeverity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

function normalizeStageName(stage: string): string {
  if (!stage) return "";
  const upper = stage.trim().toUpperCase().replace(/\s+/g, "_");
  if (upper === "PROPOSAL")   return FORECAST_KNOWN_STAGES.PROPOSAL_SENT;
  if (upper === "CONTRACT")   return FORECAST_KNOWN_STAGES.CONTRACT_SENT;
  return upper;
}

function daysBetween(future: Date, now: Date): number {
  return Math.ceil((future.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * @deprecated Use formatCurrency() from shared/utils/currency.ts instead.
 * Kept as a thin wrapper only in case anything external still imports
 * this — always formats as INR regardless of org currency.
 */
function formatINR(rupees: number): string {
  return formatCurrency(rupees, "INR");
}

/**
 * Weighted impact — uses pre-computed weightedValue if available,
 * else computes value × probability / 100, falls back to value.
 */
function computeWeightedImpact(s: ForecastDealSignals): number {
  if (typeof s.weightedValue === "number" && s.weightedValue > 0) {
    return s.weightedValue;
  }
  if (typeof s.probability === "number") {
    return Math.round(s.value * (s.probability / 100));
  }
  return s.value;
}

function isOpenDeal(s: ForecastDealSignals): boolean {
  return (
    s.status !== "won" &&
    s.status !== "lost" &&
    s.status !== "abandoned"
  );
}

// ============================================================
// FACTOR DETECTORS
// Each returns a factor or null. Pure functions.
// currency is the org's currency for the whole forecast run —
// passed down from detectForecastRisk's top-level parameter.
// ============================================================

function detectLateStageInactive(
  s: ForecastDealSignals,
  currency: OrganizationCurrency
): ForecastRiskFactor | null {
  const stage = normalizeStageName(s.stage);
  if (!LATE_STAGES.includes(stage)) return null;
  if (s.lastActivityDays < FORECAST_CONFIG.lateStageInactive.inactivityDays) {
    return null;
  }

  return {
    type:     FORECAST_RISK_TYPES.LATE_STAGE_INACTIVE,
    ...(s.dealId !== undefined && { dealId: s.dealId }),
    dealName: s.name,
    severity: "high",
    revenueImpact:  s.value,
    weightedImpact: computeWeightedImpact(s),
    message:
      s.name + " (" + formatCurrency(s.value, currency) + ") in " +
      humanizeStage(stage) + " — quiet " + s.lastActivityDays + " days",
    recommendedAction: "Re-engage today — late-stage silence usually means a deal lost",
  };
}

function detectSlipped(
  s: ForecastDealSignals,
  now: Date
): ForecastRiskFactor | null {
  if (!s.expectedCloseDate) return null;
  const daysOverdue = daysBetween(now, s.expectedCloseDate); // positive when overdue
  if (daysOverdue <= 0) return null;

  return {
    type:     FORECAST_RISK_TYPES.SLIPPED,
    ...(s.dealId !== undefined && { dealId: s.dealId }),
    dealName: s.name,
    severity: "critical",
    revenueImpact:  s.value,
    weightedImpact: computeWeightedImpact(s),
    message:
      s.name + " expected to close " + daysOverdue +
      " days ago — still open",
    recommendedAction: "Reset expected close date or escalate — slipped deals erode forecast credibility",
  };
}

function detectSlippingSoon(
  s: ForecastDealSignals,
  now: Date
): ForecastRiskFactor | null {
  if (!s.expectedCloseDate) return null;
  const daysToClose = daysBetween(s.expectedCloseDate, now);
  if (daysToClose <= 0) return null; // already slipped, handled by detectSlipped
  if (daysToClose > FORECAST_CONFIG.slippingSoon.daysToClose) return null;

  // Only flag if the deal isn't actively progressing
  if (s.lastActivityDays <= 2) return null;

  return {
    type:     FORECAST_RISK_TYPES.SLIPPING_SOON,
    ...(s.dealId !== undefined && { dealId: s.dealId }),
    dealName: s.name,
    severity: "high",
    revenueImpact:  s.value,
    weightedImpact: computeWeightedImpact(s),
    message:
      s.name + " expected to close in " + daysToClose +
      " days — last activity " + s.lastActivityDays + " days ago",
    recommendedAction: "Push to close this week or set realistic expectation with leadership",
  };
}

function detectStaleCommit(
  s: ForecastDealSignals,
  currency: OrganizationCurrency
): ForecastRiskFactor | null {
  if (s.forecastCategory !== "commit") return null;
  if (s.lastActivityDays < FORECAST_CONFIG.staleCommit.inactivityDays) return null;

  return {
    type:     FORECAST_RISK_TYPES.STALE_COMMIT,
    ...(s.dealId !== undefined && { dealId: s.dealId }),
    dealName: s.name,
    severity: "critical",
    revenueImpact:  s.value,
    weightedImpact: computeWeightedImpact(s),
    message:
      "COMMIT deal " + s.name + " (" + formatCurrency(s.value, currency) +
      ") quiet for " + s.lastActivityDays + " days",
    recommendedAction: "Commits are promises — verify the deal is still on track or downgrade to best_case",
  };
}

function detectBestCaseErosion(
  s: ForecastDealSignals
): ForecastRiskFactor | null {
  if (s.forecastCategory !== "best_case") return null;
  if (typeof s.probability !== "number") return null;
  if (s.probability > FORECAST_CONFIG.bestCaseErosion.probabilityMax) return null;
  if (s.lastActivityDays < FORECAST_CONFIG.bestCaseErosion.inactivityDays) return null;

  return {
    type:     FORECAST_RISK_TYPES.BEST_CASE_EROSION,
    ...(s.dealId !== undefined && { dealId: s.dealId }),
    dealName: s.name,
    severity: "medium",
    revenueImpact:  s.value,
    weightedImpact: computeWeightedImpact(s),
    message:
      s.name + " in best_case at " + s.probability +
      "% — quiet " + s.lastActivityDays + " days",
    recommendedAction: "Probability has decayed — move to pipeline or close out",
  };
}

function detectMegaDealAtRisk(
  s: ForecastDealSignals,
  existingRisk: boolean,
  currency: OrganizationCurrency
): ForecastRiskFactor | null {
  if (s.value < FORECAST_CONFIG.megaDeal.valueMin) return null;
  if (!existingRisk) return null; // only flag mega deals that already have other risk

  return {
    type:     FORECAST_RISK_TYPES.MEGA_DEAL_AT_RISK,
    ...(s.dealId !== undefined && { dealId: s.dealId }),
    dealName: s.name,
    severity: "critical",
    revenueImpact:  s.value,
    weightedImpact: computeWeightedImpact(s),
    message:
      "Mega deal " + s.name + " (" + formatCurrency(s.value, currency) +
      ") has risk signals — quarter impact if it slips",
    recommendedAction: "Escalate to manager — one mega-deal slip can miss the quarter",
  };
}

function humanizeStage(stage: string): string {
  return stage.toLowerCase().replace(/_/g, " ");
}

// ============================================================
// CORE ENGINE
// ============================================================

/**
 * Compute forecast-risk analysis across a set of deals.
 *
 * @param deals    Deals to analyze (typically an org's open pipeline)
 * @param currency Org's currency for formatted messages. Defaults to
 *                 INR if not passed — safe for existing callers.
 *
 * Returns a structured result with summary, factors, breakdowns by
 * severity/type, and top deals to watch. Always returns a result —
 * even with zero factors, the summary describes a clean forecast.
 */
export function detectForecastRisk(
  deals: ForecastDealSignals[],
  currency: OrganizationCurrency = "INR"
): ForecastRiskResult {
  const computedAt = new Date();
  const factors: ForecastRiskFactor[] = [];

  // Filter open deals only for risk analysis
  const openDeals = deals.filter(isOpenDeal);

  // Total pipeline = sum of all open deals (denominator for % math)
  const totalPipelineValue = openDeals.reduce((sum, d) => sum + d.value, 0);

  // -----------------------------------------------------------
  // PER-DEAL FACTOR DETECTION
  // -----------------------------------------------------------
  for (const s of openDeals) {
    const dealFactors: ForecastRiskFactor[] = [];

    const lateStage     = detectLateStageInactive(s, currency);
    if (lateStage)     dealFactors.push(lateStage);

    const slipped       = detectSlipped(s, computedAt);
    if (slipped)       dealFactors.push(slipped);

    const slippingSoon  = detectSlippingSoon(s, computedAt);
    if (slippingSoon)  dealFactors.push(slippingSoon);

    const staleCommit   = detectStaleCommit(s, currency);
    if (staleCommit)   dealFactors.push(staleCommit);

    const bestCaseDecay = detectBestCaseErosion(s);
    if (bestCaseDecay) dealFactors.push(bestCaseDecay);

    // Mega deal flag — only if this deal already has at least one risk
    if (dealFactors.length > 0) {
      const megaFlag = detectMegaDealAtRisk(s, true, currency);
      if (megaFlag) dealFactors.push(megaFlag);
    }

    for (const f of dealFactors) factors.push(f);
  }

  // -----------------------------------------------------------
  // CONCENTRATION DETECTION
  // Flag concentration risk if a small subset of deals holds most
  // of the at-risk revenue
  // -----------------------------------------------------------
  const riskByDeal = new Map<string, number>();
  for (const f of factors) {
    const key = String(f.dealId ?? f.dealName);
    const current = riskByDeal.get(key) ?? 0;
    // Use revenueImpact once per deal even if multiple factors fire
    if (current === 0) {
      riskByDeal.set(key, f.revenueImpact);
    }
  }

  const totalAtRisk = Array.from(riskByDeal.values()).reduce((a, b) => a + b, 0);

  if (riskByDeal.size >= 5 && totalAtRisk > 0) {
    const sortedRisks = Array.from(riskByDeal.values()).sort((a, b) => b - a);
    const topDealCount = Math.max(1, Math.floor(sortedRisks.length * FORECAST_CONFIG.concentration.topDealsRatio));
    const topRevenue = sortedRisks.slice(0, topDealCount).reduce((a, b) => a + b, 0);
    const topShare = topRevenue / totalAtRisk;

    if (topShare >= FORECAST_CONFIG.concentration.revenueShareMin) {
      factors.push({
        type:     FORECAST_RISK_TYPES.CONCENTRATION,
        dealName: "Portfolio concentration",
        severity: "high",
        revenueImpact:  topRevenue,
        weightedImpact: topRevenue,
        message:
          Math.round(topShare * 100) + "% of at-risk revenue concentrated in " +
          topDealCount + " deal" + (topDealCount === 1 ? "" : "s"),
        recommendedAction:
          "Diversify focus — protect mega deals AND build mid-tier pipeline depth",
      });
    }
  }

  // -----------------------------------------------------------
  // SORT FACTORS
  // -----------------------------------------------------------
  factors.sort((a, b) => {
    const s = compareSeverity(b.severity, a.severity);
    if (s !== 0) return s;
    return b.revenueImpact - a.revenueImpact;
  });

  // -----------------------------------------------------------
  // AGGREGATE SUMMARY
  // -----------------------------------------------------------
  // Unique-deal revenue (avoid double-counting same deal across factors)
  const uniqueDealRevenue = new Map<string, number>();
  const uniqueDealWeighted = new Map<string, number>();

  for (const f of factors) {
    if (f.type === FORECAST_RISK_TYPES.CONCENTRATION) continue;
    const key = String(f.dealId ?? f.dealName);
    if (!uniqueDealRevenue.has(key)) {
      uniqueDealRevenue.set(key, f.revenueImpact);
      uniqueDealWeighted.set(key, f.weightedImpact);
    }
  }

  const totalRevenueAtRisk = Array
    .from(uniqueDealRevenue.values())
    .reduce((a, b) => a + b, 0);

  const totalWeightedAtRisk = Array
    .from(uniqueDealWeighted.values())
    .reduce((a, b) => a + b, 0);

  const riskyDealsCount = uniqueDealRevenue.size;

  const percentAtRisk = totalPipelineValue > 0
    ? Math.min(100, (totalRevenueAtRisk / totalPipelineValue) * 100)
    : 0;

  let confidence: ForecastConfidence;
  const pct = percentAtRisk / 100;
  if (pct >= FORECAST_CONFIG.confidence.highRiskThreshold) {
    confidence = "low";
  } else if (pct >= FORECAST_CONFIG.confidence.mediumRiskThreshold) {
    confidence = "medium";
  } else {
    confidence = "high";
  }

  const summary: ForecastRiskSummary = {
    totalRevenueAtRisk,
    totalWeightedAtRisk,
    riskyDealsCount,
    totalPipelineValue,
    percentAtRisk: Math.round(percentAtRisk * 10) / 10,
    confidence,
    message: buildSummaryMessage(
      totalRevenueAtRisk,
      riskyDealsCount,
      percentAtRisk,
      confidence,
      currency
    ),
  };

  // -----------------------------------------------------------
  // BREAKDOWNS
  // -----------------------------------------------------------
  const bySeverity: Record<ForecastRiskSeverity, number> = {
    critical: 0,
    high:     0,
    medium:   0,
    low:      0,
  };
  const byType: Record<ForecastRiskType, number> = {
    [FORECAST_RISK_TYPES.LATE_STAGE_INACTIVE]: 0,
    [FORECAST_RISK_TYPES.SLIPPED]:             0,
    [FORECAST_RISK_TYPES.SLIPPING_SOON]:       0,
    [FORECAST_RISK_TYPES.STALE_COMMIT]:        0,
    [FORECAST_RISK_TYPES.BEST_CASE_EROSION]:   0,
    [FORECAST_RISK_TYPES.MEGA_DEAL_AT_RISK]:   0,
    [FORECAST_RISK_TYPES.CONCENTRATION]:       0,
  };

  for (const f of factors) {
    bySeverity[f.severity] += 1;
    byType[f.type] += 1;
  }

  // -----------------------------------------------------------
  // TOP DEALS TO WATCH
  // Compute a per-deal risk score (sum of factor weights), pick top 3
  // -----------------------------------------------------------
  const dealRiskMap = new Map<
    string,
    { dealId?: string | Types.ObjectId; dealName: string; score: number; reasons: string[] }
  >();

  for (const f of factors) {
    if (f.type === FORECAST_RISK_TYPES.CONCENTRATION) continue;
    const key = String(f.dealId ?? f.dealName);
    const entry = dealRiskMap.get(key) ?? {
      ...(f.dealId !== undefined && { dealId: f.dealId }),
      dealName: f.dealName,
      score:    0,
      reasons:  [] as string[],
    };
    entry.score   += SEVERITY_RANK[f.severity] * 10;
    entry.reasons.push(f.message);
    dealRiskMap.set(key, entry);
  }

  const topDealsToWatch = Array
    .from(dealRiskMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((d) => ({
      ...(d.dealId !== undefined && { dealId: d.dealId }),
      dealName:  d.dealName,
      riskScore: Math.min(100, d.score),
      reason:    d.reasons[0] ?? "Multiple risk signals",
    }));

  return {
    summary,
    factors,
    bySeverity,
    byType,
    topDealsToWatch,
    engineVersion: FORECAST_RISK_ENGINE_VERSION,
    computedAt,
  };
}

// ============================================================
// MESSAGE BUILDERS
// ============================================================

function buildSummaryMessage(
  totalAtRisk: number,
  riskyCount:  number,
  percentAtRisk: number,
  confidence:  ForecastConfidence,
  currency:    OrganizationCurrency
): string {
  if (riskyCount === 0 || totalAtRisk === 0) {
    return "Forecast is healthy — no significant risk signals detected";
  }

  const dealsLabel = riskyCount === 1 ? "deal" : "deals";
  const pctStr     = Math.round(percentAtRisk * 10) / 10;

  let confidenceText: string;
  if (confidence === "low") {
    confidenceText = " — forecast confidence is LOW";
  } else if (confidence === "medium") {
    confidenceText = " — confidence is moderate";
  } else {
    confidenceText = " — overall confidence remains high";
  }

  return formatCurrency(totalAtRisk, currency) + " at risk across " + riskyCount +
         " " + dealsLabel + " (" + pctStr + "% of pipeline)" +
         confidenceText;
}

// ============================================================
// SIGNAL EXTRACTION
// ============================================================

/**
 * Extract ForecastDealSignals from a Mongoose-shaped Deal document.
 * The scoring service uses this to bridge from DB to engine.
 *
 * Caller must resolve stageId → stageName via Pipeline lookup before
 * calling this function.
 */
export function extractForecastSignals(input: {
  _id?:                Types.ObjectId | string;
  title?:              string;
  value?:              number;
  stageName:           string;
  lastActivityAt?:     Date | null;
  probability?:        number;
  expectedCloseDate?:  Date | null;
  forecastCategory?:   "pipeline" | "best_case" | "commit" | "closed";
  status?:             "open" | "won" | "lost" | "stalled" | "abandoned";
  weightedValue?:      number;
}): ForecastDealSignals {
  const lastActivityDays = input.lastActivityAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - input.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  const signals: ForecastDealSignals = {
    name:             input.title ?? "Untitled Deal",
    value:            input.value ?? 0,
    stage:            input.stageName,
    lastActivityDays,
  };

  if (input._id !== undefined) signals.dealId = input._id;
  if (input.probability !== undefined) signals.probability = input.probability;
  if (input.expectedCloseDate !== undefined) signals.expectedCloseDate = input.expectedCloseDate;
  if (input.forecastCategory !== undefined) signals.forecastCategory = input.forecastCategory;
  if (input.status !== undefined) signals.status = input.status;
  if (input.weightedValue !== undefined) signals.weightedValue = input.weightedValue;

  return signals;
}

// ============================================================
// LEGACY-COMPATIBLE WRAPPER
// Keeps the frontend signature working during cutover.
// ============================================================

/**
 * @deprecated Use detectForecastRisk() for the full structured result.
 * Returns null when no risk, matching original frontend behavior.
 */
export function detectForecastRiskLegacy(
  deals: Array<{
    name:             string;
    value:            number;
    stage:            string;
    lastActivityDays: number;
  }>
): {
  totalRevenueAtRisk: number;
  riskyDeals:         number;
  message:            string;
} | null {
  const signals: ForecastDealSignals[] = deals.map((d) => ({
    name:             d.name,
    value:            d.value,
    stage:            d.stage,
    lastActivityDays: d.lastActivityDays,
  }));

  const result = detectForecastRisk(signals);

  if (result.summary.totalRevenueAtRisk === 0) return null;

  return {
    totalRevenueAtRisk: result.summary.totalRevenueAtRisk,
    riskyDeals:         result.summary.riskyDealsCount,
    message:            result.summary.message,
  };
}

export default detectForecastRisk;