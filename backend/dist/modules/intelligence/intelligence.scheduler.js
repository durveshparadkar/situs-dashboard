// intelligence.scheduler.ts
//
// Scheduled background job that runs the intelligence orchestrator
// for every active organization nightly. Powered by BullMQ.
//
// Design:
//   - Single repeatable job (intelligence-nightly) runs once per day
//   - Worker fetches active orgs, processes each sequentially with
//     bounded concurrency (avoid hammering Mongo)
//   - Per-org timing logged for capacity planning
//   - Failed orgs don't stop the batch — log + continue
//   - Graceful shutdown via closeIntelligenceWorker()
//
// Schedule:
//   - Default: 02:30 IST every day (Asia/Kolkata)
//   - Override via INTELLIGENCE_CRON env var
//
// Why nightly and not realtime?
//   - Risk scores change on activity events (we'll add per-event
//     re-scoring later via an event bus)
//   - Forecast and leak views are full-portfolio computations —
//     not meaningful at sub-day granularity
//   - Cost: 5 engines × 10k deals × every-event = expensive
//   - Nightly + on-demand refresh covers 99% of UX needs
import { Queue, Worker, QueueEvents } from "bullmq";
import intelligenceService from "./intelligence.service.js";
import Organization from "../organizations/organization.model.js";
import { dbLogger, jobLogger } from "../../utils/logger.js";
const queueLogger = jobLogger;
const engineLogger = jobLogger;
// ============================================================
// CONFIG
// ============================================================
const SCHEDULER_CONFIG = {
    /**
     * Queue name. Stays stable across deploys so existing repeatables
     * survive code changes.
     */
    queueName: "intelligence-jobs",
    /**
     * Repeatable job ID. BullMQ uses this to deduplicate repeatables —
     * we always pass the same id on enqueue so we don't end up with
     * 14 copies of the same nightly job after 14 deploys.
     */
    nightlyJobId: "intelligence-nightly",
    /**
     * Cron pattern. Default: 02:30 IST every day.
     * Configurable via INTELLIGENCE_CRON.
     *
     * Why 02:30 IST? Lowest-traffic window for Indian market customers.
     * Most reps are asleep; scoring 100k deals doesn't compete with
     * user-facing requests.
     */
    cron: process.env.INTELLIGENCE_CRON ?? "30 2 * * *",
    timezone: process.env.INTELLIGENCE_TZ ?? "Asia/Kolkata",
    /**
     * Worker concurrency. How many orgs to process in parallel.
     * Each org runs 5 engines + bulk writes + alert inserts —
     * 3-5 parallel is the sweet spot before Mongo gets contention.
     */
    concurrency: parseInt(process.env.INTELLIGENCE_WORKER_CONCURRENCY ?? "3", 10),
    /**
     * Per-org timeout. If processing one org takes longer than this,
     * we log + skip rather than blocking the rest of the batch.
     */
    perOrgTimeoutMs: parseInt(process.env.INTELLIGENCE_ORG_TIMEOUT_MS ?? "120000", 10),
    /**
     * Retry policy for the parent batch job (the one that enumerates orgs).
     * Failures here usually mean DB / queue issues — retry with backoff.
     */
    jobAttempts: 3,
    jobBackoffMs: 60_000, // 1 minute
    /**
     * Retention for completed jobs — useful for debugging recent runs.
     */
    removeOnComplete: { count: 30 },
    removeOnFail: { count: 100 },
    /**
     * Whether to enable the scheduler at all. Disabled in test
     * environments so tests don't spawn background workers.
     */
    enabled: process.env.NODE_ENV !== "test"
        && process.env.INTELLIGENCE_SCHEDULER_ENABLED !== "false",
};
// ============================================================
// REDIS CONNECTION
// ============================================================
import { env } from "../../config/env.js";
/**
 * BullMQ connection config — same Redis as the email queue.
 * Reuses the URL parsing from your queue.ts patterns.
 */
if (!env.db.redisUrl) {
    throw new Error("REDIS_URL is not configured");
}
const connection = {
    url: env.db.redisUrl,
};
// ============================================================
// QUEUE
// ============================================================
let intelligenceQueue = null;
let intelligenceWorker = null;
let intelligenceQueueEvents = null;
/**
 * Lazily get or build the queue. Single instance per process.
 */
function getQueue() {
    if (!intelligenceQueue) {
        intelligenceQueue = new Queue(SCHEDULER_CONFIG.queueName, {
            connection,
            defaultJobOptions: {
                attempts: SCHEDULER_CONFIG.jobAttempts,
                backoff: { type: "exponential", delay: SCHEDULER_CONFIG.jobBackoffMs },
                removeOnComplete: SCHEDULER_CONFIG.removeOnComplete,
                removeOnFail: SCHEDULER_CONFIG.removeOnFail,
            },
        });
        queueLogger.info("Intelligence queue initialized: name=" + SCHEDULER_CONFIG.queueName);
    }
    return intelligenceQueue;
}
// ============================================================
// PROCESSOR
// ============================================================
/**
 * Load all organizations that should be scored. By default this means
 * active orgs only — disabled / suspended / deleted orgs are skipped.
 *
 * For very large customer bases, paginate this in the future.
 */
async function loadActiveOrganizations() {
    const OrgModel = Organization;
    const orgs = await OrgModel
        .find({
        isDeleted: { $ne: true },
        isActive: { $ne: false },
    })
        .select("_id")
        .lean();
    return orgs.map((o) => o._id);
}
/**
 * Run the orchestrator for one org with a hard timeout. Returns
 * success / failure without throwing — caller logs aggregate result.
 */
async function processOneOrg(orgId) {
    const startedAt = Date.now();
    // Wrap service call in a timeout so one slow org can't stall the batch
    const timeoutPromise = new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error("Per-org timeout exceeded")), SCHEDULER_CONFIG.perOrgTimeoutMs);
    });
    try {
        await Promise.race([
            intelligenceService.run({
                organizationId: orgId,
            }),
            timeoutPromise,
        ]);
        return { ok: true, durationMs: Date.now() - startedAt };
    }
    catch (err) {
        return {
            ok: false,
            error: err?.message ?? "unknown",
        };
    }
}
/**
 * Process the parent batch job: enumerate orgs, process each.
 * Concurrency bounded — we don't fan out 500 simultaneous orgs.
 */
async function processBatchJob(job) {
    const batchStart = Date.now();
    queueLogger.info("Intelligence batch starting: " +
        "trigger=" + (job.data.triggeredBy ?? "schedule") +
        " scheduledAt=" + job.data.scheduledAt);
    const orgIds = await loadActiveOrganizations();
    const errors = [];
    let orgsSucceeded = 0;
    let orgsFailed = 0;
    // Bounded concurrency: process orgs in parallel batches of N
    const concurrency = SCHEDULER_CONFIG.concurrency;
    for (let i = 0; i < orgIds.length; i += concurrency) {
        const batch = orgIds.slice(i, i + concurrency);
        const results = await Promise.all(batch.map(async (orgId) => {
            const result = await processOneOrg(orgId);
            return { orgId, result };
        }));
        for (const { orgId, result } of results) {
            if (result.ok) {
                orgsSucceeded += 1;
                engineLogger.debug("Intelligence run ok: org=" + String(orgId) +
                    " durationMs=" + result.durationMs);
            }
            else {
                orgsFailed += 1;
                errors.push({ orgId: String(orgId), message: result.error });
                engineLogger.warn("Intelligence run failed: org=" + String(orgId) +
                    " error=" + result.error);
            }
        }
        // Update job progress for the dashboard
        const progress = Math.round(((i + batch.length) / Math.max(orgIds.length, 1)) * 100);
        await job.updateProgress(progress);
    }
    const totalDurationMs = Date.now() - batchStart;
    queueLogger.info("Intelligence batch complete: " +
        "orgs=" + orgIds.length +
        " succeeded=" + orgsSucceeded +
        " failed=" + orgsFailed +
        " durationMs=" + totalDurationMs);
    return {
        orgsProcessed: orgIds.length,
        orgsSucceeded,
        orgsFailed,
        totalDurationMs,
        errors,
    };
}
// ============================================================
// WORKER
// ============================================================
/**
 * Start the worker. Idempotent — calling twice returns the same worker.
 */
export function startIntelligenceWorker() {
    if (!SCHEDULER_CONFIG.enabled) {
        queueLogger.info("Intelligence scheduler disabled (test or env-disabled)");
        return null;
    }
    if (intelligenceWorker)
        return intelligenceWorker;
    intelligenceWorker = new Worker(SCHEDULER_CONFIG.queueName, processBatchJob, {
        connection,
        concurrency: 1, // we control internal concurrency in the processor itself
    });
    intelligenceWorker.on("completed", (job, result) => {
        queueLogger.info("Intelligence batch completed: jobId=" + job.id +
            " orgs=" + result.orgsProcessed +
            " durationMs=" + result.totalDurationMs);
    });
    intelligenceWorker.on("failed", (job, err) => {
        dbLogger.error("Intelligence batch failed: jobId=" + (job?.id ?? "unknown") +
            " error=" + (err?.message ?? "unknown"));
    });
    intelligenceWorker.on("error", (err) => {
        dbLogger.error("Intelligence worker error: " + (err?.message ?? "unknown"));
    });
    // Optional: queue events for end-to-end visibility
    intelligenceQueueEvents = new QueueEvents(SCHEDULER_CONFIG.queueName, { connection });
    intelligenceQueueEvents.on("stalled", ({ jobId }) => {
        queueLogger.warn("Intelligence job stalled: jobId=" + jobId);
    });
    queueLogger.info("Intelligence worker started: " +
        "queue=" + SCHEDULER_CONFIG.queueName +
        " concurrency=" + SCHEDULER_CONFIG.concurrency);
    return intelligenceWorker;
}
// ============================================================
// SCHEDULING
// ============================================================
/**
 * Register the nightly repeatable job. Idempotent — BullMQ's
 * repeatable job ID dedups across calls so deploys don't duplicate.
 */
export async function scheduleIntelligenceNightly() {
    if (!SCHEDULER_CONFIG.enabled)
        return;
    const queue = getQueue();
    await queue.add("intelligence-batch", {
        triggeredBy: "schedule",
        scheduledAt: new Date().toISOString(),
    }, {
        repeat: {
            pattern: SCHEDULER_CONFIG.cron,
            tz: SCHEDULER_CONFIG.timezone,
        },
        jobId: SCHEDULER_CONFIG.nightlyJobId, // dedup key
    });
    queueLogger.info("Intelligence nightly scheduled: " +
        "cron=" + SCHEDULER_CONFIG.cron +
        " tz=" + SCHEDULER_CONFIG.timezone);
}
/**
 * Manual trigger — useful for ops endpoints and admin tools.
 * Returns the job ID for tracking.
 */
export async function triggerIntelligenceNow(actorId) {
    const queue = getQueue();
    const job = await queue.add("intelligence-batch-manual", {
        triggeredBy: "manual",
        scheduledAt: new Date().toISOString(),
    }, {
        // Manual runs don't repeat
        removeOnComplete: { count: 50 },
    });
    queueLogger.info("Intelligence batch triggered manually: " +
        "jobId=" + (job.id ?? "unknown") +
        " actor=" + (actorId ?? "system"));
    return job.id ?? "unknown";
}
// ============================================================
// SHUTDOWN
// ============================================================
/**
 * Gracefully shut down worker and queue. Call from SIGTERM handler.
 */
export async function closeIntelligenceWorker() {
    if (intelligenceWorker) {
        await intelligenceWorker.close();
        intelligenceWorker = null;
    }
    if (intelligenceQueueEvents) {
        await intelligenceQueueEvents.close();
        intelligenceQueueEvents = null;
    }
    if (intelligenceQueue) {
        await intelligenceQueue.close();
        intelligenceQueue = null;
    }
    queueLogger.info("Intelligence worker shut down");
}
// ============================================================
// EXPORTS
// ============================================================
export { SCHEDULER_CONFIG as INTELLIGENCE_SCHEDULER_CONFIG, getQueue as getIntelligenceQueue, };
//# sourceMappingURL=intelligence.scheduler.js.map