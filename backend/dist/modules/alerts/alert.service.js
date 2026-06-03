import { Types } from "mongoose";
import Alert from "./alert.model.js";
/* =====================================================
   HELPERS
===================================================== */
function toObjectId(id) {
    if (id instanceof Types.ObjectId)
        return id;
    if (!Types.ObjectId.isValid(id))
        throw new Error(`Invalid ObjectId: ${id}`);
    return new Types.ObjectId(id);
}
function buildDedupKey(type, relatedType, relatedId) {
    return `${type}-${relatedType}-${relatedId.toString()}`;
}
const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
/* =====================================================
   SERVICE
===================================================== */
class AlertService {
    /* ── CREATE ALERT (dedup + cooldown + atomic upsert) ── */
    async createAlert(data) {
        const orgId = toObjectId(data.organizationId);
        const relatedId = toObjectId(data.relatedTo.id);
        const dedupKey = buildDedupKey(data.type, data.relatedTo.type, relatedId);
        /* Fast-path: skip write if alert exists within cooldown window */
        const cooldownTime = new Date(Date.now() - COOLDOWN_MS);
        const existing = await Alert.findOne({
            organizationId: orgId,
            dedupKey,
            status: "active",
            createdAt: { $gte: cooldownTime },
        })
            .select("_id")
            .lean();
        if (existing)
            return existing;
        /* Atomic upsert — handles concurrent writes safely */
        try {
            return await Alert.findOneAndUpdate({ organizationId: orgId, dedupKey }, {
                $setOnInsert: {
                    type: data.type,
                    severity: data.severity,
                    title: data.title,
                    message: data.message,
                    relatedTo: { type: data.relatedTo.type, id: relatedId },
                    organizationId: orgId,
                    dedupKey,
                    isRead: false,
                    status: "active",
                    metadata: data.metadata ?? {},
                },
            }, { new: true, upsert: true }).lean();
        }
        catch (err) {
            /* Duplicate key — another process won the race; return existing */
            if (typeof err === "object" &&
                err !== null &&
                err.code === 11000) {
                return Alert.findOne({ organizationId: orgId, dedupKey }).lean();
            }
            throw err;
        }
    }
    /* ── GET ALERTS (paginated + filterable) ── */
    async getAlerts(orgId, options = {}) {
        const { page = 1, limit = 20, status = "active", isRead, severity, } = options;
        const query = {
            organizationId: toObjectId(orgId),
            status,
        };
        if (typeof isRead === "boolean")
            query.isRead = isRead;
        if (severity)
            query.severity = severity;
        const skip = (page - 1) * limit;
        const [alerts, total] = await Promise.all([
            Alert.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Alert.countDocuments(query),
        ]);
        return {
            data: alerts,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    }
    /* ── UNREAD COUNT ── */
    async getUnreadCount(orgId) {
        return Alert.countDocuments({
            organizationId: toObjectId(orgId),
            isRead: false,
            status: "active",
        });
    }
    /* ── MARK AS READ ── */
    async markAsRead(alertId) {
        if (!Types.ObjectId.isValid(alertId))
            return null;
        return Alert.findByIdAndUpdate(alertId, { isRead: true }, { new: true }).lean();
    }
    /* ── MARK ALL AS READ ── */
    async markAllAsRead(orgId) {
        return Alert.updateMany({ organizationId: toObjectId(orgId), isRead: false }, { isRead: true });
    }
    /* ── RESOLVE ALERT ── */
    async resolveAlert(alertId) {
        if (!Types.ObjectId.isValid(alertId))
            return null;
        return Alert.findByIdAndUpdate(alertId, { status: "resolved", isRead: true }, { new: true }).lean();
    }
    /* ── RESOLVE BY ENTITY (smart bulk cleanup) ── */
    async resolveByEntity(relatedType, relatedId, organizationId) {
        return Alert.updateMany({
            "relatedTo.type": relatedType,
            "relatedTo.id": toObjectId(relatedId),
            organizationId: toObjectId(organizationId),
            status: "active",
        }, { status: "resolved", isRead: true });
    }
    /* ── DELETE ALERT ── */
    async deleteAlert(alertId) {
        if (!Types.ObjectId.isValid(alertId))
            return null;
        return Alert.findByIdAndDelete(alertId).lean();
    }
    /* ── PURGE OLD RESOLVED ALERTS (maintenance) ── */
    async purgeOldResolved(organizationId, olderThanDays = 30) {
        const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
        const result = await Alert.deleteMany({
            organizationId: toObjectId(organizationId),
            status: "resolved",
            createdAt: { $lt: cutoff },
        });
        return { deletedCount: result.deletedCount ?? 0 };
    }
}
export default new AlertService();
//# sourceMappingURL=alert.service.js.map