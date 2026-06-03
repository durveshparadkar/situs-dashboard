import mongoose, { Schema, } from "mongoose";
/* =====================================================
   ACTION TAXONOMY
===================================================== */
export const LEAD_ACTIVITY_ACTIONS = [
    "CREATED", "UPDATED", "STAGE_CHANGED", "STATUS_CHANGED", "ARCHIVED",
    "RESTORED", "DELETED", "ASSIGNED", "UNASSIGNED", "REASSIGNED",
    "OWNER_CHANGED", "EMAIL_SENT", "EMAIL_OPENED", "EMAIL_REPLIED",
    "CALL_LOGGED", "MEETING_SCHEDULED", "MEETING_COMPLETED", "NOTE_ADDED",
    "TASK_CREATED", "TASK_COMPLETED", "QUALIFIED", "DISQUALIFIED",
    "SCORE_CHANGED", "TAG_ADDED", "TAG_REMOVED", "CONVERTED_TO_DEAL",
    "MERGED", "ESCALATION_REQUESTED", "ESCALATION_APPROVED",
    "ESCALATION_REJECTED", "SYNCED_FROM_HUBSPOT", "SYNCED_FROM_SALESFORCE",
    "IMPORTED", "EXPORTED", "AI_ENRICHED", "AI_SCORED",
    "AI_RECOMMENDATION_GENERATED",
];
export const LEAD_ACTIVITY_CATEGORIES = [
    "lifecycle", "ownership", "engagement", "qualification",
    "conversion", "escalation", "integration", "ai", "system",
];
const ACTION_CATEGORY_MAP = {
    CREATED: "lifecycle",
    UPDATED: "lifecycle",
    STAGE_CHANGED: "lifecycle",
    STATUS_CHANGED: "lifecycle",
    ARCHIVED: "lifecycle",
    RESTORED: "lifecycle",
    DELETED: "lifecycle",
    ASSIGNED: "ownership",
    UNASSIGNED: "ownership",
    REASSIGNED: "ownership",
    OWNER_CHANGED: "ownership",
    EMAIL_SENT: "engagement",
    EMAIL_OPENED: "engagement",
    EMAIL_REPLIED: "engagement",
    CALL_LOGGED: "engagement",
    MEETING_SCHEDULED: "engagement",
    MEETING_COMPLETED: "engagement",
    NOTE_ADDED: "engagement",
    TASK_CREATED: "engagement",
    TASK_COMPLETED: "engagement",
    QUALIFIED: "qualification",
    DISQUALIFIED: "qualification",
    SCORE_CHANGED: "qualification",
    TAG_ADDED: "qualification",
    TAG_REMOVED: "qualification",
    CONVERTED_TO_DEAL: "conversion",
    MERGED: "conversion",
    ESCALATION_REQUESTED: "escalation",
    ESCALATION_APPROVED: "escalation",
    ESCALATION_REJECTED: "escalation",
    SYNCED_FROM_HUBSPOT: "integration",
    SYNCED_FROM_SALESFORCE: "integration",
    IMPORTED: "integration",
    EXPORTED: "integration",
    AI_ENRICHED: "ai",
    AI_SCORED: "ai",
    AI_RECOMMENDATION_GENERATED: "ai",
};
/* =====================================================
   ACTOR TYPES
===================================================== */
export const LEAD_ACTIVITY_ACTOR_TYPES = [
    "user", "system", "ai", "integration", "api",
];
const FieldChangeSchema = new Schema({
    field: { type: String, required: true, trim: true },
    previousValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
}, { _id: false });
const RequestContextSchema = new Schema({
    ipAddress: { type: String, trim: true, maxlength: 45 },
    userAgent: { type: String, trim: true, maxlength: 500 },
    source: { type: String, enum: ["web", "mobile", "api", "cron", "webhook"] },
    requestId: { type: String, trim: true, maxlength: 100 },
}, { _id: false });
/* =====================================================
   SCHEMA
===================================================== */
const LeadActivitySchema = new Schema({
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    lead: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    action: { type: String, enum: LEAD_ACTIVITY_ACTIONS, required: true, index: true },
    category: { type: String, enum: LEAD_ACTIVITY_CATEGORIES, required: true, index: true },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    actorType: { type: String, enum: LEAD_ACTIVITY_ACTOR_TYPES, default: "user", required: true, index: true },
    actorName: { type: String, trim: true, maxlength: 200 },
    previousValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    changes: { type: [FieldChangeSchema], default: [] },
    description: { type: String, trim: true, maxlength: 1000 },
    requestContext: { type: RequestContextSchema, default: undefined },
    relatedEntities: [
        {
            _id: false,
            entityType: {
                type: String,
                enum: ["deal", "user", "task", "email", "call", "meeting", "note"],
                required: true,
            },
            entityId: { type: Schema.Types.ObjectId, required: true },
        },
    ],
    idempotencyKey: { type: String, trim: true, maxlength: 200, sparse: true, unique: true },
    isInternal: { type: Boolean, default: false, index: true },
}, {
    timestamps: true,
    versionKey: false,
    minimize: false,
});
/* =====================================================
   PRE-VALIDATE
===================================================== */
LeadActivitySchema.pre("validate", function () {
    if (!this.category && this.action) {
        this.category = ACTION_CATEGORY_MAP[this.action] ?? "lifecycle";
    }
});
/* =====================================================
   IMMUTABILITY
===================================================== */
LeadActivitySchema.pre("updateOne", async function () {
    throw new Error("Lead activity logs are immutable and cannot be updated");
});
LeadActivitySchema.pre("findOneAndUpdate", async function () {
    throw new Error("Lead activity logs are immutable and cannot be updated");
});
LeadActivitySchema.pre("updateMany", async function () {
    throw new Error("Lead activity logs are immutable and cannot be updated");
});
/* =====================================================
   STATIC METHODS
===================================================== */
LeadActivitySchema.statics.logActivity = async function (input) {
    const category = ACTION_CATEGORY_MAP[input.action] ?? "lifecycle";
    if (input.idempotencyKey) {
        const existing = await this.findOne({ idempotencyKey: input.idempotencyKey });
        if (existing)
            return existing;
    }
    return this.create({
        ...input,
        category,
        isInternal: input.isInternal ?? false,
    });
};
LeadActivitySchema.statics.getTimeline = function (leadId, opts = {}) {
    const query = { lead: leadId, isInternal: false };
    if (opts.before)
        query.createdAt = { $lt: opts.before };
    if (opts.categories?.length)
        query.category = { $in: opts.categories };
    return this.find(query)
        .sort({ createdAt: -1 })
        .limit(Math.min(opts.limit ?? 50, 200))
        .lean();
};
/* =====================================================
   INDEXES
===================================================== */
LeadActivitySchema.index({ lead: 1, createdAt: -1 });
LeadActivitySchema.index({ organizationId: 1, createdAt: -1 });
LeadActivitySchema.index({ organizationId: 1, action: 1, createdAt: -1 });
LeadActivitySchema.index({ organizationId: 1, category: 1, createdAt: -1 });
LeadActivitySchema.index({ performedBy: 1, createdAt: -1 });
LeadActivitySchema.index({ lead: 1, category: 1, createdAt: -1 });
LeadActivitySchema.index({ lead: 1, action: 1, createdAt: -1 });
LeadActivitySchema.index({ organizationId: 1, actorType: 1, createdAt: -1 });
LeadActivitySchema.index({ lead: 1, isInternal: 1, createdAt: -1 });
/* =====================================================
   MODEL EXPORT
===================================================== */
const LeadActivity = mongoose.models.LeadActivity ??
    mongoose.model("LeadActivity", LeadActivitySchema);
export default LeadActivity;
export { ACTION_CATEGORY_MAP };
//# sourceMappingURL=leadActivity.model.js.map