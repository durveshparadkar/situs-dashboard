// shared/utils/asyncHandler.ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

import { dbLogger } from "./logger.js";

/* =====================================================
   TYPES
===================================================== */

/**
 * The shape of an async route handler. Returns Promise<unknown>
 * because handlers may return res.json(...), undefined, or void —
 * the wrapper doesn't care about the return value.
 */
export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

/**
 * Optional configuration per-handler. Most handlers won't need to set
 * any of these — the defaults are sensible. Override only when a specific
 * route has special requirements (long-running uploads, security-sensitive
 * actions that should always log, etc.).
 */
export interface AsyncHandlerOptions {
  /** Human-friendly label for logs (defaults to function name or "anonymous"). */
  name?: string;

  /** Auto-fail the request after this many ms. Default: no timeout. */
  timeoutMs?: number;

  /** Log every request/response (default: only logs errors and slow requests). */
  alwaysLog?: boolean;

  /** Threshold for slow-request warnings (ms). Default: 3000. */
  slowMs?: number;

  /** Skip attaching x-request-id header (default: false). */
  skipRequestId?: boolean;
}

/* =====================================================
   ERROR CLASSES
===================================================== */

/**
 * Thrown by the timeout wrapper. Distinct class so the global error
 * middleware can return a 408 instead of 500.
 */
export class HandlerTimeoutError extends Error {
  public statusCode = 408;
  public code = "HANDLER_TIMEOUT";

  constructor(handlerName: string, timeoutMs: number) {
    super(`Handler '${handlerName}' timed out after ${timeoutMs}ms`);
    this.name = "HandlerTimeoutError";
  }
}

/* =====================================================
   CONSTANTS
===================================================== */

const DEFAULTS = {
  slowMs: 3_000,
  alwaysLog: false,
} as const;

const REQUEST_ID_HEADER = "x-request-id";

/* =====================================================
   HELPERS
===================================================== */

/**
 * Extract or generate a request ID. Honors upstream proxies that already
 * set x-request-id (e.g. Cloudflare, ALB). Otherwise generates a UUID.
 */
function ensureRequestId(req: Request, res: Response): string {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.length <= 200 ? incoming : randomUUID();

  /* Echo back in response so clients can correlate logs */
  res.setHeader(REQUEST_ID_HEADER, requestId);

  /* Make available to the rest of the request lifecycle */
  (req as Request & { requestId?: string }).requestId = requestId;

  return requestId;
}

/**
 * Race a promise against a timeout. Resolves with the promise result
 * or rejects with HandlerTimeoutError after the timeout fires.
 *
 * Critical: clears the timer on settle to prevent memory leaks.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  handlerName: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new HandlerTimeoutError(handlerName, timeoutMs));
    }, timeoutMs);

    /* Don't keep the event loop alive just for this timer */
    timer.unref?.();

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Sanitize the request path for logs. Strips query strings to avoid
 * accidentally logging tokens (?access_token=...) or PII (?email=...).
 */
function safePath(req: Request): string {
  return req.path || req.url?.split("?")[0] || "/unknown";
}

/* =====================================================
   PRIMARY EXPORT — asyncHandler
===================================================== */

/**
 * Wrap an async route handler with observability and error normalization.
 *
 * Usage (basic):
 *   router.get("/users", asyncHandler(async (req, res) => { ... }));
 *
 * Usage (with options):
 *   router.post(
 *     "/exports",
 *     asyncHandler(
 *       async (req, res) => { ... },
 *       { name: "createExport", timeoutMs: 30_000, alwaysLog: true }
 *     )
 *   );
 *
 * What this wrapper does:
 *  - Catches sync throws AND async rejections, forwards via next(err)
 *  - Generates/propagates x-request-id for request correlation
 *  - Tracks request duration; warns on slow requests (>3s by default)
 *  - Optionally enforces a hard timeout via withTimeout()
 *  - Never sends a response itself — the caller's handler always does
 */
export function asyncHandler(
  fn: AsyncRouteHandler,
  options: AsyncHandlerOptions = {}
): RequestHandler {
  const handlerName = options.name ?? fn.name ?? "anonymous";
  const slowMs      = options.slowMs ?? DEFAULTS.slowMs;
  const alwaysLog   = options.alwaysLog ?? DEFAULTS.alwaysLog;
  const timeoutMs   = options.timeoutMs;
  const skipRequestId = options.skipRequestId ?? false;

  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = performance.now();

    /* Attach a request-id (unless explicitly skipped) */
    const requestId = skipRequestId ? undefined : ensureRequestId(req, res);

    /* Run the handler — wrap in timeout if configured */
    const exec = Promise.resolve().then(() => fn(req, res, next));

    const wrapped =
      timeoutMs && timeoutMs > 0
        ? withTimeout(exec, timeoutMs, handlerName)
        : exec;

    wrapped
      .then(() => {
        const durationMs = Math.round(performance.now() - startedAt);

        /* Slow-request warning */
        if (durationMs >= slowMs) {
          dbLogger.warn(
            `Slow handler: ${handlerName} ${req.method} ${safePath(req)} ` +
            `durationMs=${durationMs} requestId=${requestId ?? "n/a"}`
          );
          return;
        }

        /* Verbose mode — log every successful request */
        if (alwaysLog) {
          dbLogger.info(
            `Handler ok: ${handlerName} ${req.method} ${safePath(req)} ` +
            `durationMs=${durationMs} status=${res.statusCode} ` +
            `requestId=${requestId ?? "n/a"}`
          );
        }
      })
      .catch((err: unknown) => {
        const durationMs = Math.round(performance.now() - startedAt);

        /* Normalize the error to something loggable */
        const errMessage =
          err instanceof Error ? err.message : String(err ?? "Unknown error");
        const errName =
          err instanceof Error ? err.name : "UnknownError";
        const errCode =
          (err as { code?: string })?.code ?? "UNKNOWN";

        dbLogger.error(
          `Handler failed: ${handlerName} ${req.method} ${safePath(req)} ` +
          `durationMs=${durationMs} requestId=${requestId ?? "n/a"} ` +
          `errorName=${errName} errorCode=${errCode} error="${errMessage}"`
        );

        /* Forward to global error middleware — never send response here */
        next(err);
      });
  };
}

/* =====================================================
   SECONDARY EXPORT — controllerMethod
===================================================== */

/**
 * Wrapper for class-based controllers where methods need to be bound
 * to the controller instance. Without this, this becomes undefined
 * inside async methods when used as Express handlers.
 *
 * Usage:
 *   router.get("/users", controllerMethod(userController, "list"));
 */
export function controllerMethod<T extends object, K extends keyof T>(
  controller: T,
  methodName: K,
  options?: AsyncHandlerOptions
): RequestHandler {
  const method = controller[methodName];

  if (typeof method !== "function") {
    throw new Error(
      `controllerMethod: '${String(methodName)}' is not a function on the provided controller`
    );
  }

  const bound = (method as (...args: unknown[]) => Promise<unknown>).bind(
    controller
  );

  return asyncHandler(
    bound as AsyncRouteHandler,
    {
      ...options,
      name: options?.name ?? `${controller.constructor.name}.${String(methodName)}`,
    }
  );
}

/* =====================================================
   DEFAULT EXPORT
===================================================== */

export default asyncHandler;