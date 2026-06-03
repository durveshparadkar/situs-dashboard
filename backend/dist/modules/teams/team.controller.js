import mongoose from "mongoose";
import { z } from "zod";
import teamService from "./team.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { logAudit } from "../../shared/audits/audit.logger.js";
import { AuditAction, AuditResource, } from "../audit/audit.model.js";
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
const TEAM_CONFIG = {
    pagination: {
        defaultLimit: 50,
        maxLimit: 200,
    },
    caps: {
        name: 100,
        description: 500,
        maxMembers: 500, // hard ceiling per team
        bulkMembers: 100, // max members to add/remove in one bulk call
    },
    privilegedRoles: ["ORG_ADMIN", "SUPER_ADMIN", "MANAGER"],
    superAdminRoles: ["SUPER_ADMIN", "ORG_ADMIN"],
};
/* =====================================================
   ALLOWLISTS
===================================================== */
/* The narrower set the team service expects */
const SERVICE_ROLES = [
    "SUPER_ADMIN",
    "ORG_ADMIN",
    "MANAGER",
    "AGENT",
    "USER",
];
function toServiceRole(role) {
    return SERVICE_ROLES.includes(role)
        ? role
        : "USER";
}
/* =====================================================
   ZOD SCHEMAS
===================================================== */
const objectIdSchema = z
    .string()
    .refine((v) => mongoose.Types.ObjectId.isValid(v), {
    message: "Invalid ObjectId format",
});
const createTeamSchema = z
    .object({
    name: z.string().trim().min(1, "Name required").max(TEAM_CONFIG.caps.name),
    description: z.string().trim().max(TEAM_CONFIG.caps.description).optional(),
    members: z.array(objectIdSchema).max(TEAM_CONFIG.caps.maxMembers).optional(),
    managerId: objectIdSchema.optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be hex color").optional(),
})
    .strict();
const updateTeamSchema = z
    .object({
    name: z.string().trim().min(1).max(TEAM_CONFIG.caps.name).optional(),
    description: z.string().trim().max(TEAM_CONFIG.caps.description).optional(),
    managerId: objectIdSchema.optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});
const memberActionSchema = z
    .object({
    userId: objectIdSchema,
})
    .strict();
const bulkMembersSchema = z
    .object({
    userIds: z
        .array(objectIdSchema)
        .min(1, "At least one userId required")
        .max(TEAM_CONFIG.caps.bulkMembers),
})
    .strict();
const listQuerySchema = z
    .object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    sort: z.string().optional(),
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
 * Build the service-input shape that teamService methods expect.
 * Centralizes the (legacy) { _id, role, organizationId } field naming
 * so the service can be migrated independently of the controller.
 */
function buildServiceUser(actor) {
    return {
        _id: actor.userId,
        role: toServiceRole(actor.role),
        organizationId: actor.organizationId,
    };
}
/**
 * Validate and extract a Mongo ObjectId from req params.
 */
function requireObjectId(req, paramName = "id") {
    const id = req.params[paramName];
    if (!id || !id.trim()) {
        throw new AppError(`${paramName} is required`, HttpStatus.BAD_REQUEST, "MISSING_ID");
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
/* =====================================================
   CONTROLLER
===================================================== */
class TeamController {
    /* =====================================================
       POST /teams — create a new team
    ===================================================== */
    create = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, TEAM_CONFIG.privilegedRoles);
        const validated = runSchema(createTeamSchema, req.body);
        /* Build input with conditional spreads (exactOptionalPropertyTypes safe) */
        const input = {
            name: validated.name,
            ...(validated.description !== undefined && { description: validated.description }),
            ...(validated.members !== undefined && { members: validated.members }),
            ...(validated.managerId !== undefined && { managerId: validated.managerId }),
            ...(validated.color !== undefined && { color: validated.color }),
        };
        const team = await teamService.create(input, buildServiceUser(actor));
        if (!team) {
            throw new AppError("Team creation failed", HttpStatus.INTERNAL, "TEAM_CREATE_FAILED");
        }
        /* Audit log — non-fatal */
        try {
            await logAudit({
                organizationId: actor.organizationId,
                actorId: actor.userId,
                action: AuditAction.CREATE,
                resource: AuditResource.TEAM,
                resourceId: team._id.toString(),
                req,
            });
        }
        catch (err) {
            dbLogger.warn(`Audit log failed (non-fatal): team create ` +
                `error=${err?.message ?? "unknown"}`);
        }
        dbLogger.info(`Team created: org=${actor.organizationId} name=${validated.name} ` +
            `members=${validated.members?.length ?? 0} actor=${actor.userId}`);
        res.status(HttpStatus.CREATED).json({
            success: true,
            data: team,
            message: "Team created",
        });
    });
    /* =====================================================
       GET /teams — list teams with pagination + search
    ===================================================== */
    getAll = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const validated = runSchema(listQuerySchema, req.query);
        const page = getNumber(validated.page, 1, { min: 1, max: 10_000 });
        const limit = getNumber(validated.limit, TEAM_CONFIG.pagination.defaultLimit, { min: 1, max: TEAM_CONFIG.pagination.maxLimit });
        const search = validated.search?.trim().slice(0, 200);
        /* Service may have a simple getAll(user) or paginated signature —
           cast supports both shapes without breaking back-compat. */
        const svc = teamService;
        const result = await svc.getAll(buildServiceUser(actor), {
            page,
            limit,
            ...(search && { search }),
        });
        /* Support both response shapes: array or { teams, total } */
        const items = Array.isArray(result)
            ? result
            : result?.teams
                ?? result?.data
                ?? [];
        const total = Array.isArray(result)
            ? result.length
            : result?.total ?? items.length;
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
       GET /teams/:id — single team lookup
    ===================================================== */
    getOne = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const id = requireObjectId(req);
        const team = await teamService.getById(id, buildServiceUser(actor));
        if (!team) {
            throw new AppError("Team not found", HttpStatus.NOT_FOUND, "TEAM_NOT_FOUND");
        }
        res.status(HttpStatus.OK).json({
            success: true,
            data: team,
        });
    });
    /* =====================================================
       PATCH /teams/:id — update team metadata
    ===================================================== */
    update = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, TEAM_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        const validated = runSchema(updateTeamSchema, req.body);
        /* Build update with conditional spreads */
        const update = {
            ...(validated.name !== undefined && { name: validated.name }),
            ...(validated.description !== undefined && { description: validated.description }),
            ...(validated.managerId !== undefined && { managerId: validated.managerId }),
            ...(validated.color !== undefined && { color: validated.color }),
            updatedBy: actor.userId,
        };
        const team = await teamService.update(id, update, buildServiceUser(actor));
        if (!team) {
            throw new AppError("Team not found", HttpStatus.NOT_FOUND, "TEAM_NOT_FOUND");
        }
        /* Audit log — non-fatal */
        try {
            await logAudit({
                organizationId: actor.organizationId,
                actorId: actor.userId,
                action: AuditAction.UPDATE,
                resource: AuditResource.TEAM,
                resourceId: id,
                meta: { fields: Object.keys(update) },
                req,
            });
        }
        catch (err) {
            dbLogger.warn(`Audit log failed (non-fatal): team update id=${id} ` +
                `error=${err?.message ?? "unknown"}`);
        }
        dbLogger.info(`Team updated: id=${id} org=${actor.organizationId} ` +
            `fields=${Object.keys(update).join(",")} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: team,
            message: "Team updated",
        });
    });
    /* =====================================================
       DELETE /teams/:id — soft delete a team
    ===================================================== */
    remove = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, TEAM_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        await teamService.remove(id, buildServiceUser(actor));
        /* Audit log — non-fatal */
        try {
            await logAudit({
                organizationId: actor.organizationId,
                actorId: actor.userId,
                action: AuditAction.DELETE,
                resource: AuditResource.TEAM,
                resourceId: id,
                req,
            });
        }
        catch (err) {
            dbLogger.warn(`Audit log failed (non-fatal): team delete id=${id} ` +
                `error=${err?.message ?? "unknown"}`);
        }
        dbLogger.warn(`Team deleted: id=${id} org=${actor.organizationId} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            message: "Team deleted",
        });
    });
    /* =====================================================
       POST /teams/:id/members — add a single member
    ===================================================== */
    addMember = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, TEAM_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        const { userId } = runSchema(memberActionSchema, req.body);
        const team = await teamService.addMember(id, userId, buildServiceUser(actor));
        if (!team) {
            throw new AppError("Team not found", HttpStatus.NOT_FOUND, "TEAM_NOT_FOUND");
        }
        dbLogger.info(`Team member added: team=${id} user=${userId} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: team,
            message: "Member added",
        });
    });
    /* =====================================================
       DELETE /teams/:id/members/:userId — remove a single member
    ===================================================== */
    removeMember = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, TEAM_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        /* Support both: userId in URL (REST style) or body (legacy) */
        const userIdParam = req.params.userId;
        const userId = userIdParam && mongoose.Types.ObjectId.isValid(userIdParam)
            ? userIdParam
            : runSchema(memberActionSchema, req.body).userId;
        /* Prevent self-removal by accident — must be intentional */
        if (userId === actor.userId && req.body?.confirmSelfRemoval !== true) {
            throw new AppError("Removing yourself requires { confirmSelfRemoval: true } in body", HttpStatus.BAD_REQUEST, "CONFIRM_REQUIRED");
        }
        const team = await teamService.removeMember(id, userId, buildServiceUser(actor));
        if (!team) {
            throw new AppError("Team not found", HttpStatus.NOT_FOUND, "TEAM_NOT_FOUND");
        }
        dbLogger.info(`Team member removed: team=${id} user=${userId} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: team,
            message: "Member removed",
        });
    });
    /* =====================================================
       POST /teams/:id/members/bulk-add — add multiple members at once
    ===================================================== */
    bulkAddMembers = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, TEAM_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        const { userIds } = runSchema(bulkMembersSchema, req.body);
        const svc = teamService;
        let result;
        if (typeof svc.bulkAddMembers === "function") {
            result = await svc.bulkAddMembers(id, userIds, buildServiceUser(actor));
        }
        else {
            /* Fallback: parallel addMember with allSettled — partial failures OK */
            const settled = await Promise.allSettled(userIds.map((uid) => svc.addMember(id, uid, buildServiceUser(actor))));
            result = {
                added: settled.filter((r) => r.status === "fulfilled").length,
                failed: settled.filter((r) => r.status === "rejected").length,
            };
        }
        dbLogger.info(`Team bulk add: team=${id} requested=${userIds.length} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: result,
            message: `Bulk member add: ${userIds.length} processed`,
        });
    });
    /* =====================================================
       GET /teams/:id/members — list members of a team
    ===================================================== */
    getMembers = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const id = requireObjectId(req);
        const svc = teamService;
        if (typeof svc.getMembers !== "function") {
            throw new AppError("Member listing not available", HttpStatus.NOT_FOUND, "NOT_AVAILABLE");
        }
        const members = await svc.getMembers(id, buildServiceUser(actor));
        res.status(HttpStatus.OK).json({
            success: true,
            data: members,
        });
    });
    /* =====================================================
       POST /teams/:id/transfer-manager — change team manager
    ===================================================== */
    transferManager = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, TEAM_CONFIG.superAdminRoles);
        const id = requireObjectId(req);
        const newManagerId = typeof req.body?.newManagerId === "string" ? req.body.newManagerId : "";
        if (!newManagerId || !mongoose.Types.ObjectId.isValid(newManagerId)) {
            throw new AppError("Valid newManagerId is required", HttpStatus.BAD_REQUEST, "INVALID_MANAGER_ID");
        }
        const svc = teamService;
        let result;
        if (typeof svc.transferManager === "function") {
            result = await svc.transferManager(id, newManagerId, buildServiceUser(actor));
        }
        else {
            /* Fallback: standard update */
            result = await svc.update(id, { managerId: newManagerId }, buildServiceUser(actor));
        }
        if (!result) {
            throw new AppError("Team not found", HttpStatus.NOT_FOUND, "TEAM_NOT_FOUND");
        }
        /* Audit log — security-critical */
        try {
            await logAudit({
                organizationId: actor.organizationId,
                actorId: actor.userId,
                action: AuditAction.UPDATE,
                resource: AuditResource.TEAM,
                resourceId: id,
                meta: { event: "MANAGER_TRANSFERRED", newManagerId },
                req,
            });
        }
        catch (err) {
            dbLogger.warn(`Audit log failed (non-fatal): team manager transfer id=${id} ` +
                `error=${err?.message ?? "unknown"}`);
        }
        dbLogger.warn(`Team manager transferred: team=${id} newManager=${newManagerId} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: result,
            message: "Team manager transferred",
        });
    });
}
export default new TeamController();
//# sourceMappingURL=team.controller.js.map