import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { dbLogger } from "./logger.js";
/* =====================================================
   ERROR CLASSES
===================================================== */
/**
 * Thrown by the timeout wrapper. Distinct class so the global error
 * middleware can return a 408 instead of 500.
 */
export class HandlerTimeoutError extends Error {
    statusCode = 408;
    code = "HANDLER_TIMEOUT";
    constructor(handlerName, timeoutMs) {
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
};
const REQUEST_ID_HEADER = "x-request-id";
/* =====================================================
   HELPERS
===================================================== */
/**
 * Extract or generate a request ID. Honors upstream proxies that already
 * set x-request-id (e.g. Cloudflare, ALB). Otherwise generates a UUID.
 */
function ensureRequestId(req, res) {
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId = incoming && incoming.length <= 200 ? incoming : randomUUID();
    /* Echo back in response so clients can correlate logs */
    res.setHeader(REQUEST_ID_HEADER, requestId);
    /* Make available to the rest of the request lifecycle */
    req.requestId = requestId;
    return requestId;
}
/**
 * Race a promise against a timeout. Resolves with the promise result
 * or rejects with HandlerTimeoutError after the timeout fires.
 *
 * Critical: clears the timer on settle to prevent memory leaks.
 */
function withTimeout(promise, timeoutMs, handlerName) {
    return new Promise((resolve, reject) => {
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
function safePath(req) {
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
export function asyncHandler(fn, options = {}) {
    const handlerName = options.name ?? fn.name ?? "anonymous";
    const slowMs = options.slowMs ?? DEFAULTS.slowMs;
    const alwaysLog = options.alwaysLog ?? DEFAULTS.alwaysLog;
    const timeoutMs = options.timeoutMs;
    const skipRequestId = options.skipRequestId ?? false;
    return (req, res, next) => {
        const startedAt = performance.now();
        /* Attach a request-id (unless explicitly skipped) */
        const requestId = skipRequestId ? undefined : ensureRequestId(req, res);
        /* Run the handler — wrap in timeout if configured */
        const exec = Promise.resolve().then(() => fn(req, res, next));
        const wrapped = timeoutMs && timeoutMs > 0
            ? withTimeout(exec, timeoutMs, handlerName)
            : exec;
        wrapped
            .then(() => {
            const durationMs = Math.round(performance.now() - startedAt);
            /* Slow-request warning */
            if (durationMs >= slowMs) {
                dbLogger.warn(`Slow handler: ${handlerName} ${req.method} ${safePath(req)} ` +
                    `durationMs=${durationMs} requestId=${requestId ?? "n/a"}`);
                return;
            }
            /* Verbose mode — log every successful request */
            if (alwaysLog) {
                dbLogger.info(`Handler ok: ${handlerName} ${req.method} ${safePath(req)} ` +
                    `durationMs=${durationMs} status=${res.statusCode} ` +
                    `requestId=${requestId ?? "n/a"}`);
            }
        })
            .catch((err) => {
            const durationMs = Math.round(performance.now() - startedAt);
            /* Normalize the error to something loggable */
            const errMessage = err instanceof Error ? err.message : String(err ?? "Unknown error");
            const errName = err instanceof Error ? err.name : "UnknownError";
            const errCode = err?.code ?? "UNKNOWN";
            dbLogger.error(`Handler failed: ${handlerName} ${req.method} ${safePath(req)} ` +
                `durationMs=${durationMs} requestId=${requestId ?? "n/a"} ` +
                `errorName=${errName} errorCode=${errCode} error="${errMessage}"`);
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
export function controllerMethod(controller, methodName, options) {
    const method = controller[methodName];
    if (typeof method !== "function") {
        throw new Error(`controllerMethod: '${String(methodName)}' is not a function on the provided controller`);
    }
    const bound = method.bind(controller);
    return asyncHandler(bound, {
        ...options,
        name: options?.name ?? `${controller.constructor.name}.${String(methodName)}`,
    });
}
/* =====================================================
   DEFAULT EXPORT
===================================================== */
export default asyncHandler;
//# sourceMappingURL=asyncHandler.js.map