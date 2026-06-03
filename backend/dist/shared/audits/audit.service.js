import mongoose from "mongoose";
import AuditLog from "./audit.model.js";
import { dbLogger } from "../../utils/logger.js";
// ============================================================
// CONFIG
// ============================================================
const AUDIT_SERVICE_CONFIG = {
    /**
     * Whether audit failures should throw. Default: false.
     * Audit logging must NEVER break the user's operation.
     * Set true only in tests where audit emission is asserted.
     */
    throwOnFailure: process.env.AUDIT_THROW_ON_FAILURE === "true",
    /**
     * Caps to defend against bloated payloads.
     */
    caps: {
        metadataFieldLength: 10_000,
        metadataDepth: 5,
        metadataKeys: 50,
        userAgentLength: 500,
        ipLength: 100,
        actionLength: 100,
        resourceLength: 100,
        errorMessageLength: 1_000,
    },
    /**
     * Default page size for query helpers.
     */
    defaultLimit: 100,
    maxLimit: 500,
    /**
     * Fields redacted from metadata before storage.
     * Audit logs should never store secrets.
     */
    redactedFields: [
        "password",
        "newpassword",
        "currentpassword",
        "passwordhash",
        "token",
        "refreshtoken",
        "accesstoken",
        "apikey",
        "secret",
        "privatekey",
        "creditcard",
        "cardnumber",
        "cvv",
        "ssn",
    ],
};
// ============================================================
// HELPERS
// ============================================================
/**
 * Coerce ID shapes to ObjectId. Returns null on invalid input.
 */
function toObjectId(value) {
    if (!value)
        return null;
    if (value instanceof mongoose.Types.ObjectId)
        return value;
    if (typeof value === "string") {
        if (!mongoose.Types.ObjectId.isValid(value))
            return null;
        return new mongoose.Types.ObjectId(value);
    }
    return null;
}
/**
 * Normalize an action/resource label — uppercase, trimmed, length-capped.
 */
function normalizeLabel(value, maxLength) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .slice(0, maxLength);
}
/**
 * Extract client IP from request.
 */
function getClientIp(req) {
    if (!req)
        return "";
    return (req.ip ||
        req.socket?.remoteAddress ||
        "");
}
/**
 * Extract user-agent from request, length-capped.
 */
function getUserAgent(req) {
    if (!req)
        return "";
    const ua = req.get?.("user-agent") ?? "";
    return String(ua).slice(0, AUDIT_SERVICE_CONFIG.caps.userAgentLength);
}
/**
 * Extract request ID set by the request logger middleware.
 */
function getRequestId(req) {
    if (!req)
        return undefined;
    const reqWithId = req;
    if (typeof reqWithId.requestId === "string")
        return reqWithId.requestId;
    const header = req.headers["x-request-id"] ||
        req.headers["x-correlation-id"];
    return typeof header === "string" && header.length > 0 ? header : undefined;
}
/**
 * Recursively sanitize metadata: redact sensitive fields, enforce
 * depth and key limits, truncate huge values.
 */
function sanitizeMetadata(meta, depth = 0) {
    if (depth > AUDIT_SERVICE_CONFIG.caps.metadataDepth) {
        return "[MAX_DEPTH_EXCEEDED]";
    }
    if (meta === null || meta === undefined)
        return meta;
    if (typeof meta === "string") {
        if (meta.length > AUDIT_SERVICE_CONFIG.caps.metadataFieldLength) {
            return meta.slice(0, AUDIT_SERVICE_CONFIG.caps.metadataFieldLength) +
                "...[truncated:" + meta.length + "]";
        }
        return meta;
    }
    if (typeof meta === "number" || typeof meta === "boolean")
        return meta;
    if (Array.isArray(meta)) {
        return meta
            .slice(0, AUDIT_SERVICE_CONFIG.caps.metadataKeys)
            .map((item) => sanitizeMetadata(item, depth + 1));
    }
    if (typeof meta === "object") {
        const obj = meta;
        const out = {};
        let count = 0;
        for (const [key, value] of Object.entries(obj)) {
            if (count >= AUDIT_SERVICE_CONFIG.caps.metadataKeys) {
                out["_truncated_"] = "Additional keys omitted (max " +
                    AUDIT_SERVICE_CONFIG.caps.metadataKeys + ")";
                break;
            }
            if (AUDIT_SERVICE_CONFIG.redactedFields.includes(key.toLowerCase())) {
                out[key] = "[REDACTED]";
            }
            else {
                out[key] = sanitizeMetadata(value, depth + 1);
            }
            count++;
        }
        return out;
    }
    // Functions, symbols, etc. — never store
    return undefined;
}
/**
 * Validate required fields. Returns error message or null.
 */
function validatePayload(payload) {
    if (!payload.action || String(payload.action).trim().length === 0) {
        return "action is required";
    }
    if (!payload.organizationId) {
        return "organizationId is required";
    }
    return null;
}
/**
 * Convert an AuditPayload (with legacy field names) to the document
 * shape that audit.model.ts expects (actorId, meta).
 */
function buildAuditDoc(payload) {
    // Validate required fields
    const validationError = validatePayload(payload);
    if (validationError) {
        dbLogger.warn("Audit skipped — invalid payload: " + validationError);
        return null;
    }
    // Coerce organizationId
    const orgId = toObjectId(payload.organizationId);
    if (!orgId) {
        dbLogger.warn("Audit skipped — invalid organizationId: " +
            String(payload.organizationId));
        return null;
    }
    // Coerce actor — accept either 'userId' (legacy) or 'actorId' (canonical)
    const actorRaw = payload.actorId ?? payload.userId;
    const actorObjectId = toObjectId(actorRaw);
    let actorIdString;
    if (!actorObjectId && actorRaw) {
        // Non-ObjectId actor (e.g. "system", "cron-cleanup")
        actorIdString = String(actorRaw).slice(0, 100);
    }
    const resourceObjectId = toObjectId(payload.resourceId);
    // Merge legacy metadata and canonical meta fields
    const mergedMeta = {
        ...(payload.metadata ?? {}),
        ...(payload.meta ?? {}),
    };
    const sanitizedMeta = sanitizeMetadata(mergedMeta);
    // Augment with request context
    if (actorIdString && !sanitizedMeta.actorIdString) {
        sanitizedMeta.actorIdString = actorIdString;
    }
    const requestId = getRequestId(payload.req);
    if (requestId && !sanitizedMeta.requestId) {
        sanitizedMeta.requestId = requestId;
    }
    if (payload.success === false) {
        sanitizedMeta.success = false;
        if (payload.errorCode) {
            sanitizedMeta.errorCode = payload.errorCode;
        }
        if (payload.errorMessage) {
            sanitizedMeta.errorMessage = String(payload.errorMessage)
                .slice(0, AUDIT_SERVICE_CONFIG.caps.errorMessageLength);
        }
    }
    // Build the doc using the MODEL's field names (actorId, meta)
    const doc = {
        organizationId: orgId,
        action: normalizeLabel(payload.action, AUDIT_SERVICE_CONFIG.caps.actionLength),
        resource: normalizeLabel(payload.resource, AUDIT_SERVICE_CONFIG.caps.resourceLength),
        meta: sanitizedMeta,
        ip: (payload.ip ?? getClientIp(payload.req)).slice(0, AUDIT_SERVICE_CONFIG.caps.ipLength),
        userAgent: (payload.userAgent ?? getUserAgent(payload.req)).slice(0, AUDIT_SERVICE_CONFIG.caps.userAgentLength),
    };
    if (actorObjectId)
        doc.actorId = actorObjectId;
    if (resourceObjectId)
        doc.resourceId = resourceObjectId;
    return doc;
}
// ============================================================
// SERVICE
// ============================================================
class AuditService {
    // -----------------------------------------------------------
    // LOG A SINGLE AUDIT ENTRY
    // -----------------------------------------------------------
    /**
     * Persist a single audit log entry.
     *
     * *Failure isolation:* Errors are logged but never thrown by default —
     * audit failures must not break user operations. Override via the
     * AUDIT_THROW_ON_FAILURE env var (for tests).
     */
    async log(payload) {
        try {
            const doc = buildAuditDoc(payload);
            if (!doc)
                return;
            const AuditLogModel = AuditLog;
            await AuditLogModel.create(doc);
        }
        catch (err) {
            dbLogger.error("Audit log failed: " +
                "action=" + String(payload.action) + " " +
                "resource=" + String(payload.resource ?? "") + " " +
                "error=" + (err?.message ?? "unknown"));
            if (AUDIT_SERVICE_CONFIG.throwOnFailure) {
                throw err;
            }
        }
    }
    // -----------------------------------------------------------
    // BULK LOG — for high-throughput scenarios
    // -----------------------------------------------------------
    /**
     * Persist multiple audit entries in a single bulk write.
     * Use for batch operations to avoid N database round-trips.
     *
     * Same failure-isolation semantics — failures logged, never thrown.
     */
    async logBulk(payloads) {
        if (!Array.isArray(payloads) || payloads.length === 0)
            return;
        try {
            const docs = [];
            for (const payload of payloads) {
                const doc = buildAuditDoc(payload);
                if (doc)
                    docs.push(doc);
            }
            if (docs.length === 0)
                return;
            const AuditLogModel = AuditLog;
            await AuditLogModel.insertMany(docs, { ordered: false });
        }
        catch (err) {
            dbLogger.error("Audit bulk log failed: count=" + payloads.length +
                " error=" + (err?.message ?? "unknown"));
            if (AUDIT_SERVICE_CONFIG.throwOnFailure) {
                throw err;
            }
        }
    }
    // -----------------------------------------------------------
    // QUERY HELPERS — used by the audit controller
    // -----------------------------------------------------------
    /**
     * Build a Mongo filter from query options. Always scopes to org.
     */
    buildFilter(filter) {
        const orgId = toObjectId(filter.organizationId);
        if (!orgId) {
            // Should never happen if controllers validate first, but defensive
            throw new Error("buildFilter requires a valid organizationId");
        }
        const out = {
            organizationId: orgId,
        };
        if (filter.action) {
            out.action = normalizeLabel(filter.action, AUDIT_SERVICE_CONFIG.caps.actionLength);
        }
        if (filter.resource) {
            out.resource = normalizeLabel(filter.resource, AUDIT_SERVICE_CONFIG.caps.resourceLength);
        }
        const resourceId = toObjectId(filter.resourceId);
        if (resourceId) {
            out.resourceId = resourceId;
        }
        // Accept either actorId or userId at the filter layer
        const actor = toObjectId(filter.actorId ?? filter.userId);
        if (actor) {
            out.actorId = actor;
        }
        if (filter.fromDate || filter.toDate) {
            const dateFilter = {};
            if (filter.fromDate) {
                const from = new Date(filter.fromDate);
                if (!isNaN(from.getTime()))
                    dateFilter.$gte = from;
            }
            if (filter.toDate) {
                const to = new Date(filter.toDate);
                if (!isNaN(to.getTime()))
                    dateFilter.$lte = to;
            }
            if (Object.keys(dateFilter).length > 0) {
                out.createdAt = dateFilter;
            }
        }
        return out;
    }
    /**
     * Find audit logs with pagination.
     */
    async find(filter, options = {}) {
        const mongoFilter = this.buildFilter(filter);
        const limit = Math.min(Math.max(options.limit ?? AUDIT_SERVICE_CONFIG.defaultLimit, 1), AUDIT_SERVICE_CONFIG.maxLimit);
        const skip = Math.max(options.skip ?? 0, 0);
        const sort = options.sortOrder === "asc" ? 1 : -1;
        const AuditLogModel = AuditLog;
        return AuditLogModel
            .find(mongoFilter)
            .sort({ createdAt: sort })
            .skip(skip)
            .limit(limit)
            .populate("actorId", "name email")
            .lean();
    }
    /**
     * Count audit logs matching the filter.
     */
    async count(filter) {
        const mongoFilter = this.buildFilter(filter);
        const AuditLogModel = AuditLog;
        return AuditLogModel.countDocuments(mongoFilter);
    }
    /**
     * Find a single audit log by ID, scoped to org.
     */
    async findOne(id, organizationId) {
        const logId = toObjectId(id);
        const orgId = toObjectId(organizationId);
        if (!logId || !orgId)
            return null;
        const AuditLogModel = AuditLog;
        return AuditLogModel
            .findOne({ _id: logId, organizationId: orgId })
            .populate("actorId", "name email")
            .lean();
    }
}
// ============================================================
// SINGLETON EXPORT
// ============================================================
const auditService = new AuditService();
// Legacy named export — backward compatibility with existing callers.
// @deprecated Use auditService.log() directly.
export const logAudit = (payload) => auditService.log(payload);
export default auditService;
//# sourceMappingURL=audit.service.js.map