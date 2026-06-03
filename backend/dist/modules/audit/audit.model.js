// audit.model.ts
import mongoose, { Schema, } from "mongoose";
/* =====================================================
   ENUMS — exhaustive action & resource taxonomy
===================================================== */
export var AuditAction;
(function (AuditAction) {
    /* ── Generic CRUD ── */
    AuditAction["CREATE"] = "CREATE";
    AuditAction["UPDATE"] = "UPDATE";
    AuditAction["DELETE"] = "DELETE";
    AuditAction["RESTORE"] = "RESTORE";
    AuditAction["ARCHIVE"] = "ARCHIVE";
    AuditAction["BULK_DELETED"] = "BULK_DELETED";
    AuditAction["BULK_UPDATED"] = "BULK_UPDATED";
    /* ── Auth & sessions ── */
    AuditAction["LOGIN"] = "LOGIN";
    AuditAction["LOGIN_FAILED"] = "LOGIN_FAILED";
    AuditAction["LOGOUT"] = "LOGOUT";
    AuditAction["PASSWORD_CHANGED"] = "PASSWORD_CHANGED";
    AuditAction["PASSWORD_RESET"] = "PASSWORD_RESET";
    AuditAction["TWO_FACTOR_ENABLED"] = "TWO_FACTOR_ENABLED";
    AuditAction["TWO_FACTOR_DISABLED"] = "TWO_FACTOR_DISABLED";
    AuditAction["SESSION_REVOKED"] = "SESSION_REVOKED";
    /* ── Access control ── */
    AuditAction["ROLE_CHANGED"] = "ROLE_CHANGED";
    AuditAction["PERMISSION_GRANTED"] = "PERMISSION_GRANTED";
    AuditAction["PERMISSION_REVOKED"] = "PERMISSION_REVOKED";
    AuditAction["ACCESS_DENIED"] = "ACCESS_DENIED";
    /* ── Org & team management ── */
    AuditAction["ORGANIZATION_CREATED"] = "ORGANIZATION_CREATED";
    AuditAction["ORGANIZATION_UPDATED"] = "ORGANIZATION_UPDATED";
    AuditAction["ORGANIZATION_DELETED"] = "ORGANIZATION_DELETED";
    AuditAction["USER_INVITED"] = "USER_INVITED";
    AuditAction["USER_JOINED"] = "USER_JOINED";
    AuditAction["USER_REMOVED"] = "USER_REMOVED";
    AuditAction["USER_DELETED"] = "USER_DELETED";
    AuditAction["INVITE_SENT"] = "INVITE_SENT";
    AuditAction["INVITE_ACCEPTED"] = "INVITE_ACCEPTED";
    AuditAction["INVITE_REVOKED"] = "INVITE_REVOKED";
    /* ── API & integrations ── */
    AuditAction["API_KEY_CREATED"] = "API_KEY_CREATED";
    AuditAction["API_KEY_REVOKED"] = "API_KEY_REVOKED";
    AuditAction["INTEGRATION_CONNECTED"] = "INTEGRATION_CONNECTED";
    AuditAction["INTEGRATION_DISCONNECTED"] = "INTEGRATION_DISCONNECTED";
    AuditAction["WEBHOOK_RECEIVED"] = "WEBHOOK_RECEIVED";
    /* ── Data ops ── */
    AuditAction["DATA_EXPORTED"] = "DATA_EXPORTED";
    AuditAction["DATA_IMPORTED"] = "DATA_IMPORTED";
    /* ── Billing ── */
    AuditAction["SUBSCRIPTION_STARTED"] = "SUBSCRIPTION_STARTED";
    AuditAction["SUBSCRIPTION_UPDATED"] = "SUBSCRIPTION_UPDATED";
    AuditAction["SUBSCRIPTION_CANCELLED"] = "SUBSCRIPTION_CANCELLED";
    AuditAction["PAYMENT_SUCCEEDED"] = "PAYMENT_SUCCEEDED";
    AuditAction["PAYMENT_FAILED"] = "PAYMENT_FAILED";
    /* ── Domain-specific (Situs decision engine) ── */
    AuditAction["DEAL_STAGE_CHANGED"] = "DEAL_STAGE_CHANGED";
    AuditAction["DEAL_RISK_ESCALATED"] = "DEAL_RISK_ESCALATED";
    AuditAction["AI_RECOMMENDATION_GENERATED"] = "AI_RECOMMENDATION_GENERATED";
    AuditAction["AI_RECOMMENDATION_ACCEPTED"] = "AI_RECOMMENDATION_ACCEPTED";
    AuditAction["AI_RECOMMENDATION_REJECTED"] = "AI_RECOMMENDATION_REJECTED";
})(AuditAction || (AuditAction = {}));
export var AuditResource;
(function (AuditResource) {
    AuditResource["ORGANIZATION"] = "ORGANIZATION";
    AuditResource["USER"] = "USER";
    AuditResource["ROLE"] = "ROLE";
    AuditResource["TEAM"] = "TEAM";
    AuditResource["INVITE"] = "INVITE";
    AuditResource["BILLING"] = "BILLING";
    AuditResource["SUBSCRIPTION"] = "SUBSCRIPTION";
    AuditResource["PAYMENT"] = "PAYMENT";
    AuditResource["API_KEY"] = "API_KEY";
    AuditResource["INTEGRATION"] = "INTEGRATION";
    AuditResource["WEBHOOK"] = "WEBHOOK";
    AuditResource["DEAL"] = "DEAL";
    AuditResource["LEAD"] = "LEAD";
    AuditResource["CONTACT"] = "CONTACT";
    AuditResource["ACCOUNT"] = "ACCOUNT";
    AuditResource["PIPELINE"] = "PIPELINE";
    AuditResource["CAMPAIGN"] = "CAMPAIGN";
    AuditResource["REPORT"] = "REPORT";
    AuditResource["AI_RECOMMENDATION"] = "AI_RECOMMENDATION";
    AuditResource["ENTITY"] = "ENTITY";
    AuditResource["SYSTEM"] = "SYSTEM";
})(AuditResource || (AuditResource = {}));
const AuditRequestContextSchema = new Schema({
    ipAddress: { type: String, trim: true, maxlength: 45 }, // IPv6 max
    userAgent: { type: String, trim: true, maxlength: 500 },
    source: {
        type: String,
        enum: ["web", "mobile", "api", "cron", "webhook", "cli"],
    },
    requestId: { type: String, trim: true, maxlength: 100 },
    sessionId: { type: String, trim: true, maxlength: 100 },
    geoCountry: { type: String, trim: true, maxlength: 4 },
    geoCity: { type: String, trim: true, maxlength: 100 },
}, { _id: false });
/* =====================================================
   SCHEMA
===================================================== */
const auditSchema = new Schema({
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
        index: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true,
    },
    actorType: {
        type: String,
        enum: ["user", "system", "ai", "integration", "api", "cron"],
        required: true,
        default: "user",
        index: true,
    },
    actorName: { type: String, trim: true, maxlength: 200 },
    action: {
        type: String,
        enum: Object.values(AuditAction),
        required: true,
        index: true,
    },
    resource: {
        type: String,
        enum: Object.values(AuditResource),
        required: true,
        index: true,
    },
    resourceId: {
        type: Schema.Types.ObjectId,
        default: null,
        index: true,
    },
    outcome: {
        type: String,
        enum: ["success", "failure", "denied"],
        required: true,
        default: "success",
        index: true,
    },
    severity: {
        type: String,
        enum: ["info", "warn", "critical"],
        required: true,
        default: "info",
        index: true,
    },
    errorMessage: { type: String, trim: true, maxlength: 2000 },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    requestContext: { type: AuditRequestContextSchema, default: undefined },
    idempotencyKey: {
        type: String,
        trim: true,
        maxlength: 200,
        sparse: true,
        unique: true,
    },
}, {
    timestamps: true,
    versionKey: false,
    minimize: false,
});
// ✅ Document middleware (no next, no overload issues)
auditSchema.pre("save", async function () {
    if (!this.isNew) {
        throw new Error("Audit logs are immutable and cannot be modified");
    }
});
// ✅ Query middleware — force correct overload using RegExp
const blockUpdate = async function () {
    throw new Error("Audit logs are immutable and cannot be updated");
};
// ✅ SINGLE REGEX — avoids ALL overload conflicts
auditSchema.pre(/^(updateOne|updateMany|findOneAndUpdate|replaceOne|findOneAndReplace)$/, blockUpdate);
/* deleteOne and deleteMany are intentionally NOT blocked here —
   you need them for legal-compliance retention purges (e.g. GDPR
   right-to-be-forgotten). Restrict via service-layer + RBAC instead. */
/* =====================================================
   STATIC METHODS
===================================================== */
auditSchema.statics.findByOrg = function (orgId, opts = {}) {
    const query = { organizationId: orgId };
    if (opts.before)
        query.createdAt = { $lt: opts.before };
    if (opts.severity)
        query.severity = opts.severity;
    return this.find(query)
        .sort({ createdAt: -1 })
        .limit(Math.min(opts.limit ?? 100, 1000))
        .lean();
};
auditSchema.statics.findByResource = function (resource, resourceId) {
    return this.find({ resource, resourceId })
        .sort({ createdAt: -1 })
        .lean();
};
auditSchema.statics.findCriticalEvents = function (orgId, since) {
    const query = {
        organizationId: orgId,
        severity: "critical",
    };
    if (since)
        query.createdAt = { $gte: since };
    return this.find(query)
        .sort({ createdAt: -1 })
        .limit(500)
        .lean();
};
/* =====================================================
   COMPOUND INDEXES — built for real audit query patterns
===================================================== */
// Most common: org-scoped activity timeline
auditSchema.index({ organizationId: 1, createdAt: -1 });
// User activity feed ("what has this user done")
auditSchema.index({ userId: 1, createdAt: -1 });
// Per-resource history ("show me everything that happened to this deal")
auditSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
// Org-scoped resource history (tenant-safe)
auditSchema.index({ organizationId: 1, resource: 1, resourceId: 1, createdAt: -1 });
// Critical events dashboard
auditSchema.index({ organizationId: 1, severity: 1, createdAt: -1 });
// Failed/denied event monitoring (security ops)
auditSchema.index({ organizationId: 1, outcome: 1, createdAt: -1 });
// Action filtering ("show me all DELETEs in the last 30 days")
auditSchema.index({ organizationId: 1, action: 1, createdAt: -1 });
// Actor-type filtering ("show me all AI-triggered events")
auditSchema.index({ organizationId: 1, actorType: 1, createdAt: -1 });
// IP forensics — partial index, only when populated
auditSchema.index({ "requestContext.ipAddress": 1, createdAt: -1 }, { partialFilterExpression: { "requestContext.ipAddress": { $exists: true } } });
/* =====================================================
   TTL — optional auto-purge for retention compliance
   Uncomment when legal has confirmed your retention policy.
===================================================== */
// auditSchema.index(
//   { createdAt: 1 },
//   { expireAfterSeconds: 60 * 60 * 24 * 365 * 7 } // 7 years (SOC2/SOX standard)
// );
/* =====================================================
   MODEL EXPORT (HMR-safe)
===================================================== */
const AuditLog = mongoose.models.AuditLog ??
    mongoose.model("AuditLog", auditSchema);
export default AuditLog;
//# sourceMappingURL=audit.model.js.map