// intelligence.controller.ts
//
// HTTP layer for the intelligence subsystem. Wraps intelligence.service.ts
// with Zod input validation, response shaping, and standard error handling.
//
// Endpoints exposed:
//   POST   /api/intelligence/refresh         → on-demand re-run for current org
//   POST   /api/intelligence/preview         → dry-run, no persistence
//   POST   /api/intelligence/deals/:dealId   → single-deal re-score
//   GET    /api/intelligence/summary         → latest scores + actions
//   GET    /api/intelligence/forecast        → just the forecast view
//   GET    /api/intelligence/leaks           → just the pipeline leaks view
//   GET    /api/intelligence/actions         → just the top revenue actions
//
// All endpoints require auth + tenant scope.
// Heavy endpoints (refresh) are rate-limited at the route layer.
import { z, ZodError } from "zod";
import mongoose from "mongoose";
import intelligenceService from "./intelligence.service.js";
import { dbLogger } from "../../utils/logger.js";
import { AppError, unauthorizedError, validationError, asyncHandler, HTTP_STATUS, } from "../../core/types/index.js";
// ============================================================
// HELPERS
// ============================================================
/**
 * Require auth — narrows req.user from optional to required.
 * Returns userId, organizationId, role and effectiveOrganizationId.
 *
 * effectiveOrganizationId is set by tenantGuard.middleware.ts when
 * SUPER_ADMIN uses X-Tenant-Override header to act on another org.
 * Controllers MUST query against this, not user.organizationId.
 */
function requireAuth(req) {
    if (!req.user) {
        throw unauthorizedError("Authentication required");
    }
    const effectiveOrganizationId = req.effectiveOrganizationId ?? req.user.organizationId;
    return {
        userId: req.user.id,
        organizationId: req.user.organizationId,
        effectiveOrganizationId,
        role: req.user.role,
    };
}
/**
 * Validate Zod-parseable input, throwing structured AppError on failure.
 */
function parseInput(schema, data, source) {
    try {
        return schema.parse(data);
    }
    catch (err) {
        if (err instanceof ZodError) {
            throw validationError("Invalid " + source, err.issues.map((i) => ({
                path: i.path.join("."),
                message: i.message,
                code: i.code,
            })));
        }
        throw err;
    }
}
/**
 * Validate ObjectId string. Returns a usable string for the service layer.
 */
function validateObjectId(id, field) {
    if (typeof id !== "string" || !mongoose.Types.ObjectId.isValid(id)) {
        throw validationError("Invalid " + field, { field, value: id });
    }
    return id;
}
// ============================================================
// ZOD SCHEMAS
// ============================================================
const refreshBodySchema = z.object({
    pipelineId: z.string().optional(),
    assignedToId: z.string().optional(),
});
const previewBodySchema = z.object({
    pipelineId: z.string().optional(),
    assignedToId: z.string().optional(),
});
const summaryQuerySchema = z.object({
    pipelineId: z.string().optional(),
    assignedToId: z.string().optional(),
});
// ============================================================
// CONTROLLER CLASS
// ============================================================
class IntelligenceController {
    // -----------------------------------------------------------
    // POST /api/intelligence/refresh
    // On-demand orchestrator run. Re-scores all deals, emits alerts,
    // persists scores. Rate-limited at the route layer.
    // -----------------------------------------------------------
    refresh = asyncHandler(async (req, res, _next) => {
        const auth = requireAuth(req);
        const body = parseInput(refreshBodySchema, req.body ?? {}, "refresh body");
        const runInput = {
            organizationId: auth.effectiveOrganizationId,
            actorId: auth.userId,
        };
        if (body.pipelineId) {
            runInput.pipelineId = validateObjectId(body.pipelineId, "pipelineId");
        }
        if (body.assignedToId) {
            runInput.assignedToId = validateObjectId(body.assignedToId, "assignedToId");
        }
        const startedAt = Date.now();
        const result = await intelligenceService.run(runInput);
        const elapsed = Date.now() - startedAt;
        dbLogger.info("Intelligence refresh: " +
            "user=" + auth.userId +
            " org=" + auth.effectiveOrganizationId +
            " dealsProcessed=" + result.meta.dealsProcessed +
            " durationMs=" + elapsed);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: result,
        });
        return;
    });
    // -----------------------------------------------------------
    // POST /api/intelligence/preview
    // Dry-run — runs engines, returns result, does NOT persist or
    // emit alerts. Useful for "what would happen if..." previews.
    // -----------------------------------------------------------
    preview = asyncHandler(async (req, res, _next) => {
        const auth = requireAuth(req);
        const body = parseInput(previewBodySchema, req.body ?? {}, "preview body");
        const previewInput = {
            organizationId: auth.effectiveOrganizationId,
            actorId: auth.userId,
        };
        if (body.pipelineId) {
            previewInput.pipelineId = validateObjectId(body.pipelineId, "pipelineId");
        }
        if (body.assignedToId) {
            previewInput.assignedToId = validateObjectId(body.assignedToId, "assignedToId");
        }
        const result = await intelligenceService.preview(previewInput);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: result,
        });
        return;
    });
    // -----------------------------------------------------------
    // POST /api/intelligence/deals/:dealId/refresh
    // Re-score a single deal on demand. Returns risk result only.
    // -----------------------------------------------------------
    refreshDeal = asyncHandler(async (req, res, _next) => {
        const auth = requireAuth(req);
        const dealId = validateObjectId(req.params.dealId, "dealId");
        const result = await intelligenceService.refreshOneDeal(dealId, auth.effectiveOrganizationId, auth.userId);
        if (!result) {
            throw new AppError("Deal not found or not accessible", HTTP_STATUS.NOT_FOUND, "DEAL_NOT_FOUND");
        }
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: result,
        });
        return;
    });
    // -----------------------------------------------------------
    // GET /api/intelligence/summary
    // Lightweight read — returns the full composed intelligence result
    // by running the orchestrator in preview mode (no writes, no alerts).
    // For latency-sensitive dashboards.
    //
    // Why preview mode for a GET? The orchestrator is fast enough
    // (engines are pure, no per-deal Mongo trips), and the alternative
    // (caching results) introduces staleness without much benefit.
    // -----------------------------------------------------------
    summary = asyncHandler(async (req, res, _next) => {
        const auth = requireAuth(req);
        const query = parseInput(summaryQuerySchema, req.query, "query");
        const previewInput = {
            organizationId: auth.effectiveOrganizationId,
            actorId: auth.userId,
        };
        if (query.pipelineId) {
            previewInput.pipelineId = validateObjectId(query.pipelineId, "pipelineId");
        }
        if (query.assignedToId) {
            previewInput.assignedToId = validateObjectId(query.assignedToId, "assignedToId");
        }
        const result = await intelligenceService.preview(previewInput);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: result,
        });
        return;
    });
    // -----------------------------------------------------------
    // GET /api/intelligence/forecast
    // Returns only the forecast risk subset. Smaller payload.
    // -----------------------------------------------------------
    forecast = asyncHandler(async (req, res, _next) => {
        const auth = requireAuth(req);
        const query = parseInput(summaryQuerySchema, req.query, "query");
        const previewInput = {
            organizationId: auth.effectiveOrganizationId,
            actorId: auth.userId,
        };
        if (query.pipelineId) {
            previewInput.pipelineId = validateObjectId(query.pipelineId, "pipelineId");
        }
        if (query.assignedToId) {
            previewInput.assignedToId = validateObjectId(query.assignedToId, "assignedToId");
        }
        const result = await intelligenceService.preview(previewInput);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                forecast: result.forecast,
                meta: result.meta,
            },
        });
        return;
    });
    // -----------------------------------------------------------
    // GET /api/intelligence/leaks
    // Returns only the pipeline-leak subset.
    // -----------------------------------------------------------
    leaks = asyncHandler(async (req, res, _next) => {
        const auth = requireAuth(req);
        const query = parseInput(summaryQuerySchema, req.query, "query");
        const previewInput = {
            organizationId: auth.effectiveOrganizationId,
            actorId: auth.userId,
        };
        if (query.pipelineId) {
            previewInput.pipelineId = validateObjectId(query.pipelineId, "pipelineId");
        }
        if (query.assignedToId) {
            previewInput.assignedToId = validateObjectId(query.assignedToId, "assignedToId");
        }
        const result = await intelligenceService.preview(previewInput);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                pipelineLeaks: result.pipelineLeaks,
                meta: result.meta,
            },
        });
        return;
    });
    // -----------------------------------------------------------
    // GET /api/intelligence/actions
    // Returns only the revenue-decision actions. Dashboard "Today's
    // Top Actions" hero widget calls this directly.
    // -----------------------------------------------------------
    actions = asyncHandler(async (req, res, _next) => {
        const auth = requireAuth(req);
        const query = parseInput(summaryQuerySchema, req.query, "query");
        const previewInput = {
            organizationId: auth.effectiveOrganizationId,
            actorId: auth.userId,
        };
        if (query.pipelineId) {
            previewInput.pipelineId = validateObjectId(query.pipelineId, "pipelineId");
        }
        if (query.assignedToId) {
            previewInput.assignedToId = validateObjectId(query.assignedToId, "assignedToId");
        }
        const result = await intelligenceService.preview(previewInput);
        res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                actions: result.actions,
                attentionAlerts: result.attentionAlerts,
                meta: result.meta,
            },
        });
        return;
    });
}
// ============================================================
// EXPORTS
// ============================================================
const intelligenceController = new IntelligenceController();
export default intelligenceController;
//# sourceMappingURL=intelligence.controller.js.map