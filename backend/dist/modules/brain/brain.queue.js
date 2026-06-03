// brain.queue.ts
import { Queue, QueueEvents } from "bullmq";
import { dbLogger } from "../../utils/logger.js";
/* =====================================================
   REDIS CONFIG — passed directly to BullMQ
   BullMQ bundles its own ioredis internally, so we
   never instantiate ioredis ourselves — avoids the
   version conflict entirely.
===================================================== */
const REDIS_CONFIG = {
    host: process.env.REDIS_HOST ?? "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD ?? undefined,
    db: Number(process.env.REDIS_DB) || 0,
    maxRetriesPerRequest: null, // BullMQ requires null
    enableReadyCheck: false, // BullMQ recommendation
    connectTimeout: 10_000,
    ...(process.env.REDIS_TLS === "true" && {
        tls: { rejectUnauthorized: false },
    }),
};
/* =====================================================
   QUEUE NAMES
===================================================== */
export const QUEUE_NAMES = {
    BRAIN: "brainQueue",
    BRAIN_PRIORITY: "brainQueue.priority",
};
/* =====================================================
   JOB TYPES
===================================================== */
export const JOB_TYPES = {
    ANALYZE_LEAD: "analyze_lead",
    ANALYZE_DEAL: "analyze_deal",
    RECALCULATE_ORG: "recalculate_org",
    REGENERATE_RECOMMENDATIONS: "regenerate_recommendations",
};
/* =====================================================
   JOB OPTIONS
===================================================== */
const isDev = process.env.NODE_ENV !== "production";
export const DEFAULT_JOB_OPTIONS = {
    removeOnComplete: {
        count: isDev ? 1_000 : 5_000,
        age: 24 * 60 * 60,
    },
    removeOnFail: {
        count: isDev ? 500 : 2_000,
        age: 7 * 24 * 60 * 60,
    },
    attempts: 5,
    backoff: {
        type: "exponential",
        delay: 3_000,
    },
};
/* =====================================================
   QUEUES — pass config object, not a Redis instance
===================================================== */
export const brainQueue = new Queue(QUEUE_NAMES.BRAIN, {
    connection: REDIS_CONFIG,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
});
export const brainPriorityQueue = new Queue(QUEUE_NAMES.BRAIN_PRIORITY, {
    connection: REDIS_CONFIG,
    defaultJobOptions: {
        ...DEFAULT_JOB_OPTIONS,
        attempts: 3,
        backoff: { type: "exponential", delay: 1_000 },
    },
});
/* =====================================================
   QUEUE EVENTS
===================================================== */
export const brainQueueEvents = new QueueEvents(QUEUE_NAMES.BRAIN, {
    connection: REDIS_CONFIG,
});
brainQueueEvents.on("completed", ({ jobId }) => {
    dbLogger.info(`[brainQueue] Job completed: ${jobId}`);
});
brainQueueEvents.on("failed", ({ jobId, failedReason }) => {
    dbLogger.error(`[brainQueue] Job failed: ${jobId} reason=${failedReason}`);
});
brainQueueEvents.on("stalled", ({ jobId }) => {
    dbLogger.warn(`[brainQueue] Job stalled: ${jobId}`);
});
brainQueueEvents.on("waiting", ({ jobId }) => {
    if (isDev)
        dbLogger.info(`[brainQueue] Job waiting: ${jobId}`);
});
export async function enqueueLeadAnalysis(payload, opts = {}) {
    if (!payload.leadId)
        throw new Error("leadId is required");
    if (!payload.organizationId)
        throw new Error("organizationId is required");
    const jobId = opts.jobId ?? `analyze_lead:${payload.leadId}`;
    const job = await brainQueue.add(JOB_TYPES.ANALYZE_LEAD, { ...payload, type: JOB_TYPES.ANALYZE_LEAD }, {
        jobId,
        priority: opts.priority ?? 5,
        ...(opts.delay !== undefined && { delay: opts.delay }),
        ...(opts.attempts !== undefined && { attempts: opts.attempts }),
    });
    dbLogger.info(`[brainQueue] Enqueued lead analysis: lead=${payload.leadId} job=${job.id}`);
    return job.id ?? jobId;
}
export async function enqueueDealAnalysis(payload, opts = {}) {
    if (!payload.dealId)
        throw new Error("dealId is required");
    const jobId = opts.jobId ?? `analyze_deal:${payload.dealId}`;
    const job = await brainQueue.add(JOB_TYPES.ANALYZE_DEAL, { ...payload, type: JOB_TYPES.ANALYZE_DEAL }, {
        jobId,
        priority: opts.priority ?? 5,
        ...(opts.delay !== undefined && { delay: opts.delay }),
    });
    return job.id ?? jobId;
}
export async function enqueueOrgRecalculation(payload, opts = {}) {
    if (!payload.organizationId)
        throw new Error("organizationId is required");
    const jobId = opts.jobId ?? `recalc_org:${payload.organizationId}`;
    const job = await brainQueue.add(JOB_TYPES.RECALCULATE_ORG, { ...payload, type: JOB_TYPES.RECALCULATE_ORG }, {
        jobId,
        priority: opts.priority ?? 8,
        attempts: 2,
        ...(opts.delay !== undefined && { delay: opts.delay }),
    });
    return job.id ?? jobId;
}
export async function enqueueUrgentAnalysis(payload, opts = {}) {
    const job = await brainPriorityQueue.add(payload.type, payload, {
        priority: opts.priority ?? 1,
        ...(opts.jobId !== undefined && { jobId: opts.jobId }),
    });
    return job.id ?? "";
}
export async function getQueueHealth() {
    return Promise.all([brainQueue, brainPriorityQueue].map(async (q) => {
        const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
            q.getWaitingCount(),
            q.getActiveCount(),
            q.getCompletedCount(),
            q.getFailedCount(),
            q.getDelayedCount(),
            q.isPaused(),
        ]);
        return { name: q.name, waiting, active, completed, failed, delayed, paused };
    }));
}
/* =====================================================
   ADMIN UTILITIES
===================================================== */
export async function pauseBrainQueue() {
    await brainQueue.pause();
    dbLogger.warn("[brainQueue] PAUSED");
}
export async function resumeBrainQueue() {
    await brainQueue.resume();
    dbLogger.info("[brainQueue] RESUMED");
}
export async function drainBrainQueue() {
    await brainQueue.drain();
    dbLogger.warn("[brainQueue] DRAINED");
}
export async function retryFailedJobs(limit = 100) {
    const failed = await brainQueue.getFailed(0, limit - 1);
    let retried = 0;
    for (const job of failed) {
        try {
            await job.retry();
            retried++;
        }
        catch (err) {
            dbLogger.error(`[brainQueue] Failed to retry job ${job.id}: ${err.message}`);
        }
    }
    dbLogger.info(`[brainQueue] Retried ${retried}/${failed.length} failed jobs`);
    return retried;
}
/* =====================================================
   GRACEFUL SHUTDOWN
===================================================== */
let _shutdownInProgress = false;
export async function closeBrainQueue() {
    if (_shutdownInProgress)
        return;
    _shutdownInProgress = true;
    dbLogger.info("[brainQueue] Closing connections...");
    try {
        await Promise.all([
            brainQueueEvents.close(),
            brainPriorityQueue.close(),
            brainQueue.close(),
        ]);
        dbLogger.info("[brainQueue] All connections closed");
    }
    catch (err) {
        dbLogger.error(`[brainQueue] Shutdown error: ${err.message}`);
    }
}
process.on("SIGTERM", () => closeBrainQueue().then(() => process.exit(0)));
process.on("SIGINT", () => closeBrainQueue().then(() => process.exit(0)));
//# sourceMappingURL=brain.queue.js.map