// brain.worker.ts
import { Worker, UnrecoverableError } from "bullmq";
import mongoose from "mongoose";
import Lead from "../leads/lead.model.js";
import { analyzeLead, BrainServiceError } from "./brain.service.js";
import { recalculatePriority } from "../leads/leadPriority.engine.js";
import { QUEUE_NAMES, JOB_TYPES, } from "./brain.queue.js";
import { dbLogger } from "../../utils/logger.js";
/* =====================================================
   REDIS CONFIG — must match brain.queue.ts
===================================================== */
const REDIS_CONFIG = {
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD ?? undefined,
    db: Number(process.env.REDIS_DB) || 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...(process.env.REDIS_TLS === "true" && {
        tls: { rejectUnauthorized: false },
    }),
};
/* =====================================================
   CONFIG
===================================================== */
const CONFIG = {
    concurrency: Number(process.env.BRAIN_WORKER_CONCURRENCY) || 5,
    jobTimeoutMs: 60_000,
    recentRunSkipMs: 30_000,
    stuckLockThresholdMs: 5 * 60_000,
    skipStatuses: ["archived", "deleted"],
};
/* =====================================================
   HELPERS
===================================================== */
function isValidObjectId(id) {
    if (!id)
        return false;
    return mongoose.Types.ObjectId.isValid(id);
}
async function withTimeout(promise, ms, errorMsg) {
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`${errorMsg} (timeout after ${ms}ms)`)), ms);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    }
    finally {
        if (timeoutHandle)
            clearTimeout(timeoutHandle);
    }
}
/* =====================================================
   LOCK RELEASE — best-effort, never throws
===================================================== */
async function releaseLock(leadId, status) {
    try {
        await Lead.findByIdAndUpdate(leadId, {
            $set: {
                brainStatus: status,
                ...(status === "failed" && { lastBrainRunAt: new Date() }),
            },
        });
    }
    catch (err) {
        dbLogger.error(`[brainWorker] Failed to release lock for lead ${leadId}: ${err.message}`);
    }
}
/* =====================================================
   ESCALATION ENGINE
===================================================== */
function handleEscalation(lead, priority, isStale, jobId) {
    const shouldEscalate = priority === "critical" && isStale && !lead.isArchived;
    if (shouldEscalate) {
        if (!lead.escalation?.recommended) {
            lead.escalation = {
                recommended: true,
                reason: "Critical lead is stale and requires manager attention",
                recommendedAt: new Date(),
                approved: false,
            };
            dbLogger.info(`[brainWorker:${jobId}] Escalation recommended: lead=${lead._id}`);
            return true;
        }
        return false;
    }
    if (lead.escalation?.recommended && !lead.escalation?.approved) {
        lead.escalation = null;
        dbLogger.info(`[brainWorker:${jobId}] Escalation auto-cleared: lead=${lead._id}`);
    }
    return false;
}
/* =====================================================
   PROCESSOR — ANALYZE LEAD
===================================================== */
async function processAnalyzeLead(job) {
    const startedAt = Date.now();
    const { leadId } = job.data;
    const jobId = job.id ?? "unknown";
    if (!isValidObjectId(leadId)) {
        dbLogger.warn(`[brainWorker:${jobId}] Invalid leadId: ${leadId}`);
        throw new UnrecoverableError(`Invalid leadId: ${leadId}`);
    }
    const safeLeadId = leadId;
    dbLogger.info(`[brainWorker:${jobId}] Starting brain analysis: lead=${safeLeadId}`);
    const now = new Date();
    const stuckLockTime = new Date(Date.now() - CONFIG.stuckLockThresholdMs);
    const recentRunTime = new Date(Date.now() - CONFIG.recentRunSkipMs);
    const lockedLead = await Lead.findOneAndUpdate({
        _id: safeLeadId,
        $or: [
            { brainStatus: { $ne: "processing" } },
            { brainStatus: "processing", lastBrainRunAt: { $lt: stuckLockTime } },
        ],
        $and: [
            {
                $or: [
                    { lastBrainRunAt: { $exists: false } },
                    { lastBrainRunAt: null },
                    { lastBrainRunAt: { $lt: recentRunTime } },
                ],
            },
        ],
    }, {
        $set: {
            brainStatus: "processing",
            lastBrainLockAt: now,
        },
    }, { new: true });
    if (!lockedLead) {
        const lead = await Lead.findById(safeLeadId).lean();
        if (!lead) {
            dbLogger.warn(`[brainWorker:${jobId}] Lead not found: ${safeLeadId}`);
            return { status: "skipped", leadId: safeLeadId, reason: "lead_not_found" };
        }
        if (lead.brainStatus === "processing") {
            dbLogger.info(`[brainWorker:${jobId}] Skipping — lead is locked by another worker`);
            return { status: "skipped", leadId: safeLeadId, reason: "already_processing" };
        }
        dbLogger.info(`[brainWorker:${jobId}] Skipping — recently processed`);
        return { status: "skipped", leadId: safeLeadId, reason: "recently_processed" };
    }
    if (lockedLead.isArchived) {
        await releaseLock(safeLeadId, "completed");
        return { status: "skipped", leadId: safeLeadId, reason: "lead_archived" };
    }
    if (lockedLead.isDeleted) {
        await releaseLock(safeLeadId, "completed");
        return { status: "skipped", leadId: safeLeadId, reason: "lead_deleted" };
    }
    try {
        await withTimeout(analyzeLead(safeLeadId), CONFIG.jobTimeoutMs, `Brain analysis exceeded timeout for lead ${safeLeadId}`);
        const freshLead = await Lead.findById(safeLeadId);
        if (!freshLead) {
            dbLogger.warn(`[brainWorker:${jobId}] Lead disappeared during analysis: ${safeLeadId}`);
            return { status: "skipped", leadId: safeLeadId, reason: "lead_not_found" };
        }
        const { priority, isStale } = recalculatePriority(freshLead);
        freshLead.brainPriority = priority;
        freshLead.isStale = isStale;
        const escalationTriggered = handleEscalation(freshLead, priority, isStale, jobId);
        freshLead.brainStatus = "completed";
        freshLead.lastBrainRunAt = new Date();
        await freshLead.save();
        const durationMs = Date.now() - startedAt;
        dbLogger.info(`[brainWorker:${jobId}] Brain analysis complete: lead=${safeLeadId} ` +
            `priority=${priority} stale=${isStale} escalated=${escalationTriggered} ` +
            `durationMs=${durationMs}`);
        return {
            status: "success",
            leadId: safeLeadId,
            priority,
            isStale,
            escalationTriggered,
            durationMs,
        };
    }
    catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        dbLogger.error(`[brainWorker:${jobId}] Brain processing failed: lead=${safeLeadId} error=${errMsg}`);
        await releaseLock(safeLeadId, "failed");
        if (err instanceof BrainServiceError &&
            (err.code === "INVALID_ID" || err.code === "LEAD_NOT_FOUND")) {
            throw new UnrecoverableError(errMsg);
        }
        throw err;
    }
}
/* =====================================================
   JOB ROUTER
===================================================== */
async function processJob(job) {
    const jobType = job.data?.type ?? job.name;
    switch (jobType) {
        case JOB_TYPES.ANALYZE_LEAD:
            return processAnalyzeLead(job);
        case JOB_TYPES.ANALYZE_DEAL:
            dbLogger.warn(`[brainWorker:${job.id}] ANALYZE_DEAL not yet implemented`);
            return null;
        case JOB_TYPES.RECALCULATE_ORG:
            dbLogger.warn(`[brainWorker:${job.id}] RECALCULATE_ORG should be handled by a dedicated org worker`);
            return null;
        default:
            dbLogger.warn(`[brainWorker:${job.id}] Unknown job type: ${jobType}`);
            throw new UnrecoverableError(`Unknown job type: ${jobType}`);
    }
}
/* =====================================================
   WORKER INSTANCE
===================================================== */
export const brainWorker = new Worker(QUEUE_NAMES.BRAIN, processJob, {
    connection: REDIS_CONFIG,
    concurrency: CONFIG.concurrency,
    lockDuration: CONFIG.jobTimeoutMs + 30_000,
    lockRenewTime: 15_000,
    settings: {
        backoffStrategy: (attemptsMade) => {
            const base = 3_000 * Math.pow(2, attemptsMade);
            const jitter = Math.floor(Math.random() * 500);
            return Math.min(base + jitter, 60_000);
        },
    },
});
dbLogger.info(`[brainWorker] Started: queue=${QUEUE_NAMES.BRAIN} concurrency=${CONFIG.concurrency}`);
/* =====================================================
   EVENT HANDLERS
===================================================== */
brainWorker.on("completed", (job, result) => {
    if (result?.status === "success") {
        dbLogger.info(`[brainWorker] Job ${job.id} completed: lead=${result.leadId} ` +
            `priority=${result.priority} durationMs=${result.durationMs}`);
    }
    else if (result?.status === "skipped") {
        dbLogger.info(`[brainWorker] Job ${job.id} skipped: lead=${result.leadId} reason=${result.reason}`);
    }
});
brainWorker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 1;
    const isFinal = attemptsMade >= maxAttempts;
    dbLogger.error(`[brainWorker] Job ${job?.id} failed (attempt ${attemptsMade}/${maxAttempts}): ${err.message}` +
        (isFinal ? " — FINAL FAILURE, no more retries" : " — will retry"));
    if (isFinal && job?.data?.leadId) {
        void releaseLock(job.data.leadId, "failed");
    }
});
brainWorker.on("error", (err) => {
    dbLogger.error(`[brainWorker] Worker error: ${err.message}`);
});
brainWorker.on("stalled", (jobId) => {
    dbLogger.warn(`[brainWorker] Job stalled: ${jobId}`);
});
brainWorker.on("active", (job) => {
    if (process.env.NODE_ENV !== "production") {
        dbLogger.info(`[brainWorker] Job active: ${job.id}`);
    }
});
export async function getWorkerHealth() {
    return {
        isRunning: !brainWorker.closing,
        isPaused: await brainWorker.isPaused(),
        concurrency: CONFIG.concurrency,
    };
}
/* =====================================================
   GRACEFUL SHUTDOWN
===================================================== */
let _shutdownInProgress = false;
async function shutdown(signal) {
    if (_shutdownInProgress)
        return;
    _shutdownInProgress = true;
    dbLogger.info(`[brainWorker] ${signal} received — initiating graceful shutdown`);
    try {
        await brainWorker.close();
        dbLogger.info("[brainWorker] Worker closed cleanly");
    }
    catch (err) {
        dbLogger.error(`[brainWorker] Shutdown error: ${err.message}`);
    }
    process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
    dbLogger.error(`[brainWorker] Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
});
//# sourceMappingURL=brain.worker.js.map