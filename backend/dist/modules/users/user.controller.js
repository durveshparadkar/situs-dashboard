import mongoose from "mongoose";
import { z } from "zod";
import userService from "./user.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { dbLogger } from "../../utils/logger.js";
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
const USER_CONFIG = {
    pagination: {
        defaultLimit: 50,
        maxLimit: 200,
    },
    caps: {
        email: 254, // RFC 5321 max
        name: 100,
        bulkInvites: 100,
    },
    password: {
        minLength: 8, // bumped from 6 — modern baseline
        maxLength: 128,
    },
    privilegedRoles: ["ORG_ADMIN", "SUPER_ADMIN", "MANAGER"],
    adminRoles: ["ORG_ADMIN", "SUPER_ADMIN"],
};
/* =====================================================
   ALLOWLISTS
===================================================== */
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
const VALID_SORT_FIELDS = [
    "createdAt",
    "updatedAt",
    "email",
    "firstName",
    "lastName",
    "lastLoginAt",
];
const VALID_USER_STATUSES = ["active", "inactive", "all"];
/* =====================================================
   ZOD SCHEMAS
===================================================== */
const objectIdSchema = z
    .string()
    .refine((v) => mongoose.Types.ObjectId.isValid(v), {
    message: "Invalid ObjectId format",
});
const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email format")
    .max(USER_CONFIG.caps.email);
/* Strong password: min 8 chars, at least 1 letter, 1 number.
   Defends against weak-credential attacks. */
const passwordSchema = z
    .string()
    .min(USER_CONFIG.password.minLength, `Password must be at least ${USER_CONFIG.password.minLength} characters`)
    .max(USER_CONFIG.password.maxLength)
    .regex(/[A-Za-z]/, "Password must contain at least one letter")
    .regex(/[0-9]/, "Password must contain at least one number");
const createUserSchema = z
    .object({
    email: emailSchema,
    password: passwordSchema,
    roleId: objectIdSchema,
    managerId: objectIdSchema.optional(),
    firstName: z.string().trim().max(USER_CONFIG.caps.name).optional(),
    lastName: z.string().trim().max(USER_CONFIG.caps.name).optional(),
    phone: z.string().trim().max(30).optional(),
})
    .strict();
const updateUserSchema = z
    .object({
    email: emailSchema.optional(),
    roleId: objectIdSchema.optional(),
    managerId: objectIdSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    fullName: z.string().trim().max(USER_CONFIG.caps.name).optional(),
    firstName: z.string().trim().max(USER_CONFIG.caps.name).optional(),
    lastName: z.string().trim().max(USER_CONFIG.caps.name).optional(),
    phone: z.string().trim().max(30).optional(),
})
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});
const updatePasswordSchema = z
    .object({
    currentPassword: z.string().min(1, "Current password required"),
    newPassword: passwordSchema,
})
    .strict()
    .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must differ from current password",
    path: ["newPassword"],
});
const listUsersQuerySchema = z
    .object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    status: z.enum(VALID_USER_STATUSES).optional(),
    roleId: z.string().optional(),
    managerId: z.string().optional(),
    teamId: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
})
    .strict();
/**
 * Extract & validate the authenticated user. Reads from globally-augmented
 * req.user (via express.d.ts) and normalizes _id to a string.
 */
function requireAuth(req) {
    const u = req.user;
    if (!u) {
        throw ApiError.unauthorized("Unauthorized");
    }
    const userId = (typeof u.id === "string" && u.id) ||
        (u._id ? u._id.toString() : "");
    const organizationId = typeof u.organizationId === "string"
        ? u.organizationId
        : String(u.organizationId ?? "");
    if (!userId || !organizationId) {
        throw ApiError.unauthorized("User missing identity or organization");
    }
    /* roleId may live in u.roleId (your service expects this naming) */
    const roleId = typeof u.roleId === "string"
        ? (u.roleId)
        : undefined;
    return {
        userId,
        organizationId,
        role: String(u.role ?? "USER").toUpperCase(),
        ...(roleId && { roleId }),
    };
}
function requireRole(actor, allowed) {
    if (!allowed.includes(actor.role)) {
        throw ApiError.forbidden("Insufficient role for this action");
    }
}
/**
 * Build the service-input shape that userService methods expect.
 * Centralizes the (legacy) { _id, role, organizationId, roleId } field
 * naming so the service can be migrated independently.
 */
function buildServiceUser(actor) {
    return {
        _id: actor.userId,
        role: toServiceRole(actor.role),
        roleId: actor.roleId ?? "",
        organizationId: actor.organizationId,
    };
}
/**
 * Validate and extract a Mongo ObjectId from req params.
 */
function requireObjectId(req, paramName = "id") {
    const id = req.params[paramName];
    if (!id || !id.trim()) {
        throw ApiError.badRequest(`/${paramName} is required`);
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest(`Invalid /${paramName} format`);
    }
    return id;
}
function runSchema(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const issues = result.error.issues
            .map((e) => `/${e.path.length ? e.path.join(".") : "(root)"}: ${e.message}`)
            .join("; ");
        throw ApiError.badRequest(`Validation failed — ${issues}`);
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
function parseEnumParam(value, allowed, fallback) {
    if (typeof value !== "string")
        return fallback;
    const v = value.trim().toLowerCase();
    return allowed.includes(v) ? v : fallback;
}
/**
 * Strip sensitive fields from user objects before sending to client.
 * Defends against accidental password/token leaks in API responses.
 */
function sanitizeUser(user) {
    if (!user || typeof user !== "object")
        return user;
    const u = user;
    const { password, passwordHash, refreshToken, refreshTokens, resetPasswordToken, resetPasswordExpires, verificationToken, twoFactorSecret, ...safe } = u;
    return safe;
}
function sanitizeUsers(users) {
    if (Array.isArray(users)) {
        return users.map((u) => sanitizeUser(u));
    }
    return users;
}
/* =====================================================
   CONTROLLER
===================================================== */
class UserController {
    /* =====================================================
       POST /users — create a new user (admin-initiated)
    ===================================================== */
    create = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, USER_CONFIG.privilegedRoles);
        const validated = runSchema(createUserSchema, req.body);
        /* Build input with conditional spreads (exactOptionalPropertyTypes safe) */
        const input = {
            email: validated.email,
            password: validated.password,
            roleId: validated.roleId,
            ...(validated.managerId !== undefined && { managerId: validated.managerId }),
            ...(validated.firstName !== undefined && { firstName: validated.firstName }),
            ...(validated.lastName !== undefined && { lastName: validated.lastName }),
            ...(validated.phone !== undefined && { phone: validated.phone }),
        };
        const user = await userService.create(input, buildServiceUser(actor));
        if (!user) {
            throw ApiError.badRequest("User creation failed");
        }
        dbLogger.info(`User created: email=${validated.email} role=${validated.roleId} ` +
            `org=${actor.organizationId} actor=${actor.userId}`);
        res.status(HttpStatus.CREATED).json({
            success: true,
            data: sanitizeUser(user),
            message: "User created",
        });
    });
    /* =====================================================
       GET /users — list with pagination, search, and filters
    ===================================================== */
    findAll = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const validated = runSchema(listUsersQuerySchema, req.query);
        const page = getNumber(validated.page, 1, { min: 1, max: 10_000 });
        const limit = getNumber(validated.limit, USER_CONFIG.pagination.defaultLimit, { min: 1, max: USER_CONFIG.pagination.maxLimit });
        const search = validated.search?.trim().slice(0, 200);
        const status = validated.status ?? "active";
        /* Sort with allowlist */
        const sortBy = validated.sortBy && VALID_SORT_FIELDS.includes(validated.sortBy)
            ? validated.sortBy
            : "createdAt";
        const sortOrder = validated.sortOrder ?? "desc";
        /* Support both simple findAll(user) and paginated signature */
        const svc = userService;
        const result = await svc.findAll(buildServiceUser(actor), {
            page,
            limit,
            status,
            sortBy,
            sortOrder,
            ...(search && { search }),
            ...(validated.roleId && { roleId: validated.roleId }),
            ...(validated.managerId && { managerId: validated.managerId }),
            ...(validated.teamId && { teamId: validated.teamId }),
        });
        /* Support both response shapes: array or { users/data, total } */
        const items = Array.isArray(result)
            ? result
            : result?.users
                ?? result?.data
                ?? [];
        const total = Array.isArray(result)
            ? result.length
            : result?.total ?? items.length;
        const totalPages = Math.ceil(total / limit);
        res.status(HttpStatus.OK).json({
            success: true,
            data: sanitizeUsers(items),
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
       GET /users/me — current user's profile
    ===================================================== */
    getMe = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const svc = userService;
        const user = await svc.findOne(actor.userId, buildServiceUser(actor));
        if (!user) {
            throw ApiError.notFound("User not found");
        }
        res.status(HttpStatus.OK).json({
            success: true,
            data: sanitizeUser(user),
        });
    });
    /* =====================================================
       GET /users/:id — single user lookup
    ===================================================== */
    findOne = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const id = requireObjectId(req);
        const user = await userService.findOne(id, buildServiceUser(actor));
        if (!user) {
            throw ApiError.notFound("User not found");
        }
        res.status(HttpStatus.OK).json({
            success: true,
            data: sanitizeUser(user),
        });
    });
    /* =====================================================
       PATCH /users/:id — update user
    ===================================================== */
    update = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const id = requireObjectId(req);
        const isSelf = id === actor.userId;
        const isPrivileged = USER_CONFIG.privilegedRoles.includes(actor.role);
        /* Self-edits and privileged edits are allowed.
           Non-privileged users editing OTHER users → forbidden. */
        if (!isSelf && !isPrivileged) {
            throw ApiError.forbidden("You can only update your own profile");
        }
        const validated = runSchema(updateUserSchema, req.body);
        /* Non-privileged users can't change role, manager, or active state.
           Only admins can do that — even for themselves. */
        if (!isPrivileged) {
            if (validated.roleId !== undefined)
                throw ApiError.forbidden("Cannot change own role");
            if (validated.managerId !== undefined)
                throw ApiError.forbidden("Cannot change own manager");
            if (validated.isActive !== undefined)
                throw ApiError.forbidden("Cannot change own active state");
        }
        /* Prevent self-deactivation — lockout prevention */
        if (isSelf && validated.isActive === false) {
            throw ApiError.badRequest("Cannot deactivate your own account");
        }
        /* Build update with conditional spreads */
        const updateData = {
            ...(validated.email !== undefined && { email: validated.email }),
            ...(validated.roleId !== undefined && { roleId: validated.roleId }),
            ...(validated.managerId !== undefined && { managerId: validated.managerId }),
            ...(validated.isActive !== undefined && { isActive: validated.isActive }),
            ...(validated.fullName !== undefined && { fullName: validated.fullName }),
            ...(validated.firstName !== undefined && { firstName: validated.firstName }),
            ...(validated.lastName !== undefined && { lastName: validated.lastName }),
            ...(validated.phone !== undefined && { phone: validated.phone }),
            updatedBy: actor.userId,
        };
        const user = await userService.update(id, updateData, buildServiceUser(actor));
        if (!user) {
            throw ApiError.notFound("User not found");
        }
        dbLogger.info(`User updated: id=${id} fields=${Object.keys(updateData).join(",")} ` +
            `actor=${actor.userId} self=${isSelf}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: sanitizeUser(user),
            message: "User updated",
        });
    });
    /* =====================================================
       PATCH /users/me/password — change own password
    ===================================================== */
    updatePassword = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const validated = runSchema(updatePasswordSchema, req.body);
        const svc = userService;
        if (typeof svc.updatePassword !== "function") {
            throw ApiError.notFound("Password update not available");
        }
        await svc.updatePassword(actor.userId, {
            currentPassword: validated.currentPassword,
            newPassword: validated.newPassword,
        }, buildServiceUser(actor));
        dbLogger.warn(`Password changed: user=${actor.userId} org=${actor.organizationId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            message: "Password updated successfully",
        });
    });
    /* =====================================================
       DELETE /users/:id — soft-delete a user
    ===================================================== */
    remove = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, USER_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        /* Prevent self-deletion — admins must transfer responsibilities first */
        if (id === actor.userId) {
            throw ApiError.badRequest("Cannot delete your own account");
        }
        const result = await userService.remove(id, buildServiceUser(actor));
        dbLogger.warn(`User removed: id=${id} actor=${actor.userId} org=${actor.organizationId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            ...(result && typeof result === "object" ? result : {}),
            message: "User removed",
        });
    });
    /* =====================================================
       POST /users/:id/reactivate — un-soft-delete a user
    ===================================================== */
    reactivate = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, USER_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        const svc = userService;
        let result;
        if (typeof svc.reactivate === "function") {
            result = await svc.reactivate(id, buildServiceUser(actor));
        }
        else {
            /* Fallback: flip isActive to true */
            result = await svc.update(id, { isActive: true }, buildServiceUser(actor));
        }
        if (!result) {
            throw ApiError.notFound("User not found");
        }
        dbLogger.info(`User reactivated: id=${id} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: sanitizeUser(result),
            message: "User reactivated",
        });
    });
    /* =====================================================
       POST /users/:id/reset-password — admin force-reset
    ===================================================== */
    forceResetPassword = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, USER_CONFIG.adminRoles);
        const id = requireObjectId(req);
        /* Don't allow force-resetting yourself — use the regular flow */
        if (id === actor.userId) {
            throw ApiError.badRequest("Use the change-password endpoint for your own account");
        }
        const svc = userService;
        if (typeof svc.forceResetPassword !== "function") {
            throw ApiError.notFound("Force password reset not available");
        }
        const result = await svc.forceResetPassword(id, buildServiceUser(actor));
        dbLogger.warn(`Password force-reset: target=${id} actor=${actor.userId}`);
        /* Service may return a temp password or a reset link — pass through */
        res.status(HttpStatus.OK).json({
            success: true,
            data: result,
            message: "Password reset initiated. User must change password on next login.",
        });
    });
    /* =====================================================
       GET /users/:id/teams — list teams a user belongs to
    ===================================================== */
    getTeams = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const id = requireObjectId(req);
        const svc = userService;
        if (typeof svc.getTeams !== "function") {
            throw ApiError.notFound("User teams lookup not available");
        }
        const teams = await svc.getTeams(id, buildServiceUser(actor));
        res.status(HttpStatus.OK).json({
            success: true,
            data: teams,
        });
    });
    /* =====================================================
       GET /users/stats — org-wide user statistics
    ===================================================== */
    getStats = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, USER_CONFIG.privilegedRoles);
        const svc = userService;
        if (typeof svc.getStats !== "function") {
            throw ApiError.notFound("User stats not available");
        }
        const stats = await svc.getStats(buildServiceUser(actor));
        res.status(HttpStatus.OK).json({
            success: true,
            data: stats,
            meta: { generatedAt: new Date().toISOString() },
        });
    });
}
export default new UserController();
//# sourceMappingURL=user.controller.js.map