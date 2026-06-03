import { randomUUID } from "crypto";
import { dbLogger } from "../../utils/logger.js";
// ============================================================
// CONFIG
// ============================================================
const REQUEST_LOGGER_CONFIG = {
    /**
     * Paths skipped entirely from logging.
     * Health checks and metrics fire constantly — would flood logs.
     */
    skipPaths: [
        "/health",
        "/healthz",
        "/ready",
        "/metrics",
        "/favicon.ico",
    ],
    /**
     * Paths logged at DEBUG instead of INFO.
     * For high-frequency polling endpoints that are legitimate but noisy.
     */
    debugPaths: [
        "/api/notifications/poll",
    ],
    /**
     * Threshold (ms) above which a request is considered slow.
     * Slow requests log at WARN.
     */
    slowThresholdMs: 1_000,
    /**
     * Threshold (ms) above which a request is critically slow.
     * Critically slow requests log at ERROR.
     */
    verySlowThresholdMs: 5_000,
    /**
     * Max body size (bytes) to log in dev. Prevents huge payloads from
     * blowing out log volume. Production never logs bodies regardless.
     */
    maxBodyLogBytes: 2_000,
    /**
     * Max upstream request ID length. Defends against pathological values
     * in headers that could bloat logs.
     */
    maxRequestIdLength: 100,
    /**
     * Header names redacted in request snapshots.
     */
    redactedHeaders: [
        "authorization",
        "cookie",
        "set-cookie",
        "x-api-key",
        "x-auth-token",
        "x-csrf-token",
        "x-forwarded-for",
    ],
    /**
     * Body fields redacted from logs.
     * Case-insensitive match.
     */
    redactedBodyFields: [
        "password",
        "newpassword",
        "currentpassword",
        "passwordhash",
        "token",
        "refreshtoken",
        "accesstoken",
        "apikey",
        "secret",
        "creditcard",
        "cardnumber",
        "cvv",
        "ssn",
    ],
};
// ============================================================
// HELPERS
// ============================================================
/**
 * Truncate a string, appending "..." if cut.
 */
function truncate(str, max) {
    if (str.length <= max)
        return str;
    return str.slice(0, max - 3) + "...";
}
/**
 * Get or generate a request ID for correlation across logs and responses.
 * Prefers an upstream-provided value (from your LB/proxy).
 */
function getOrCreateRequestId(req) {
    const headerVal = req.headers["x-request-id"] ||
        req.headers["x-correlation-id"];
    if (typeof headerVal === "string" &&
        headerVal.length > 0 &&
        headerVal.length <= REQUEST_LOGGER_CONFIG.maxRequestIdLength) {
        return headerVal;
    }
    return randomUUID();
}
/**
 * Get the client IP, respecting Express's trust-proxy setting.
 */
function getClientIp(req) {
    return (req.ip ||
        req.socket?.remoteAddress ||
        "unknown");
}
/**
 * Extract user identity if authenticated. Reads from req.user as attached
 * by the auth middleware — no DB lookup.
 */
function getActor(req) {
    const u = req.user;
    if (!u)
        return {};
    const userId = (typeof u.id === "string" && u.id) ||
        (u._id ? String(u._id) : undefined);
    const organizationId = typeof u.organizationId === "string"
        ? u.organizationId
        : u.organizationId
            ? String(u.organizationId)
            : undefined;
    return {
        ...(userId && { userId }),
        ...(organizationId && { organizationId }),
        ...(u.role && { role: String(u.role) }),
    };
}
/**
 * Prefix-match a path against a list of skip patterns.
 */
function pathMatches(path, prefixes) {
    for (const prefix of prefixes) {
        if (path === prefix ||
            path.startsWith(prefix + "/") ||
            path.startsWith(prefix + "?")) {
            return true;
        }
    }
    return false;
}
/**
 * Strip query string from URL — kept separately in dev mode.
 */
function stripQuery(url) {
    const idx = url.indexOf("?");
    return idx === -1 ? url : url.slice(0, idx);
}
/**
 * Redact sensitive headers before logging.
 */
function scrubHeaders(headers) {
    const out = {};
    for (const [key, value] of Object.entries(headers)) {
        if (REQUEST_LOGGER_CONFIG.redactedHeaders.includes(key.toLowerCase())) {
            out[key] = "[REDACTED]";
        }
        else {
            out[key] = value;
        }
    }
    return out;
}
/**
 * Recursively redact sensitive fields from body objects.
 * Depth-limited to defend against pathological nesting.
 */
function scrubBody(body, depth = 0) {
    if (depth > 5)
        return "[DEPTH_EXCEEDED]";
    if (body === null || body === undefined)
        return body;
    if (typeof body !== "object")
        return body;
    if (Array.isArray(body)) {
        return body.slice(0, 50).map((item) => scrubBody(item, depth + 1));
    }
    const out = {};
    for (const [key, value] of Object.entries(body)) {
        if (REQUEST_LOGGER_CONFIG.redactedBodyFields.includes(key.toLowerCase())) {
            out[key] = "[REDACTED]";
        }
        else {
            out[key] = scrubBody(value, depth + 1);
        }
    }
    return out;
}
/**
 * Read the response size from Content-Length header.
 */
function getResponseSize(res) {
    const header = res.getHeader("content-length");
    if (typeof header === "string") {
        const n = parseInt(header, 10);
        return Number.isFinite(n) ? n : undefined;
    }
    if (typeof header === "number")
        return header;
    return undefined;
}
/**
 * Pick log level based on status and duration.
 */
function getLogLevel(statusCode, durationMs, isDebugPath) {
    if (statusCode >= 500)
        return "error";
    if (statusCode >= 400)
        return "warn";
    if (durationMs >= REQUEST_LOGGER_CONFIG.verySlowThresholdMs)
        return "error";
    if (durationMs >= REQUEST_LOGGER_CONFIG.slowThresholdMs)
        return "warn";
    if (isDebugPath)
        return "debug";
    return "info";
}
// ============================================================
// REQUEST LOGGER MIDDLEWARE
// ============================================================
/**
 * Request lifecycle logger.
 *
 * Logs every completed request with: method, path, status, duration,
 * actor (user/org), and a request ID for log correlation.
 *
 * Should be registered EARLY in the middleware chain — before auth and
 * body parser — so even unauthenticated and parse-failed requests are
 * logged.
 *
 * Usage:
 *   app.use(requestLogger);
 */
export const requestLogger = (req, res, next) => {
    // High-resolution start time
    const startHrTime = process.hrtime.bigint();
    // Establish a request ID for correlation
    const requestId = getOrCreateRequestId(req);
    // Attach to request for downstream consumers
    req.requestId = requestId;
    // Set response header early so error responses also include it
    res.setHeader("X-Request-Id", requestId);
    // Capture path early — routers can mutate originalUrl after this point
    const method = req.method;
    const fullUrl = req.originalUrl || req.url || "";
    const pathOnly = stripQuery(fullUrl);
    const isDev = process.env.NODE_ENV !== "production";
    // Skip noisy health/metrics endpoints entirely
    if (pathMatches(pathOnly, REQUEST_LOGGER_CONFIG.skipPaths)) {
        return next();
    }
    const isDebugPath = pathMatches(pathOnly, REQUEST_LOGGER_CONFIG.debugPaths);
    // One-shot finalizer guards against double-logging if both events fire
    let logged = false;
    const finalize = (event) => {
        if (logged)
            return;
        logged = true;
        const endHrTime = process.hrtime.bigint();
        const durationMs = Number(endHrTime - startHrTime) / 1_000_000;
        const statusCode = res.statusCode;
        const level = getLogLevel(statusCode, durationMs, isDebugPath);
        // Capture actor at END of request — auth middleware runs AFTER us,
        // so req.user is populated by now if the request was authenticated.
        const actor = getActor(req);
        const responseSize = getResponseSize(res);
        const clientIp = getClientIp(req);
        const payload = {
            requestId,
            method,
            path: pathOnly,
            statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
            ip: clientIp,
            ...(actor.userId && { userId: actor.userId }),
            ...(actor.organizationId && { organizationId: actor.organizationId }),
            ...(actor.role && { role: actor.role }),
            ...(responseSize !== undefined && { responseBytes: responseSize }),
            ...(event === "close" && { clientAborted: true }),
        };
        // Dev-only enrichment: query, headers, body snippet (all scrubbed)
        if (isDev) {
            if (Object.keys(req.query ?? {}).length > 0) {
                payload.query = req.query;
            }
            if (req.headers["user-agent"]) {
                payload.userAgent = truncate(String(req.headers["user-agent"]), 200);
            }
            if (method !== "GET" &&
                method !== "HEAD" &&
                req.body &&
                typeof req.body === "object" &&
                Object.keys(req.body).length > 0) {
                try {
                    const scrubbed = scrubBody(req.body);
                    const serialized = JSON.stringify(scrubbed);
                    if (serialized.length <= REQUEST_LOGGER_CONFIG.maxBodyLogBytes) {
                        payload.body = scrubbed;
                    }
                    else {
                        payload.body = "[TRUNCATED:" + serialized.length + "_bytes]";
                    }
                }
                catch {
                    payload.body = "[SERIALIZATION_FAILED]";
                }
            }
        }
        // Compact summary for human scanning + structured JSON for parsing
        const summary = method + " " + pathOnly +
            " -> " + statusCode +
            " (" + Math.round(durationMs) + "ms)" +
            " requestId=" + requestId;
        const fullLine = summary + " " + JSON.stringify(payload);
        switch (level) {
            case "error":
                dbLogger.error(fullLine);
                break;
            case "warn":
                dbLogger.warn(fullLine);
                break;
            case "debug":
                dbLogger.debug(fullLine);
                break;
            case "info":
            default:
                dbLogger.info(fullLine);
                break;
        }
    };
    res.on("finish", () => finalize("finish"));
    res.on("close", () => finalize("close"));
    next();
};
export default requestLogger;
//# sourceMappingURL=requestLogger.js.map