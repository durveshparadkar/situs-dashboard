import mongoose from "mongoose";
import { z } from "zod";
import * as pipelineService from "./pipeline.service.js";
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
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL: 500,
};
/* =====================================================
   CONFIG
===================================================== */
const PIPELINE_CONFIG = {
    pagination: {
        defaultPage: 1,
        defaultLimit: 10,
        maxLimit: 100,
    },
    caps: {
        name: 100,
        stageName: 50,
        stageCount: 50, // hard ceiling — most CRMs cap at 10–20
        maxProbability: 100,
    },
    privilegedRoles: ["ORG_ADMIN", "SUPER_ADMIN", "MANAGER"],
};
/* =====================================================
   ZOD SCHEMAS
===================================================== */
/* Standard pipeline stage shape — same in create and update */
const stageSchema = z
    .object({
    name: z.string().trim().min(1, "Stage name required").max(PIPELINE_CONFIG.caps.stageName),
    probability: z.number().int().min(0).max(PIPELINE_CONFIG.caps.maxProbability).optional(),
    order: z.number().int().min(0).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be hex color").optional(),
    isWon: z.boolean().optional(),
    isLost: z.boolean().optional(),
})
    .strict();
const createPipelineSchema = z
    .object({
    name: z.string().trim().min(1, "Name required").max(PIPELINE_CONFIG.caps.name),
    isDefault: z.boolean().optional().default(false),
    stages: z
        .array(stageSchema)
        .min(1, "At least one stage is required")
        .max(PIPELINE_CONFIG.caps.stageCount, `Cannot exceed ${PIPELINE_CONFIG.caps.stageCount} stages`),
})
    .strict();
const updatePipelineSchema = z
    .object({
    name: z.string().trim().min(1).max(PIPELINE_CONFIG.caps.name).optional(),
    isDefault: z.boolean().optional(),
    stages: z
        .array(stageSchema)
        .min(1)
        .max(PIPELINE_CONFIG.caps.stageCount)
        .optional(),
})
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});
const listQuerySchema = z
    .object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
})
    .strict();
/**
 * Extract & validate the authenticated user. Reads from globally-augmented
 * req.user (via express.d.ts) and normalizes _id to a string.
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
function requireRole(actor, allowed) {
    if (!allowed.includes(actor.role)) {
        throw new AppError("This action requires manager-level access", HttpStatus.FORBIDDEN, "FORBIDDEN");
    }
}
/**
 * Validate and extract a Mongo ObjectId from req params.
 */
function requireObjectId(req, paramName = "id") {
    const id = req.params[paramName];
    if (!id || !id.trim()) {
        throw new AppError(` ${paramName} is required`, HttpStatus.BAD_REQUEST, "MISSING_ID");
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new AppError(`Invalid ${paramName} format`, HttpStatus.BAD_REQUEST, "INVALID_ID");
    }
    return id;
}
function runSchema(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        throw new ValidationError(result.error.issues.map((e) => ({
            field: e.path.length ? e.path.join(".") : "(root)",
            message: e.message,
        })));
    }
    return result.data;
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
/**
 * Validate stages array for business logic that Zod can't express:
 * - At most one stage with isWon=true
 * - At most one stage with isLost=true
 * - Stages can't be both isWon and isLost
 *
 * Accepts a loose readonly shape so both create and update validated outputs
 * (which differ slightly under exactOptionalPropertyTypes) can be passed in.
 */
function validateStageBusinessRules(stages) {
    let wonCount = 0;
    let lostCount = 0;
    for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        if (stage === undefined)
            continue;
        if (stage.isWon && stage.isLost) {
            throw new AppError(`Stage at index ${i} cannot be both won and lost`, HttpStatus.BAD_REQUEST, "INVALID_STAGE");
        }
        if (stage.isWon)
            wonCount++;
        if (stage.isLost)
            lostCount++;
    }
    if (wonCount > 1) {
        throw new AppError("A pipeline can have at most one 'won' stage", HttpStatus.BAD_REQUEST, "MULTIPLE_WON_STAGES");
    }
    if (lostCount > 1) {
        throw new AppError("A pipeline can have at most one 'lost' stage", HttpStatus.BAD_REQUEST, "MULTIPLE_LOST_STAGES");
    }
}
/* =====================================================
   CONTROLLER
===================================================== */
class PipelineController {
    /* =====================================================
       POST /pipelines — create a new pipeline
    ===================================================== */
    create = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, PIPELINE_CONFIG.privilegedRoles);
        const validated = runSchema(createPipelineSchema, req.body);
        validateStageBusinessRules(validated.stages);
        const svc = pipelineService;
        const pipeline = await svc.createPipeline({
            name: validated.name,
            isDefault: validated.isDefault,
            organizationId: actor.organizationId,
            stages: validated.stages,
            createdBy: actor.userId,
        });
        dbLogger.info(`Pipeline created: org=${actor.organizationId} ` +
            `name=${validated.name} stages=${validated.stages.length} ` +
            `default=${validated.isDefault} actor=${actor.userId}`);
        res.status(HttpStatus.CREATED).json({
            success: true,
            data: pipeline,
            message: "Pipeline created",
        });
    });
    /* =====================================================
       GET /pipelines — list with pagination + search
    ===================================================== */
    getAll = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const validated = runSchema(listQuerySchema, req.query);
        const page = getNumber(validated.page, PIPELINE_CONFIG.pagination.defaultPage, {
            min: 1,
            max: 10_000,
        });
        const limit = getNumber(validated.limit, PIPELINE_CONFIG.pagination.defaultLimit, { min: 1, max: PIPELINE_CONFIG.pagination.maxLimit });
        const search = validated.search?.trim().slice(0, 200);
        const svc = pipelineService;
        const result = await svc.getPipelinesByOrganization(actor.organizationId, page, limit, ...(search ? [{ search }] : []));
        /* Support both response shapes — { data, total } and { pipelines, total } */
        const items = result.data ?? result.pipelines ?? [];
        const total = result.total ?? items.length;
        const totalPages = Math.ceil(total / limit);
        res.status(HttpStatus.OK).json({
            success: true,
            data: items,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        });
    });
    /* =====================================================
       GET /pipelines/default — fetch the org's default pipeline
    ===================================================== */
    getDefault = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const pipeline = await pipelineService.getDefaultPipeline(actor.organizationId);
        if (!pipeline) {
            throw new AppError("No default pipeline configured for this organization", HttpStatus.NOT_FOUND, "DEFAULT_PIPELINE_NOT_FOUND");
        }
        res.status(HttpStatus.OK).json({
            success: true,
            data: pipeline,
        });
    });
    /* =====================================================
       GET /pipelines/:id — single pipeline lookup
    ===================================================== */
    getById = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const id = requireObjectId(req);
        const svc = pipelineService;
        if (typeof svc.getPipelineById !== "function") {
            throw new AppError("Get-by-id not available", HttpStatus.NOT_FOUND, "NOT_AVAILABLE");
        }
        const pipeline = await svc.getPipelineById(id, actor.organizationId);
        if (!pipeline) {
            throw new AppError("Pipeline not found", HttpStatus.NOT_FOUND, "PIPELINE_NOT_FOUND");
        }
        res.status(HttpStatus.OK).json({
            success: true,
            data: pipeline,
        });
    });
    /* =====================================================
       PATCH /pipelines/:id — update name/stages/default flag
    ===================================================== */
    update = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, PIPELINE_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        const validated = runSchema(updatePipelineSchema, req.body);
        if (validated.stages) {
            validateStageBusinessRules(validated.stages);
        }
        /* Build update object with conditional spreads (exactOptionalPropertyTypes) */
        const updateInput = {
            ...(validated.name !== undefined && { name: validated.name }),
            ...(validated.isDefault !== undefined && { isDefault: validated.isDefault }),
            ...(validated.stages !== undefined && { stages: validated.stages }),
            updatedBy: actor.userId,
        };
        const updated = await pipelineService.updatePipeline(id, updateInput, actor.organizationId);
        if (!updated) {
            throw new AppError("Pipeline not found", HttpStatus.NOT_FOUND, "PIPELINE_NOT_FOUND");
        }
        dbLogger.info(`Pipeline updated: id=${id} org=${actor.organizationId} ` +
            `fields=${Object.keys(updateInput).join(",")} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: updated,
            message: "Pipeline updated",
        });
    });
    /* =====================================================
       DELETE /pipelines/:id — remove a pipeline
    ===================================================== */
    remove = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, PIPELINE_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        /* Prevent deletion of the default pipeline — orgs always need one */
        const svc = pipelineService;
        if (typeof svc.getPipelineById === "function") {
            const existing = await svc.getPipelineById(id, actor.organizationId);
            if (!existing) {
                throw new AppError("Pipeline not found", HttpStatus.NOT_FOUND, "PIPELINE_NOT_FOUND");
            }
            if (existing.isDefault) {
                throw new AppError("Cannot delete the default pipeline. Set another pipeline as default first.", HttpStatus.CONFLICT, "CANNOT_DELETE_DEFAULT");
            }
        }
        await svc.deletePipeline(id, actor.organizationId);
        dbLogger.warn(`Pipeline deleted: id=${id} org=${actor.organizationId} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            message: "Pipeline deleted",
        });
    });
    /* =====================================================
       POST /pipelines/:id/set-default — promote to default
    ===================================================== */
    setDefault = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, PIPELINE_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        const svc = pipelineService;
        let result;
        if (typeof svc.setDefaultPipeline === "function") {
            result = await svc.setDefaultPipeline(id, actor.organizationId, actor.userId);
        }
        else {
            /* Fallback: standard update — service should also unset other defaults */
            result = await svc.updatePipeline(id, { isDefault: true }, actor.organizationId);
        }
        if (!result) {
            throw new AppError("Pipeline not found", HttpStatus.NOT_FOUND, "PIPELINE_NOT_FOUND");
        }
        dbLogger.info(`Pipeline set as default: id=${id} org=${actor.organizationId} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: result,
            message: "Pipeline set as default",
        });
    });
    /* =====================================================
       POST /pipelines/:id/duplicate — clone an existing pipeline
    ===================================================== */
    duplicate = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, PIPELINE_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        const newName = typeof req.body?.name === "string" && req.body.name.trim().length > 0
            ? req.body.name.trim().slice(0, PIPELINE_CONFIG.caps.name)
            : undefined;
        const svc = pipelineService;
        if (typeof svc.duplicatePipeline !== "function") {
            throw new AppError("Duplicate not available", HttpStatus.NOT_FOUND, "NOT_AVAILABLE");
        }
        const cloned = await svc.duplicatePipeline(id, actor.organizationId, {
            ...(newName && { newName }),
            actorId: actor.userId,
        });
        if (!cloned) {
            throw new AppError("Pipeline not found", HttpStatus.NOT_FOUND, "PIPELINE_NOT_FOUND");
        }
        dbLogger.info(`Pipeline duplicated: source=${id} org=${actor.organizationId} actor=${actor.userId}`);
        res.status(HttpStatus.CREATED).json({
            success: true,
            data: cloned,
            message: "Pipeline duplicated",
        });
    });
}
export default new PipelineController();
//# sourceMappingURL=pipeline.controller.js.map