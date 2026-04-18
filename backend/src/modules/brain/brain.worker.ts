import { Worker, Job } from "bullmq";
import mongoose from "mongoose";
import Lead from "../leads/lead.model.js";
import { analyzeLead } from "./brain.service.js";
import { recalculatePriority } from "../leads/leadPriority.engine.js";

/* =====================================================
   REDIS CONNECTION
===================================================== */

const connection = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
};

/* =====================================================
   BRAIN WORKER
===================================================== */

export const brainWorker = new Worker(
  "brainQueue",
  async (job: Job<{ leadId: string }>) => {
    const { leadId } = job.data;

    if (!leadId || !mongoose.Types.ObjectId.isValid(leadId)) {
      console.warn(`[${job.id}] Invalid leadId provided`);
      return;
    }

    console.log(`[${job.id}] Starting brain analysis for ${leadId}`);

    const lead = await Lead.findById(leadId);
    if (!lead) {
      console.warn(`[${job.id}] Lead not found`);
      return;
    }

    /* =====================================================
       🔒 DUPLICATE + CONCURRENCY PROTECTION
    ===================================================== */

    if (lead.brainStatus === "processing") {
      console.log(`[${job.id}] Skipping — already processing`);
      return;
    }

    if (
      lead.lastBrainRunAt &&
      Date.now() - new Date(lead.lastBrainRunAt).getTime() < 30000
    ) {
      console.log(`[${job.id}] Skipping — recently processed`);
      return;
    }

    // Lock lead
    lead.brainStatus = "processing";
    await lead.save();

    try {
      /* =====================================================
         🧠 RUN AI ANALYSIS
      ===================================================== */

      await analyzeLead(leadId);

      // Always fetch fresh document
      const freshLead = await Lead.findById(leadId);
      if (!freshLead) return;

      /* =====================================================
         🎯 SMART PRIORITY ENGINE
      ===================================================== */

      const { priority, isStale } = recalculatePriority(freshLead);

      freshLead.brainPriority = priority;
      freshLead.isStale = isStale;

      /* =====================================================
         🚨 ESCALATION RECOMMENDATION ENGINE
      ===================================================== */

      const shouldEscalate =
        priority === "critical" &&
        isStale &&
        !freshLead.isArchived;

      if (shouldEscalate) {
        // Only create escalation if not already recommended
        if (!freshLead.escalation?.recommended) {
          freshLead.escalation = {
            recommended: true,
            reason: "Critical lead is stale and requires manager attention",
            recommendedAt: new Date(),
            approved: false,
          };

          console.log(
            `[${job.id}] Escalation recommended for lead ${leadId}`
          );
        }
      } else {
        // Auto-clear escalation if conditions improved
        if (freshLead.escalation?.recommended && !freshLead.escalation?.approved) {
          freshLead.escalation = null;

          console.log(
            `[${job.id}] Escalation cleared (conditions improved)`
          );
        }
      }

      /* =====================================================
         ✅ FINALIZE BRAIN STATE
      ===================================================== */

      freshLead.brainStatus = "completed";
      freshLead.lastBrainRunAt = new Date();

      await freshLead.save();

      console.log(
        `[${job.id}] Brain completed. Final Priority: ${priority}`
      );

      return {
        success: true,
        priority,
      };
    } catch (error: any) {
      console.error(
        `[${job.id}] Brain processing failed: ${error.message}`
      );

      const failedLead = await Lead.findById(leadId);
      if (failedLead) {
        failedLead.brainStatus = "failed";
        await failedLead.save();
      }

      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

/* =====================================================
   EVENTS
===================================================== */

brainWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

brainWorker.on("failed", (job, err) => {
  console.error(
    `Job ${job?.id} failed after retries: ${err.message}`
  );
});

brainWorker.on("error", (err) => {
  console.error("Worker error:", err.message);
});

/* =====================================================
   GRACEFUL SHUTDOWN
===================================================== */

process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Closing worker...");
  await brainWorker.close();
});

process.on("SIGINT", async () => {
  console.log("SIGINT received. Closing worker...");
  await brainWorker.close();
});