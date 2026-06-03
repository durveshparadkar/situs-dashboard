import mongoose from "mongoose";
import { z } from "zod";
import Role from "./role.model.js";
import Permission from "./permission.model.js";
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
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code;
        if (details !== undefined) {
            this.details = details;
        }
    }
}
/* =====================================================
   HTTP STATUS
===================================================== */
const HttpStatus = {
    OK: 200,
    CREATED: 201,
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
const RBAC_CONFIG = {
    caps: {
        name: 100,
        description: 500,
        maxPermissions: 500,
        maxInherits: 20,
    },
    privilegedRoles: ["ORG_ADMIN", "SUPER_ADMIN"],
};
/* =====================================================
   ZOD SCHEMAS
===================================================== */
const objectIdSchema = z
    .string()
    .refine((v) => mongoose.Types.ObjectId.isValid(v), {
    message: "Invalid ObjectId format",
});
const createRoleSchema = z
    .object({
    name: z.string().trim().min(2, "Name must be at least 2 chars").max(RBAC_CONFIG.caps.name),
    description: z.string().trim().max(RBAC_CONFIG.caps.description).optional(),
    permissions: z.array(objectIdSchema).max(RBAC_CONFIG.caps.maxPermissions).default([]),
    inherits: z.array(objectIdSchema).max(RBAC_CONFIG.caps.maxInherits).optional(),
})
    .strict();
const updateRoleSchema = z
    .object({
    name: z.string().trim().min(2).max(RBAC_CONFIG.caps.name).optional(),
    description: z.string().trim().max(RBAC_CONFIG.caps.description).optional(),
    permissions: z.array(objectIdSchema).max(RBAC_CONFIG.caps.maxPermissions).optional(),
    inherits: z.array(objectIdSchema).max(RBAC_CONFIG.caps.maxInherits).optional(),
})
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});
const assignPermissionsSchema = z
    .object({
    permissions: z
        .array(objectIdSchema)
        .min(1, "At least one permission ID required")
        .max(RBAC_CONFIG.caps.maxPermissions),
})
    .strict();
const listQuerySchema = z
    .object({
    includeSystem: z.string().optional(),
    search: z.string().optional(),
})
    .strict();
function requireAuth(req) {
    const u = req.user;
    if (!u) {
        throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const userId = (typeof u.id === "string" && u.id) ||
        (u._id ? String(u._id) : "");
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
        throw new AppError("RBAC management requires admin-level access", HttpStatus.FORBIDDEN, "FORBIDDEN");
    }
}
function requireObjectId(req, paramName = "id") {
    const id = req.params[paramName];
    if (typeof id !== "string" || id.trim().length === 0) {
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
        const issues = result.error.issues
            .map((e) => ` ${e.path.length ? e.path.join(".") : "(root)"}: ${e.message}`)
            .join("; ");
        throw new AppError(`Validation failed — ${issues}`, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }
    return result.data;
}
function parseBoolFlag(value) {
    if (typeof value !== "string")
        return false;
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function toIdString(value) {
    if (value === null || value === undefined)
        return "";
    if (typeof value === "string")
        return value;
    if (typeof value === "object" && value !== null) {
        const obj = value;
        if (obj._id !== undefined)
            return String(obj._id);
        if (typeof obj.toString === "function")
            return obj.toString();
    }
    return String(value);
}
async function validatePermissionIds(ids, organizationId) {
    if (ids.length === 0)
        return [];
    const found = await Permission.find({
        _id: { $in: ids },
        $or: [
            { organizationId: null },
            { organizationId },
        ],
    })
        .select("_id")
        .lean();
    const foundIds = found.map((p) => toIdString(p._id));
    if (foundIds.length !== ids.length) {
        const foundSet = new Set(foundIds);
        const missing = ids.filter((id) => !foundSet.has(id));
        throw new AppError(`Invalid permission IDs: ${missing.slice(0, 5).join(", ")}` +
            (missing.length > 5 ? ` (and ${missing.length - 5} more)` : ""), HttpStatus.BAD_REQUEST, "INVALID_PERMISSIONS");
    }
    return foundIds;
}
async function validateInheritIds(ids, organizationId, selfRoleId) {
    if (ids.length === 0)
        return [];
    if (selfRoleId && ids.includes(selfRoleId)) {
        throw new AppError("A role cannot inherit from itself", HttpStatus.BAD_REQUEST, "CIRCULAR_INHERITANCE");
    }
    const found = await Role.find({
        _id: { $in: ids },
        $or: [
            { organizationId: null },
            { organizationId },
        ],
    })
        .select("_id")
        .lean();
    if (found.length !== ids.length) {
        throw new AppError("One or more inherited roles not found or not accessible", HttpStatus.BAD_REQUEST, "INVALID_INHERITS");
    }
    return found.map((r) => toIdString(r._id));
}
/* =====================================================
   CONTROLLER
===================================================== */
class RBACController {
    /* ── POST /rbac/roles ── */
    createRole = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, RBAC_CONFIG.privilegedRoles);
        const validated = runSchema(createRoleSchema, req.body);
        const existing = await Role.findOne({
            name: validated.name,
            organizationId: actor.organizationId,
        }).lean();
        if (existing) {
            throw new AppError(`A role named "${validated.name}" already exists`, HttpStatus.CONFLICT, "ROLE_NAME_EXISTS");
        }
        const validatedPermissions = await validatePermissionIds(validated.permissions, actor.organizationId);
        const validatedInherits = validated.inherits
            ? await validateInheritIds(validated.inherits, actor.organizationId)
            : [];
        const roleDoc = {
            name: validated.name,
            permissions: validatedPermissions,
            inherits: validatedInherits,
            organizationId: actor.organizationId,
            isSystem: false,
            createdBy: actor.userId,
        };
        if (validated.description !== undefined) {
            roleDoc.description = validated.description;
        }
        const role = await Role.create(roleDoc);
        dbLogger.info(`Role created: id=${String(role._id)} ` +
            `name=${validated.name} permissions=${validatedPermissions.length} ` +
            `inherits=${validatedInherits.length} org=${actor.organizationId} actor=${actor.userId}`);
        res.status(HttpStatus.CREATED).json({
            success: true,
            data: role,
            message: "Role created",
        });
    });
    /* ── GET /rbac/roles ── */
    getRoles = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const validated = runSchema(listQuerySchema, req.query);
        const includeSystem = validated.includeSystem === undefined
            ? true
            : parseBoolFlag(validated.includeSystem);
        const filter = {};
        if (includeSystem) {
            filter.$or = [
                { organizationId: null },
                { organizationId: actor.organizationId },
            ];
        }
        else {
            filter.organizationId = actor.organizationId;
        }
        const search = validated.search?.trim().slice(0, 100);
        if (search) {
            filter.name = { $regex: escapeRegex(search), $options: "i" };
        }
        const roles = await Role.find(filter)
            .populate("permissions")
            .lean();
        res.status(HttpStatus.OK).json({
            success: true,
            data: roles,
            meta: { count: roles.length, includeSystem },
        });
    });
    /* ── GET /rbac/roles/:id ── */
    getRoleById = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const id = requireObjectId(req);
        const role = await Role.findOne({
            _id: id,
            $or: [
                { organizationId: null },
                { organizationId: actor.organizationId },
            ],
        })
            .populate("permissions")
            .populate("inherits")
            .lean();
        if (!role) {
            throw new AppError("Role not found", HttpStatus.NOT_FOUND, "ROLE_NOT_FOUND");
        }
        res.status(HttpStatus.OK).json({ success: true, data: role });
    });
    /* ── PATCH /rbac/roles/:id ── */
    updateRole = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, RBAC_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        const validated = runSchema(updateRoleSchema, req.body);
        if (validated.name) {
            const conflict = await Role.findOne({
                _id: { $ne: id },
                name: validated.name,
                organizationId: actor.organizationId,
            }).lean();
            if (conflict) {
                throw new AppError(`A role named "${validated.name}" already exists`, HttpStatus.CONFLICT, "ROLE_NAME_EXISTS");
            }
        }
        const validatedPermissions = validated.permissions
            ? await validatePermissionIds(validated.permissions, actor.organizationId)
            : undefined;
        const validatedInherits = validated.inherits
            ? await validateInheritIds(validated.inherits, actor.organizationId, id)
            : undefined;
        const update = { updatedBy: actor.userId };
        if (validated.name !== undefined)
            update.name = validated.name;
        if (validated.description !== undefined)
            update.description = validated.description;
        if (validatedPermissions !== undefined)
            update.permissions = validatedPermissions;
        if (validatedInherits !== undefined)
            update.inherits = validatedInherits;
        const role = await Role.findOneAndUpdate({
            _id: id,
            organizationId: actor.organizationId,
            isSystem: false,
        }, { $set: update }, { new: true, runValidators: true })
            .populate("permissions")
            .lean();
        if (!role) {
            throw new AppError("Role not found or not editable (system roles are read-only)", HttpStatus.NOT_FOUND, "ROLE_NOT_FOUND_OR_LOCKED");
        }
        dbLogger.info(`Role updated: id=${id} fields=${Object.keys(update).join(",")} ` +
            `org=${actor.organizationId} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: role,
            message: "Role updated",
        });
    });
    /* ── DELETE /rbac/roles/:id ── */
    deleteRole = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, RBAC_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        const role = await Role.findOneAndDelete({
            _id: id,
            organizationId: actor.organizationId,
            isSystem: false,
        }).lean();
        if (!role) {
            throw new AppError("Role not found or cannot delete system role", HttpStatus.NOT_FOUND, "ROLE_NOT_FOUND_OR_LOCKED");
        }
        dbLogger.warn(`Role deleted: id=${id} name=${String(role.name ?? "")} ` +
            `org=${actor.organizationId} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({ success: true, message: "Role deleted" });
    });
    /* ── POST /rbac/roles/:id/permissions ── */
    assignPermissions = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, RBAC_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        const { permissions } = runSchema(assignPermissionsSchema, req.body);
        const validatedPermissions = await validatePermissionIds(permissions, actor.organizationId);
        const role = await Role.findOneAndUpdate({
            _id: id,
            organizationId: actor.organizationId,
            isSystem: false,
        }, { $addToSet: { permissions: { $each: validatedPermissions } } }, { new: true })
            .populate("permissions")
            .lean();
        if (!role) {
            throw new AppError("Role not found or not editable", HttpStatus.NOT_FOUND, "ROLE_NOT_FOUND_OR_LOCKED");
        }
        dbLogger.info(`Permissions assigned: role=${id} count=${validatedPermissions.length} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: role,
            message: `${validatedPermissions.length} permission(s) assigned`,
        });
    });
    /* ── DELETE /rbac/roles/:id/permissions ── */
    revokePermissions = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, RBAC_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        const { permissions } = runSchema(assignPermissionsSchema, req.body);
        const role = await Role.findOneAndUpdate({
            _id: id,
            organizationId: actor.organizationId,
            isSystem: false,
        }, { $pullAll: { permissions } }, { new: true })
            .populate("permissions")
            .lean();
        if (!role) {
            throw new AppError("Role not found or not editable", HttpStatus.NOT_FOUND, "ROLE_NOT_FOUND_OR_LOCKED");
        }
        dbLogger.warn(`Permissions revoked: role=${id} count=${permissions.length} actor=${actor.userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: role,
            message: `${permissions.length} permission(s) revoked`,
        });
    });
    /* ── GET /rbac/permissions ── */
    getPermissions = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const includeOrg = parseBoolFlag(req.query.includeOrg);
        const filter = includeOrg
            ? {
                $or: [
                    { isSystem: true },
                    { organizationId: actor.organizationId },
                ],
            }
            : { isSystem: true };
        const permissions = await Permission.find(filter)
            .sort({ category: 1, name: 1 })
            .lean();
        res.status(HttpStatus.OK).json({
            success: true,
            data: permissions,
            meta: { count: permissions.length, includeOrg },
        });
    });
    /* ── POST /rbac/roles/:id/duplicate ── */
    duplicateRole = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireRole(actor, RBAC_CONFIG.privilegedRoles);
        const id = requireObjectId(req);
        const source = await Role.findOne({
            _id: id,
            $or: [
                { organizationId: null },
                { organizationId: actor.organizationId },
            ],
        }).lean();
        if (!source) {
            throw new AppError("Source role not found", HttpStatus.NOT_FOUND, "ROLE_NOT_FOUND");
        }
        const sourceTyped = source;
        const bodyName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        const newName = bodyName.length > 0
            ? bodyName.slice(0, RBAC_CONFIG.caps.name)
            : `${sourceTyped.name ?? "Role"} (Copy)`;
        const conflict = await Role.findOne({
            name: newName,
            organizationId: actor.organizationId,
        }).lean();
        if (conflict) {
            throw new AppError(`A role named "${newName}" already exists`, HttpStatus.CONFLICT, "ROLE_NAME_EXISTS");
        }
        const cloneDoc = {
            name: newName,
            permissions: (sourceTyped.permissions ?? []).map(toIdString),
            inherits: (sourceTyped.inherits ?? []).map(toIdString),
            organizationId: actor.organizationId,
            isSystem: false,
            createdBy: actor.userId,
        };
        if (sourceTyped.description !== undefined) {
            cloneDoc.description = sourceTyped.description;
        }
        const cloned = await Role.create(cloneDoc);
        dbLogger.info(`Role duplicated: source=${id} new=${String(cloned._id)} ` +
            `name="${newName}" actor=${actor.userId}`);
        res.status(HttpStatus.CREATED).json({
            success: true,
            data: cloned,
            message: "Role duplicated",
        });
    });
    /* ── GET /rbac/roles/:id/effective-permissions ── */
    getEffectivePermissions = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        const id = requireObjectId(req);
        const visited = new Set();
        const allPermissionIds = new Set();
        const queue = [id];
        while (queue.length > 0) {
            const currentId = queue.shift();
            if (!currentId || visited.has(currentId))
                continue;
            visited.add(currentId);
            const role = await Role.findOne({
                _id: currentId,
                $or: [
                    { organizationId: null },
                    { organizationId: actor.organizationId },
                ],
            })
                .select("permissions inherits")
                .lean();
            if (!role)
                continue;
            const typed = role;
            for (const p of typed.permissions ?? []) {
                allPermissionIds.add(toIdString(p));
            }
            for (const r of typed.inherits ?? []) {
                const rid = toIdString(r);
                if (rid && !visited.has(rid))
                    queue.push(rid);
            }
            if (visited.size > 100) {
                dbLogger.warn(`Effective-permission walk exceeded 100 roles: root=${id}`);
                break;
            }
        }
        if (visited.size === 0) {
            throw new AppError("Role not found", HttpStatus.NOT_FOUND, "ROLE_NOT_FOUND");
        }
        const permissionIdsArr = Array.from(allPermissionIds);
        const permissions = await Permission.find({
            _id: { $in: permissionIdsArr },
        }).lean();
        res.status(HttpStatus.OK).json({
            success: true,
            data: {
                roleId: id,
                rolesWalked: visited.size,
                permissions,
                permissionIds: permissionIdsArr,
            },
            meta: { count: permissions.length },
        });
    });
}
export default new RBACController();
//# sourceMappingURL=rbac.controller.js.map