import mongoose from "mongoose";
import leadService from "./lead.service.js";
import { createLeadSchema, updateLeadSchema, } from "./lead.schema.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { dbLogger } from "../../utils/logger.js";
/* =====================================================
   ERRORS
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
/* =====================================================
   HTTP STATUS
===================================================== */
const HttpStatus = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE: 422,
    INTERNAL: 500,
};
/* =====================================================
   ALLOWLISTS — for query-param validation
===================================================== */
const VALID_SORT_FIELDS = [
    "createdAt",
    "updatedAt",
    "name",
    "score",
    "lastActivityAt",
    "stageEnteredAt",
];
const VALID_SORT_ORDERS = ["asc", "desc"];
const VALID_STAGES_FILTER = [
    "new",
    "contacted",
    "qualified",
    "proposal",
    "negotiation",
    "won",
    "lost",
    "nurture",
];
/* =====================================================
   HELPERS
===================================================== */
/**
 * Extract the authenticated user, normalize id fields, and validate role.
 * Reads from the globally-augmented req.user (express.d.ts) and returns
 * a strict, lead-specific user shape.
 */
function getCurrentUser(req) {
    const u = req.user;
    if (!u) {
        throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }
    /* Global type allows _id to be ObjectId | string — normalize to string */
    const idStr = (typeof u.id === "string" && u.id) ||
        (u._id ? u._id.toString() : "");
    const orgIdStr = typeof u.organizationId === "string"
        ? u.organizationId
        : String(u.organizationId ?? "");
    if (!idStr || !orgIdStr) {
        throw new AppError("Authenticated user missing identity fields", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const systemRole = String(u.role ?? "AGENT").trim().toUpperCase();
    const roleMap = {
        ORG_ADMIN: "org_admin",
        SUPER_ADMIN: "org_admin",
        MANAGER: "manager",
        AGENT: "agent",
        USER: "agent",
    };
    const role = roleMap[systemRole];
    if (!role) {
        throw new AppError("Invalid user role for lead operations", HttpStatus.FORBIDDEN, "INVALID_ROLE");
    }
    return {
        id: idStr,
        _id: idStr,
        organizationId: orgIdStr,
        role,
    };
}
/**
 * Safely extract a single string param. Express types params as
 * string|string[], so this normalizes and validates ObjectId format
 * for endpoints that expect Mongo IDs.
 */
function getId(value, opts = {}) {
    if (typeof value !== "string" || !value.trim()) {
        throw new AppError("Invalid or missing ID", HttpStatus.BAD_REQUEST, "INVALID_ID");
    }
    if (opts.mongoId && !mongoose.Types.ObjectId.isValid(value)) {
        throw new AppError("Invalid Mongo ObjectId format", HttpStatus.BAD_REQUEST, "INVALID_ID");
    }
    return value;
}
function paramAsString(value) {
    if (typeof value === "string" && value.length > 0)
        return value;
    return undefined;
}
function getNumber(value, fallback, opts = {}) {
    let n;
    if (typeof value === "string") {
        n = Number(value);
        if (!Number.isFinite(n))
            n = fallback;
    }
    else if (typeof value === "number" && Number.isFinite(value)) {
        n = value;
    }
    else {
        n = fallback;
    }
    if (opts.min !== undefined)
        n = Math.max(n, opts.min);
    if (opts.max !== undefined)
        n = Math.min(n, opts.max);
    return n;
}
function getEnumParam(value, allowed, fallback) {
    if (typeof value !== "string")
        return fallback;
    const v = value.trim().toLowerCase();
    return allowed.includes(v)
        ? v
        : fallback;
}
function getDateParam(value) {
    if (!value)
        return undefined;
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? undefined : d;
}
function clampString(value, max) {
    if (typeof value !== "string")
        return "";
    return value.trim().slice(0, max);
}
/* =====================================================
   LEAD CONTROLLER
===================================================== */
class LeadController {
    /* =====================================================
       POST /leads
    ===================================================== */
    create = asyncHandler(async (req, res, _next) => {
        const user = getCurrentUser(req);
        const parsed = createLeadSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new AppError("Validation failed", HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", parsed.error.issues.map((e) => ({
                field: e.path.join("."),
                message: e.message,
            })));
        }
        const lead = await leadService.create(parsed.data, user);
        const newId = lead?._id ?? "unknown";
        dbLogger.info(`Lead created: org=${user.organizationId} user=${user.id} id=${String(newId)}`);
        res.status(HttpStatus.CREATED).json({
            success: true,
            data: lead,
            message: "Lead created",
        });
    });
    /* =====================================================
       GET /leads
    ===================================================== */
    findAll = asyncHandler(async (req, res, _next) => {
        const user = getCurrentUser(req);
        /* Pagination */
        const page = getNumber(req.query.page, 1, { min: 1, max: 10_000 });
        const limit = getNumber(req.query.limit, 20, { min: 1, max: 100 });
        /* Search — capped to prevent regex-engine abuse downstream */
        const search = clampString(req.query.search, 200);
        /* Filters */
        const stage = getEnumParam(req.query.stage, VALID_STAGES_FILTER);
        const ownerId = paramAsString(req.query.ownerId);
        const minScore = req.query.minScore !== undefined
            ? getNumber(req.query.minScore, 0, { min: 0, max: 100 })
            : undefined;
        const createdAfter = getDateParam(req.query.createdAfter);
        const createdBefore = getDateParam(req.query.createdBefore);
        /* Sort */
        const sortBy = getEnumParam(req.query.sortBy, VALID_SORT_FIELDS, "createdAt") ??
            "createdAt";
        const sortOrder = getEnumParam(req.query.sortOrder, VALID_SORT_ORDERS, "desc") ??
            "desc";
        /* Build filters with conditional spreads (exactOptionalPropertyTypes) */
        const filters = {
            page,
            limit,
            sortBy,
            sortOrder,
            ...(search && { search }),
            ...(stage && { stage }),
            ...(ownerId && { ownerId }),
            ...(minScore !== undefined && { minScore }),
            ...(createdAfter && { createdAfter }),
            ...(createdBefore && { createdBefore }),
        };
        const result = await leadService.findAll(filters, user);
        res.status(HttpStatus.OK).json({
            success: true,
            ...result,
        });
    });
    /* =====================================================
       GET /leads/:id
    ===================================================== */
    findOne = asyncHandler(async (req, res, _next) => {
        const user = getCurrentUser(req);
        const id = getId(req.params.id, { mongoId: true });
        const lead = await leadService.findOne(id, user);
        if (!lead) {
            throw new AppError("Lead not found", HttpStatus.NOT_FOUND, "LEAD_NOT_FOUND");
        }
        res.status(HttpStatus.OK).json({
            success: true,
            data: lead,
        });
    });
    /* =====================================================
       PATCH /leads/:id
    ===================================================== */
    update = asyncHandler(async (req, res, _next) => {
        const user = getCurrentUser(req);
        const id = getId(req.params.id, { mongoId: true });
        const parsed = updateLeadSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new AppError("Validation failed", HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", parsed.error.issues.map((e) => ({
                field: e.path.join("."),
                message: e.message,
            })));
        }
        if (Object.keys(parsed.data).length === 0) {
            throw new AppError("No fields to update", HttpStatus.BAD_REQUEST, "EMPTY_UPDATE");
        }
        const lead = await leadService.update(id, parsed.data, user);
        if (!lead) {
            throw new AppError("Lead not found", HttpStatus.NOT_FOUND, "LEAD_NOT_FOUND");
        }
        dbLogger.info(`Lead updated: org=${user.organizationId} id=${id} ` +
            `user=${user.id} fields=${Object.keys(parsed.data).join(",")}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: lead,
            message: "Lead updated",
        });
    });
    /* =====================================================
       POST /leads/:id/stage
    ===================================================== */
    updateStage = asyncHandler(async (req, res, _next) => {
        const user = getCurrentUser(req);
        const id = getId(req.params.id, { mongoId: true });
        const stageName = clampString(req.body?.stageName, 100);
        if (!stageName) {
            throw new AppError("stageName is required", HttpStatus.BAD_REQUEST, "MISSING_STAGE_NAME");
        }
        const reason = clampString(req.body?.reason, 500) || undefined;
        const lead = await leadService.updateStage(id, stageName, user);
        if (!lead) {
            throw new AppError("Lead not found", HttpStatus.NOT_FOUND, "LEAD_NOT_FOUND");
        }
        dbLogger.info(`Lead stage changed: org=${user.organizationId} id=${id} ` +
            `user=${user.id} stage="${stageName}" reason=${reason ?? "none"}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: lead,
            message: `Stage updated to ${stageName}`,
        });
    });
    /* =====================================================
       POST /leads/:id/archive
    ===================================================== */
    archive = asyncHandler(async (req, res, _next) => {
        const user = getCurrentUser(req);
        const id = getId(req.params.id, { mongoId: true });
        const lead = await leadService.archive(id, user);
        if (!lead) {
            throw new AppError("Lead not found", HttpStatus.NOT_FOUND, "LEAD_NOT_FOUND");
        }
        dbLogger.warn(`Lead archived: org=${user.organizationId} id=${id} user=${user.id}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: lead,
            message: "Lead archived",
        });
    });
    /* =====================================================
       POST /leads/:id/restore
    ===================================================== */
    restore = asyncHandler(async (req, res, _next) => {
        const user = getCurrentUser(req);
        const id = getId(req.params.id, { mongoId: true });
        const lead = await leadService.restore(id, user);
        if (!lead) {
            throw new AppError("Lead not found or not archived", HttpStatus.NOT_FOUND, "LEAD_NOT_FOUND");
        }
        dbLogger.info(`Lead restored: org=${user.organizationId} id=${id} user=${user.id}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: lead,
            message: "Lead restored",
        });
    });
    /* =====================================================
       GET /leads/:id/activities
    ===================================================== */
    getActivities = asyncHandler(async (req, res, _next) => {
        const user = getCurrentUser(req);
        const id = getId(req.params.id, { mongoId: true });
        const limit = getNumber(req.query.limit, 50, { min: 1, max: 500 });
        const cursor = paramAsString(req.query.cursor);
        const svc = leadService;
        const activities = await svc.getActivities(id, user, {
            limit,
            ...(cursor && { cursor }),
        });
        res.status(HttpStatus.OK).json({
            success: true,
            data: activities,
            meta: { count: Array.isArray(activities) ? activities.length : 0 },
        });
    });
    /* =====================================================
       GET /leads/intelligence-summary
    ===================================================== */
    getIntelligenceSummary = asyncHandler(async (req, res, _next) => {
        const user = getCurrentUser(req);
        const summary = await leadService.getIntelligenceSummary(user);
        res.status(HttpStatus.OK).json({
            success: true,
            data: summary,
            meta: { generatedAt: new Date().toISOString() },
        });
    });
    /* =====================================================
       POST /leads/bulk
    ===================================================== */
    bulkCreate = asyncHandler(async (req, res, _next) => {
        const user = getCurrentUser(req);
        const items = req.body?.leads;
        if (!Array.isArray(items) || items.length === 0) {
            throw new AppError("Request body must contain a non-empty 'leads' array", HttpStatus.BAD_REQUEST, "INVALID_PAYLOAD");
        }
        if (items.length > 1000) {
            throw new AppError("Cannot bulk-create more than 1000 leads at once", HttpStatus.BAD_REQUEST, "TOO_MANY_LEADS");
        }
        /* Validate every lead before any DB write */
        const validated = items.map((item, idx) => {
            const result = createLeadSchema.safeParse(item);
            if (!result.success) {
                throw new AppError(`Validation failed at index ${idx}`, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", result.error.issues.map((e) => ({
                    field: `leads[${idx}].${e.path.join(".")}`,
                    message: e.message,
                })));
            }
            return result.data;
        });
        /* Service may not implement bulkCreate yet — fall back gracefully */
        const svc = leadService;
        let result;
        if (svc.bulkCreate) {
            result = await svc.bulkCreate(validated, user);
        }
        else {
            const settled = await Promise.allSettled(validated.map((d) => leadService.create(d, user)));
            result = {
                created: settled.filter((r) => r.status === "fulfilled").length,
                failed: settled.filter((r) => r.status === "rejected").length,
            };
        }
        dbLogger.info(`Bulk leads: org=${user.organizationId} user=${user.id} ` +
            `total=${validated.length} created=${result.created} failed=${result.failed}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: result,
            message: "Bulk leads processed",
        });
    });
    /* =====================================================
       POST /leads/:id/assign
    ===================================================== */
    assign = asyncHandler(async (req, res, _next) => {
        const user = getCurrentUser(req);
        if (user.role === "agent") {
            throw new AppError("Agents cannot reassign leads", HttpStatus.FORBIDDEN, "FORBIDDEN");
        }
        const id = getId(req.params.id, { mongoId: true });
        const newOwnerId = getId(req.body?.ownerId, { mongoId: true });
        const svc = leadService;
        if (!svc.assign) {
            throw new AppError("Lead reassignment not available", HttpStatus.UNPROCESSABLE, "NOT_IMPLEMENTED");
        }
        const lead = await svc.assign(id, newOwnerId, user);
        if (!lead) {
            throw new AppError("Lead not found", HttpStatus.NOT_FOUND, "LEAD_NOT_FOUND");
        }
        dbLogger.info(`Lead reassigned: org=${user.organizationId} id=${id} ` +
            `from=${user.id} to=${newOwnerId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: lead,
            message: "Lead reassigned",
        });
    });
}
export default new LeadController();
//# sourceMappingURL=lead.controller.js.map