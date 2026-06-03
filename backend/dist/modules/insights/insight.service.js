// insight.service.ts
import mongoose from "mongoose";
import crypto from "crypto";
import Insight, { INSIGHT_CATEGORY_MAP, } from "./insights.model.js";
import { dbLogger } from "../../utils/logger.js";
/* =====================================================
   ERRORS
===================================================== */
export class InsightServiceError extends Error {
    statusCode;
    code;
    constructor(message, statusCode = 400, code = "INSIGHT_SERVICE_ERROR") {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = "InsightServiceError";
    }
}
/* =====================================================
   CONFIG
===================================================== */
export const INSIGHT_CONFIG = {
    /* TTL — auto-expire active insights after this period */
    defaultTtlDays: 14,
    /* Pagination */
    defaultPageSize: 20,
    maxPageSize: 100,
    /* Bulk operations */
    bulkChunkSize: 500,
    /* Severity ranking for sorting */
    severityRank: {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
    },
};
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
/**
 * Generate a deterministic fingerprint for deduplication.
 * Same insight type + target + key context → same fingerprint.
 * Re-running the engine on the same data won't create duplicates.
 */
function generateFingerprint(input) {
    const raw = [
        input.organizationId,
        input.type,
        input.targetType,
        input.targetId,
        input.contextKey ?? "",
    ].join(":");
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}
function normalizeFilterArray(value) {
    if (value === undefined)
        return undefined;
    return Array.isArray(value) ? value : [value];
}
/* =====================================================
   SERVICE
===================================================== */
class InsightService {
    /* =====================================================
       CREATE / UPSERT — single insight
       Uses fingerprint-based upsert so re-runs don't create duplicates.
    ===================================================== */
    async createInsight(input) {
        /* ── Validation ── */
        if (!isValidObjectId(input.organizationId)) {
            throw new InsightServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        if (!isValidObjectId(input.target.id)) {
            throw new InsightServiceError("Invalid target ID", 400, "INVALID_ID");
        }
        if (input.assignedTo && !isValidObjectId(input.assignedTo)) {
            throw new InsightServiceError("Invalid assignee ID", 400, "INVALID_ID");
        }
        /* ── Build fingerprint for dedup ── */
        const fingerprint = input.fingerprint ??
            generateFingerprint({
                organizationId: input.organizationId,
                type: input.type,
                targetType: input.target.type,
                targetId: input.target.id,
            });
        /* ── Build expiresAt if not provided ── */
        const expiresAt = input.expiresAt ??
            new Date(Date.now() + INSIGHT_CONFIG.defaultTtlDays * 24 * 60 * 60 * 1000);
        /* ── Upsert via static method ── */
        const insight = await Insight.upsertByFingerprint({
            organizationId: toObjectId(input.organizationId),
            type: input.type,
            category: INSIGHT_CATEGORY_MAP[input.type],
            severity: input.severity ?? "medium",
            source: input.source ?? "rules_engine",
            ...(input.engineVersion !== undefined && { engineVersion: input.engineVersion }),
            title: input.title,
            message: input.message,
            reasoning: input.reasoning ?? [],
            actions: input.actions ?? [],
            target: {
                type: input.target.type,
                id: toObjectId(input.target.id),
                ...(input.target.name !== undefined && { name: input.target.name }),
                ...(input.target.url !== undefined && { url: input.target.url }),
            },
            assignedTo: input.assignedTo ? toObjectId(input.assignedTo) : null,
            visibleToRoles: input.visibleToRoles ?? [],
            confidence: input.confidence ?? 70,
            expectedImpact: input.expectedImpact ?? "medium",
            ...(input.estimatedValueAtRisk !== undefined && { estimatedValueAtRisk: input.estimatedValueAtRisk }),
            expiresAt,
            fingerprint,
            metadata: input.metadata ?? {},
        });
        dbLogger.info(`Insight upserted: org=${input.organizationId} type=${input.type} ` +
            `target=${input.target.type}:${input.target.id} fingerprint=${fingerprint}`);
        return insight;
    }
    /* =====================================================
       BULK CREATE — for batch generation from rules engine
    ===================================================== */
    async bulkCreateInsights(inputs) {
        if (!inputs.length)
            return { created: 0, updated: 0, failed: 0 };
        let created = 0;
        let updated = 0;
        let failed = 0;
        /* Process in chunks to avoid overwhelming the DB */
        for (let i = 0; i < inputs.length; i += INSIGHT_CONFIG.bulkChunkSize) {
            const chunk = inputs.slice(i, i + INSIGHT_CONFIG.bulkChunkSize);
            const results = await Promise.allSettled(chunk.map(async (input) => {
                const fingerprint = input.fingerprint ??
                    generateFingerprint({
                        organizationId: input.organizationId,
                        type: input.type,
                        targetType: input.target.type,
                        targetId: input.target.id,
                    });
                const existed = await Insight.findOne({
                    organizationId: toObjectId(input.organizationId),
                    fingerprint,
                }).select("_id").lean();
                await this.createInsight(input);
                return existed ? "updated" : "created";
            }));
            for (const r of results) {
                if (r.status === "fulfilled") {
                    if (r.value === "created")
                        created++;
                    else
                        updated++;
                }
                else {
                    failed++;
                    dbLogger.error(`Bulk insight create failure: ${r.reason?.message}`);
                }
            }
        }
        dbLogger.info(`Bulk insights complete: total=${inputs.length} ` +
            `created=${created} updated=${updated} failed=${failed}`);
        return { created, updated, failed };
    }
    /* =====================================================
       LIST INSIGHTS — paginated, filtered
    ===================================================== */
    async listInsights(organizationId, filters = {}) {
        if (!isValidObjectId(organizationId)) {
            throw new InsightServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        const page = Math.max(filters.page ?? 1, 1);
        const limit = Math.min(Math.max(filters.limit ?? INSIGHT_CONFIG.defaultPageSize, 1), INSIGHT_CONFIG.maxPageSize);
        const skip = (page - 1) * limit;
        /* ── Build query ── */
        const query = {
            organizationId: toObjectId(organizationId),
        };
        const status = normalizeFilterArray(filters.status);
        if (status?.length)
            query.status = { $in: status };
        const category = normalizeFilterArray(filters.category);
        if (category?.length)
            query.category = { $in: category };
        const type = normalizeFilterArray(filters.type);
        if (type?.length)
            query.type = { $in: type };
        const severity = normalizeFilterArray(filters.severity);
        if (severity?.length)
            query.severity = { $in: severity };
        if (filters.assignedTo && isValidObjectId(filters.assignedTo)) {
            query.assignedTo = toObjectId(filters.assignedTo);
        }
        if (filters.targetType) {
            query["target.type"] = filters.targetType;
        }
        if (filters.targetId && isValidObjectId(filters.targetId)) {
            query["target.id"] = toObjectId(filters.targetId);
        }
        if (filters.source)
            query.source = filters.source;
        if (filters.generatedAfter || filters.generatedBefore) {
            const dateFilter = {};
            if (filters.generatedAfter)
                dateFilter.$gte = filters.generatedAfter;
            if (filters.generatedBefore)
                dateFilter.$lte = filters.generatedBefore;
            query.generatedAt = dateFilter;
        }
        /* ── Build sort ── */
        const sortField = filters.sortBy ?? "generatedAt";
        const sortOrder = filters.sortOrder === "asc" ? 1 : -1;
        const sort = sortField === "severity"
            ? { severity: sortOrder, generatedAt: -1 }
            : { [sortField]: sortOrder };
        /* ── Run find + count in parallel ── */
        const [insights, total] = await Promise.all([
            Insight.find(query)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .populate("assignedTo", "name email avatar")
                .lean(),
            Insight.countDocuments(query),
        ]);
        return {
            insights,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    /* =====================================================
       GET INSIGHT BY ID — org-scoped
    ===================================================== */
    async getInsightById(insightId, organizationId) {
        if (!isValidObjectId(insightId)) {
            throw new InsightServiceError("Invalid insight ID", 400, "INVALID_ID");
        }
        if (!isValidObjectId(organizationId)) {
            throw new InsightServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        return Insight.findOne({
            _id: insightId,
            organizationId: toObjectId(organizationId),
        })
            .populate("assignedTo", "name email avatar")
            .lean();
    }
    /* =====================================================
       GET FOR REP — daily action queue
    ===================================================== */
    async getInsightsForRep(userId, organizationId, opts = {}) {
        if (!isValidObjectId(userId) || !isValidObjectId(organizationId)) {
            throw new InsightServiceError("Invalid ID", 400, "INVALID_ID");
        }
        return Insight.findActiveForUser(toObjectId(userId), toObjectId(organizationId), opts);
    }
    /* =====================================================
       LIFECYCLE — mark seen / acted / dismissed / snoozed
    ===================================================== */
    async markSeen(insightId, userId, organizationId) {
        const insight = await this.findOrThrow(insightId, organizationId);
        insight.markSeen(toObjectId(userId));
        await insight.save();
        dbLogger.info(`Insight seen: id=${insightId} user=${userId}`);
        return insight;
    }
    async markActed(insightId, userId, organizationId) {
        const insight = await this.findOrThrow(insightId, organizationId);
        insight.markActed(toObjectId(userId));
        await insight.save();
        dbLogger.info(`Insight acted: id=${insightId} user=${userId}`);
        return insight;
    }
    async dismiss(insightId, userId, organizationId, reason) {
        const insight = await this.findOrThrow(insightId, organizationId);
        insight.dismiss(toObjectId(userId), reason);
        await insight.save();
        dbLogger.info(`Insight dismissed: id=${insightId} user=${userId} reason=${reason ?? "none"}`);
        return insight;
    }
    async snooze(insightId, userId, organizationId, until) {
        if (until <= new Date()) {
            throw new InsightServiceError("Snooze date must be in the future", 400, "INVALID_SNOOZE_DATE");
        }
        const insight = await this.findOrThrow(insightId, organizationId);
        insight.snooze(until, toObjectId(userId));
        await insight.save();
        dbLogger.info(`Insight snoozed: id=${insightId} until=${until.toISOString()}`);
        return insight;
    }
    /* =====================================================
       FEEDBACK — for ML training data
    ===================================================== */
    async submitFeedback(insightId, userId, organizationId, feedback) {
        if (!["helpful", "not_helpful", "irrelevant"].includes(feedback.rating)) {
            throw new InsightServiceError("Invalid rating", 400, "INVALID_RATING");
        }
        const insight = await this.findOrThrow(insightId, organizationId);
        insight.feedback = {
            rating: feedback.rating,
            ...(feedback.comment !== undefined && { comment: feedback.comment }),
            submittedAt: new Date(),
            submittedBy: toObjectId(userId),
        };
        await insight.save();
        dbLogger.info(`Insight feedback submitted: id=${insightId} rating=${feedback.rating}`);
        return insight;
    }
    /* =====================================================
       STATS — aggregated metrics for dashboards
    ===================================================== */
    async getStats(organizationId) {
        if (!isValidObjectId(organizationId)) {
            throw new InsightServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        const orgId = toObjectId(organizationId);
        const baseMatch = { organizationId: orgId };
        const [total, active, byCategory, bySeverity, byStatus, byAssignee, averages, acceptanceData,] = await Promise.all([
            Insight.countDocuments(baseMatch),
            Insight.countDocuments({
                ...baseMatch,
                status: { $in: ["active", "seen"] },
            }),
            Insight.aggregate([
                { $match: baseMatch },
                { $group: { _id: "$category", count: { $sum: 1 } } },
                { $project: { _id: 0, category: "$_id", count: 1 } },
                { $sort: { count: -1 } },
            ]),
            Insight.aggregate([
                { $match: baseMatch },
                { $group: { _id: "$severity", count: { $sum: 1 } } },
                { $project: { _id: 0, severity: "$_id", count: 1 } },
            ]),
            Insight.aggregate([
                { $match: baseMatch },
                { $group: { _id: "$status", count: { $sum: 1 } } },
                { $project: { _id: 0, status: "$_id", count: 1 } },
            ]),
            Insight.aggregate([
                { $match: { ...baseMatch, assignedTo: { $ne: null } } },
                { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
                { $project: { _id: 0, userId: { $toString: "$_id" }, count: 1 } },
                { $sort: { count: -1 } },
                { $limit: 10 },
            ]),
            Insight.aggregate([
                { $match: baseMatch },
                {
                    $group: {
                        _id: null,
                        avgConfidence: { $avg: "$confidence" },
                        totalValueAtRisk: {
                            $sum: { $ifNull: ["$estimatedValueAtRisk", 0] },
                        },
                    },
                },
            ]),
            Insight.aggregate([
                {
                    $match: {
                        ...baseMatch,
                        status: { $in: ["acted", "dismissed"] },
                    },
                },
                {
                    $group: {
                        _id: null,
                        acted: {
                            $sum: { $cond: [{ $eq: ["$status", "acted"] }, 1, 0] },
                        },
                        dismissed: {
                            $sum: { $cond: [{ $eq: ["$status", "dismissed"] }, 1, 0] },
                        },
                    },
                },
            ]),
        ]);
        const avgData = averages[0] ?? { avgConfidence: 0, totalValueAtRisk: 0 };
        const accData = acceptanceData[0] ?? { acted: 0, dismissed: 0 };
        const accDenom = accData.acted + accData.dismissed;
        const acceptanceRate = accDenom > 0 ? (accData.acted / accDenom) * 100 : 0;
        return {
            total,
            active,
            byCategory,
            bySeverity,
            byStatus,
            byAssignee,
            averageConfidence: Math.round(avgData.avgConfidence ?? 0),
            totalValueAtRisk: Math.round(avgData.totalValueAtRisk ?? 0),
            acceptedCount: accData.acted,
            dismissedCount: accData.dismissed,
            acceptanceRate: Math.round(acceptanceRate * 10) / 10,
        };
    }
    /* =====================================================
       EXPIRE STALE INSIGHTS — cleanup cron
    ===================================================== */
    async expireStale(organizationId) {
        if (!isValidObjectId(organizationId)) {
            throw new InsightServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        const count = await Insight.expireStaleInsights(toObjectId(organizationId));
        dbLogger.info(`Stale insights expired: org=${organizationId} count=${count}`);
        return count;
    }
    /* =====================================================
       ARCHIVE — soft delete by ID
    ===================================================== */
    async archiveInsight(insightId, userId, organizationId) {
        const insight = await this.findOrThrow(insightId, organizationId);
        insight.status = "archived";
        insight.statusHistory.push({
            status: "archived",
            changedAt: new Date(),
            changedBy: toObjectId(userId),
        });
        await insight.save();
        dbLogger.warn(`Insight archived: id=${insightId} user=${userId}`);
        return insight;
    }
    /* =====================================================
       RESOLVE STALE — auto-resolve insights when conditions improved
       Example: a "stale_deal" insight fires; rep then logs activity →
       the underlying condition is gone, so the insight should auto-resolve.
    ===================================================== */
    async autoResolveByTarget(organizationId, targetType, targetId, types) {
        if (!isValidObjectId(organizationId) ||
            !isValidObjectId(targetId)) {
            throw new InsightServiceError("Invalid ID", 400, "INVALID_ID");
        }
        const result = await Insight.updateMany({
            organizationId: toObjectId(organizationId),
            "target.type": targetType,
            "target.id": toObjectId(targetId),
            type: { $in: types },
            status: { $in: ["active", "seen"] },
        }, {
            $set: { status: "expired" },
            $push: {
                statusHistory: {
                    status: "expired",
                    changedAt: new Date(),
                    note: "Auto-resolved: underlying condition no longer met",
                },
            },
        });
        if (result.modifiedCount > 0) {
            dbLogger.info(`Auto-resolved ${result.modifiedCount} insights: ` +
                `target=${targetType}:${targetId} types=${types.join(",")}`);
        }
        return result.modifiedCount;
    }
    /* =====================================================
       PRIVATE HELPERS
    ===================================================== */
    async findOrThrow(insightId, organizationId) {
        if (!isValidObjectId(insightId)) {
            throw new InsightServiceError("Invalid insight ID", 400, "INVALID_ID");
        }
        if (!isValidObjectId(organizationId)) {
            throw new InsightServiceError("Invalid organization ID", 400, "INVALID_ID");
        }
        const insight = await Insight.findOne({
            _id: insightId,
            organizationId: toObjectId(organizationId),
        });
        if (!insight) {
            throw new InsightServiceError("Insight not found", 404, "INSIGHT_NOT_FOUND");
        }
        return insight;
    }
}
export default new InsightService();
//# sourceMappingURL=insight.service.js.map