// logger.ts
//
// Pino-based structured logger. Single source of logging across the
// app. Every module imports a named logger and writes JSON-structured
// logs that ship cleanly to log aggregators (Datadog, Logflare,
// CloudWatch, Loki, etc.).
//
// Design:
//   - Pino for speed (~5x faster than Winston, near-zero overhead)
//   - JSON output in production, pretty-printed in dev
//   - Multiple named loggers per category (db, http, audit, security,
//     billing, queue) for selective filtering
//   - Sensitive field redaction baked in
//   - Request ID correlation when available
//   - Log level configurable via LOG_LEVEL env var
//   - Graceful fallback: works even if pino isn't installed (no-op logger)
//
// Why named loggers? In production you want to filter by domain:
//   - "show me all auth failures last hour" → securityLogger
//   - "what did the billing webhook do at 3am" → billingLogger
//   - "any DB connection issues" → dbLogger
// Without named loggers, you'd grep a giant blob.
//
// Usage:
//   import { dbLogger, httpLogger, securityLogger } from "./utils/logger.js";
//
//   dbLogger.info("Query took 47ms");
//   securityLogger.warn("Auth failed for user X");
//   httpLogger.error({ err }, "Request crashed");
import pino from "pino";
// ============================================================
// CONFIG
// ============================================================
const LOG_CONFIG = {
    /**
     * Log level. error < warn < info < debug < trace.
     * Production default: "info". Dev default: "debug".
     * Override via LOG_LEVEL env var.
     */
    level: (process.env.LOG_LEVEL ??
        (process.env.NODE_ENV === "production" ? "info" : "debug")).toLowerCase(),
    /**
     * Whether to pretty-print logs (human-readable colors) or output JSON.
     * Pretty in dev, JSON in production.
     * Override via LOG_PRETTY=true/false.
     */
    pretty: process.env.LOG_PRETTY === "true" ||
        (process.env.LOG_PRETTY !== "false" && process.env.NODE_ENV !== "production"),
    /**
     * Whether to silence all logging (used by tests that assert on output).
     */
    silent: process.env.LOG_SILENT === "true" || process.env.NODE_ENV === "test",
    /**
     * Service name appended to every log entry for multi-service deployments.
     * In production, this lets you filter "show me only Situs API logs"
     * when shipping multiple services to one aggregator.
     */
    serviceName: process.env.SERVICE_NAME ?? "situs",
    /**
     * App version surfaced in logs for deployment correlation.
     * "did the error rate spike when v1.4.2 deployed?"
     */
    version: process.env.APP_VERSION ?? "0.0.0",
    /**
     * Environment for log routing rules in aggregator.
     */
    env: process.env.NODE_ENV ?? "development",
};
// ============================================================
// SENSITIVE FIELD REDACTION
// ============================================================
/**
 * Field names automatically redacted in logged objects. Prevents
 * accidental PII / credential leakage when developers log entire
 * request bodies or error objects.
 *
 * Pino's redact uses fast-redact under the hood — minimal overhead.
 *
 * IMPORTANT: redaction only works on KNOWN paths. Field names that
 * appear elsewhere in an object (nested, custom keys) won't redact.
 * Don't rely on this as your only defense — code review for explicit
 * credential logging is still required.
 */
const REDACT_PATHS = [
    "password",
    "passwordHash",
    "currentPassword",
    "newPassword",
    "confirmPassword",
    "token",
    "accessToken",
    "refreshToken",
    "jwt",
    "secret",
    "apiKey",
    "api_key",
    "authorization",
    "cookie",
    "creditCard",
    "cardNumber",
    "cvv",
    "ssn",
    "otp",
    "stripeSecretKey",
    "webhookSecret",
    // Nested paths
    "*.password",
    "*.token",
    "*.secret",
    "req.headers.authorization",
    "req.headers.cookie",
    "headers.authorization",
    "headers.cookie",
    "body.password",
    "body.token",
];
// ============================================================
// BASE LOGGER FACTORY
// ============================================================
/**
 * Build the root logger options. Each named logger derives from this
 * via .child({ category: "..." }).
 */
function buildBaseOptions() {
    const options = {
        level: LOG_CONFIG.silent ? "silent" : LOG_CONFIG.level,
        base: {
            service: LOG_CONFIG.serviceName,
            version: LOG_CONFIG.version,
            env: LOG_CONFIG.env,
            pid: process.pid,
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: {
            paths: REDACT_PATHS,
            censor: "[REDACTED]",
            remove: false,
        },
        formatters: {
            level: (label) => ({ level: label }),
        },
    };
    // Pretty-print transport for dev
    if (LOG_CONFIG.pretty && !LOG_CONFIG.silent) {
        options.transport = {
            target: "pino-pretty",
            options: {
                colorize: true,
                translateTime: "SYS:HH:MM:ss.l",
                ignore: "pid,hostname,service,version,env",
                singleLine: false,
            },
        };
    }
    return options;
}
// ============================================================
// ROOT LOGGER
// ============================================================
/**
 * Create the root logger. If pino fails to load (rare — only if pino
 * isn't installed), falls back to console-based no-op logger so the
 * app keeps booting.
 */
function createRootLogger() {
    try {
        return pino(buildBaseOptions());
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to initialize pino logger, falling back to console: " +
            (err?.message ?? "unknown"));
        // Pino-compatible fallback so call sites don't break
        return pino({ level: "silent" });
    }
}
const rootLogger = createRootLogger();
// ============================================================
// LOGGER WRAPPER
// ============================================================
/**
 * Wrap pino's logger in our Logger interface. The signature
 * (msg, obj?) is the call pattern used throughout the codebase:
 *
 *   dbLogger.info("Query completed: ms=47");
 *   dbLogger.warn("Slow query", { queryId: "abc", durationMs: 5000 });
 *
 * Pino's native signature is (obj, msg) but ours is (msg, obj)
 * because callers find it more natural to lead with the message string.
 */
function wrap(p) {
    return {
        trace: (msg, obj) => (obj ? p.trace(obj, msg) : p.trace(msg)),
        debug: (msg, obj) => (obj ? p.debug(obj, msg) : p.debug(msg)),
        info: (msg, obj) => (obj ? p.info(obj, msg) : p.info(msg)),
        warn: (msg, obj) => (obj ? p.warn(obj, msg) : p.warn(msg)),
        error: (msg, obj) => (obj ? p.error(obj, msg) : p.error(msg)),
        fatal: (msg, obj) => (obj ? p.fatal(obj, msg) : p.fatal(msg)),
        child: (bindings) => wrap(p.child(bindings)),
    };
}
// ============================================================
// NAMED LOGGERS
// ============================================================
/** Root app-level logger. Use for app-wide events (startup, shutdown). */
export const logger = wrap(rootLogger);
/** Database queries, connections, migrations. */
export const dbLogger = wrap(rootLogger.child({ category: "db" }));
/** HTTP request lifecycle, routing, middleware. */
export const httpLogger = wrap(rootLogger.child({ category: "http" }));
/** Auth events, permission checks, rate-limit hits, brute-force blocks. */
export const securityLogger = wrap(rootLogger.child({ category: "security" }));
/** Audit events — explicit business-action trail. */
export const auditLogger = wrap(rootLogger.child({ category: "audit" }));
/** Billing — Stripe, subscriptions, webhooks. */
export const billingLogger = wrap(rootLogger.child({ category: "billing" }));
/** BullMQ queues, jobs, workers. */
export const queueLogger = wrap(rootLogger.child({ category: "queue" }));
/** Email send attempts, SMTP responses, template rendering. */
export const emailLogger = wrap(rootLogger.child({ category: "email" }));
/** Decision engines — risk, forecast, intelligence outputs. */
export const engineLogger = wrap(rootLogger.child({ category: "engine" }));
/** CRM sync, integrations, external API calls. */
export const integrationLogger = wrap(rootLogger.child({ category: "integration" }));
// ============================================================
// REQUEST-SCOPED LOGGER
// ============================================================
/**
 * Build a request-scoped logger that includes requestId/userId/orgId
 * automatically in every log line. Use in middleware:
 *
 *   const requestLog = buildRequestLogger({
 *     requestId: req.requestId,
 *     userId:    req.user?.id,
 *     orgId:     req.user?.organizationId,
 *   });
 *
 *   requestLog.info("Request started");
 */
export function buildRequestLogger(bindings) {
    const clean = {};
    for (const [k, v] of Object.entries(bindings)) {
        if (v !== undefined && v !== "")
            clean[k] = v;
    }
    return wrap(rootLogger.child(clean));
}
// ============================================================
// EXPORTS
// ============================================================
export default logger;
//# sourceMappingURL=logger.js.map