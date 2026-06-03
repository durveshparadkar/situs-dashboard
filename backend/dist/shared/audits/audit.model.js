// audit.model.ts
import mongoose, { Schema, } from "mongoose";
// ============================================================
// CONFIG
// ============================================================
const AUDIT_MODEL_CONFIG = {
    caps: {
        action: 100,
        resource: 100,
        ip: 100,
        userAgent: 500,
        errorCode: 100,
    },
    /**
     * TTL in seconds — audit logs are deleted automatically after this period.
     * 730 days = ~24 months. Tune per compliance requirements.
     * Override via AUDIT_TTL_DAYS env var.
     */
    ttlSeconds: (parseInt(process.env.AUDIT_TTL_DAYS ?? "", 10) || 730) * 24 * 60 * 60,
    /**
     * Disable TTL entirely via env var. Compliance regimes that require
     * indefinite retention should set this true.
     */
    ttlDisabled: process.env.AUDIT_TTL_DISABLED === "true",
};
// ============================================================
// CONSTANTS — ACTIONS
// ============================================================
export const AUDIT_ACTIONS = {
    // Generic CRUD
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    READ: "READ",
    RESTORE: "RESTORE",
    // Auth
    LOGIN: "LOGIN",
    LOGIN_FAILED: "LOGIN_FAILED",
    LOGOUT: "LOGOUT",
    PASSWORD_CHANGED: "PASSWORD_CHANGED",
    PASSWORD_RESET: "PASSWORD_RESET",
    TOKEN_ISSUED: "TOKEN_ISSUED",
    TOKEN_REVOKED: "TOKEN_REVOKED",
    PERMISSION_DENIED: "PERMISSION_DENIED",
    CROSS_TENANT_ATTEMPT: "CROSS_TENANT_ATTEMPT",
    // Organization
    ORGANIZATION_CREATED: "ORGANIZATION_CREATED",
    ORGANIZATION_UPDATED: "ORGANIZATION_UPDATED",
    ORGANIZATION_DELETED: "ORGANIZATION_DELETED",
    ORGANIZATION_TRANSFERRED: "ORGANIZATION_TRANSFERRED",
    // Invites
    INVITE_CREATED: "INVITE_CREATED",
    INVITE_ACCEPTED: "INVITE_ACCEPTED",
    INVITE_REVOKED: "INVITE_REVOKED",
    INVITE_RESENT: "INVITE_RESENT",
    // Users
    USER_CREATED: "USER_CREATED",
    USER_UPDATED: "USER_UPDATED",
    USER_DELETED: "USER_DELETED",
    USER_REACTIVATED: "USER_REACTIVATED",
    USER_DEACTIVATED: "USER_DEACTIVATED",
    // Teams
    TEAM_CREATED: "TEAM_CREATED",
    TEAM_UPDATED: "TEAM_UPDATED",
    TEAM_DELETED: "TEAM_DELETED",
    TEAM_MEMBER_ADDED: "TEAM_MEMBER_ADDED",
    TEAM_MEMBER_REMOVED: "TEAM_MEMBER_REMOVED",
    TEAM_MANAGER_TRANSFERRED: "TEAM_MANAGER_TRANSFERRED",
    // RBAC
    ROLE_CREATED: "ROLE_CREATED",
    ROLE_UPDATED: "ROLE_UPDATED",
    ROLE_DELETED: "ROLE_DELETED",
    ROLE_DUPLICATED: "ROLE_DUPLICATED",
    PERMISSIONS_ASSIGNED: "PERMISSIONS_ASSIGNED",
    PERMISSIONS_REVOKED: "PERMISSIONS_REVOKED",
    // Billing
    BILLING_UPDATED: "BILLING_UPDATED",
    SUBSCRIPTION_STARTED: "SUBSCRIPTION_STARTED",
    SUBSCRIPTION_CANCELED: "SUBSCRIPTION_CANCELED",
    PAYMENT_SUCCESS: "PAYMENT_SUCCESS",
    PAYMENT_FAILED: "PAYMENT_FAILED",
    AUDIT_EXPORTED: "AUDIT_EXPORTED",
    // System
    SYSTEM_ACTION: "SYSTEM_ACTION",
};
// ============================================================
// CONSTANTS — RESOURCES
// ============================================================
export const AUDIT_RESOURCES = {
    ORGANIZATION: "ORGANIZATION",
    USER: "USER",
    INVITE: "INVITE",
    TEAM: "TEAM",
    ENTITY: "ENTITY",
    DEAL: "DEAL",
    LEAD: "LEAD",
    PIPELINE: "PIPELINE",
    ROLE: "ROLE",
    PERMISSION: "PERMISSION",
    BILLING: "BILLING",
    FORECAST: "FORECAST",
    INSIGHT: "INSIGHT",
    AUDIT: "AUDIT",
    AUTH: "AUTH",
    SYSTEM: "SYSTEM",
};
// ============================================================
// SCHEMA
// ============================================================
const AuditLogSchema = new Schema({
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        required: [true, "organizationId is required"],
        index: true,
    },
    actorId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true,
    },
    /**
     * Action is stored as a string (not strict enum) so new actions can be
     * logged without a schema migration. The AUDIT_ACTIONS constants give
     * IDE autocomplete and consistency at call sites.
     */
    action: {
        type: String,
        required: [true, "action is required"],
        trim: true,
        uppercase: true,
        maxlength: [AUDIT_MODEL_CONFIG.caps.action, "action too long"],
        index: true,
    },
    resource: {
        type: String,
        required: [true, "resource is required"],
        trim: true,
        uppercase: true,
        maxlength: [AUDIT_MODEL_CONFIG.caps.resource, "resource too long"],
        index: true,
    },
    resourceId: {
        type: Schema.Types.ObjectId,
        default: null,
        index: true,
    },
    meta: {
        type: Schema.Types.Mixed,
        default: {},
    },
    ip: {
        type: String,
        default: "",
        maxlength: AUDIT_MODEL_CONFIG.caps.ip,
    },
    userAgent: {
        type: String,
        default: "",
        maxlength: AUDIT_MODEL_CONFIG.caps.userAgent,
    },
}, {
    // createdAt only — audit logs are immutable, no updatedAt needed
    timestamps: { createdAt: true, updatedAt: false },
    minimize: false,
    versionKey: false,
});
// ============================================================
// IMMUTABILITY ENFORCEMENT
// Audit logs must never be modified — defeats the purpose of an audit
// trail. Block document-save modifications and all update queries.
// ============================================================
AuditLogSchema.pre("save", function (_opts, next) {
    if (!this.isNew) {
        if (next) {
            return next(new Error("Audit logs are immutable and cannot be modified"));
        }
        throw new Error("Audit logs are immutable and cannot be modified");
    }
    if (next)
        next();
});
// Block update operations at the query layer too
AuditLogSchema.pre("updateOne", function (_opts, next) {
    if (next) {
        return next(new Error("Audit logs are immutable. updateOne is not allowed."));
    }
    throw new Error("Audit logs are immutable. updateOne is not allowed.");
});
AuditLogSchema.pre("updateMany", function (_opts, next) {
    if (next) {
        return next(new Error("Audit logs are immutable. updateMany is not allowed."));
    }
    throw new Error("Audit logs are immutable. updateMany is not allowed.");
});
AuditLogSchema.pre("findOneAndUpdate", function (_opts, next) {
    if (next) {
        return next(new Error("Audit logs are immutable. findOneAndUpdate is not allowed."));
    }
    throw new Error("Audit logs are immutable. findOneAndUpdate is not allowed.");
});
AuditLogSchema.pre("replaceOne", function (_opts, next) {
    if (next) {
        return next(new Error("Audit logs are immutable. replaceOne is not allowed."));
    }
    throw new Error("Audit logs are immutable. replaceOne is not allowed.");
});
// ============================================================
// INDEXES
// Optimized for the query patterns used by audit.controller.ts.
// ============================================================
AuditLogSchema.index({ organizationId: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, action: 1, createdAt: -1 });
AuditLogSchema.index({ organizationId: 1, resource: 1, resourceId: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, organizationId: 1, createdAt: -1 });
// TTL index — auto-deletes records older than ttlSeconds.
// MongoDB's background task runs every 60s for cleanup.
if (!AUDIT_MODEL_CONFIG.ttlDisabled) {
    AuditLogSchema.index({ createdAt: 1 }, {
        expireAfterSeconds: AUDIT_MODEL_CONFIG.ttlSeconds,
        name: "ttl_audit_retention",
    });
}
// ============================================================
// STATIC METHODS
// ============================================================
AuditLogSchema.statics.findByOrg = function (organizationId, opts = {}) {
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    return this.find({ organizationId: orgId })
        .sort({ createdAt: -1 })
        .limit(opts.limit ?? 100)
        .exec();
};
AuditLogSchema.statics.findByResource = function (resource, resourceId, organizationId, opts = {}) {
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    const resId = new mongoose.Types.ObjectId(resourceId.toString());
    return this.find({
        organizationId: orgId,
        resource: resource.toUpperCase(),
        resourceId: resId,
    })
        .sort({ createdAt: -1 })
        .limit(opts.limit ?? 100)
        .exec();
};
AuditLogSchema.statics.findByActor = function (actorId, organizationId, opts = {}) {
    const actor = new mongoose.Types.ObjectId(actorId.toString());
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    return this.find({ actorId: actor, organizationId: orgId })
        .sort({ createdAt: -1 })
        .limit(opts.limit ?? 100)
        .exec();
};
// ============================================================
// MODEL
// ============================================================
const AuditLog = mongoose.models.AuditLog ||
    mongoose.model("AuditLog", AuditLogSchema);
export default AuditLog;
//# sourceMappingURL=audit.model.js.map