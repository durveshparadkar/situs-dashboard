// redis.ts
//
// Redis client for ioredis. Single shared connection used by:
//   - Cache middleware (cache.middleware.ts)
//   - Rate limiters (when Redis-backed mode is enabled)
//   - Session store
//   - Brute-force counter
//   - Any other ad-hoc caching / pub-sub
//
// IMPORTANT: BullMQ has its OWN connection in queue.ts. Don't share
// this client with BullMQ — BullMQ requires maxRetriesPerRequest=null
// and enableReadyCheck=false which conflict with general-purpose use.
//
// Design:
//   - URL parsing with TLS support (rediss:// for managed providers)
//   - Lazy connection (doesn't block app boot if Redis is briefly down)
//   - Exponential backoff retry with cap
//   - Comprehensive event listeners for observability
//   - Health check helper for /health and /ready endpoints
//   - Graceful shutdown via quit()
//   - Connection state introspection
//
// Usage:
//   import { redis, isRedisReady, getRedisHealth } from "./config/redis.js";
//
//   await redis.set("key", "value", "EX", 60);
//   const cached = await redis.get("key");
import { Redis } from "ioredis";
import { dbLogger } from "../utils/logger.js";
// ============================================================
// CONFIG
// ============================================================
const REDIS_CONFIG = {
    /**
     * Redis URL. Supports redis:// and rediss:// (TLS).
     * Falls back to localhost for dev.
     */
    url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
    /**
     * How many retries before a SINGLE command gives up. Different from
     * connection retries (below). 3 is a balance: enough to survive
     * transient blips, few enough to fail fast on real outages.
     *
     * Note: BullMQ requires this to be null — don't share this client
     * with BullMQ. Use queue.ts for BullMQ.
     */
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES ?? "3", 10),
    /**
     * Connection retry cap. After this many failed reconnection attempts,
     * the client gives up. Production typically wants higher (10+) so
     * transient outages recover. Dev wants lower (3) so you notice config issues.
     */
    maxConnectionRetries: parseInt(process.env.REDIS_MAX_CONNECTION_RETRIES ??
        (process.env.NODE_ENV === "production" ? "20" : "5"), 10),
    /**
     * Initial retry delay (ms). Backoff doubles each attempt, capped
     * at maxRetryDelayMs.
     */
    initialRetryDelayMs: parseInt(process.env.REDIS_INITIAL_RETRY_MS ?? "1000", 10),
    maxRetryDelayMs: parseInt(process.env.REDIS_MAX_RETRY_MS ?? "30000", 10),
    /**
     * Connection timeout — initial TCP connect deadline.
     */
    connectTimeoutMs: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS ?? "10000", 10),
    /**
     * Command timeout — single command deadline. Defaults to 0 (no timeout)
     * which can hang forever on stuck connections. 5s is sane.
     */
    commandTimeoutMs: parseInt(process.env.REDIS_COMMAND_TIMEOUT_MS ?? "5000", 10),
    /**
     * Lazy connect — wait until first command before establishing connection.
     * Lets the app boot even if Redis is briefly unavailable.
     */
    lazyConnect: process.env.REDIS_LAZY_CONNECT === "true",
    /**
     * Key prefix for all commands. Useful when multiple apps share a Redis instance.
     */
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? "",
    /**
     * Connection name shown in CLIENT LIST — helpful when debugging
     * multiple connected clients on a shared Redis.
     */
    connectionName: process.env.REDIS_CONNECTION_NAME ?? "situs-app",
    /**
     * Whether to enable Redis command tracing. Set REDIS_DEBUG=true for
     * verbose logging of every command. Very noisy — dev only.
     */
    enableDebug: process.env.REDIS_DEBUG === "true",
};
// ============================================================
// HELPERS
// ============================================================
/**
 * Sanitize URL for logging — strips password.
 */
function sanitizeUrl(url) {
    try {
        return url.replace(/(rediss?:\/\/[^:]+):[^@]+@/, "$1:**@");
    }
    catch {
        return "[unparseable-url]";
    }
}
/**
 * Calculate exponential backoff delay with jitter.
 * Returns null to stop retries entirely.
 */
function getRetryDelay(times) {
    if (times > REDIS_CONFIG.maxConnectionRetries) {
        dbLogger.error("Redis exceeded max connection retries (" +
            REDIS_CONFIG.maxConnectionRetries +
            ") — giving up. Set REDIS_MAX_CONNECTION_RETRIES higher if needed.");
        return null;
    }
    const base = REDIS_CONFIG.initialRetryDelayMs * Math.pow(2, times - 1);
    const capped = Math.min(base, REDIS_CONFIG.maxRetryDelayMs);
    // Jitter (±25%) prevents thundering herd if multiple clients reconnect together
    const jitter = capped * 0.25 * (Math.random() * 2 - 1);
    return Math.max(100, Math.round(capped + jitter));
}
/**
 * Parse Redis URL to detect TLS requirement.
 */
function detectTls(url) {
    try {
        return new URL(url).protocol === "rediss:";
    }
    catch {
        return false;
    }
}
// ============================================================
// CONNECTION STATE
// ============================================================
let lastError = null;
let connectionAttempts = 0;
let isReady = false;
// ============================================================
// REDIS OPTIONS
// ============================================================
const redisOptions = {
    maxRetriesPerRequest: REDIS_CONFIG.maxRetriesPerRequest,
    connectTimeout: REDIS_CONFIG.connectTimeoutMs,
    commandTimeout: REDIS_CONFIG.commandTimeoutMs,
    lazyConnect: REDIS_CONFIG.lazyConnect,
    connectionName: REDIS_CONFIG.connectionName,
    retryStrategy: getRetryDelay,
    enableOfflineQueue: true,
    // Reconnect on READONLY errors (Redis Sentinel/Cluster failover)
    reconnectOnError(err) {
        const msg = err.message ?? "";
        if (msg.includes("READONLY")) {
            dbLogger.warn("Redis READONLY error — reconnecting (likely failover)");
            return true;
        }
        return false;
    },
};
if (REDIS_CONFIG.keyPrefix) {
    redisOptions.keyPrefix = REDIS_CONFIG.keyPrefix;
}
// Enable TLS for rediss:// URLs (most managed providers require this)
if (detectTls(REDIS_CONFIG.url)) {
    redisOptions.tls = {};
}
// ============================================================
// CLIENT INSTANCE
// ============================================================
dbLogger.info("Redis initializing: url=" + sanitizeUrl(REDIS_CONFIG.url) +
    " lazy=" + REDIS_CONFIG.lazyConnect +
    " tls=" + Boolean(redisOptions.tls));
export const redis = new Redis(REDIS_CONFIG.url, redisOptions);
// Set monitoring/debug mode if requested
if (REDIS_CONFIG.enableDebug) {
    redis.monitor((err, monitor) => {
        if (err) {
            dbLogger.error("Redis monitor failed: " + err.message);
            return;
        }
        monitor?.on("monitor", (time, args) => {
            dbLogger.info("Redis command: " + args.join(" "));
        });
    });
    dbLogger.warn("Redis debug mode ENABLED — verbose command logging");
}
// ============================================================
// EVENT LISTENERS
// ============================================================
redis.on("connect", () => {
    connectionAttempts++;
    dbLogger.info("Redis connect event: attempt=" + connectionAttempts);
});
redis.on("ready", () => {
    isReady = true;
    lastError = null;
    dbLogger.info("Redis ready — commands can now execute");
});
redis.on("error", (err) => {
    lastError = err;
    isReady = false;
    dbLogger.error("Redis error: " + (err?.message ?? "unknown"));
});
redis.on("close", () => {
    isReady = false;
    dbLogger.warn("Redis connection closed");
});
redis.on("reconnecting", (delay) => {
    dbLogger.info("Redis reconnecting in " + delay + "ms");
});
redis.on("end", () => {
    isReady = false;
    dbLogger.warn("Redis connection ended");
});
// ============================================================
// PUBLIC API
// ============================================================
/**
 * Whether the Redis client is ready to accept commands.
 * Different from connected — ready means handshake complete.
 */
export function isRedisReady() {
    return isReady && redis.status === "ready";
}
/**
 * Get current Redis connection status as a string.
 */
export function getRedisStatus() {
    return redis.status;
}
/**
 * Check Redis health with active ping. Use in /health and /ready endpoints.
 */
export async function getRedisHealth() {
    const status = {
        ready: isRedisReady(),
        status: redis.status,
        attempts: connectionAttempts,
        url: sanitizeUrl(REDIS_CONFIG.url),
    };
    if (lastError) {
        status.lastError = lastError.message;
    }
    // Active ping if ready
    if (status.ready) {
        try {
            const start = Date.now();
            await redis.ping();
            status.pingMs = Date.now() - start;
        }
        catch (err) {
            status.ready = false;
            status.lastError = "Ping failed: " + (err?.message ?? "unknown");
        }
    }
    return status;
}
/**
 * Graceful shutdown — disconnects from Redis cleanly. Call from
 * SIGTERM/SIGINT handlers alongside DB and queue shutdown.
 */
export async function disconnectRedis() {
    if (redis.status === "end") {
        dbLogger.info("Redis already disconnected");
        return;
    }
    try {
        dbLogger.info("Redis disconnecting...");
        // quit() waits for pending commands; disconnect() is forceful
        await redis.quit();
        dbLogger.info("Redis disconnected gracefully");
    }
    catch (err) {
        dbLogger.error("Redis disconnect error, forcing close: " +
            (err?.message ?? "unknown"));
        redis.disconnect();
    }
}
// ============================================================
// SAFE-OPS HELPERS — fail-open wrappers
// ============================================================
/**
 * Safe get — returns null on any failure (timeout, connection issue).
 * Use for non-critical reads where you'd rather miss the cache than
 * fail the request.
 */
export async function safeGet(key) {
    if (!isRedisReady())
        return null;
    try {
        return await redis.get(key);
    }
    catch (err) {
        dbLogger.warn("Redis safeGet failed: key=" + key +
            " err=" + (err?.message ?? "unknown"));
        return null;
    }
}
/**
 * Safe set — swallows errors. Use for non-critical writes where
 * losing the cache entry is acceptable.
 */
export async function safeSet(key, value, ttlSec) {
    if (!isRedisReady())
        return false;
    try {
        if (typeof ttlSec === "number" && ttlSec > 0) {
            await redis.set(key, value, "EX", ttlSec);
        }
        else {
            await redis.set(key, value);
        }
        return true;
    }
    catch (err) {
        dbLogger.warn("Redis safeSet failed: key=" + key +
            " err=" + (err?.message ?? "unknown"));
        return false;
    }
}
/**
 * Safe delete — swallows errors. Returns number of keys deleted.
 */
export async function safeDel(...keys) {
    if (!isRedisReady() || keys.length === 0)
        return 0;
    try {
        return await redis.del(...keys);
    }
    catch (err) {
        dbLogger.warn("Redis safeDel failed: keys=" + keys.length +
            " err=" + (err?.message ?? "unknown"));
        return 0;
    }
}
// ============================================================
// EXPORTS
// ============================================================
export default redis;
//# sourceMappingURL=redis.js.map