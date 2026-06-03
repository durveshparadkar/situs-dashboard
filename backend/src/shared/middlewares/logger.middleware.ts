// requestLogger.middleware.ts
import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import { randomUUID } from "crypto";

import { dbLogger } from "../../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const REQUEST_LOGGER_CONFIG = {
  /**
   * Paths that should be skipped from logging entirely.
   * Health checks and metrics endpoints are hit constantly and
   * would flood your logs without adding signal.
   */
  skipPaths: [
    "/health",
    "/healthz",
    "/ready",
    "/metrics",
    "/favicon.ico",
  ] as const,

  /**
   * Paths that should be logged at DEBUG instead of INFO.
   * Useful for high-frequency polling endpoints where INFO would be noise.
   */
  debugPaths: [
    "/api/notifications/poll",
  ] as const,

  /**
   * Threshold (ms) above which requests are flagged as slow.
   * Slow requests get logged at WARN level for visibility.
   */
  slowRequestThresholdMs: 1_000,

  /**
   * Threshold (ms) above which requests are critically slow.
   * Critically slow requests are logged at ERROR — they need investigation.
   */
  verySlowRequestThresholdMs: 5_000,

  /**
   * Max body size to log in dev (bytes). Prevents huge payloads from
   * flooding logs. Production never logs bodies regardless.
   */
  maxBodyLogBytes: 2_000,

  /**
   * Header names to redact in any request snapshot.
   * Contains credentials, sessions, or PII.
   */
  redactedHeaders: [
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "x-csrf-token",
    "x-forwarded-for",
  ] as const,

  /**
   * Body fields to redact in any request body snapshot.
   * Defends against the "we accidentally logged a password" scenario.
   */
  redactedBodyFields: [
    "password",
    "newPassword",
    "currentPassword",
    "passwordHash",
    "token",
    "refreshToken",
    "accessToken",
    "apiKey",
    "secret",
    "creditCard",
    "cardNumber",
    "cvv",
    "ssn",
  ] as const,
} as const;

// ============================================================
// HELPERS
// ============================================================

/**
 * Get a stable request ID for log correlation. Uses an existing header
 * (set by upstream proxy/load balancer like Cloudflare or AWS ALB) or
 * generates a fresh UUID v4.
 */
function getOrCreateRequestId(req: Request): string {
  const fromHeader =
    (req.headers["x-request-id"] as string | undefined) ||
    (req.headers["x-correlation-id"] as string | undefined);

  if (
    fromHeader &&
    typeof fromHeader === "string" &&
    fromHeader.length > 0 &&
    fromHeader.length <= 100
  ) {
    return fromHeader;
  }

  return randomUUID();
}

/**
 * Get the client IP, respecting proxy headers if Express trust-proxy is on.
 */
function getClientIp(req: Request): string {
  // Express's req.ip respects trust-proxy setting if configured.
  // Falls back to socket address.
  return (
    req.ip ||
    (req.socket?.remoteAddress as string | undefined) ||
    "unknown"
  );
}

/**
 * Extract the user identity if authenticated. Doesn't trigger any DB lookup —
 * just reads from req.user as attached by the auth middleware.
 */
function getActor(req: Request): {
  userId?:         string;
  organizationId?: string;
  role?:           string;
} {
  const u = req.user;
  if (!u) return {};

  const userId =
    (typeof u.id === "string" && u.id) ||
    (u._id ? String(u._id) : undefined);

  const organizationId =
    typeof u.organizationId === "string"
      ? u.organizationId
      : u.organizationId
        ? String(u.organizationId)
        : undefined;

  return {
    ...(userId         && { userId }),
    ...(organizationId && { organizationId }),
    ...(u.role         && { role: String(u.role) }),
  };
}

/**
 * Check if a path matches any of the configured skip/debug lists.
 * Uses prefix matching so "/health/check" also matches "/health".
 */
function pathMatches(path: string, prefixes: readonly string[]): boolean {
  for (const prefix of prefixes) {
    if (path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix + "?")) {
      return true;
    }
  }
  return false;
}

/**
 * Strip query string from URL — keeps log noise down on logged paths.
 * Query strings are logged separately in dev mode.
 */
function stripQuery(url: string): string {
  const idx = url.indexOf("?");
  return idx === -1 ? url : url.slice(0, idx);
}

/**
 * Redact sensitive headers before logging.
 */
function scrubHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if ((REQUEST_LOGGER_CONFIG.redactedHeaders as readonly string[]).includes(key.toLowerCase())) {
      scrubbed[key] = "[REDACTED]";
    } else {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}

/**
 * Recursively redact sensitive fields from request body objects.
 * Depth-limited to defend against pathological nesting.
 */
function scrubBody(body: unknown, depth: number = 0): unknown {
  if (depth > 5) return "[DEPTH_EXCEEDED]";

  if (body === null || body === undefined) return body;

  if (typeof body !== "object") return body;

  if (Array.isArray(body)) {
    return body.slice(0, 50).map((item) => scrubBody(item, depth + 1));
  }

  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if ((REQUEST_LOGGER_CONFIG.redactedBodyFields as readonly string[]).includes(key.toLowerCase())) {
      scrubbed[key] = "[REDACTED]";
    } else {
      scrubbed[key] = scrubBody(value, depth + 1);
    }
  }
  return scrubbed;
}

/**
 * Get the response size from the Content-Length header if set.
 */
function getResponseSize(res: Response): number | undefined {
  const header = res.getHeader("content-length");
  if (typeof header === "string") {
    const n = parseInt(header, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof header === "number") return header;
  return undefined;
}

/**
 * Choose the log level based on status code and duration.
 */
function getLogLevel(
  statusCode: number,
  durationMs: number,
  isDebugPath: boolean
): "debug" | "info" | "warn" | "error" {
  if (statusCode >= 500) return "error";
  if (statusCode >= 400) return "warn";
  if (durationMs >= REQUEST_LOGGER_CONFIG.verySlowRequestThresholdMs) return "error";
  if (durationMs >= REQUEST_LOGGER_CONFIG.slowRequestThresholdMs)     return "warn";
  if (isDebugPath) return "debug";
  return "info";
}

// ============================================================
// REQUEST LOGGER MIDDLEWARE
// ============================================================

/**
 * Request lifecycle logger. Logs every request once it completes (or fails),
 * with status, duration, actor context, and a correlation ID.
 *
 * Register early in the middleware chain so it captures even errored
 * requests. The request ID it generates is also used by the error handler
 * and can be returned to clients via response headers.
 *
 * Usage:
 *   app.use(requestLogger);
 */
export const requestLogger: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // High-resolution start time. Date.now() has ~1ms granularity which is fine
  // for HTTP request latency, but hrtime gives sub-ms precision for the rare
  // case of very fast endpoints.
  const startHrTime = process.hrtime.bigint();
  const startTime   = Date.now();

  // Establish a request ID for correlation across logs and responses.
  const requestId = getOrCreateRequestId(req);

  // Attach to request for downstream consumers (controllers, error middleware).
  (req as Request & { requestId?: string }).requestId = requestId;

  // Set early so even error responses include the correlation header.
  res.setHeader("X-Request-Id", requestId);

  // Capture path early — req.originalUrl can be mutated by routers
  const method     = req.method;
  const fullUrl    = req.originalUrl || req.url || "";
  const pathOnly   = stripQuery(fullUrl);
  const isDev      = process.env.NODE_ENV !== "production";

  // Skip logging entirely for noisy health/metrics endpoints
  if (pathMatches(pathOnly, REQUEST_LOGGER_CONFIG.skipPaths)) {
    return next();
  }

  const isDebugPath = pathMatches(pathOnly, REQUEST_LOGGER_CONFIG.debugPaths);

  // One-shot finalizer — fires on either finish (success) or close (client
  // disconnected before completion). Guards against double-logging if both fire.
  let logged = false;

  const finalize = (event: "finish" | "close"): void => {
    if (logged) return;
    logged = true;

    const endHrTime  = process.hrtime.bigint();
    const durationMs = Number(endHrTime - startHrTime) / 1_000_000;
    const statusCode = res.statusCode;
    const level      = getLogLevel(statusCode, durationMs, isDebugPath);

    // Build the log payload. Actor info is captured at end-of-request
    // because the auth middleware runs AFTER us — req.user may not have
    // been populated at request start.
    const actor       = getActor(req);
    const responseSize = getResponseSize(res);
    const clientIp     = getClientIp(req);

    const payload: Record<string, unknown> = {
      requestId,
      method,
      path:       pathOnly,
      statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip:         clientIp,
      ...(actor.userId         && { userId:         actor.userId }),
      ...(actor.organizationId && { organizationId: actor.organizationId }),
      ...(actor.role           && { role:           actor.role }),
      ...(responseSize !== undefined && { responseBytes: responseSize }),
      ...(event === "close"          && { clientAborted: true }),
    };

    // In dev mode: include query, headers (scrubbed), and body snippet.
    // Production stays minimal to control log volume and avoid PII surface.
    if (isDev) {
      if (Object.keys(req.query ?? {}).length > 0) {
        payload.query = req.query;
      }
      if (req.headers["user-agent"]) {
        payload.userAgent = String(req.headers["user-agent"]).slice(0, 200);
      }
      // Only log body for non-GET requests (GETs shouldn't have bodies)
      if (
        method !== "GET" &&
        method !== "HEAD" &&
        req.body &&
        typeof req.body === "object" &&
        Object.keys(req.body).length > 0
      ) {
        try {
          const scrubbed   = scrubBody(req.body);
          const serialized = JSON.stringify(scrubbed);
          if (serialized.length <= REQUEST_LOGGER_CONFIG.maxBodyLogBytes) {
            payload.body = scrubbed;
          } else {
            payload.body = "[TRUNCATED:" + serialized.length + "_bytes]";
          }
        } catch {
          payload.body = "[SERIALIZATION_FAILED]";
        }
      }
    }

    // Compact one-line summary for human-readable scanning,
    // plus structured JSON for machine parsing.
    const summary =
      method + " " + pathOnly +
      " -> " + statusCode +
      " (" + Math.round(durationMs) + "ms)" +
      " requestId=" + requestId;

    const full = summary + " " + JSON.stringify(payload);

    // Dispatch at appropriate level
    switch (level) {
      case "error":
        dbLogger.error(full);
        break;
      case "warn":
        dbLogger.warn(full);
        break;
      case "debug":
        dbLogger.debug(full);
        break;
      case "info":
      default:
        dbLogger.info(full);
        break;
    }
  };

  res.on("finish", () => finalize("finish"));
  res.on("close",  () => finalize("close"));

  // Reference unused for now but kept for clarity / future use
  void startTime;

  next();
};

export default requestLogger;
