// invite.model.ts
import mongoose, { Schema, } from "mongoose";
import crypto from "crypto";
/* =====================================================
   ROLES
===================================================== */
export const INVITE_ROLES = ["AGENT", "USER", "MANAGER", "ADMIN"];
/* =====================================================
   SCHEMA
===================================================== */
const inviteSchema = new Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        maxlength: 255,
        validate: {
            validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
            message: "Invalid email format",
        },
    },
    emailLower: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 255,
        index: true,
    },
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
        index: true,
    },
    role: {
        type: String,
        enum: INVITE_ROLES,
        default: "AGENT",
        required: true,
    },
    tokenHash: {
        type: String,
        required: true,
        unique: true,
        index: true,
        maxlength: 128,
        select: false, // never returned in queries by default
    },
    tokenLastFour: {
        type: String,
        required: true,
        maxlength: 8,
    },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null, index: true },
    revokedAt: { type: Date, default: null, index: true },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    usedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    revokedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    message: {
        type: String,
        default: null,
        trim: true,
        maxlength: 500,
    },
    resendCount: { type: Number, default: 0, min: 0, max: 50 },
    lastResentAt: { type: Date, default: null },
    createdFromIp: { type: String, default: null, maxlength: 45 },
    acceptedFromIp: { type: String, default: null, maxlength: 45 },
    userAgent: { type: String, default: null, maxlength: 500 },
}, {
    timestamps: true,
    versionKey: false,
    minimize: false,
    toJSON: {
        virtuals: true,
        transform: (_doc, ret) => {
            delete ret.tokenHash; // NEVER expose hash via JSON
            return ret;
        },
    },
    toObject: { virtuals: true },
});
/* =====================================================
   VIRTUALS
===================================================== */
inviteSchema.virtual("status").get(function () {
    if (this.usedAt)
        return "used";
    if (this.revokedAt)
        return "revoked";
    if (this.expiresAt && this.expiresAt < new Date())
        return "expired";
    return "active";
});
/* =====================================================
   PRE-VALIDATE
===================================================== */
inviteSchema.pre("validate", function () {
    if (this.email && (!this.emailLower || this.isModified("email"))) {
        this.emailLower = this.email.trim().toLowerCase();
    }
});
/* =====================================================
   INSTANCE METHODS
===================================================== */
inviteSchema.methods.isExpired = function () {
    return !!this.expiresAt && this.expiresAt < new Date();
};
inviteSchema.methods.isUsed = function () {
    return !!this.usedAt;
};
inviteSchema.methods.isRevoked = function () {
    return !!this.revokedAt;
};
inviteSchema.methods.isActive = function () {
    return !this.isUsed() && !this.isRevoked() && !this.isExpired();
};
inviteSchema.methods.getStatus = function () {
    if (this.isUsed())
        return "used";
    if (this.isRevoked())
        return "revoked";
    if (this.isExpired())
        return "expired";
    return "active";
};
inviteSchema.methods.canResend = function () {
    return !this.isUsed() && !this.isRevoked() && this.resendCount < 10;
};
inviteSchema.methods.matchesToken = function (rawToken) {
    if (!rawToken || typeof rawToken !== "string")
        return false;
    if (!this.tokenHash)
        return false;
    const incoming = this.constructor.hashToken(rawToken);
    const a = Buffer.from(incoming);
    const b = Buffer.from(this.tokenHash);
    if (a.length !== b.length)
        return false;
    return crypto.timingSafeEqual(a, b);
};
/* =====================================================
   STATIC METHODS
===================================================== */
inviteSchema.statics.hashToken = function (rawToken) {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
};
inviteSchema.statics.generateRawToken = function (bytes = 32) {
    return crypto.randomBytes(bytes).toString("hex");
};
inviteSchema.statics.findByRawToken = async function (rawToken) {
    if (!rawToken || typeof rawToken !== "string")
        return null;
    const hash = this.hashToken(rawToken);
    return this.findOne({ tokenHash: hash }).select("+tokenHash");
};
inviteSchema.statics.findActiveForEmail = function (email, organizationId) {
    return this.findOne({
        emailLower: email.trim().toLowerCase(),
        organizationId,
        usedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
    });
};
inviteSchema.statics.countActiveForOrg = function (organizationId, since) {
    const query = {
        organizationId,
        usedAt: null,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
    };
    if (since)
        query.createdAt = { $gte: since };
    return this.countDocuments(query);
};
/* =====================================================
   INDEXES
===================================================== */
inviteSchema.index({ emailLower: 1, organizationId: 1 }, {
    partialFilterExpression: { usedAt: null, revokedAt: null },
    name: "active_invite_per_email_org",
});
inviteSchema.index({ organizationId: 1, createdAt: -1 });
inviteSchema.index({ organizationId: 1, expiresAt: 1 });
inviteSchema.index({ organizationId: 1, usedAt: 1, revokedAt: 1, expiresAt: 1 });
inviteSchema.index({ createdBy: 1, createdAt: -1 });
/* ── TTL: auto-cleanup 90 days after terminal state ── */
inviteSchema.index({ usedAt: 1 }, {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { usedAt: { $type: "date" } },
    name: "ttl_used_invites",
});
inviteSchema.index({ revokedAt: 1 }, {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { revokedAt: { $type: "date" } },
    name: "ttl_revoked_invites",
});
/* =====================================================
   MODEL EXPORT
===================================================== */
const Invite = mongoose.models.Invite ??
    mongoose.model("Invite", inviteSchema);
export default Invite;
//# sourceMappingURL=invite.model.js.map