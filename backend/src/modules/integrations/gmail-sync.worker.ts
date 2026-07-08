// gmail-sync.worker.ts
import { Worker, Job } from "bullmq";
import { syncAllGmailConnections } from "./gmail-sync.service.js";
import {
  GMAIL_SYNC_QUEUE_NAME,
  GMAIL_SYNC_JOB_TYPES,
  type GmailSyncJobPayload,
} from "./gmail-sync.queue.js";
import { dbLogger } from "../../utils/logger.js";

/* =====================================================
   REDIS CONFIG — must match gmail-sync.queue.ts
===================================================== */

const REDIS_CONFIG = {
  host:                 process.env.REDIS_HOST     ?? "127.0.0.1",
  port:                 Number(process.env.REDIS_PORT) || 6379,
  password:             process.env.REDIS_PASSWORD ?? undefined,
  db:                   Number(process.env.REDIS_DB) || 0,
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
  ...(process.env.REDIS_TLS === "true" && {
    tls: { rejectUnauthorized: false },
  }),
} as const;

const CONFIG = {
  concurrency: 1, // only one sync batch should run at a time
  jobTimeoutMs: 10 * 60_000, // 10 minutes — syncing many mailboxes can take a while
} as const;

/* =====================================================
   PROCESSOR
===================================================== */

async function processJob(job: Job<GmailSyncJobPayload>) {
  const jobType = job.data?.type ?? job.name;

  if (jobType !== GMAIL_SYNC_JOB_TYPES.SYNC_ALL) {
    dbLogger.warn(`[gmailSyncWorker:${job.id}] Unknown job type: ${jobType}`);
    return null;
  }

  dbLogger.info(`[gmailSyncWorker:${job.id}] Starting Gmail sync batch`);

  const result = await syncAllGmailConnections();

  dbLogger.info(
    `[gmailSyncWorker:${job.id}] Gmail sync batch complete: total=${result.totalMailboxes} succeeded=${result.succeeded} failed=${result.failed}`
  );

  return result;
}

/* =====================================================
   WORKER INSTANCE
===================================================== */

export const gmailSyncWorker = new Worker<GmailSyncJobPayload>(
  GMAIL_SYNC_QUEUE_NAME,
  processJob,
  {
    connection: REDIS_CONFIG,
    concurrency: CONFIG.concurrency,
    lockDuration: CONFIG.jobTimeoutMs + 30_000,
  }
);

dbLogger.info(`[gmailSyncWorker] Started: queue=${GMAIL_SYNC_QUEUE_NAME}`);

/* =====================================================
   EVENT HANDLERS
===================================================== */

gmailSyncWorker.on("completed", (job) => {
  dbLogger.info(`[gmailSyncWorker] Job ${job.id} completed`);
});

gmailSyncWorker.on("failed", (job, err) => {
  dbLogger.error(`[gmailSyncWorker] Job ${job?.id} failed: ${err.message}`);
});

gmailSyncWorker.on("error", (err) => {
  dbLogger.error(`[gmailSyncWorker] Worker error: ${err.message}`);
});

/* =====================================================
   GRACEFUL SHUTDOWN
===================================================== */

let _shutdownInProgress = false;

async function shutdown(signal: string): Promise<void> {
  if (_shutdownInProgress) return;
  _shutdownInProgress = true;

  dbLogger.info(`[gmailSyncWorker] ${signal} received — shutting down`);

  try {
    await gmailSyncWorker.close();
    dbLogger.info("[gmailSyncWorker] Worker closed cleanly");
  } catch (err) {
    dbLogger.error(`[gmailSyncWorker] Shutdown error: ${(err as Error).message}`);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));