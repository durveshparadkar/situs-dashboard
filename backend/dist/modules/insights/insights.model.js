// insight.model.ts
import mongoose, { Schema, } from "mongoose";
/* =====================================================
   ENUMS
===================================================== */
export const INSIGHT_TYPES = [
    /* ── Engagement ── */
    "stale_deal",
    "re_engage_lead",
    "missing_next_step",
    /* ── Forecast ── */
    "close_date_overdue",
    "close_date_at_risk",
    "forecast_distortion",
    /* ── Velocity ── */
    "stage_stagnation",
    "rapid_progression",
    /* ── Risk ── */
    "high_value_at_risk",
    "churn_risk",
    "competitive_threat",
    /* ── Qualification ── */
    "low_probability_late",
    "qualification_gap",
    "unqualified_lead",
    /* ── Performance ── */
    "rep_underperforming",
    "rep_overperforming",
    "pipeline_imbalance",
    /* ── Positive signals ── */
    "momentum_strong",
    "deal_ready_to_close",
    "champion_identified",
    /* ── AI-generated ── */
    "ai_recommendation",
    "anomaly_detected",
];
/* =====================================================
   CATEGORY MAP — auto-derives category from type
===================================================== */
export const INSIGHT_CATEGORY_MAP = {
    stale_deal: "engagement",
    re_engage_lead: "engagement",
    missing_next_step: "engagement",
    close_date_overdue: "forecast",
    close_date_at_risk: "forecast",
    forecast_distortion: "forecast",
    stage_stagnation: "velocity",
    rapid_progression: "velocity",
    high_value_at_risk: "risk",
    churn_risk: "risk",
    competitive_threat: "risk",
    low_probability_late: "qualification",
    qualification_gap: "qualification",
    unqualified_lead: "qualification",
    rep_underperforming: "performance",
    rep_overperforming: "performance",
    pipeline_imbalance: "performance",
    momentum_strong: "celebration",
    deal_ready_to_close: "celebration",
    champion_identified: "celebration",
    ai_recommendation: "ai",
    anomaly_detected: "ai",
};
/* =====================================================
   SUB-SCHEMAS
===================================================== */
const InsightActionSchema = new Schema({
    type: { type: String, required: true, trim: true, maxlength: 100 },
    label: { type: String, required: true, trim: true, maxlength: 200 },
    url: { type: String, trim: true, maxlength: 1000 },
    metadata: { type: Schema.Types.Mixed },
}, { _id: false });
const InsightTargetSchema = new Schema({
    type: {
        type: String,
        enum: ["deal", "lead", "contact", "account", "user", "pipeline", "organization"],
        required: true,
    },
    id: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, trim: true, maxlength: 300 },
    url: { type: String, trim: true, maxlength: 1000 },
}, { _id: false });
const InsightFeedbackSchema = new Schema({
    rating: {
        type: String,
        enum: ["helpful", "not_helpful", "irrelevant"],
        required: true,
    },
    comment: { type: String, trim: true, maxlength: 1000 },
    submittedAt: { type: Date, required: true, default: Date.now },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { _id: false });
const StatusHistorySchema = new Schema({
    status: {
        type: String,
        enum: ["active", "seen", "acted", "dismissed", "snoozed", "expired", "archived"],
        required: true,
    },
    changedAt: { type: Date, required: true, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    note: { type: String, trim: true, maxlength: 500 },
}, { _id: false });
/* =====================================================
   MAIN SCHEMA
===================================================== */
const insightSchema = new Schema({
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: INSIGHT_TYPES,
        required: true,
        index: true,
    },
    category: {
        type: String,
        enum: [
            "engagement", "forecast", "velocity", "risk",
            "qualification", "performance", "celebration", "ai",
        ],
        required: true,
        index: true,
    },
    severity: {
        type: String,
        enum: ["info", "low", "medium", "high", "critical"],
        required: true,
        default: "medium",
        index: true,
    },
    source: {
        type: String,
        enum: ["rules_engine", "ai_engine", "risk_engine", "scoring_engine", "forecast_engine", "manual"],
        required: true,
        default: "rules_engine",
    },
    engineVersion: { type: String, trim: true, maxlength: 50 },
    /* Display */
    title: { type: String, required: true, trim: true, maxlength: 300 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    reasoning: { type: [String], default: [] },
    actions: { type: [InsightActionSchema], default: [] },
    target: { type: InsightTargetSchema, required: true },
    assignedTo: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
        index: true,
    },
    visibleToRoles: {
        type: [String],
        default: [],
    },
    /* Quantitative */
    confidence: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        default: 70,
    },
    expectedImpact: {
        type: String,
        enum: ["low", "medium", "high"],
        default: "medium",
    },
    estimatedValueAtRisk: { type: Number, min: 0 },
    /* Lifecycle */
    status: {
        type: String,
        enum: ["active", "seen", "acted", "dismissed", "snoozed", "expired", "archived"],
        default: "active",
        required: true,
        index: true,
    },
    statusHistory: { type: [StatusHistorySchema], default: [] },
    /* Timing */
    generatedAt: { type: Date, required: true, default: Date.now, index: true },
    expiresAt: { type: Date, default: null, index: true },
    snoozedUntil: { type: Date, default: null, index: true },
    /* User interaction */
    seenAt: { type: Date, default: null },
    seenBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actedAt: { type: Date, default: null },
    actedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    dismissedAt: { type: Date, default: null },
    dismissedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    dismissReason: { type: String, trim: true, maxlength: 500 },
    /* Feedback */
    feedback: { type: InsightFeedbackSchema, default: null },
    /* Idempotency */
    fingerprint: {
        type: String,
        required: true,
        maxlength: 128,
        index: true,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
}, {
    timestamps: true,
    versionKey: false,
    minimize: false,
    toJSON: {
        virtuals: true,
        transform: (_doc, ret) => {
            delete ret.__v;
            return ret;
        },
    },
});
/* =====================================================
   PRE-VALIDATE — auto-derive category
===================================================== */
insightSchema.pre("validate", function () {
    if (!this.category && this.type) {
        this.category = INSIGHT_CATEGORY_MAP[this.type] ?? "engagement";
    }
});
/* =====================================================
   INSTANCE METHODS
===================================================== */
insightSchema.methods.isActive = function () {
    if (this.status !== "active" && this.status !== "seen")
        return false;
    if (this.expiresAt && this.expiresAt < new Date())
        return false;
    if (this.snoozedUntil && this.snoozedUntil > new Date())
        return false;
    return true;
};
insightSchema.methods.isExpired = function () {
    return !!(this.expiresAt && this.expiresAt < new Date());
};
insightSchema.methods.markSeen = function (userId) {
    if (this.seenAt)
        return;
    this.status = "seen";
    this.seenAt = new Date();
    this.seenBy = userId;
    this.statusHistory.push({
        status: "seen",
        changedAt: new Date(),
        changedBy: userId,
    });
};
insightSchema.methods.markActed = function (userId) {
    this.status = "acted";
    this.actedAt = new Date();
    this.actedBy = userId;
    this.statusHistory.push({
        status: "acted",
        changedAt: new Date(),
        changedBy: userId,
    });
};
insightSchema.methods.dismiss = function (userId, reason) {
    this.status = "dismissed";
    this.dismissedAt = new Date();
    this.dismissedBy = userId;
    if (reason)
        this.dismissReason = reason;
    this.statusHistory.push({
        status: "dismissed",
        changedAt: new Date(),
        changedBy: userId,
        ...(reason && { note: reason }),
    });
};
insightSchema.methods.snooze = function (until, userId) {
    this.status = "snoozed";
    this.snoozedUntil = until;
    this.statusHistory.push({
        status: "snoozed",
        changedAt: new Date(),
        changedBy: userId,
        note: `Snoozed until ${until.toISOString()}`,
    });
};
/* =====================================================
   STATIC METHODS
===================================================== */
insightSchema.statics.upsertByFingerprint = async function (insight) {
    const { fingerprint, organizationId, ...rest } = insight;
    const result = await this.findOneAndUpdate({ fingerprint, organizationId }, {
        $set: rest,
        $setOnInsert: {
            fingerprint,
            organizationId,
            generatedAt: new Date(),
            status: "active",
        },
    }, { new: true, upsert: true, runValidators: true });
    return result;
};
insightSchema.statics.findActiveForUser = function (userId, organizationId, opts = {}) {
    const SEVERITY_RANK = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
        info: 4,
    };
    const allSeverities = Object.keys(SEVERITY_RANK);
    const minSev = opts.minSeverity;
    const allowedSeverities = minSev
        ? allSeverities.filter((s) => SEVERITY_RANK[s] <= SEVERITY_RANK[minSev])
        : allSeverities;
    const now = new Date();
    return this.find({
        organizationId,
        assignedTo: userId,
        status: { $in: ["active", "seen"] },
        severity: { $in: allowedSeverities },
        $and: [
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
            { $or: [{ snoozedUntil: null }, { snoozedUntil: { $lt: now } }] },
        ],
    })
        .sort({ severity: 1, generatedAt: -1 })
        .limit(Math.min(opts.limit ?? 50, 200))
        .lean();
};
insightSchema.statics.expireStaleInsights = async function (organizationId) {
    const result = await this.updateMany({
        organizationId,
        status: { $in: ["active", "seen"] },
        expiresAt: { $lt: new Date() },
    }, {
        $set: { status: "expired" },
        $push: {
            statusHistory: {
                status: "expired",
                changedAt: new Date(),
                note: "Auto-expired by cleanup job",
            },
        },
    });
    return result.modifiedCount;
};
/* =====================================================
   COMPOUND INDEXES
===================================================== */
/* Most common: user's active insight feed */
insightSchema.index({ organizationId: 1, assignedTo: 1, status: 1, severity: 1, generatedAt: -1 });
/* Org-wide insight dashboards */
insightSchema.index({ organizationId: 1, status: 1, generatedAt: -1 });
insightSchema.index({ organizationId: 1, category: 1, generatedAt: -1 });
insightSchema.index({ organizationId: 1, type: 1, generatedAt: -1 });
insightSchema.index({ organizationId: 1, severity: 1, generatedAt: -1 });
/* Target-based queries: "show insights for this deal" */
insightSchema.index({ "target.type": 1, "target.id": 1, status: 1 });
/* Fingerprint dedup — one active insight per (org, fingerprint) */
insightSchema.index({ organizationId: 1, fingerprint: 1 }, { name: "fingerprint_org_unique" });
/* TTL — auto-purge resolved insights after 90 days */
insightSchema.index({ updatedAt: 1 }, {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: {
        status: { $in: ["acted", "dismissed", "expired", "archived"] },
    },
    name: "ttl_resolved_insights",
});
/* =====================================================
   MODEL EXPORT (HMR-safe)
===================================================== */
const Insight = mongoose.models.Insight ??
    mongoose.model("Insight", insightSchema);
export default Insight;
//# sourceMappingURL=insights.model.js.map