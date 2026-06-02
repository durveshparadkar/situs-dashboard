// intelligence.api.ts
//
// Frontend client for the backend intelligence API.
// Wraps apiFetch with typed endpoints that mirror the backend orchestrator.
//
// All endpoints below mirror routes from:
//   backend/src/modules/intelligence/intelligence.routes.ts
//
// Auth: cookie-based session (apiFetch sets credentials: "include")
//
// Usage:
//   const data = await getIntelligenceSummary();
//   data.dealRisks       // per-deal risk results
//   data.attentionAlerts // today's action alerts
//   data.forecast        // forecast risk summary
//   data.pipelineLeaks   // pipeline structure analysis
//   data.actions         // composed revenue actions

import { apiFetch } from "../../lib/api";

// ============================================================
// TYPES — mirror the backend engine outputs
// Kept loose (no readonly modifiers) so the existing dashboard
// components can work with the data without TS friction.
// ============================================================

export type DealRiskLevel = "low" | "medium" | "high" | "critical";

export type DealRiskFactor = {
  code:    string;
  message: string;
  weight:  number;
};

export type DealRiskResult = {
  dealId?:       string;
  name:          string;
  riskScore:     number;
  riskLevel:     DealRiskLevel;
  factors:       DealRiskFactor[];
  reasons:       string[];
  engineVersion: string;
  computedAt:    string;
};

export type AttentionPriority = "low" | "medium" | "high" | "critical";

export type DealAttentionAlert = {
  dealId?:           string;
  type:              string;
  dealName:          string;
  message:           string;
  recommendedAction: string;
  priority:          AttentionPriority;
  impactScore:       number;
  engineVersion:     string;
  computedAt:        string;
};

export type ForecastConfidence = "low" | "medium" | "high";

export type ForecastRiskSeverity = "low" | "medium" | "high" | "critical";

export type ForecastRiskFactor = {
  type:              string;
  dealId?:           string;
  dealName:          string;
  severity:          ForecastRiskSeverity;
  revenueImpact:     number;
  weightedImpact:    number;
  message:           string;
  recommendedAction: string;
};

export type ForecastRiskSummary = {
  totalRevenueAtRisk:  number;
  totalWeightedAtRisk: number;
  riskyDealsCount:     number;
  totalPipelineValue:  number;
  percentAtRisk:       number;
  confidence:          ForecastConfidence;
  message:             string;
};

export type ForecastRiskResult = {
  summary:         ForecastRiskSummary;
  factors:         ForecastRiskFactor[];
  bySeverity:      Record<ForecastRiskSeverity, number>;
  byType:          Record<string, number>;
  topDealsToWatch: Array<{
    dealId?:   string;
    dealName:  string;
    riskScore: number;
    reason:    string;
  }>;
  engineVersion:   string;
  computedAt:      string;
};

export type PipelineLeakSeverity = "low" | "medium" | "high" | "critical";

export type PipelineLeak = {
  type:              string;
  stage?:            string;
  severity:          PipelineLeakSeverity;
  totalValue:        number;
  dealCount:         number;
  avgInactivityDays?: number;
  message:           string;
  recommendedAction: string;
  dealIds?:          string[];
};

export type StageMetrics = {
  stage:             string;
  dealCount:         number;
  totalValue:        number;
  avgValue:          number;
  avgInactivityDays: number;
  avgAgeDays:        number;
  shareOfPipeline:   number;
};

export type PipelineLeakResult = {
  leaks:              PipelineLeak[];
  stageMetrics:       StageMetrics[];
  totalPipelineValue: number;
  totalOpenDeals:     number;
  bySeverity:         Record<PipelineLeakSeverity, number>;
  byType:             Record<string, number>;
  worstStage?:        string;
  healthScore:        number;
  summary:            string;
  engineVersion:      string;
  computedAt:         string;
};

export type RevenueActionType =
  | "critical"
  | "warning"
  | "opportunity"
  | "quick_win"
  | "coaching";

export type RevenueActionPriority = "low" | "medium" | "high" | "critical";

export type RevenueAction = {
  actionId:        string;
  type:            RevenueActionType;
  priority:        RevenueActionPriority;
  dealId?:         string;
  dealName:        string;
  title:           string;
  action:          string;
  reason:          string;
  priorityScore:   number;
  revenueImpact:   number;
  assignedToId?:   string;
  assignedToName?: string;
  stage?:          string;
};

export type CoachingSignal = {
  assignedToId?:     string;
  assignedToName:    string;
  pattern:           string;
  affectedDeals:     number;
  message:           string;
  recommendedAction: string;
};

export type RevenueDecisionResult = {
  topActions:            RevenueAction[];
  allActions:            RevenueAction[];
  totalRevenueImpact:    number;
  criticalRevenueAtRisk: number;
  opportunityRevenue:    number;
  byType:                Record<RevenueActionType, number>;
  byPriority:            Record<RevenueActionPriority, number>;
  coachingSignals:       CoachingSignal[];
  summary:               string;
  engineVersion:         string;
  computedAt:            string;
};

export type IntelligenceMeta = {
  orchestratorVersion: string;
  engineVersions:      Record<string, string>;
  dealsProcessed:      number;
  dealsSkipped:        number;
  dealsUpdated:        number;
  alertsEmitted:       number;
  durationMs:          number;
  errors:              string[];
  computedAt:          string;
  dryRun:              boolean;
};

export type IntelligenceSummary = {
  organizationId:  string;
  pipelineId?:     string;
  dealRisks:       DealRiskResult[];
  attentionAlerts: DealAttentionAlert[];
  forecast:        ForecastRiskResult;
  pipelineLeaks:   PipelineLeakResult;
  actions:         RevenueDecisionResult;
  meta:            IntelligenceMeta;
};

// ============================================================
// API CALLS
// ============================================================

type Envelope<T> = {
  success: boolean;
  data?:   T;
  message?: string;
};

/**
 * Full composed intelligence — risk, attention, forecast, leaks, actions.
 * Used by the main dashboard page.
 */
export async function getIntelligenceSummary(params?: {
  pipelineId?:   string;
  assignedToId?: string;
}): Promise<IntelligenceSummary> {
  const query = new URLSearchParams();
  if (params?.pipelineId)   query.set("pipelineId", params.pipelineId);
  if (params?.assignedToId) query.set("assignedToId", params.assignedToId);

  const qs = query.toString();
  const path = "/api/intelligence/summary" + (qs ? "?" + qs : "");

  const res = await apiFetch<Envelope<IntelligenceSummary>>(path);

  if (!res.success || !res.data) {
    throw new Error(res.message ?? "Failed to load intelligence summary");
  }
  return res.data;
}

/**
 * Forecast-only view. Use when you only need the forecast card.
 */
export async function getForecast(params?: {
  pipelineId?: string;
}): Promise<{ forecast: ForecastRiskResult; meta: IntelligenceMeta }> {
  const query = new URLSearchParams();
  if (params?.pipelineId) query.set("pipelineId", params.pipelineId);

  const qs = query.toString();
  const path = "/api/intelligence/forecast" + (qs ? "?" + qs : "");

  const res = await apiFetch<Envelope<{
    forecast: ForecastRiskResult;
    meta:     IntelligenceMeta;
  }>>(path);

  if (!res.success || !res.data) {
    throw new Error(res.message ?? "Failed to load forecast");
  }
  return res.data;
}

/**
 * Trigger a full re-scoring. Writes scores back to Deal docs and emits alerts.
 * Use sparingly — heavy operation, rate-limited at the backend.
 */
export async function refreshIntelligence(params?: {
  pipelineId?:   string;
  assignedToId?: string;
}): Promise<IntelligenceSummary> {
  const res = await apiFetch<Envelope<IntelligenceSummary>>(
    "/api/intelligence/refresh",
    {
      method: "POST",
      body:   JSON.stringify(params ?? {}),
    }
  );

  if (!res.success || !res.data) {
    throw new Error(res.message ?? "Failed to refresh intelligence");
  }
  return res.data;
}

/**
 * Re-score a single deal on demand.
 */
export async function refreshDealIntelligence(
  dealId: string
): Promise<DealRiskResult> {
  const res = await apiFetch<Envelope<DealRiskResult>>(
    "/api/intelligence/deals/" + dealId + "/refresh",
    { method: "POST" }
  );

  if (!res.success || !res.data) {
    throw new Error(res.message ?? "Failed to refresh deal intelligence");
  }
  return res.data;
}