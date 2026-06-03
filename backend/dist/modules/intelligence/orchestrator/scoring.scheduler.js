// scoring.scheduler.ts
//
// BullMQ-based scheduler for periodic deal risk scoring.
//
// Two responsibilities:
//   1. A repeatable job that fires on a schedule (default: every 30 min)
//      and scores every organization that has open deals.
//   2. A Worker that consumes scoring jobs and runs scoringService.
//
// Also exposes enqueueOrgScoring() for on-demand, single-org scoring
// (e.g. triggered from the intelligence controller after a deal change).
//
// Mirrors the connection + lifecycle patterns in config/queue.ts.
import { Queue, Worker, QueueEvents, } from "bullmq";
import mongoose from "mongoose";
import Deal from "../../deals/deal.model.js";
import scoringService from "./scoring.service.js";
import { dbLogger } from "../../../utils/logger.js";
/* =====================================================
   REDIS CONNECTION
   Same parsing strategy as config/queue.ts — BullMQ needs
   maxRetriesPerRequest: null.
===================================================== */
function parseRedisUrl(url) {
    if (!url || url.length === 0) {
        return {
            host: process.env.REDIS_HOST ?? "127.0.0.1",
            port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
            ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
            maxRetriesPerRequest: null,
        };
    }
    try {
        const parsed = new URL(url);
        const config = {
            host: parsed.hostname,
            port: parseInt(parsed.port || "6379", 10),
            maxRetriesPerRequest: null,
        };
        if (parsed.username) {
            config.username = decodeURIComponent(parsed.username);
        }
        if (parsed.password) {
            config.password = decodeURIComponent(parsed.password);
        }
        if (parsed.protocol === "rediss:") {
            config.tls = {};
        }
        return config;
    }
    catch (err) {
        dbLogger.error("Scoring scheduler: invalid REDIS_URL, using localhost: " +
            (err?.message ?? "unknown"));
        return { host: "127.0.0.1", port: 6379, maxRetriesPerRequest: null };
    }
}
const connection = parseRedisUrl(process.env.REDIS_URL);
/* =====================================================
   CONFIG
===================================================== */
const SCHEDULER_CONFIG = {
    queueName: "scoring-queue",
    /* Job name for the recurring "score everyone" sweep */
    sweepJobName: "score-all-orgs",
    /* Job name for a targeted single-org scoring */
    orgJobName: "score-org",
    /* How often the sweep runs. Cron: every 30 minutes. Override via env. */
    sweepCron: process.env.SCORING_SWEEP_CRON ?? "*/30 * * * *",
    /* Worker concurrency — how many scoring jobs run at once */
    concurrency: parseInt(process.env.SCORING_CONCURRENCY ?? "2", 10),
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 200 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 1000 },
    },
};
/* =====================================================
   QUEUE
===================================================== */
export const scoringQueue = new Queue(SCHEDULER_CONFIG.queueName, {
    connection,
    defaultJobOptions: SCHEDULER_CONFIG.defaultJobOptions,
});
export const scoringQueueEvents = new QueueEvents(SCHEDULER_CONFIG.queueName, { connection });
/* =====================================================
   ENQUEUE HELPERS
===================================================== */
/**
 * Enqueue an on-demand scoring run for a single organization.
 * Call from the intelligence controller (e.g. POST /intelligence/score).
 */
export async function enqueueOrgScoring(organizationId) {
    if (!mongoose.Types.ObjectId.isValid(organizationId)) {
        throw new Error("enqueueOrgScoring: invalid organizationId");
    }
    const job = await scoringQueue.add(SCHEDULER_CONFIG.orgJobName, { kind: "org", organizationId }, {
        /* Dedup: collapse repeated requests for the same org within the
           retention window into one job. */
        jobId: "score-org:" + organizationId,
    });
    dbLogger.info("Scoring enqueued: org=" + organizationId + " jobId=" + (job.id ?? ""));
    return job.id ?? "";
}
/**
 * Register the repeatable sweep job. Idempotent — calling repeatedly
 * with the same repeat options won't create duplicates. Call once at
 * server boot.
 */
export async function registerScoringSweep() {
    await scoringQueue.add(SCHEDULER_CONFIG.sweepJobName, { kind: "sweep" }, {
        repeat: { pattern: SCHEDULER_CONFIG.sweepCron },
        /* Stable jobId so re-registration on each boot doesn't stack repeats */
        jobId: "scoring-sweep",
    });
    dbLogger.info("Scoring sweep registered: cron=" + SCHEDULER_CONFIG.sweepCron);
}
/* =====================================================
   WORKER
===================================================== */
/**
 * Find all organization IDs that currently have open, non-deleted deals.
 * The sweep scores each of these.
 */
async function findOrgsWithOpenDeals() {
    const orgIds = await Deal.distinct("organizationId", {
        isDeleted: false,
        status: "open",
    });
    return orgIds.map((id) => String(id));
}
async function processScoringJob(job) {
    const data = job.data;
    if (data.kind === "org") {
        const summary = await scoringService.scoreOrganization(data.organizationId);
        dbLogger.info("Scoring job done (org): org=" + data.organizationId +
            " scored=" + summary.scored + " failed=" + summary.failed);
        return;
    }
    /* Sweep: score every org with open deals */
    const orgIds = await findOrgsWithOpenDeals();
    dbLogger.info("Scoring sweep starting: orgs=" + orgIds.length);
    let totalScored = 0;
    let totalFailed = 0;
    for (const orgId of orgIds) {
        try {
            const summary = await scoringService.scoreOrganization(orgId);
            totalScored += summary.scored;
            totalFailed += summary.failed;
        }
        catch (err) {
            totalFailed++;
            dbLogger.error("Scoring sweep: org failed org=" + orgId +
                " err=" + (err?.message ?? "unknown"));
        }
    }
    dbLogger.info("Scoring sweep complete: orgs=" + orgIds.length +
        " totalScored=" + totalScored + " totalFailed=" + totalFailed);
}
export const scoringWorker = new Worker(SCHEDULER_CONFIG.queueName, processScoringJob, {
    connection,
    concurrency: SCHEDULER_CONFIG.concurrency,
});
/* =====================================================
   EVENT LISTENERS
===================================================== */
scoringWorker.on("completed", (job) => {
    dbLogger.info("Scoring job completed: jobId=" + (job.id ?? ""));
});
scoringWorker.on("failed", (job, err) => {
    dbLogger.error("Scoring job failed: jobId=" + (job?.id ?? "") +
        " err=" + (err?.message ?? "unknown"));
});
scoringWorker.on("error", (err) => {
    dbLogger.error("Scoring worker error: " + (err?.message ?? "unknown"));
});
scoringQueue.on("error", (err) => {
    dbLogger.error("Scoring queue error: " + (err?.message ?? "unknown"));
});
/* =====================================================
   GRACEFUL SHUTDOWN
===================================================== */
/**
 * Close scheduler resources. Call from SIGTERM/SIGINT handlers
 * alongside closeQueues() and disconnectRedis().
 */
export async function closeScoringScheduler() {
    dbLogger.info("Closing scoring scheduler...");
    try {
        await scoringWorker.close();
        await scoringQueueEvents.close();
        await scoringQueue.close();
        dbLogger.info("Scoring scheduler closed gracefully");
    }
    catch (err) {
        dbLogger.error("Error closing scoring scheduler: " +
            (err?.message ?? "unknown"));
        throw err;
    }
}
export default scoringQueue;
//# sourceMappingURL=scoring.scheduler.js.map