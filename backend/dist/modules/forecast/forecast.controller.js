import mongoose from "mongoose";
import ForecastService from "./forecast.service.js";
import { validateForecastQuery, } from "./forecast.validation.js";
import { dbLogger } from "../../utils/logger.js";
/* =====================================================
   ERROR CLASSES
===================================================== */
class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(message, statusCode = 400, code = "APP_ERROR", details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = "AppError";
    }
}
class ValidationError extends AppError {
    constructor(details) {
        super("Validation failed", 400, "VALIDATION_ERROR", details);
        this.name = "ValidationError";
    }
}
/* =====================================================
   HTTP STATUS
===================================================== */
const HttpStatus = {
    OK: 200,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL: 500,
    GATEWAY_TIMEOUT: 504,
};
/* =====================================================
   CONFIG
===================================================== */
const FORECAST_CONFIG = {
    /* Cache the forecast response for 60s — heavy aggregation, low change rate */
    cacheControlSeconds: 60,
    /* Slow-query threshold for warnings */
    slowMs: 5_000,
    /* Hard cap on custom date windows */
    maxRangeDays: 730, // 2 years
};
/* =====================================================
   ALLOWLISTS
===================================================== */
const VALID_RANGES = ["week", "month", "quarter", "year", "custom"];
const VALID_GROUPBY = ["stage", "owner", "month", "week"];
const VALID_MODELS = [
    "weighted_pipeline",
    "best_case",
    "commit",
    "ai_blended",
];
/**
 * Extract & validate the authenticated user from the global AuthenticatedUser
 * type (augmented via express.d.ts). Throws on missing/invalid identity.
 */
function requireAuth(req) {
    const u = req.user;
    if (!u) {
        throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const userId = (typeof u.id === "string" && u.id) ||
        (u._id ? u._id.toString() : "");
    const organizationId = typeof u.organizationId === "string"
        ? u.organizationId
        : String(u.organizationId ?? "");
    if (!userId || !organizationId) {
        throw new AppError("User missing identity or organization", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }
    return {
        userId,
        organizationId,
        role: String(u.role ?? "USER").toUpperCase(),
    };
}
function paramAsString(value) {
    if (typeof value === "string" && value.length > 0)
        return value;
    return undefined;
}
function getEnumParam(value, allowed, fallback) {
    if (typeof value !== "string")
        return fallback;
    const v = value.trim().toLowerCase();
    return allowed.includes(v) ? v : fallback;
}
function getDateParam(value) {
    if (!value)
        return undefined;
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? undefined : d;
}
function isValidObjectId(id) {
    return !!id && mongoose.Types.ObjectId.isValid(id);
}
/**
 * Validate a custom-range date window. Enforces a hard 2-year cap to
 * prevent DoS via massive scans, e.g. ?startDate=1970&endDate=2030.
 */
function validateCustomRange(start, end) {
    if (!start || !end) {
        throw new AppError("startDate and endDate are required when range='custom'", HttpStatus.BAD_REQUEST, "MISSING_RANGE_DATES");
    }
    if (start.getTime() >= end.getTime()) {
        throw new AppError("startDate must be before endDate", HttpStatus.BAD_REQUEST, "INVALID_RANGE");
    }
    const spanMs = end.getTime() - start.getTime();
    const maxMs = FORECAST_CONFIG.maxRangeDays * 24 * 60 * 60 * 1000;
    if (spanMs > maxMs) {
        throw new AppError(`Date range cannot exceed ${FORECAST_CONFIG.maxRangeDays} days`, HttpStatus.BAD_REQUEST, "RANGE_TOO_LARGE");
    }
    return { start, end };
}
/**
 * Run the existing Zod-based validator and translate failures into
 * a structured ValidationError. Handles both "throws on failure" and
 * "returns parsed result" validator styles.
 */
function runForecastValidator(query) {
    try {
        const result = validateForecastQuery(query);
        return (result ?? query);
    }
    catch (err) {
        const issues = err
            ?.issues;
        if (Array.isArray(issues)) {
            throw new ValidationError(issues.map((i) => ({
                field: i.path.length ? i.path.join(".") : "(root)",
                message: i.message,
            })));
        }
        throw new AppError(err?.message || "Invalid forecast query", HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }
}
/**
 * Set a Cache-Control header so clients/CDNs can reuse the response.
 * Private cache only — forecasts are org-specific.
 */
function setForecastCacheHeaders(res) {
    res.setHeader("Cache-Control", `private, max-age=${FORECAST_CONFIG.cacheControlSeconds}`);
}
/**
 * Coerce a service result (may be void/undefined) into a safe object.
 */
function asObject(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    return {};
}
/**
 * Race a promise against a hard timeout. Forecast aggregations can be
 * heavy; we don't want a stuck query to hold a Node worker forever.
 */
function withTimeout(promise, timeoutMs, operationName) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const err = new Error(` ${operationName} timed out after ${timeoutMs}ms`);
            err.statusCode = HttpStatus.GATEWAY_TIMEOUT;
            err.code = "GATEWAY_TIMEOUT";
            reject(err);
        }, timeoutMs);
        timer.unref?.();
        promise
            .then((value) => {
            clearTimeout(timer);
            resolve(value);
        })
            .catch((reason) => {
            clearTimeout(timer);
            reject(reason);
        });
    });
}
/* =====================================================
   CONTROLLER
===================================================== */
class ForecastController {
    /* =====================================================
       GET /forecast
       Returns forecast data for the org based on query filters.
    ===================================================== */
    async getForecast(req, res, next) {
        try {
            const { userId, organizationId, role } = requireAuth(req);
            /* ── Validate base query (uses your Zod validator) ── */
            const parsedQuery = runForecastValidator(req.query);
            /* ── Resolve range with allowlist defense ── */
            const range = getEnumParam(parsedQuery.range, VALID_RANGES, "month") ?? "month";
            const model = getEnumParam(parsedQuery.model, VALID_MODELS, "weighted_pipeline") ??
                "weighted_pipeline";
            /* ── Custom range validation ── */
            let dateWindow;
            if (range === "custom") {
                dateWindow = validateCustomRange(getDateParam(parsedQuery.startDate), getDateParam(parsedQuery.endDate));
            }
            /* ── Optional filters ── */
            const ownerId = paramAsString(parsedQuery.ownerId);
            if (ownerId && !isValidObjectId(ownerId)) {
                throw new AppError("Invalid ownerId format", HttpStatus.BAD_REQUEST, "INVALID_OWNER_ID");
            }
            const pipelineId = paramAsString(parsedQuery.pipelineId);
            if (pipelineId && !isValidObjectId(pipelineId)) {
                throw new AppError("Invalid pipelineId format", HttpStatus.BAD_REQUEST, "INVALID_PIPELINE_ID");
            }
            const startedAt = Date.now();
            dbLogger.info(`Forecast requested: org=${organizationId} user=${userId} ` +
                `range=${range} model=${model}`);
            /* Service contract — support flexible signatures via cast.
               If your service only accepts (orgId, range), it ignores the rest. */
            const svc = ForecastService;
            const data = await withTimeout(Promise.resolve(svc.getForecast(organizationId, range, {
                model,
                requestedBy: userId,
                role,
                ...(ownerId && { ownerId }),
                ...(pipelineId && { pipelineId }),
                ...(dateWindow && {
                    startDate: dateWindow.start,
                    endDate: dateWindow.end,
                }),
            })), 30_000, "Forecast aggregation");
            const durationMs = Date.now() - startedAt;
            if (durationMs > FORECAST_CONFIG.slowMs) {
                dbLogger.warn(`Slow forecast: org=${organizationId} range=${range} ` +
                    `model=${model} durationMs=${durationMs}`);
            }
            dbLogger.info(`Forecast complete: org=${organizationId} durationMs=${durationMs}`);
            setForecastCacheHeaders(res);
            res.status(HttpStatus.OK).json({
                success: true,
                data,
                meta: {
                    generatedAt: new Date().toISOString(),
                    range,
                    model,
                    durationMs,
                    ...(dateWindow && {
                        dateWindow: {
                            start: dateWindow.start.toISOString(),
                            end: dateWindow.end.toISOString(),
                        },
                    }),
                    ...(ownerId && { ownerId }),
                    ...(pipelineId && { pipelineId }),
                },
            });
        }
        catch (err) {
            next(err);
        }
    }
    /* =====================================================
       GET /forecast/summary
       High-level summary metrics for the dashboard.
    ===================================================== */
    async getForecastSummary(req, res, next) {
        try {
            const { userId, organizationId } = requireAuth(req);
            const range = getEnumParam(req.query.range, VALID_RANGES, "month") ?? "month";
            const svc = ForecastService;
            const startedAt = Date.now();
            const result = typeof svc.getForecastSummary === "function"
                ? await withTimeout(Promise.resolve(svc.getForecastSummary(organizationId, range, {
                    requestedBy: userId,
                })), 20_000, "Forecast summary")
                : await withTimeout(Promise.resolve(svc.getForecast(organizationId, range)), 20_000, "Forecast summary (fallback)");
            const durationMs = Date.now() - startedAt;
            dbLogger.info(`Forecast summary: org=${organizationId} range=${range} ` +
                `durationMs=${durationMs}`);
            setForecastCacheHeaders(res);
            res.status(HttpStatus.OK).json({
                success: true,
                data: asObject(result),
                meta: {
                    generatedAt: new Date().toISOString(),
                    range,
                    durationMs,
                },
            });
        }
        catch (err) {
            next(err);
        }
    }
    /* =====================================================
       GET /forecast/breakdown
       Forecast broken down by stage, owner, month, or week.
    ===================================================== */
    async getForecastBreakdown(req, res, next) {
        try {
            const { userId, organizationId } = requireAuth(req);
            const groupBy = getEnumParam(req.query.groupBy, VALID_GROUPBY, "stage") ?? "stage";
            const range = getEnumParam(req.query.range, VALID_RANGES, "month") ?? "month";
            const ownerId = paramAsString(req.query.ownerId);
            if (ownerId && !isValidObjectId(ownerId)) {
                throw new AppError("Invalid ownerId format", HttpStatus.BAD_REQUEST, "INVALID_OWNER_ID");
            }
            const svc = ForecastService;
            const startedAt = Date.now();
            const result = typeof svc.getForecastBreakdown === "function"
                ? await withTimeout(Promise.resolve(svc.getForecastBreakdown(organizationId, groupBy, {
                    range,
                    requestedBy: userId,
                    ...(ownerId && { ownerId }),
                })), 30_000, "Forecast breakdown")
                : await withTimeout(Promise.resolve(svc.getForecast(organizationId, range)), 30_000, "Forecast breakdown (fallback)");
            const durationMs = Date.now() - startedAt;
            if (durationMs > FORECAST_CONFIG.slowMs) {
                dbLogger.warn(`Slow forecast breakdown: org=${organizationId} ` +
                    `groupBy=${groupBy} range=${range} durationMs=${durationMs}`);
            }
            dbLogger.info(`Forecast breakdown: org=${organizationId} groupBy=${groupBy} ` +
                `durationMs=${durationMs}`);
            setForecastCacheHeaders(res);
            res.status(HttpStatus.OK).json({
                success: true,
                data: result,
                meta: {
                    groupBy,
                    range,
                    durationMs,
                    generatedAt: new Date().toISOString(),
                    ...(ownerId && { ownerId }),
                },
            });
        }
        catch (err) {
            next(err);
        }
    }
    /* =====================================================
       GET /forecast/accuracy
       Historical accuracy of forecasts vs actuals.
       Powers the "how reliable is our forecasting" UX.
    ===================================================== */
    async getForecastAccuracy(req, res, next) {
        try {
            const { userId, organizationId, role } = requireAuth(req);
            /* Managers & admins only — accuracy data is sensitive */
            if (!["ORG_ADMIN", "SUPER_ADMIN", "MANAGER"].includes(role)) {
                throw new AppError("Accuracy report restricted to managers", HttpStatus.FORBIDDEN, "FORBIDDEN");
            }
            const lookbackMonths = Math.min(Math.max(parseInt(String(req.query.months ?? "6"), 10) || 6, 1), 24);
            const svc = ForecastService;
            if (typeof svc.getForecastAccuracy !== "function") {
                throw new AppError("Accuracy reporting not available", HttpStatus.NOT_FOUND, "NOT_AVAILABLE");
            }
            const data = await svc.getForecastAccuracy(organizationId, {
                lookbackMonths,
                requestedBy: userId,
            });
            dbLogger.info(`Forecast accuracy: org=${organizationId} months=${lookbackMonths} ` +
                `user=${userId}`);
            setForecastCacheHeaders(res);
            res.status(HttpStatus.OK).json({
                success: true,
                data,
                meta: {
                    lookbackMonths,
                    generatedAt: new Date().toISOString(),
                },
            });
        }
        catch (err) {
            next(err);
        }
    }
    /* =====================================================
       POST /forecast/refresh
       Force recalculation, bypassing cache. Manager-only.
    ===================================================== */
    async refreshForecast(req, res, next) {
        try {
            const { userId, organizationId, role } = requireAuth(req);
            if (!["ORG_ADMIN", "SUPER_ADMIN", "MANAGER"].includes(role)) {
                throw new AppError("Refresh restricted to managers", HttpStatus.FORBIDDEN, "FORBIDDEN");
            }
            const svc = ForecastService;
            const startedAt = Date.now();
            const data = typeof svc.refreshForecast === "function"
                ? await withTimeout(Promise.resolve(svc.refreshForecast(organizationId, {
                    requestedBy: userId,
                    force: true,
                })), 60_000, "Forecast refresh")
                : await withTimeout(Promise.resolve(svc.getForecast(organizationId, "month", {
                    force: true,
                    requestedBy: userId,
                })), 60_000, "Forecast refresh (fallback)");
            const durationMs = Date.now() - startedAt;
            dbLogger.warn(`Forecast refresh: org=${organizationId} user=${userId} ` +
                `durationMs=${durationMs}`);
            /* No cache on refresh response — caller wants fresh data */
            res.setHeader("Cache-Control", "no-store");
            res.status(HttpStatus.OK).json({
                success: true,
                data,
                message: "Forecast refreshed",
                meta: {
                    generatedAt: new Date().toISOString(),
                    durationMs,
                },
            });
        }
        catch (err) {
            next(err);
        }
    }
}
export default new ForecastController();
//# sourceMappingURL=forecast.controller.js.map