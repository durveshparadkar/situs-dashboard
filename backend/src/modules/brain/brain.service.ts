import mongoose from "mongoose";
import Lead from "../leads/lead.model.js";
import LeadActivity from "../leadActivity/leadActivity.model.js";
import Pipeline from "../pipelines/pipeline.model.js";

import { runBrain } from "./brain.engine.js";
import { runAIPrediction } from "./ai.engine.js";
import { LeadContext, BrainDecision } from "./brain.types.js";

/* =====================================================
   ANALYZE LEAD (CORE INTELLIGENCE ENGINE)
===================================================== */

export async function analyzeLead(
  leadId: string
): Promise<BrainDecision> {
  if (!mongoose.Types.ObjectId.isValid(leadId)) {
    throw new Error("Invalid lead ID");
  }

  /* ===============================
     LOAD LEAD (Lean Safe)
  =============================== */

  const lead = await Lead.findById(leadId);

  if (!lead) {
    throw new Error("Lead not found");
  }

  /* ===============================
     ACTIVITY METRICS
  =============================== */

  const [activityCount, lastActivity] = await Promise.all([
    LeadActivity.countDocuments({ lead: leadId }),
    LeadActivity.findOne({ lead: leadId })
      .sort({ createdAt: -1 })
      .select("createdAt")
      .lean(),
  ]);

  let daysSinceLastActivity = 999;

  if (lastActivity?.createdAt) {
    const diffMs =
      Date.now() -
      new Date(lastActivity.createdAt).getTime();

    daysSinceLastActivity = Math.floor(
      diffMs / (1000 * 60 * 60 * 24)
    );
  }

  /* ===============================
     STAGE INFO
  =============================== */

  let stageName = "unknown";
  let stageProbability = 0;

  if (lead.pipelineId) {
    const pipeline = await Pipeline.findById(
      lead.pipelineId
    )
      .select("stages")
      .lean();

    if (pipeline?.stages?.length) {
      const stage = pipeline.stages.find(
        (s: any) =>
          s._id.toString() === lead.stageId?.toString()
      );

      if (stage) {
        stageName = stage.name;
        stageProbability = stage.probability ?? 0;
      }
    }
  }

  /* ===============================
     BUILD CONTEXT
  =============================== */

  const context: LeadContext = {
    leadId: lead._id.toString(),
    dealValue: lead.budget ?? 0,
    stage: stageName,
    activityCount,
    daysSinceLastActivity,
    stageChangedRecently: false,
  };

  /* ===============================
     CORE BRAIN ENGINE
  =============================== */

  const decision = runBrain(context);

  /* ===============================
     AI LAYER (Isolated Safe)
  =============================== */

  try {
    const aiPrediction = await runAIPrediction({
      leadScore: lead.leadScore ?? 0,
      stage: stageName,
      stageProbability,
      daysSinceLastActivity,
      activityCount,
      signals: decision.signals.map((s) => s.type),
      dealValue: lead.budget ?? 0,
    });

    if (aiPrediction) {
      decision.aiPrediction = aiPrediction;
    }
  } catch (error: any) {
    console.log(
      "AI prediction skipped:",
      error?.message
    );
  }

  /* ===============================
     STALE DETECTION
  =============================== */

  const isStale =
    daysSinceLastActivity > 14 ||
    decision.signals.some(
      (s) => s.type === "STALLED" || s.type === "COLD"
    );

  /* ===============================
     ATOMIC UPDATE (Safe Write)
  =============================== */

  await Lead.findByIdAndUpdate(leadId, {
    leadScore: decision.score,
    brainPriority: decision.priority,
    isStale,
    lastActivityAt: lastActivity?.createdAt ?? lead.lastActivityAt,
    brainSnapshot: {
      score: decision.score,
      priority: decision.priority,
      signals: decision.signals,
      recommendedActions: decision.recommendedActions,
      analyzedAt: new Date(),
    },
  });

  return decision;
}