import mongoose from "mongoose";
import AuditLog from "../../modules/audit/audit.model.js";
import logger from "../../utils/logger.js";
/* ================= POLICY MAPS ================= */
const CRITICAL_ACTIONS = new Set([
    "USER_DELETED", "ORGANIZATION_DELETED", "ROLE_CHANGED", "PERMISSION_GRANTED",
    "PERMISSION_REVOKED", "API_KEY_CREATED", "API_KEY_REVOKED", "PASSWORD_RESET",
    "LOGIN_FAILED", "ACCESS_DENIED", "DATA_EXPORTED", "BULK_DELETED",
    "INTEGRATION_CONNECTED", "INTEGRATION_DISCONNECTED",
]);
const SENSITIVE_KEYS = new Set([
    "password", "passwordHash", "token", "accessToken", "refreshToken",
    "apiKey", "secret", "ssn", "creditCard", "cvv", "authorization", "cookie",
]);
/* ================= HELPERS ================= */
function isValidObjectId(id) {
    if (!id)
        return false;
    return mongoose.Types.ObjectId.isValid(id);
}
function toObjectId(id) {
    return new mongoose.Types.ObjectId(id);
}
function scrubSensitive(value, depth = 0) {
    if (depth > 10)
        return "[max-depth-exceeded]";
    if (value === null || value === undefined)
        return value;
    if (typeof value !== "object")
        return value;
    if (Array.isArray(value)) {
        return value.map(v => scrubSensitive(v, depth + 1));
    }
    const out = {};
    for (const [key, val] of Object.entries(value)) {
        out[key] = SENSITIVE_KEYS.has(key.toLowerCase())
            ? "[REDACTED]"
            : scrubSensitive(val, depth + 1);
    }
    return out;
}
function capPayload(value, maxBytes = 16_000) {
    try {
        const str = JSON.stringify(value);
        if (str.length <= maxBytes)
            return value;
        return { _truncated: true, _originalSize: str.length, preview: str.slice(0, maxBytes) + "...[truncated]" };
    }
    catch {
        return { _error: "unserializable" };
    }
}
function deriveSeverity(action, outcome) {
    if (outcome === "failure" || outcome === "denied")
        return "critical";
    if (CRITICAL_ACTIONS.has(action))
        return "critical";
    return "info";
}
function deriveActorType(userId) {
    return userId ? "user" : "system";
}
/* ================= SERVICE ================= */
class AuditService {
    /* ── LOG ── */
    async log(params) {
        try {
            if (!isValidObjectId(params.organizationId)) {
                logger.error({ action: `${params.action}`, resource: params.resource, organizationId: params.organizationId }, "Invalid organizationId for audit log");
                return;
            }
            if (params.userId && !isValidObjectId(params.userId)) {
                logger.error({ userId: params.userId, action: `${params.action}` }, "Invalid userId for audit log");
                return;
            }
            if (params.resourceId && !isValidObjectId(params.resourceId)) {
                logger.error({ resourceId: params.resourceId, action: `${params.action}` }, "Invalid resourceId for audit log");
                return;
            }
            if (params.idempotencyKey) {
                const existing = await AuditLog.findOne({
                    idempotencyKey: params.idempotencyKey,
                }).lean();
                if (existing)
                    return;
            }
            const outcome = params.outcome ?? "success";
            const actorType = params.actorType ?? deriveActorType(params.userId);
            const severity = params.severity ?? deriveSeverity(params.action, outcome);
            const safeBefore = capPayload(scrubSensitive(params.before));
            const safeAfter = capPayload(scrubSensitive(params.after));
            const safeMetadata = capPayload(scrubSensitive(params.metadata ?? {}));
            const doc = {
                organizationId: toObjectId(params.organizationId),
                userId: params.userId ? toObjectId(params.userId) : null,
                actorType,
                actorName: params.actorName,
                action: params.action,
                resource: params.resource,
                resourceId: params.resourceId ? toObjectId(params.resourceId) : null,
                outcome,
                severity,
                before: safeBefore ?? null,
                after: safeAfter ?? null,
                metadata: safeMetadata ?? {},
                requestContext: params.requestContext,
                errorMessage: params.errorMessage,
                idempotencyKey: params.idempotencyKey,
            };
            await AuditLog.create([doc], { session: params.session ?? null });
            if (severity === "critical") {
                logger.warn({
                    action: `${params.action}`,
                    resource: `${params.resource}`,
                    organizationId: params.organizationId,
                    userId: params.userId,
                    outcome,
                }, "Critical audit event");
            }
        }
        catch (error) {
            logger.error({
                action: `${params.action}`,
                resource: `${params.resource}`,
                organizationId: params.organizationId,
                userId: params.userId,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }, "Audit log write failed");
        }
    }
    /* ── CONVENIENCE HELPERS ── */
    async logSuccess(params) {
        return this.log({ ...params, outcome: "success" });
    }
    async logFailure(params) {
        return this.log({ ...params, outcome: "failure" });
    }
    async logDenied(params) {
        return this.log({ ...params, outcome: "denied" });
    }
    /* ── BULK LOG ── */
    async bulkLog(entries) {
        if (!entries.length)
            return { written: 0, skipped: 0 };
        let written = 0;
        let skipped = 0;
        const CHUNK = 500;
        for (let i = 0; i < entries.length; i += CHUNK) {
            const chunk = entries.slice(i, i + CHUNK);
            const docs = [];
            for (const e of chunk) {
                if (!isValidObjectId(e.organizationId) ||
                    (e.userId && !isValidObjectId(e.userId)) ||
                    (e.resourceId && !isValidObjectId(e.resourceId))) {
                    skipped++;
                    continue;
                }
                const outcome = e.outcome ?? "success";
                const actorType = e.actorType ?? deriveActorType(e.userId);
                const severity = e.severity ?? deriveSeverity(e.action, outcome);
                docs.push({
                    organizationId: toObjectId(e.organizationId),
                    userId: e.userId ? toObjectId(e.userId) : null,
                    actorType,
                    actorName: e.actorName,
                    action: e.action,
                    resource: e.resource,
                    resourceId: e.resourceId ? toObjectId(e.resourceId) : null,
                    outcome,
                    severity,
                    before: capPayload(scrubSensitive(e.before)),
                    after: capPayload(scrubSensitive(e.after)),
                    metadata: capPayload(scrubSensitive(e.metadata ?? {})),
                    requestContext: e.requestContext,
                    errorMessage: e.errorMessage,
                    idempotencyKey: e.idempotencyKey,
                });
            }
            try {
                const res = await AuditLog.insertMany(docs, { ordered: false });
                written += res.length;
            }
            catch (err) {
                if (err?.insertedDocs) {
                    written += err.insertedDocs.length;
                }
                logger.error({ error: err?.message }, "Bulk audit log partial failure");
            }
        }
        logger.info({ total: entries.length, written, skipped }, "Bulk audit log complete");
        return { written, skipped };
    }
}
/* ================= EXPORTS ================= */
const auditService = new AuditService();
export const logAudit = (params) => auditService.log(params);
export default auditService;
//# sourceMappingURL=audit.logger.js.map