// entity.service.ts
import mongoose from "mongoose";
import Entity, { ENTITY_TYPES, ENTITY_STATUSES, ENTITY_VISIBILITY, } from "./entity.model.js";
import { dbLogger } from "../../utils/logger.js";
/* =====================================================
   ERRORS
===================================================== */
export class EntityServiceError extends Error {
    statusCode;
    code;
    constructor(message, statusCode = 400, code = "ENTITY_SERVICE_ERROR") {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = "EntityServiceError";
    }
}
/* =====================================================
   CONFIG
===================================================== */
export const ENTITY_CONFIG = {
    defaultPageSize: 20,
    maxPageSize: 100,
    bulkChunkSize: 500,
    maxSearchLength: 200,
};
const SORTABLE_FIELDS = [
    "createdAt",
    "updatedAt",
    "title",
    "type",
    "status",
    "lastViewedAt",
    "viewCount",
];
/* =====================================================
   HELPERS
===================================================== */
function isValidObjectId(id) {
    if (!id)
        return false;
    return mongoose.Types.ObjectId.isValid(id);
}
function toObjectId(id) {
    return new mongoose.Types.ObjectId(id);
}
function escapeRegex(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function normalizeFilterArray(value) {
    if (value === undefined)
        return undefined;
    return Array.isArray(value) ? value : [value];
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
/* =====================================================
   SERVICE
===================================================== */
class EntityService {
    /* =====================================================
       CREATE
    ===================================================== */
    async createEntity(payload) {
        /* ── Validation ── */
        if (!isValidObjectId(payload.organizationId)) {
            throw new EntityServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        if (!isValidObjectId(payload.ownerId)) {
            throw new EntityServiceError("Invalid owner ID", 400, "INVALID_ID");
        }
        if (!isValidObjectId(payload.createdBy)) {
            throw new EntityServiceError("Invalid creator ID", 400, "INVALID_ID");
        }
        if (!payload.title || !payload.title.trim()) {
            throw new EntityServiceError("Title is required", 400, "MISSING_TITLE");
        }
        if (payload.type && !ENTITY_TYPES.includes(payload.type)) {
            throw new EntityServiceError(`Invalid type. Must be one of: ${ENTITY_TYPES.join(", ")}`, 400, "INVALID_TYPE");
        }
        if (payload.status && !ENTITY_STATUSES.includes(payload.status)) {
            throw new EntityServiceError(`Invalid status. Must be one of: ${ENTITY_STATUSES.join(", ")}`, 400, "INVALID_STATUS");
        }
        /* ── Build doc with conditional spreads ── */
        const entity = await Entity.create({
            organizationId: toObjectId(payload.organizationId),
            ownerId: toObjectId(payload.ownerId),
            createdBy: toObjectId(payload.createdBy),
            title: payload.title.trim().slice(0, 300),
            type: payload.type ?? "generic",
            status: payload.status ?? "active",
            visibility: payload.visibility ?? "organization",
            ...(payload.description !== undefined && {
                description: payload.description.slice(0, 5000),
            }),
            ...(payload.tags !== undefined && { tags: payload.tags }),
            ...(payload.category !== undefined && { category: payload.category }),
            ...(payload.externalIds !== undefined && { externalIds: payload.externalIds }),
            ...(payload.customFields !== undefined && { customFields: payload.customFields }),
            ...(payload.metadata !== undefined && { metadata: payload.metadata }),
        });
        dbLogger.info(`Entity created: org=${payload.organizationId} ` +
            `id=${entity._id} type=${entity.type} owner=${payload.ownerId}`);
        return entity;
    }
    /* =====================================================
       LIST — paginated, filtered, multi-tenant safe
    ===================================================== */
    async listEntities(organizationId, filters = {}) {
        if (!isValidObjectId(organizationId)) {
            throw new EntityServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        const page = clamp(filters.page ?? 1, 1, 10_000);
        const limit = clamp(filters.limit ?? ENTITY_CONFIG.defaultPageSize, 1, ENTITY_CONFIG.maxPageSize);
        const skip = (page - 1) * limit;
        /* ── Build mongo filter ── */
        const filter = {
            organizationId: toObjectId(organizationId),
        };
        if (!filters.includeDeleted) {
            filter.isDeleted = { $ne: true };
        }
        /* Search — escape user input to prevent regex injection */
        const search = filters.search?.trim().slice(0, ENTITY_CONFIG.maxSearchLength);
        if (search) {
            const safe = escapeRegex(search);
            filter.$or = [
                { title: { $regex: safe, $options: "i" } },
                { description: { $regex: safe, $options: "i" } },
            ];
        }
        /* Multi-value filters */
        const types = normalizeFilterArray(filters.type);
        const statuses = normalizeFilterArray(filters.status);
        if (types?.length)
            filter.type = { $in: types };
        if (statuses?.length)
            filter.status = { $in: statuses };
        if (filters.ownerId && isValidObjectId(filters.ownerId)) {
            filter.ownerId = toObjectId(filters.ownerId);
        }
        if (filters.tags && filters.tags.length > 0) {
            const cleanTags = filters.tags
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean);
            if (cleanTags.length)
                filter.tags = { $in: cleanTags };
        }
        if (filters.category) {
            filter.category = filters.category;
        }
        if (filters.visibility) {
            filter.visibility = filters.visibility;
        }
        /* Date range */
        if (filters.createdAfter || filters.createdBefore) {
            const dateFilter = {};
            if (filters.createdAfter)
                dateFilter.$gte = filters.createdAfter;
            if (filters.createdBefore)
                dateFilter.$lte = filters.createdBefore;
            filter.createdAt = dateFilter;
        }
        /* ── Build sort with allowlist ── */
        const sortField = filters.sortBy && SORTABLE_FIELDS.includes(filters.sortBy)
            ? filters.sortBy
            : "createdAt";
        const sortDir = filters.sortOrder === "asc" ? 1 : -1;
        const sort = { [sortField]: sortDir };
        /* ── Run find + count in parallel ── */
        const [entities, total] = await Promise.all([
            Entity.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .populate("ownerId", "name email avatar")
                .lean(),
            Entity.countDocuments(filter),
        ]);
        return {
            entities,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    /* =====================================================
       GET BY ID — org-scoped
    ===================================================== */
    async getEntityById(entityId, organizationId, opts = {}) {
        if (!isValidObjectId(entityId)) {
            throw new EntityServiceError("Invalid entity ID", 400, "INVALID_ID");
        }
        if (!isValidObjectId(organizationId)) {
            throw new EntityServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        const entity = await Entity.findOne({
            _id: entityId,
            organizationId: toObjectId(organizationId),
            isDeleted: { $ne: true },
        }).populate("ownerId", "name email avatar");
        if (!entity)
            return null;
        /* Record view (fire-and-forget — don't block response) */
        if (opts.recordView) {
            entity.recordView().catch((err) => {
                dbLogger.error(`View tracking failed for entity ${entityId}: ${err.message}`);
            });
        }
        return entity;
    }
    /* =====================================================
       UPDATE
    ===================================================== */
    async updateEntity(entityId, organizationId, userId, updates) {
        if (!isValidObjectId(entityId) || !isValidObjectId(organizationId) || !isValidObjectId(userId)) {
            throw new EntityServiceError("Invalid ID", 400, "INVALID_ID");
        }
        /* ── Validate enum updates ── */
        if (updates.type && !ENTITY_TYPES.includes(updates.type)) {
            throw new EntityServiceError("Invalid type", 400, "INVALID_TYPE");
        }
        if (updates.status && !ENTITY_STATUSES.includes(updates.status)) {
            throw new EntityServiceError("Invalid status", 400, "INVALID_STATUS");
        }
        if (updates.visibility &&
            !ENTITY_VISIBILITY.includes(updates.visibility)) {
            throw new EntityServiceError("Invalid visibility", 400, "INVALID_VISIBILITY");
        }
        if (updates.ownerId && !isValidObjectId(updates.ownerId)) {
            throw new EntityServiceError("Invalid owner ID", 400, "INVALID_ID");
        }
        /* ── Build $set with only provided fields (conditional spread) ── */
        const $set = { updatedBy: toObjectId(userId) };
        if (updates.title !== undefined)
            $set.title = updates.title.trim().slice(0, 300);
        if (updates.description !== undefined)
            $set.description = updates.description.slice(0, 5000);
        if (updates.type !== undefined)
            $set.type = updates.type;
        if (updates.status !== undefined)
            $set.status = updates.status;
        if (updates.visibility !== undefined)
            $set.visibility = updates.visibility;
        if (updates.tags !== undefined)
            $set.tags = updates.tags;
        if (updates.category !== undefined)
            $set.category = updates.category;
        if (updates.ownerId !== undefined)
            $set.ownerId = toObjectId(updates.ownerId);
        if (updates.externalIds !== undefined)
            $set.externalIds = updates.externalIds;
        if (updates.customFields !== undefined)
            $set.customFields = updates.customFields;
        if (updates.metadata !== undefined)
            $set.metadata = updates.metadata;
        if (Object.keys($set).length === 1) {
            // only updatedBy — no actual changes
            throw new EntityServiceError("No fields to update", 400, "EMPTY_UPDATE");
        }
        const entity = await Entity.findOneAndUpdate({
            _id: entityId,
            organizationId: toObjectId(organizationId),
            isDeleted: { $ne: true },
        }, { $set }, { new: true, runValidators: true }).populate("ownerId", "name email avatar");
        if (!entity) {
            throw new EntityServiceError("Entity not found", 404, "ENTITY_NOT_FOUND");
        }
        dbLogger.info(`Entity updated: org=${organizationId} id=${entityId} ` +
            `user=${userId} fields=${Object.keys($set).filter((k) => k !== "updatedBy").join(",")}`);
        return entity;
    }
    /* =====================================================
       SOFT DELETE
    ===================================================== */
    async softDeleteEntity(entityId, organizationId, userId) {
        if (!isValidObjectId(entityId) || !isValidObjectId(organizationId) || !isValidObjectId(userId)) {
            throw new EntityServiceError("Invalid ID", 400, "INVALID_ID");
        }
        const entity = await Entity.findOneAndUpdate({
            _id: entityId,
            organizationId: toObjectId(organizationId),
            isDeleted: { $ne: true },
        }, {
            $set: {
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: toObjectId(userId),
            },
        }, { new: true });
        if (!entity) {
            throw new EntityServiceError("Entity not found", 404, "ENTITY_NOT_FOUND");
        }
        dbLogger.warn(`Entity soft-deleted: org=${organizationId} id=${entityId} user=${userId}`);
        return entity;
    }
    /* =====================================================
       RESTORE
    ===================================================== */
    async restoreEntity(entityId, organizationId, userId) {
        if (!isValidObjectId(entityId) || !isValidObjectId(organizationId) || !isValidObjectId(userId)) {
            throw new EntityServiceError("Invalid ID", 400, "INVALID_ID");
        }
        const entity = await Entity.findOneAndUpdate({
            _id: entityId,
            organizationId: toObjectId(organizationId),
            isDeleted: true,
        }, {
            $set: { isDeleted: false, updatedBy: toObjectId(userId) },
            $unset: { deletedAt: "", deletedBy: "" },
        }, { new: true });
        if (!entity) {
            throw new EntityServiceError("Entity not found or not deleted", 404, "ENTITY_NOT_FOUND");
        }
        dbLogger.info(`Entity restored: org=${organizationId} id=${entityId} user=${userId}`);
        return entity;
    }
    /* =====================================================
       BULK CREATE — for CRM imports
    ===================================================== */
    async bulkCreateEntities(payloads) {
        if (!payloads.length)
            return { created: 0, failed: 0, errors: [] };
        let created = 0;
        let failed = 0;
        const errors = [];
        /* Process in chunks to avoid overwhelming the DB */
        for (let i = 0; i < payloads.length; i += ENTITY_CONFIG.bulkChunkSize) {
            const chunk = payloads.slice(i, i + ENTITY_CONFIG.bulkChunkSize);
            const results = await Promise.allSettled(chunk.map((p) => this.createEntity(p)));
            results.forEach((r, idx) => {
                if (r.status === "fulfilled") {
                    created++;
                }
                else {
                    failed++;
                    errors.push({
                        index: i + idx,
                        error: r.reason?.message ?? "Unknown error",
                    });
                }
            });
        }
        dbLogger.info(`Bulk entity create: total=${payloads.length} created=${created} failed=${failed}`);
        return { created, failed, errors };
    }
    /* =====================================================
       STATS — org-wide aggregates
    ===================================================== */
    async getStats(organizationId) {
        if (!isValidObjectId(organizationId)) {
            throw new EntityServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        const orgId = toObjectId(organizationId);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const [total, active, archived, deleted, byType, byStatus, byOwner, viewSums, recentlyCreated,] = await Promise.all([
            Entity.countDocuments({ organizationId: orgId }),
            Entity.countDocuments({
                organizationId: orgId,
                status: "active",
                isDeleted: { $ne: true },
            }),
            Entity.countDocuments({
                organizationId: orgId,
                status: "archived",
                isDeleted: { $ne: true },
            }),
            Entity.countDocuments({ organizationId: orgId, isDeleted: true }),
            Entity.aggregate([
                { $match: { organizationId: orgId, isDeleted: { $ne: true } } },
                { $group: { _id: "$type", count: { $sum: 1 } } },
                { $project: { _id: 0, type: "$_id", count: 1 } },
                { $sort: { count: -1 } },
            ]),
            Entity.aggregate([
                { $match: { organizationId: orgId, isDeleted: { $ne: true } } },
                { $group: { _id: "$status", count: { $sum: 1 } } },
                { $project: { _id: 0, status: "$_id", count: 1 } },
            ]),
            Entity.aggregate([
                { $match: { organizationId: orgId, isDeleted: { $ne: true } } },
                { $group: { _id: "$ownerId", count: { $sum: 1 } } },
                { $project: { _id: 0, ownerId: { $toString: "$_id" }, count: 1 } },
                { $sort: { count: -1 } },
                { $limit: 10 },
            ]),
            Entity.aggregate([
                { $match: { organizationId: orgId, isDeleted: { $ne: true } } },
                { $group: { _id: null, total: { $sum: "$viewCount" } } },
            ]),
            Entity.countDocuments({
                organizationId: orgId,
                createdAt: { $gte: sevenDaysAgo },
                isDeleted: { $ne: true },
            }),
        ]);
        return {
            total,
            active,
            archived,
            deleted,
            byType,
            byStatus,
            byOwner,
            totalViews: viewSums[0]?.total ?? 0,
            recentlyCreated,
        };
    }
    /* =====================================================
       FIND BY EXTERNAL ID — for CRM sync (HubSpot/Salesforce)
    ===================================================== */
    async findByExternalId(organizationId, source, externalId) {
        if (!isValidObjectId(organizationId)) {
            throw new EntityServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        if (!externalId || !externalId.trim()) {
            throw new EntityServiceError("External ID required", 400, "MISSING_EXTERNAL_ID");
        }
        return Entity.findByExternalId(toObjectId(organizationId), source, externalId);
    }
    /* =====================================================
       PURGE — hard delete (admin only, used rarely)
       Use with caution — this BYPASSES the soft-delete TTL
       and removes data immediately.
    ===================================================== */
    async hardDeleteEntity(entityId, organizationId) {
        if (!isValidObjectId(entityId) || !isValidObjectId(organizationId)) {
            throw new EntityServiceError("Invalid ID", 400, "INVALID_ID");
        }
        const result = await Entity.deleteOne({
            _id: entityId,
            organizationId: toObjectId(organizationId),
            isDeleted: true, // safety: only allow hard-delete of already soft-deleted entities
        });
        if (result.deletedCount === 0) {
            throw new EntityServiceError("Entity not found or not soft-deleted (hard delete requires prior soft delete)", 404, "ENTITY_NOT_FOUND");
        }
        dbLogger.warn(`Entity HARD DELETED: org=${organizationId} id=${entityId}`);
        return true;
    }
}
export default new EntityService();
//# sourceMappingURL=entity.service.js.map