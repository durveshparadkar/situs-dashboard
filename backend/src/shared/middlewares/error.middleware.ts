// error.middleware.ts
import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import { ZodError } from "zod";
import mongoose from "mongoose";

import { dbLogger } from "../../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const ERROR_CONFIG = {
  /**
   * Generic message used for 5xx errors in production.
   * Never leak internal error messages to clients on 500.
   */
  productionFallbackMessage: "Internal Server Error",

  /**
   * Max length for error messages in client responses.
   * Defends against accidentally echoing huge payloads back.
   */
  maxMessageLength: 500,

  /**
   * Max number of validation issues returned to the client.
   * Defends against bloated responses from huge invalid payloads.
   */
  maxValidationIssues: 50,

  /**
   * Headers to scrub from request snapshots in logs.
   * These can contain credentials, sessions, or PII.
   */
  redactedHeaders: [
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "x-csrf-token",
  ] as const,
} as const;

// ============================================================
// TYPES
// ============================================================

interface AppError extends Error {
  status?:     number;
  statusCode?: number;
  code?:       number | string;
  errors?:     Record<string, { message?: string; kind?: string; path?: string; value?: unknown }>;
  path?:       string;
  keyValue?:   Record<string, unknown>;
  keyPattern?: Record<string, unknown>;
  details?:    unknown;
  expose?:     boolean;
}

interface ErrorResponseBody {
  success:    false;
  error: {
    code:     string;
    message:  string;
    details?: unknown;
    requestId?: string;
  };
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Truncate a string to a max length, appending an ellipsis if cut.
 * Defends against echoing huge values back to clients.
 */
function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

/**
 * Get a stable request ID for log correlation. Uses an existing header
 * (set by upstream proxy/load balancer) or falls back to a generated one.
 */
function getRequestId(req: Request): string {
  const fromHeader =
    (req.headers["x-request-id"] as string | undefined) ||
    (req.headers["x-correlation-id"] as string | undefined);

  if (fromHeader && typeof fromHeader === "string" && fromHeader.length > 0) {
    return fromHeader.slice(0, 100);
  }

  // Fallback: ephemeral ID for this request. Not cryptographically secure,
  // just a correlation token between log line and client response.
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

/**
 * Scrub sensitive headers before logging the request snapshot.
 */
function scrubHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if ((ERROR_CONFIG.redactedHeaders as readonly string[]).includes(key.toLowerCase())) {
      scrubbed[key] = "[REDACTED]";
    } else {
      scrubbed[key] = value;
    }
  }
  return scrubbed;
}

/**
 * Extract the user identity (if authenticated) for log correlation.
 */
function getActor(req: Request): { userId?: string; organizationId?: string; role?: string } {
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
 * Sanitize a string for safe inclusion in error messages.
 * Strips control characters and limits length.
 */
function sanitizeMessage(message: string): string {
  // eslint-disable-next-line no-control-regex
  const stripped = String(message).replace(/[\x00-\x1F\x7F]/g, " ");
  return truncate(stripped.trim(), ERROR_CONFIG.maxMessageLength);
}

// ============================================================
// ERROR CLASSIFIERS
// Each returns a partial response shape (status, code, message, details)
// or null if the error doesn't match the classifier's type.
// ============================================================

interface ClassifiedError {
  statusCode: number;
  code:       string;
  message:    string;
  details?:   unknown;
  /** True if the original error message is safe to expose to clients */
  expose:     boolean;
}

function classifyZodError(err: unknown): ClassifiedError | null {
  if (!(err instanceof ZodError)) return null;

  const issues = err.issues.slice(0, ERROR_CONFIG.maxValidationIssues).map((issue) => ({
    field:   issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
    code:    issue.code,
  }));

  return {
    statusCode: 400,
    code:       "VALIDATION_ERROR",
    message:    "Validation failed",
    details:    issues,
    expose:     true,
  };
}

function classifyMongooseValidationError(err: AppError): ClassifiedError | null {
  if (err.name !== "ValidationError") return null;

  const errorsObj = err.errors ?? {};

  const details = Object.entries(errorsObj)
    .slice(0, ERROR_CONFIG.maxValidationIssues)
    .map(([field, val]) => ({
      field,
      message: val?.message || "Invalid value",
      kind:    val?.kind,
    }));

  return {
    statusCode: 400,
    code:       "VALIDATION_ERROR",
    message:    "Validation failed",
    details,
    expose:     true,
  };
}

function classifyMongooseCastError(err: AppError): ClassifiedError | null {
  if (err.name !== "CastError") return null;

  return {
    statusCode: 400,
    code:       "INVALID_ID",
    message:    "Invalid resource ID",
    expose:     true,
  };
}

function classifyMongooseDuplicateKey(err: AppError): ClassifiedError | null {
  // MongoDB duplicate key error
  if (err.code !== 11000 && err.code !== "11000") return null;

  const keyValue = err.keyValue ?? {};
  const field    = Object.keys(keyValue)[0];

  return {
    statusCode: 409,
    code:       "DUPLICATE_KEY",
    message:    field ? field + " already exists" : "Duplicate field value",
    details:    field ? { field, value: keyValue[field] } : undefined,
    expose:     true,
  };
}

function classifyJwtError(err: AppError): ClassifiedError | null {
  if (err.name === "JsonWebTokenError") {
    return {
      statusCode: 401,
      code:       "TOKEN_INVALID",
      message:    "Invalid token",
      expose:     true,
    };
  }

  if (err.name === "TokenExpiredError") {
    return {
      statusCode: 401,
      code:       "TOKEN_EXPIRED",
      message:    "Session expired. Please login again.",
      expose:     true,
    };
  }

  if (err.name === "NotBeforeError") {
    return {
      statusCode: 401,
      code:       "TOKEN_NOT_ACTIVE",
      message:    "Token not active yet",
      expose:     true,
    };
  }

  return null;
}

function classifyMongoNetworkError(err: AppError): ClassifiedError | null {
  if (
    err.name === "MongoNetworkError" ||
    err.name === "MongoServerSelectionError" ||
    err.name === "MongoTimeoutError"
  ) {
    return {
      statusCode: 503,
      code:       "DATABASE_UNAVAILABLE",
      message:    "Service temporarily unavailable",
      expose:     false, // Don't leak DB topology details
    };
  }
  return null;
}

function classifySyntaxError(err: AppError): ClassifiedError | null {
  // Body-parser surfaces SyntaxError when JSON parsing fails
  if (err instanceof SyntaxError && "status" in err && (err.status === 400 || err.statusCode === 400)) {
    return {
      statusCode: 400,
      code:       "INVALID_JSON",
      message:    "Invalid JSON in request body",
      expose:     true,
    };
  }
  return null;
}

function classifyByStatusCode(err: AppError): ClassifiedError {
  const rawStatus =
    typeof err.status === "number"
      ? err.status
      : typeof err.statusCode === "number"
        ? err.statusCode
        : 500;

  // Clamp to valid HTTP error range
  const statusCode = rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;

  // Use the error's code field if it's a string, else derive from status
  const code =
    typeof err.code === "string"
      ? err.code
      : deriveCodeFromStatus(statusCode);

  // Honor the expose flag if set (used by libraries like http-errors)
  // Otherwise: 4xx exposes the message, 5xx hides it
  const expose =
    typeof err.expose === "boolean"
      ? err.expose
      : statusCode < 500;

  return {
    statusCode,
    code,
    message: err.message || "Error",
    expose,
    ...(err.details !== undefined && { details: err.details }),
  };
}

function deriveCodeFromStatus(status: number): string {
  switch (status) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHORIZED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 405: return "METHOD_NOT_ALLOWED";
    case 409: return "CONFLICT";
    case 410: return "GONE";
    case 413: return "PAYLOAD_TOO_LARGE";
    case 415: return "UNSUPPORTED_MEDIA_TYPE";
    case 422: return "UNPROCESSABLE_ENTITY";
    case 429: return "TOO_MANY_REQUESTS";
    case 500: return "INTERNAL_ERROR";
    case 502: return "BAD_GATEWAY";
    case 503: return "SERVICE_UNAVAILABLE";
    case 504: return "GATEWAY_TIMEOUT";
    default:  return status >= 500 ? "SERVER_ERROR" : "CLIENT_ERROR";
  }
}

/**
 * Run all classifiers in order. First match wins. Falls back to
 * status-code-based classification.
 */
function classifyError(err: AppError): ClassifiedError {
  return (
    classifyZodError(err)                ??
    classifyMongooseValidationError(err) ??
    classifyMongooseCastError(err)       ??
    classifyMongooseDuplicateKey(err)    ??
    classifyJwtError(err)                ??
    classifyMongoNetworkError(err)       ??
    classifySyntaxError(err)             ??
    classifyByStatusCode(err)
  );
}

// ============================================================
// LOGGING
// ============================================================

function logError(
  err: AppError,
  req: Request,
  classified: ClassifiedError,
  requestId: string,
  isDev: boolean
): void {
  const actor = getActor(req);

  const logPayload = {
    requestId,
    method:     req.method,
    path:       req.originalUrl || req.url,
    statusCode: classified.statusCode,
    errorCode:  classified.code,
    errorName:  err.name,
    message:    err.message,
    actor,
    // In dev: include stack, query, params, scrubbed headers.
    // In prod: omit to keep log volume manageable and avoid PII leakage.
    ...(isDev && {
      stack:   err.stack,
      query:   req.query,
      params:  req.params,
      headers: scrubHeaders(req.headers as Record<string, unknown>),
    }),
  };

  // Use level based on status code: 5xx = error, 4xx = warn
  if (classified.statusCode >= 500) {
    dbLogger.error(
      "Request failed (5xx): " + JSON.stringify(logPayload)
    );
  } else {
    dbLogger.warn(
      "Request failed (4xx): " + JSON.stringify(logPayload)
    );
  }
}

// ============================================================
// ERROR MIDDLEWARE
// ============================================================

/**
 * Global error-handling middleware. Must be registered LAST in the
 * Express middleware chain, after all routes.
 *
 * Usage:
 *   app.use(errorMiddleware);
 *
 * Responsibilities:
 *   - Classify the error (Zod, Mongoose, JWT, generic, etc.)
 *   - Log with appropriate detail level (dev vs prod)
 *   - Return a consistent JSON shape to the client
 *   - Never leak stack traces or internal details in production
 *   - Correlate logs with responses via a request ID
 */
const errorMiddleware: ErrorRequestHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // If the response has already been sent, defer to Express's default handler.
  // Trying to send another response would crash the request.
  if (res.headersSent) {
    return next(err);
  }

  const isDev     = process.env.NODE_ENV !== "production";
  const requestId = getRequestId(req);

  // Classify the error into a normalized shape
  const classified = classifyError(err);

  // Log the error with appropriate verbosity
  logError(err, req, classified, requestId, isDev);

  // Determine the client-safe message:
  //  - If classifier marked it safe to expose, use the classified message
  //  - Otherwise (5xx or sensitive), use the generic production message
  const clientMessage =
    classified.expose
      ? sanitizeMessage(classified.message)
      : ERROR_CONFIG.productionFallbackMessage;

  // Build response body
  const body: ErrorResponseBody = {
    success: false,
    error: {
      code:    classified.code,
      message: clientMessage,
      ...(classified.details !== undefined && { details: classified.details }),
      requestId,
    },
  };

  // Set request-id response header for client-side log correlation
  res.setHeader("X-Request-Id", requestId);

  // Ensure response isn't cached by intermediaries
  res.setHeader("Cache-Control", "no-store");

  res.status(classified.statusCode).json(body);
};

export default errorMiddleware;


