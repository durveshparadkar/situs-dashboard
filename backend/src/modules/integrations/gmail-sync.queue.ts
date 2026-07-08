// gmail-sync.queue.ts
//
// Queue + scheduler for the Gmail activity sync job. Unlike brain.queue.ts
// (which queues one job per lead, triggered on demand), this queues a
// single repeating job that syncs ALL connected Gmail mailboxes each run —
// same shape as intelligence.scheduler.ts's nightly job.

import { Queue } from "bullmq";
import { dbLogger } from "../../utils/logger.js";

/* =====================================================
   REDIS CONFIG — must match brain.worker.ts / brain.queue.ts
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

/* =====================================================
   QUEUE NAMES / JOB TYPES
===================================================== */

export const GMAIL_SYNC_QUEUE_NAME = "gmail-sync";

export const GMAIL_SYNC_JOB_TYPES = {
  SYNC_ALL: "SYNC_ALL",
} as const;

export interface GmailSyncJobPayload {
  type: (typeof GMAIL_SYNC_JOB_TYPES)[keyof typeof GMAIL_SYNC_JOB_TYPES];
}

/* =====================================================
   CONFIG
===================================================== */

const SYNC_CONFIG = {
  /** How often to sync all connected mailboxes, in minutes */
  intervalMinutes: Number(process.env.GMAIL_SYNC_INTERVAL_MINUTES) || 20,
} as const;

/* =====================================================
   QUEUE INSTANCE
===================================================== */

export const gmailSyncQueue = new Queue<GmailSyncJobPayload>(
  GMAIL_SYNC_QUEUE_NAME,
  { connection: REDIS_CONFIG }
);

/* =====================================================
   SCHEDULER
   Call once at server startup (same pattern as
   scheduleIntelligenceNightly() in app.ts).
===================================================== */

export async function scheduleGmailSync(): Promise<void> {
  // Remove any pre-existing repeatable job first so changing
  // SYNC_CONFIG.intervalMinutes and redeploying actually takes effect,
  // instead of leaving the old schedule running alongside a new one.
  const existing = await gmailSyncQueue.getRepeatableJobs();
  for (const job of existing) {
    await gmailSyncQueue.removeRepeatableByKey(job.key);
  }

  await gmailSyncQueue.add(
    GMAIL_SYNC_JOB_TYPES.SYNC_ALL,
    { type: GMAIL_SYNC_JOB_TYPES.SYNC_ALL },
    {
      repeat: {
        every: SYNC_CONFIG.intervalMinutes * 60 * 1000,
      },
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 20 },
    }
  );

  dbLogger.info(`Scheduled — runs every ${SYNC_CONFIG.intervalMinutes} minutes`);
}

/**
 * Trigger an immediate one-off sync (e.g. right after a user connects
 * Gmail for the first time, or a "Sync now" button), without waiting
 * for the next scheduled run.
 */
export async function triggerImmediateGmailSync(): Promise<void> {
  await gmailSyncQueue.add(GMAIL_SYNC_JOB_TYPES.SYNC_ALL, {
    type: GMAIL_SYNC_JOB_TYPES.SYNC_ALL,
  });
}