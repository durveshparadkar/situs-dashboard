// gmail-sync.worker.ts
//
// BullMQ worker for the scheduled Gmail activity sync. The queue owns
// scheduling; this file owns processing and worker lifecycle logging.
import { Worker, UnrecoverableError } from "bullmq";
import { GMAIL_SYNC_JOB_TYPES, GMAIL_SYNC_QUEUE_NAME, } from "./gmail-sync.queue.js";
import { syncAllGmailConnections } from "./gmail-sync.service.js";
import { dbLogger } from "../../utils/logger.js";
/* =====================================================
   REDIS CONFIG - must match gmail-sync.queue.ts
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
   CONFIG / TYPES
===================================================== */
const WORKER_CONFIG = {
    concurrency: Number(process.env.GMAIL_SYNC_WORKER_CONCURRENCY) || 1,
    jobTimeoutMs: 5 * 60_000,
};
/* =====================================================
   HELPERS
===================================================== */
async function withTimeout(promise, ms, errorMsg) {
    let timeoutHandle;
    const timeoutPromise = new Promise((_resolve, reject) => {
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
   PROCESSOR
===================================================== */
async function processSyncAll(job) {
    const startedAt = Date.now();
    const jobId = job.id ?? "unknown";
    dbLogger.info(`[gmailSyncWorker:${jobId}] Starting Gmail sync batch`);
    const result = await withTimeout(syncAllGmailConnections(), WORKER_CONFIG.jobTimeoutMs, "Gmail sync batch exceeded timeout");
    const durationMs = Date.now() - startedAt;
    dbLogger.info(`[gmailSyncWorker:${jobId}] Gmail sync batch complete: ` +
        `total=${result.totalMailboxes} succeeded=${result.succeeded} ` +
        `failed=${result.failed} durationMs=${durationMs}`);
    return {
        status: "success",
        ...result,
        durationMs,
    };
}
async function processJob(job) {
    const jobType = job.data?.type ?? job.name;
    switch (jobType) {
        case GMAIL_SYNC_JOB_TYPES.SYNC_ALL:
            return processSyncAll(job);
        default:
            dbLogger.warn(`[gmailSyncWorker:${job.id}] Unknown job type: ${jobType}`);
            throw new UnrecoverableError(`Unknown Gmail sync job type: ${jobType}`);
    }
}
/* =====================================================
   WORKER INSTANCE
===================================================== */
export const gmailSyncWorker = new Worker(GMAIL_SYNC_QUEUE_NAME, processJob, {
    connection: REDIS_CONFIG,
    concurrency: WORKER_CONFIG.concurrency,
    lockDuration: WORKER_CONFIG.jobTimeoutMs + 30_000,
    lockRenewTime: 15_000,
    settings: {
        backoffStrategy: (attemptsMade) => {
            const base = 5_000 * Math.pow(2, attemptsMade);
            const jitter = Math.floor(Math.random() * 1_000);
            return Math.min(base + jitter, 60_000);
        },
    },
});
dbLogger.info(`[gmailSyncWorker] Started: queue=${GMAIL_SYNC_QUEUE_NAME} ` +
    `concurrency=${WORKER_CONFIG.concurrency}`);
/* =====================================================
   EVENT HANDLERS
===================================================== */
gmailSyncWorker.on("completed", (job, result) => {
    if (result.status === "success") {
        dbLogger.info(`[gmailSyncWorker] Job ${job.id} completed: ` +
            `total=${result.totalMailboxes} succeeded=${result.succeeded} ` +
            `failed=${result.failed} durationMs=${result.durationMs}`);
        return;
    }
    dbLogger.info(`[gmailSyncWorker] Job ${job.id} skipped: reason=${result.reason}`);
});
gmailSyncWorker.on("failed", (job, err) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 1;
    const isFinal = attemptsMade >= maxAttempts;
    dbLogger.error(`[gmailSyncWorker] Job ${job?.id} failed ` +
        `(attempt ${attemptsMade}/${maxAttempts}): ${err.message}` +
        (isFinal ? " - final failure" : " - will retry"));
});
gmailSyncWorker.on("error", (err) => {
    dbLogger.error(`[gmailSyncWorker] Worker error: ${err.message}`);
});
gmailSyncWorker.on("stalled", (jobId) => {
    dbLogger.warn(`[gmailSyncWorker] Job stalled: ${jobId}`);
});
gmailSyncWorker.on("active", (job) => {
    if (process.env.NODE_ENV !== "production") {
        dbLogger.info(`[gmailSyncWorker] Job active: ${job.id}`);
    }
});
export async function getGmailSyncWorkerHealth() {
    return {
        isRunning: !gmailSyncWorker.closing,
        isPaused: await gmailSyncWorker.isPaused(),
        concurrency: WORKER_CONFIG.concurrency,
    };
}
export async function closeGmailSyncWorker() {
    await gmailSyncWorker.close();
    dbLogger.info("[gmailSyncWorker] Worker closed cleanly");
}
let shutdownInProgress = false;
async function shutdown(signal) {
    if (shutdownInProgress)
        return;
    shutdownInProgress = true;
    dbLogger.info(`[gmailSyncWorker] ${signal} received - closing worker`);
    try {
        await closeGmailSyncWorker();
    }
    catch (err) {
        dbLogger.error(`[gmailSyncWorker] Shutdown error: ${err.message}`);
    }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
//# sourceMappingURL=gmail-sync.worker.js.map