// config/index.ts
//
// Barrel re-export for the config subsystem. Importers should pull
// from this file rather than individual config modules:
//
//   import { env, redis, stripe } from "./config/index.js";
//
// instead of:
//
//   import { env }    from "./config/env.js";
//   import { redis }  from "./config/redis.js";
//   import stripe     from "./config/stripe.js";
//
// Why a barrel here when we generally avoid them? Config is special:
//   - 5+ files in one folder all consumed together at app boot
//   - Single import surface is cleaner than 5 lines
//   - The barrel is one-to-one — no logic added, no drift surface
//
// Anything beyond config (rbac, billing, middlewares) does NOT need a
// barrel — those modules have their own internal APIs.
// ============================================================
// ENV — must be imported first because it validates at load time
// ============================================================
export { env, default as envDefault, } from "./env.js";
// ============================================================
// DATABASE
// ============================================================
export { connectDB, disconnectDB, getDbHealth, isDbConnected, getDbState, registerShutdownHandlers, } from "./db.js";
// ============================================================
// REDIS
// ============================================================
export { redis, isRedisReady, getRedisStatus, getRedisHealth, disconnectRedis, safeGet, safeSet, safeDel, } from "./redis.js";
// ============================================================
// QUEUES (BullMQ)
// ============================================================
export { emailQueue, emailQueueEvents, enqueueEmail, enqueueWelcomeEmail, enqueuePasswordResetEmail, enqueueInviteEmail, enqueueAlertEmail, enqueueBillingReceiptEmail, enqueueBillingPastDueEmail, enqueueTrialExpiringEmail, getEmailQueueStats, pauseEmailQueue, resumeEmailQueue, drainEmailQueue, closeQueues, EMAIL_JOB_TYPES, } from "./queue.js";
// ============================================================
// QUEUE ADMIN UI (Bull Board)
// ============================================================
export { mountQueueUI, getQueueUIBasePath, isQueueUIEnabled, serverAdapter, } from "./queue.ui.js";
// ============================================================
// STRIPE
// ============================================================
export { default as stripe, STRIPE_CONFIG, isStripeEnabled, isStripeLive, isStripeTest, isStripeWebhookEnabled, buildIdempotencyKey, verifyWebhookSignature, translateStripeError, getStripeHealth, safeRetrieveCustomer, safeRetrieveSubscription, withStripeTimeout, } from "./stripe.js";
// ============================================================
// CONSOLIDATED HEALTH CHECK
// ============================================================
import { getDbHealth } from "./db.js";
import { getRedisHealth } from "./redis.js";
import { getStripeHealth } from "./stripe.js";
import { getEmailQueueStats } from "./queue.js";
/**
 * Aggregated health check across all infrastructure. Use in /ready
 * endpoint to determine whether the app can serve traffic.
 *
 * Status semantics:
 *   - "healthy"   : DB + Redis up; Stripe (if configured) reachable
 *   - "degraded"  : non-critical service down (Stripe unreachable, queue paused)
 *   - "unhealthy" : DB or Redis down — return 503 from /ready
 */
export async function getSystemHealth() {
    const [db, redis, stripe, queue] = await Promise.allSettled([
        getDbHealth(),
        getRedisHealth(),
        getStripeHealth(),
        getEmailQueueStats(),
    ]);
    const dbStatus = db.status === "fulfilled" ? db.value : null;
    const redisStatus = redis.status === "fulfilled" ? redis.value : null;
    const stripeStatus = stripe.status === "fulfilled" ? stripe.value : null;
    const queueStatus = queue.status === "fulfilled" ? queue.value : null;
    const services = {
        db: dbStatus ?? { connected: false, state: "uninitialized", stateCode: 99, attempts: 0 },
        redis: redisStatus ?? { ready: false, status: "uninitialized", attempts: 0, url: "unknown" },
    };
    if (stripeStatus)
        services.stripe = stripeStatus;
    if (queueStatus)
        services.queue = queueStatus;
    // Determine overall status
    let status = "healthy";
    if (!services.db.connected || !services.redis.ready) {
        status = "unhealthy";
    }
    else if ((services.stripe && services.stripe.configured && services.stripe.reachable === false) ||
        (services.queue && services.queue.paused)) {
        status = "degraded";
    }
    return {
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services,
    };
}
// ============================================================
// CONSOLIDATED SHUTDOWN
// ============================================================
import { disconnectDB } from "./db.js";
import { disconnectRedis } from "./redis.js";
import { closeQueues } from "./queue.js";
/**
 * Gracefully shut down all infrastructure connections. Call from
 * SIGTERM/SIGINT handlers. Order matters: queues → Redis → DB.
 *
 *   - Queues first: workers may need DB/Redis during their last jobs
 *   - Redis next: app code might briefly hit Redis during DB shutdown
 *   - DB last: gives any final logging/audit writes a chance to complete
 */
export async function shutdownInfrastructure() {
    const errors = [];
    try {
        await closeQueues();
    }
    catch (err) {
        errors.push(err);
    }
    try {
        await disconnectRedis();
    }
    catch (err) {
        errors.push(err);
    }
    try {
        await disconnectDB();
    }
    catch (err) {
        errors.push(err);
    }
    if (errors.length > 0) {
        throw new Error("Shutdown completed with errors: " +
            errors.map((e) => e.message).join("; "));
    }
}
//# sourceMappingURL=index.js.map