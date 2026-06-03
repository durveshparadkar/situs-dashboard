// queue.ts
//
// BullMQ queue definitions. Centralizes Redis connection config and
// exports typed queues for async job processing.
//
// Queues defined here:
//   - emailQueue: outbound transactional emails (welcome, password reset,
//                  invites, alerts, billing notifications)
//
// Design:
//   - Single Redis connection config shared across queues
//   - Typed job payloads catch malformed enqueues at compile time
//   - Default retry policy: 3 attempts with exponential backoff
//   - Bounded job retention (don't bloat Redis with old completed jobs)
//   - Graceful shutdown helper
//   - QueueEvents instances for observability
//
// Usage:
//   import { emailQueue, enqueueEmail, closeQueues } from "./config/queue.js";
//
//   await enqueueEmail({
//     to:       "user@example.com",
//     subject:  "Welcome",
//     template: "welcome",
//     data:     { name: "Durvesh" },
//   });
//
//   // On shutdown:
//   await closeQueues();

import { Queue, QueueEvents, type JobsOptions, type ConnectionOptions } from "bullmq";

import { dbLogger } from "../utils/logger.js";

// ============================================================
// REDIS CONNECTION
// ============================================================

/**
* Parse Redis URL into BullMQ connection config. BullMQ wants
* an object, but most platforms (Upstash, Railway, Render, Heroku)
* provide a URL string.
*/
function parseRedisUrl(url: string | undefined): ConnectionOptions {
 // Fallback to localhost for dev when REDIS_URL isn't set
 if (!url || url.length === 0) {
   return {
     host: process.env.REDIS_HOST ?? "127.0.0.1",
     port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
     ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
     maxRetriesPerRequest: null, // BullMQ requirement
   };
 }

 try {
   const parsed = new URL(url);
   const config: ConnectionOptions = {
     host: parsed.hostname,
     port: parseInt(parsed.port || "6379", 10),
     maxRetriesPerRequest: null, // BullMQ requirement — null = no retries on commands
   };

   if (parsed.username) {
     (config as { username?: string }).username = decodeURIComponent(parsed.username);
   }
   if (parsed.password) {
     (config as { password?: string }).password = decodeURIComponent(parsed.password);
   }
   if (parsed.protocol === "rediss:") {
     (config as { tls?: object }).tls = {}; // enable TLS for rediss:// URLs
   }

   return config;
 } catch (err) {
   dbLogger.error(
     "Invalid REDIS_URL, falling back to localhost: " +
     ((err as Error)?.message ?? "unknown")
   );
   return {
     host: "127.0.0.1",
     port: 6379,
     maxRetriesPerRequest: null,
   };
 }
}

const connection: ConnectionOptions = parseRedisUrl(process.env.REDIS_URL);

// ============================================================
// CONFIG CONSTANTS
// ============================================================

const QUEUE_CONFIG = {
 /**
  * Default job options applied to every enqueue unless overridden.
  *
  *   - attempts: 3 — first try + 2 retries
  *   - backoff: exponential, starting 5s (5s → 10s → 20s)
  *   - removeOnComplete: keep last 1000 success jobs (for debugging)
  *   - removeOnFail:     keep last 5000 failed jobs (for forensics)
  */
 defaultJobOptions: {
   attempts: 3,
   backoff: {
     type:  "exponential",
     delay: 5000,
   },
   removeOnComplete: {
     age:   24 * 60 * 60, // 24 hours
     count: 1000,
   },
   removeOnFail: {
     age:   7 * 24 * 60 * 60, // 7 days
     count: 5000,
   },
 } satisfies JobsOptions,

 /**
  * Connection retry behavior for the Redis client itself.
  */
 enableOfflineQueue: true,
} as const;

// ============================================================
// TYPED EMAIL JOB
// ============================================================

/**
* Supported email types. Workers branch on this to choose the right
* template and rendering logic.
*/
export const EMAIL_JOB_TYPES = {
 WELCOME:               "welcome",
 PASSWORD_RESET:        "password-reset",
 INVITE:                "invite",
 ALERT:                 "alert",
 BILLING_RECEIPT:       "billing-receipt",
 BILLING_PAST_DUE:      "billing-past-due",
 TRIAL_EXPIRING:        "trial-expiring",
 WEEKLY_DIGEST:         "weekly-digest",
 GENERIC:               "generic",
} as const;

export type EmailJobType = (typeof EMAIL_JOB_TYPES)[keyof typeof EMAIL_JOB_TYPES];

/**
* Email job payload. Workers receive this shape and act on it.
* Strict types prevent enqueuing malformed jobs that would fail
* at the worker (which would consume a retry attempt before failing).
*/
export interface EmailJobPayload {
 /** Recipient email address(es) */
 to: string | string[];

 /** Optional CC recipients */
 cc?: string | string[];

 /** Optional BCC recipients */
 bcc?: string | string[];

 /** Optional reply-to */
 replyTo?: string;

 /** Email subject line */
 subject: string;

 /** Template identifier — worker maps this to actual template */
 template: EmailJobType;

 /** Template variables for rendering */
 data?: Record<string, unknown>;

 /** Organization ID for multi-tenant context (logging, branding) */
 organizationId?: string;

 /** User ID of the recipient (for audit + analytics) */
 recipientUserId?: string;

 /** Optional pre-rendered HTML (bypasses template if provided) */
 html?: string;

 /** Optional pre-rendered text (fallback for HTML-unfriendly clients) */
 text?: string;

 /** Optional attachments — keep small; large files belong in object storage */
 attachments?: Array<{
   filename:    string;
   content?:    string;   // base64
   path?:       string;   // file path or URL
   contentType?: string;
 }>;

 /** Metadata for observability and idempotency */
 meta?: {
   /** Deduplication key — prevents the same email being sent twice */
   dedupKey?: string;
   /** Source feature/module that enqueued this email */
   source?:   string;
   /** Request ID for log correlation */
   requestId?: string;
 };
}

/**
* Options accepted by enqueueEmail beyond BullMQ's standard JobsOptions.
* Mostly for ergonomics — common overrides exposed at the top level.
*/
export interface EnqueueEmailOptions extends JobsOptions {
 /** Override default priority (lower number = higher priority) */
 priority?: number;
 /** Delay job by N milliseconds */
 delay?: number;
 /** Idempotency key — BullMQ will reject duplicates with the same key */
 jobId?: string;
}

// ============================================================
// QUEUES
// ============================================================

/**
* Email queue — all transactional email sends flow through here.
* Workers in email.worker.ts consume from this queue.
*/
export const emailQueue = new Queue<EmailJobPayload>(
 "email-queue",
 {
   connection,
   defaultJobOptions: QUEUE_CONFIG.defaultJobOptions,
 }
);

/**
* QueueEvents instance for observability. Lets you subscribe to job
* lifecycle events (completed, failed, stalled) without being a worker.
* Useful for metrics, alerts, and dashboards.
*/
export const emailQueueEvents = new QueueEvents("email-queue", {
 connection,
});

// ============================================================
// EVENT LISTENERS
// ============================================================

emailQueueEvents.on("completed", ({ jobId }) => {
 dbLogger.info("Email job completed: jobId=" + jobId);
});

emailQueueEvents.on("failed", ({ jobId, failedReason }) => {
 dbLogger.error(
   "Email job failed: jobId=" + jobId +
   " reason=" + (failedReason ?? "unknown")
 );
});

emailQueueEvents.on("stalled", ({ jobId }) => {
 dbLogger.warn("Email job stalled: jobId=" + jobId);
});

emailQueueEvents.on("error", (err) => {
 dbLogger.error(
   "Email queue event error: " +
   ((err as Error)?.message ?? "unknown")
 );
});

emailQueue.on("error", (err) => {
 dbLogger.error(
   "Email queue error: " +
   ((err as Error)?.message ?? "unknown")
 );
});

// ============================================================
// PUBLIC API — enqueue helpers
// ============================================================

/**
* Enqueue an email for async processing. Returns the BullMQ job.
*
* Validates payload basics before enqueuing — bad recipients or
* missing subject reject IMMEDIATELY rather than consuming a retry.
*/
export async function enqueueEmail(
 payload: EmailJobPayload,
 options: EnqueueEmailOptions = {}
): Promise<string> {
 // Basic validation — reject malformed payloads before they hit Redis
 if (!payload.to || (Array.isArray(payload.to) && payload.to.length === 0)) {
   throw new Error("Email payload requires to recipient(s)");
 }
 if (!payload.subject || payload.subject.trim().length === 0) {
   throw new Error("Email payload requires subject");
 }
 if (!payload.template) {
   throw new Error("Email payload requires template");
 }

 // Use dedupKey as jobId if provided (BullMQ rejects duplicate jobIds)
 const jobOptions: JobsOptions = { ...options };
 if (payload.meta?.dedupKey && !jobOptions.jobId) {
   jobOptions.jobId = "email:" + payload.meta.dedupKey;
 }

 const job = await emailQueue.add(
   payload.template,
   payload,
   jobOptions
 );

 dbLogger.info(
   "Email enqueued: jobId=" + job.id +
   " template=" + payload.template +
   " to=" + (Array.isArray(payload.to) ? payload.to.length + " recipients" : payload.to) +
   (payload.meta?.requestId ? " requestId=" + payload.meta.requestId : "")
 );

 return job.id ?? "";
}

// ============================================================
// CONVENIENCE WRAPPERS — common email types
// ============================================================

/**
* Enqueue welcome email for newly registered users.
*/
export function enqueueWelcomeEmail(
 to:   string,
 data: { name: string; organizationName?: string; loginUrl?: string },
 options?: EnqueueEmailOptions
): Promise<string> {
 return enqueueEmail(
   {
     to,
     subject:  "Welcome to Situs",
     template: EMAIL_JOB_TYPES.WELCOME,
     data,
   },
   options
 );
}

/**
* Enqueue password reset email. Idempotent via dedupKey to prevent
* spam from repeated "forgot password" clicks.
*/
export function enqueuePasswordResetEmail(
 to:    string,
 data:  { name: string; resetUrl: string; expiresIn: string },
 meta?: { dedupKey?: string; requestId?: string }
): Promise<string> {
 return enqueueEmail({
   to,
   subject:  "Reset your Situs password",
   template: EMAIL_JOB_TYPES.PASSWORD_RESET,
   data,
   ...(meta && { meta }),
 });
}

/**
* Enqueue team invite email.
*/
export function enqueueInviteEmail(
 to:   string,
 data: { inviterName: string; organizationName: string; inviteUrl: string },
 options?: EnqueueEmailOptions
): Promise<string> {
 return enqueueEmail(
   {
     to,
     subject:  data.inviterName + " invited you to join " + data.organizationName + " on Situs",
     template: EMAIL_JOB_TYPES.INVITE,
     data,
   },
   options
 );
}

/**
* Enqueue alert email for critical alerts. Used by alert engine
* when severity = critical and user has email notifications enabled.
*/
export function enqueueAlertEmail(
 to:   string,
 data: { alertTitle: string; alertMessage: string; alertUrl: string; severity: string },
 options?: EnqueueEmailOptions
): Promise<string> {
 return enqueueEmail(
   {
     to,
     subject:  "[" + data.severity.toUpperCase() + "] " + data.alertTitle,
     template: EMAIL_JOB_TYPES.ALERT,
     data,
   },
   {
     priority: 1, // alerts jump the queue
     ...options,
   }
 );
}

/**
* Enqueue billing receipt email.
*/
export function enqueueBillingReceiptEmail(
 to:   string,
 data: { amount: string; invoiceUrl: string; planName: string },
 options?: EnqueueEmailOptions
): Promise<string> {
 return enqueueEmail(
   {
     to,
     subject:  "Your Situs receipt",
     template: EMAIL_JOB_TYPES.BILLING_RECEIPT,
     data,
   },
   options
 );
}

/**
* Enqueue billing past-due notification.
*/
export function enqueueBillingPastDueEmail(
 to:   string,
 data: { name: string; amount: string; updatePaymentUrl: string },
 options?: EnqueueEmailOptions
): Promise<string> {
 return enqueueEmail(
   {
     to,
     subject:  "Payment failed — action required",
     template: EMAIL_JOB_TYPES.BILLING_PAST_DUE,
     data,
   },
   {
     priority: 2,
     ...options,
   }
 );
}

/**
* Enqueue trial-expiring reminder.
*/
export function enqueueTrialExpiringEmail(
 to:   string,
 data: { name: string; daysRemaining: number; upgradeUrl: string },
 options?: EnqueueEmailOptions
): Promise<string> {
 return enqueueEmail(
   {
     to,
     subject:  "Your Situs trial expires in " + data.daysRemaining + " days",
     template: EMAIL_JOB_TYPES.TRIAL_EXPIRING,
     data,
   },
   options
 );
}

// ============================================================
// QUEUE INTROSPECTION
// ============================================================

/**
* Get queue statistics. Useful for monitoring dashboards and
* admin endpoints.
*/
export async function getEmailQueueStats(): Promise<{
 waiting:    number;
 active:     number;
 completed:  number;
 failed:     number;
 delayed:    number;
 paused:     boolean;
}> {
 const [waiting, active, completed, failed, delayed, isPaused] =
   await Promise.all([
     emailQueue.getWaitingCount(),
     emailQueue.getActiveCount(),
     emailQueue.getCompletedCount(),
     emailQueue.getFailedCount(),
     emailQueue.getDelayedCount(),
     emailQueue.isPaused(),
   ]);

 return {
   waiting,
   active,
   completed,
   failed,
   delayed,
   paused: isPaused,
 };
}

/**
* Pause email processing (workers will finish in-flight jobs but stop
* picking up new ones). Use during maintenance windows or incidents.
*/
export async function pauseEmailQueue(): Promise<void> {
 await emailQueue.pause();
 dbLogger.warn("Email queue paused");
}

/**
* Resume email processing.
*/
export async function resumeEmailQueue(): Promise<void> {
 await emailQueue.resume();
 dbLogger.info("Email queue resumed");
}

/**
* Drain the queue — wait for all pending jobs to complete.
* Use during graceful shutdown.
*/
export async function drainEmailQueue(): Promise<void> {
 await emailQueue.drain();
 dbLogger.info("Email queue drained");
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

/**
* Close all queue resources. Call from SIGTERM/SIGINT handlers.
* Stops accepting new jobs and closes the Redis connection cleanly.
*/
export async function closeQueues(): Promise<void> {
 dbLogger.info("Closing queues...");

 try {
   await emailQueueEvents.close();
   await emailQueue.close();
   dbLogger.info("Queues closed gracefully");
 } catch (err) {
   dbLogger.error(
     "Error closing queues: " +
     ((err as Error)?.message ?? "unknown")
   );
   throw err;
 }
}

// ============================================================
// EXPORTS
// ============================================================

export default emailQueue;