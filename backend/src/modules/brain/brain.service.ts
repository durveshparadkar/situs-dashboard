// brain.service.ts
import mongoose from "mongoose";
import Lead from "../leads/lead.model.js";
import LeadActivity from "../leadActivity/leadActivity.model.js";
import Pipeline from "../pipelines/pipeline.model.js";

import { runBrain } from "./brain.engine.js";
import { runAIPrediction, predictWithMeta } from "./ai.engine.js";
import { LeadContext, BrainDecision } from "./brain.types.js";
import { dbLogger } from "../../utils/logger.js";

/* =====================================================
   ERRORS
===================================================== */

export class BrainServiceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "BRAIN_SERVICE_ERROR"
  ) {
    super(message);
    this.name = "BrainServiceError";
  }
}

/* =====================================================
   CONFIG
===================================================== */

const CONFIG = {
  staleDaysThreshold:       14,
  staleSignalTypes:         ["STALLED", "COLD"] as const,
  defaultDaysSinceActivity: 999,
  aiTimeoutMs:              10_000,
  enableAI:                 process.env.ENABLE_AI_PREDICTION !== "false",
} as const;

/* =====================================================
   TYPES
===================================================== */

interface ActivityMetrics {
  activityCount:        number;
  lastActivityAt:       Date | null;
  daysSinceLastActivity: number;
}

interface StageInfo {
  stageName:        string;
  stageProbability: number;
}

export interface AnalyzeLeadOptions {
  skipAI?:       boolean;
  skipPersist?:  boolean;
  forceRefresh?: boolean;
}

export interface AnalyzeLeadResult extends Omit<BrainDecision, "meta"> {
  meta: {
    leadId:     string;
    analyzedAt: Date;
    durationMs: number;
    aiUsed:     boolean;
    aiSource?:  "ai" | "fallback" | "cache" | "circuit_breaker";
    isStale:    boolean;
  };
}

export interface BatchAnalyzeResult {
  total:      number;
  succeeded:  number;
  failed:     number;
  durationMs: number;
}

/* =====================================================
   HELPERS
===================================================== */

function isValidObjectId(id: string | undefined | null): boolean {
  if (!id) return false;
  return mongoose.Types.ObjectId.isValid(id);
}

function calcDaysSince(date: Date | null | undefined): number {
  if (!date) return CONFIG.defaultDaysSinceActivity;
  return Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24));
}

/* =====================================================
   PRIVATE — DATA LOADERS
===================================================== */

async function loadActivityMetrics(leadId: string): Promise<ActivityMetrics> {
  const [activityCount, lastActivity] = await Promise.all([
    LeadActivity.countDocuments({ lead: leadId }),
    LeadActivity.findOne({ lead: leadId })
      .sort({ createdAt: -1 })
      .select("createdAt")
      .lean<{ createdAt: Date } | null>(),
  ]);

  return {
    activityCount,
    lastActivityAt:       lastActivity?.createdAt ?? null,
    daysSinceLastActivity: calcDaysSince(lastActivity?.createdAt),
  };
}

async function loadStageInfo(
  pipelineId: mongoose.Types.ObjectId | string | null | undefined,
  stageId:    mongoose.Types.ObjectId | string | null | undefined
): Promise<StageInfo> {
  const fallback: StageInfo = { stageName: "unknown", stageProbability: 0 };

  if (!pipelineId || !stageId) return fallback;

  const pipeline = await Pipeline.findById(pipelineId)
    .select("stages")
    .lean<{ stages?: Array<{ _id: unknown; name: string; probability?: number }> }>();

  if (!pipeline?.stages?.length) return fallback;

  const stage = pipeline.stages.find(
    (s) => String(s._id) === String(stageId)
  );

  if (!stage) return fallback;

  return {
    stageName:        stage.name ?? "unknown",
    stageProbability: stage.probability ?? 0,
  };
}

/* =====================================================
   PRIVATE — STALE DETECTION
===================================================== */

function detectStale(
  daysSinceLastActivity: number,
  signals: BrainDecision["signals"]
): boolean {
  if (daysSinceLastActivity > CONFIG.staleDaysThreshold) return true;
  return signals.some((s) =>
    (CONFIG.staleSignalTypes as readonly string[]).includes(s.type)
  );
}

/* =====================================================
   PRIVATE — AI ENRICHMENT
===================================================== */

async function enrichWithAI(
  context:          LeadContext,
  decision:         BrainDecision,
  lead:             any,
  stageProbability: number
): Promise<{ used: boolean; source?: string }> {
  if (!CONFIG.enableAI) return { used: false };

  try {
    const result = await predictWithMeta({
      leadScore:             lead.leadScore ?? 0,
      stage:                 context.stage,
      stageProbability,
      daysSinceLastActivity: context.daysSinceLastActivity,
      activityCount:         context.activityCount,
      signals:               decision.signals.map((s) => s.type),
      dealValue:             context.dealValue ?? 0,
    });

    if (result?.prediction) {
      decision.aiPrediction = result.prediction;
      return { used: true, source: result.source };
    }
    return { used: false };
  } catch (err) {
    dbLogger.warn(
      `AI enrichment failed for lead ${context.leadId}: ${(err as Error).message}`
    );
    return { used: false };
  }
}

async function enrichWithAILegacy(
  context:          LeadContext,
  decision:         BrainDecision,
  lead:             any,
  stageProbability: number
): Promise<boolean> {
  try {
    const aiPrediction = await runAIPrediction({
      leadScore:             lead.leadScore ?? 0,
      stage:                 context.stage,
      stageProbability,
      daysSinceLastActivity: context.daysSinceLastActivity,
      activityCount:         context.activityCount,
      signals:               decision.signals.map((s) => s.type),
      dealValue:             context.dealValue ?? 0,
    });

    if (aiPrediction) {
      decision.aiPrediction = aiPrediction;
      return true;
    }
    return false;
  } catch (err) {
    dbLogger.warn(
      `Legacy AI enrichment failed for lead ${context.leadId}: ${(err as Error).message}`
    );
    return false;
  }
}

/* =====================================================
   PRIVATE — PERSIST DECISION
===================================================== */

async function persistDecision(
  leadId:               string,
  decision:             BrainDecision,
  metrics:              ActivityMetrics,
  isStale:              boolean,
  fallbackLastActivity: Date | null | undefined
): Promise<void> {
  await Lead.findByIdAndUpdate(
    leadId,
    {
      $set: {
        leadScore:      decision.score,
        brainPriority:  decision.priority,
        isStale,
        lastActivityAt: metrics.lastActivityAt ?? fallbackLastActivity ?? null,
        brainSnapshot: {
          score:               decision.score,
          priority:            decision.priority,
          signals:             decision.signals,
          recommendedActions:  decision.recommendedActions,
          aiPrediction:        decision.aiPrediction ?? null,
          analyzedAt:          new Date(),
        },
      },
    },
    { new: false, runValidators: false }
  );
}

/* =====================================================
   PUBLIC — ANALYZE LEAD
===================================================== */

export async function analyzeLead(
  leadId:  string,
  options: AnalyzeLeadOptions = {}
): Promise<AnalyzeLeadResult> {
  const startedAt = Date.now();

  if (!isValidObjectId(leadId)) {
    throw new BrainServiceError("Invalid lead ID", 400, "INVALID_ID");
  }

  const lead = await Lead.findById(leadId);
  if (!lead) {
    throw new BrainServiceError("Lead not found", 404, "LEAD_NOT_FOUND");
  }

  const [metrics, stageInfo] = await Promise.all([
    loadActivityMetrics(leadId),
    loadStageInfo(lead.pipelineId, lead.stageId),
  ]);

  const context: LeadContext = {
    leadId:               (lead._id as mongoose.Types.ObjectId).toString(),
    dealValue:            lead.budget ?? 0,
    stage:                stageInfo.stageName,
    activityCount:        metrics.activityCount,
    daysSinceLastActivity: metrics.daysSinceLastActivity,
    stageChangedRecently: false,
  };

  const decision = runBrain(context);

  let aiUsed   = false;
  let aiSource: AnalyzeLeadResult["meta"]["aiSource"];

  if (!options.skipAI) {
    try {
      const aiResult = await enrichWithAI(context, decision, lead, stageInfo.stageProbability);
      aiUsed   = aiResult.used;
      aiSource = aiResult.source as AnalyzeLeadResult["meta"]["aiSource"];
    } catch {
      aiUsed = await enrichWithAILegacy(context, decision, lead, stageInfo.stageProbability);
    }
  }

  const isStale = detectStale(metrics.daysSinceLastActivity, decision.signals);

  if (!options.skipPersist) {
    try {
      await persistDecision(leadId, decision, metrics, isStale, lead.lastActivityAt);
    } catch (err) {
      dbLogger.error(
        `Brain decision persist failed for lead ${leadId}: ${(err as Error).message}`
      );
    }
  }

  const durationMs = Date.now() - startedAt;

  dbLogger.info(
    `Brain analysis complete: lead=${leadId} score=${decision.score} ` +
    `priority=${decision.priority} stale=${isStale} ai=${aiUsed} durationMs=${durationMs}`
  );

  return {
    ...decision,
    meta: {
      leadId,
      analyzedAt: new Date(),
      durationMs,
      aiUsed,
      ...(aiSource !== undefined && { aiSource }),
      isStale,
    },
  };
}

/* =====================================================
   PUBLIC — BATCH ANALYZE
===================================================== */

export async function analyzeOrgLeads(
  organizationId: string,
  options: { skipAI?: boolean; concurrency?: number } = {}
): Promise<BatchAnalyzeResult> {
  if (!isValidObjectId(organizationId)) {
    throw new BrainServiceError("Invalid organization ID", 400, "INVALID_ID");
  }

  const startedAt   = Date.now();
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 5, 20));
  const skipAI      = options.skipAI ?? true;

  let total     = 0;
  let succeeded = 0;
  let failed    = 0;

  const cursor = Lead.find({
    organizationId,
    isDeleted: { $ne: true },
  })
    .select("_id")
    .cursor();

  const inFlight: Promise<void>[] = [];

  for await (const lead of cursor) {
    total++;
    const leadId = (lead._id as mongoose.Types.ObjectId).toString();

    const task = analyzeLead(leadId, { skipAI })
      .then(() => { succeeded++; })
      .catch((err: Error) => {
        failed++;
        dbLogger.error(
          `Batch brain analysis failed for lead ${leadId}: ${err.message}`
        );
      });

    inFlight.push(task);

    if (inFlight.length >= concurrency) {
      await Promise.race(inFlight);
      for (let i = inFlight.length - 1; i >= 0; i--) {
        const p = inFlight[i];
        if (!p) continue;
        if (await Promise.race([p.then(() => true), Promise.resolve(false)])) {
          inFlight.splice(i, 1);
        }
      }
    }
  }

  await Promise.allSettled(inFlight);

  const durationMs = Date.now() - startedAt;

  dbLogger.info(
    `Org brain analysis complete: org=${organizationId} ` +
    `total=${total} succeeded=${succeeded} failed=${failed} durationMs=${durationMs}`
  );

  return { total, succeeded, failed, durationMs };
}