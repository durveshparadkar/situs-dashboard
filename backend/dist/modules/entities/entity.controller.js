import mongoose from "mongoose";
import { z } from "zod";
import Entity from "./entity.model.js";
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
const ENTITY_CONFIG = {
    defaultPageSize: 10,
    maxPageSize: 100,
    allowedSortFields: [
        "createdAt",
        "updatedAt",
        "title",
        "type",
    ],
    defaultSort: "-createdAt",
    maxSearchLength: 200,
    maxBulkSize: 100,
};
/* =====================================================
   VALIDATION SCHEMAS
===================================================== */
const objectIdSchema = z
    .string()
    .refine((v) => mongoose.Types.ObjectId.isValid(v), {
    message: "Invalid ObjectId format",
});
const createEntitySchema = z
    .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    type: z.string().trim().min(1, "Type is required").max(100),
    description: z.string().trim().max(1000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
})
    .strict();
const updateEntitySchema = z
    .object({
    title: z.string().trim().min(1).max(200).optional(),
    type: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(1000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
})
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});
const querySchema = z
    .object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    sort: z.string().optional(),
    type: z.string().optional(),
    tag: z.string().optional(),
    includeDeleted: z.string().optional(),
})
    .strict();
const bulkCreateSchema = z
    .object({
    entities: z.array(createEntitySchema).min(1).max(ENTITY_CONFIG.maxBulkSize),
})
    .strict();
/**
 * Extract & validate the authenticated user from the global AuthenticatedUser
 * type (augmented via express.d.ts). Handles both id and _id.
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
/**
 * Validate an ObjectId from req params and return as a clean string.
 */
function requireObjectId(req, paramName = "id") {
    const id = paramAsString(req.params[paramName]);
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new AppError(`Invalid ${paramName} format`, HttpStatus.BAD_REQUEST, "INVALID_ID");
    }
    return id;
}
/**
 * Run a Zod schema and translate failures into a structured ValidationError.
 */
function runSchema(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const details = result.error.issues.map((e) => ({
            field: e.path.length ? e.path.join(".") : "(root)",
            message: e.message,
        }));
        throw new ValidationError(details);
    }
    return result.data;
}
/**
 * Parse a sort string like "-createdAt" or "title" into a Mongoose sort object,
 * validating the field against an allowlist to prevent injection attacks.
 */
function parseSortField(sort) {
    const raw = sort && sort.trim().length > 0 ? sort.trim() : ENTITY_CONFIG.defaultSort;
    const direction = raw.startsWith("-") ? -1 : 1;
    const field = raw.replace(/^-/, "");
    if (!ENTITY_CONFIG.allowedSortFields.includes(field)) {
        throw new AppError(`Invalid sort field. Allowed: ${ENTITY_CONFIG.allowedSortFields.join(", ")}`, HttpStatus.BAD_REQUEST, "INVALID_SORT_FIELD");
    }
    return { [field]: direction };
}
/**
 * Escape regex special characters in user input — prevents ReDoS attacks
 * via crafted regex patterns in search queries.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function parseBoolFlag(value) {
    if (typeof value !== "string")
        return false;
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}
/* =====================================================
   CREATE ENTITY
===================================================== */
export const createEntity = async (req, res, next) => {
    try {
        const { userId, organizationId } = requireAuth(req);
        const validated = runSchema(createEntitySchema, req.body);
        /* Build doc with conditional spreads to satisfy exactOptionalPropertyTypes */
        const entity = await Entity.create({
            title: validated.title,
            type: validated.type,
            ownerId: userId,
            organizationId,
            createdBy: userId,
            ...(validated.description !== undefined && { description: validated.description }),
            ...(validated.metadata !== undefined && { metadata: validated.metadata }),
            ...(validated.tags !== undefined && { tags: validated.tags }),
        });
        dbLogger.info(`Entity created: id=${entity._id} type=${entity.type} ` +
            `org=${organizationId} owner=${userId}`);
        res.status(HttpStatus.CREATED).json({
            success: true,
            data: entity,
            message: "Entity created",
        });
    }
    catch (err) {
        next(err);
    }
};
/* =====================================================
   GET ENTITIES — paginated, searchable, sortable
===================================================== */
export const getEntities = async (req, res, next) => {
    try {
        const { organizationId, role } = requireAuth(req);
        const validatedQuery = runSchema(querySchema, req.query);
        /* ── Pagination ── */
        const pageRaw = parseInt(validatedQuery.page ?? "1", 10);
        const limitRaw = parseInt(validatedQuery.limit ?? String(ENTITY_CONFIG.defaultPageSize), 10);
        const page = Math.max(Number.isFinite(pageRaw) ? pageRaw : 1, 1);
        const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : ENTITY_CONFIG.defaultPageSize, 1), ENTITY_CONFIG.maxPageSize);
        const skip = (page - 1) * limit;
        /* ── Sort ── */
        const sort = parseSortField(validatedQuery.sort);
        /* ── Build filter — org-scoped always ── */
        const filter = { organizationId };
        if (validatedQuery.type) {
            filter.type = validatedQuery.type;
        }
        if (validatedQuery.tag) {
            filter.tags = validatedQuery.tag.toLowerCase();
        }
        const search = validatedQuery.search
            ?.trim()
            .slice(0, ENTITY_CONFIG.maxSearchLength);
        if (search) {
            filter.title = { $regex: escapeRegex(search), $options: "i" };
        }
        /* ── Soft-delete gating ── */
        const includeDeleted = parseBoolFlag(validatedQuery.includeDeleted);
        const isPrivileged = ["ORG_ADMIN", "SUPER_ADMIN", "MANAGER"].includes(role);
        if (!includeDeleted || !isPrivileged) {
            filter.isDeleted = { $ne: true };
        }
        /* ── Run find + count in parallel ── */
        const [entities, total] = await Promise.all([
            Entity.find(filter).sort(sort).skip(skip).limit(limit).lean(),
            Entity.countDocuments(filter),
        ]);
        const totalPages = Math.ceil(total / limit);
        res.status(HttpStatus.OK).json({
            success: true,
            data: entities,
            pagination: {
                total,
                page,
                limit,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        });
    }
    catch (err) {
        next(err);
    }
};
/* =====================================================
   GET ENTITY BY ID
===================================================== */
export const getEntityById = async (req, res, next) => {
    try {
        const { organizationId, userId } = requireAuth(req);
        const id = requireObjectId(req);
        const entity = await Entity.findOne({
            _id: id,
            organizationId,
            isDeleted: { $ne: true },
        }).lean();
        if (!entity) {
            throw new AppError("Entity not found", HttpStatus.NOT_FOUND, "ENTITY_NOT_FOUND");
        }
        /* Record view asynchronously — don't block response */
        Entity.updateOne({ _id: id, organizationId }, {
            $inc: { viewCount: 1 },
            $set: { lastViewedAt: new Date(), lastViewedBy: userId },
        }).catch((err) => {
            dbLogger.warn(`Failed to record entity view: id=${id} error=${err?.message ?? "unknown"}`);
        });
        res.status(HttpStatus.OK).json({ success: true, data: entity });
    }
    catch (err) {
        next(err);
    }
};
/* =====================================================
   UPDATE ENTITY
===================================================== */
export const updateEntity = async (req, res, next) => {
    try {
        const { userId, organizationId } = requireAuth(req);
        const id = requireObjectId(req);
        const validated = runSchema(updateEntitySchema, req.body);
        /* Build update doc with conditional spreads */
        const update = {
            ...(validated.title !== undefined && { title: validated.title }),
            ...(validated.type !== undefined && { type: validated.type }),
            ...(validated.description !== undefined && { description: validated.description }),
            ...(validated.metadata !== undefined && { metadata: validated.metadata }),
            ...(validated.tags !== undefined && { tags: validated.tags }),
            updatedBy: userId,
        };
        const entity = await Entity.findOneAndUpdate({ _id: id, organizationId, isDeleted: { $ne: true } }, { $set: update }, { new: true, runValidators: true }).lean();
        if (!entity) {
            throw new AppError("Entity not found", HttpStatus.NOT_FOUND, "ENTITY_NOT_FOUND");
        }
        dbLogger.info(`Entity updated: id=${id} org=${organizationId} user=${userId} ` +
            `fields=${Object.keys(update).join(",")}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: entity,
            message: "Entity updated",
        });
    }
    catch (err) {
        next(err);
    }
};
/* =====================================================
   DELETE ENTITY (soft delete)
===================================================== */
export const deleteEntity = async (req, res, next) => {
    try {
        const { userId, organizationId } = requireAuth(req);
        const id = requireObjectId(req);
        /* Soft delete — sets isDeleted flag rather than removing the doc.
           Preserves audit trail and supports recovery. */
        const entity = await Entity.findOneAndUpdate({ _id: id, organizationId, isDeleted: { $ne: true } }, {
            $set: {
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: userId,
            },
        }, { new: true }).lean();
        if (!entity) {
            throw new AppError("Entity not found or already deleted", HttpStatus.NOT_FOUND, "ENTITY_NOT_FOUND");
        }
        dbLogger.warn(`Entity deleted: id=${id} org=${organizationId} user=${userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: { id },
            message: "Entity deleted",
        });
    }
    catch (err) {
        next(err);
    }
};
/* =====================================================
   RESTORE ENTITY (undo soft delete)
===================================================== */
export const restoreEntity = async (req, res, next) => {
    try {
        const { userId, organizationId } = requireAuth(req);
        const id = requireObjectId(req);
        const entity = await Entity.findOneAndUpdate({ _id: id, organizationId, isDeleted: true }, {
            $set: {
                isDeleted: false,
                deletedAt: null,
                deletedBy: null,
                restoredAt: new Date(),
                restoredBy: userId,
            },
        }, { new: true, runValidators: false }).lean();
        if (!entity) {
            throw new AppError("Entity not found or not deleted", HttpStatus.NOT_FOUND, "ENTITY_NOT_FOUND");
        }
        dbLogger.info(`Entity restored: id=${id} org=${organizationId} user=${userId}`);
        res.status(HttpStatus.OK).json({
            success: true,
            data: entity,
            message: "Entity restored",
        });
    }
    catch (err) {
        next(err);
    }
};
/* =====================================================
   BULK CREATE ENTITIES
===================================================== */
export const bulkCreateEntities = async (req, res, next) => {
    try {
        const { userId, organizationId } = requireAuth(req);
        const validated = runSchema(bulkCreateSchema, req.body);
        /* Build docs with conditional spreads for each entity */
        const docs = validated.entities.map((e) => ({
            title: e.title,
            type: e.type,
            ownerId: userId,
            organizationId,
            createdBy: userId,
            ...(e.description !== undefined && { description: e.description }),
            ...(e.metadata !== undefined && { metadata: e.metadata }),
            ...(e.tags !== undefined && { tags: e.tags }),
        }));
        /* ordered: false → continue on individual failures, return partial success */
        const inserted = await Entity.insertMany(docs, { ordered: false });
        dbLogger.info(`Entity bulk create: org=${organizationId} user=${userId} ` +
            `requested=${validated.entities.length} inserted=${inserted.length}`);
        res.status(HttpStatus.CREATED).json({
            success: true,
            data: {
                inserted: inserted.length,
                failed: validated.entities.length - inserted.length,
                entities: inserted,
            },
            message: `Bulk create: ${inserted.length} of ${validated.entities.length} created`,
        });
    }
    catch (err) {
        next(err);
    }
};
/* =====================================================
   GET ENTITY STATS
===================================================== */
export const getEntityStats = async (req, res, next) => {
    try {
        const { organizationId } = requireAuth(req);
        const [byType, totals] = await Promise.all([
            Entity.aggregate([
                { $match: { organizationId, isDeleted: { $ne: true } } },
                { $group: { _id: "$type", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
            Entity.aggregate([
                { $match: { organizationId } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        active: { $sum: { $cond: [{ $ne: ["$isDeleted", true] }, 1, 0] } },
                        deleted: { $sum: { $cond: [{ $eq: ["$isDeleted", true] }, 1, 0] } },
                    },
                },
            ]),
        ]);
        const summary = totals[0] ?? { total: 0, active: 0, deleted: 0 };
        res.status(HttpStatus.OK).json({
            success: true,
            data: {
                summary: {
                    total: summary.total,
                    active: summary.active,
                    deleted: summary.deleted,
                },
                byType: byType.map((b) => ({ type: b._id, count: b.count })),
            },
            meta: { generatedAt: new Date().toISOString() },
        });
    }
    catch (err) {
        next(err);
    }
};
/* =====================================================
   FIND ENTITY BY EXTERNAL ID — HubSpot/Salesforce lookup
===================================================== */
export const findEntityByExternalId = async (req, res, next) => {
    try {
        const { organizationId } = requireAuth(req);
        const source = paramAsString(req.query.source);
        const externalId = paramAsString(req.query.externalId);
        if (!source || !externalId) {
            throw new AppError("Both 'source' and 'externalId' query params are required", HttpStatus.BAD_REQUEST, "MISSING_PARAMS");
        }
        if (!["hubspot", "salesforce"].includes(source.toLowerCase())) {
            throw new AppError("source must be 'hubspot' or 'salesforce'", HttpStatus.BAD_REQUEST, "INVALID_SOURCE");
        }
        const fieldKey = `externalIds.${source.toLowerCase()}`;
        const entity = await Entity.findOne({
            organizationId,
            isDeleted: { $ne: true },
            [fieldKey]: externalId,
        }).lean();
        if (!entity) {
            throw new AppError("Entity not found for that external ID", HttpStatus.NOT_FOUND, "ENTITY_NOT_FOUND");
        }
        res.status(HttpStatus.OK).json({ success: true, data: entity });
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=entity.controller.js.map