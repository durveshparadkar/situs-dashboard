import mongoose, { Schema } from "mongoose";
import { LeadSource } from "../../shared/enums/lead.enums.js";
/* =====================================================
   SUBSCHEMAS
===================================================== */
const BrainSignalSchema = new Schema({
    type: { type: String, required: true, trim: true },
    severity: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
        required: true,
    },
    message: { type: String, required: true, trim: true },
}, { _id: false });
const BrainSnapshotSchema = new Schema({
    score: { type: Number, required: true },
    priority: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
        required: true,
    },
    signals: { type: [BrainSignalSchema], default: [] },
    recommendedActions: { type: [String], default: [] },
    analyzedAt: { type: Date, default: Date.now },
}, { _id: false });
const EscalationSchema = new Schema({
    recommended: { type: Boolean, default: false, index: true },
    reason: { type: String, trim: true },
    recommendedAt: { type: Date },
    approved: { type: Boolean, default: false, index: true },
    approvedAt: { type: Date },
    approvedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
}, { _id: false });
/* =====================================================
   MAIN SCHEMA
===================================================== */
const LeadSchema = new Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        default: "Unnamed Lead",
        index: true,
    },
    phone: {
        type: String,
        required: true,
        trim: true,
        index: true,
    },
    email: {
        type: String,
        lowercase: true,
        trim: true,
        default: null,
        index: true,
    },
    budget: {
        type: Number,
        required: true,
        min: 0,
        index: true,
    },
    interestedLocation: {
        type: String,
        required: true,
        trim: true,
        index: true,
    },
    source: {
        type: String,
        enum: Object.values(LeadSource),
        required: true,
        index: true,
    },
    /* ================= MULTI-TENANT ================= */
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
        index: true,
    },
    assignedTo: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    /* ================= PIPELINE ================= */
    pipelineId: {
        type: Schema.Types.ObjectId,
        ref: "Pipeline",
        required: true,
        index: true,
    },
    stageId: {
        type: Schema.Types.ObjectId,
        required: true,
        index: true,
    },
    probability: {
        type: Number,
        min: 0,
        max: 100,
        default: 0,
    },
    /* ================= AI ================= */
    activityCount: { type: Number, default: 0 },
    leadScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
        index: true,
    },
    isStale: { type: Boolean, default: false, index: true },
    lastActivityAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    brainPriority: {
        type: String,
        enum: ["low", "medium", "high", "critical"],
        default: "low",
        index: true,
    },
    brainSnapshot: {
        type: BrainSnapshotSchema,
        default: null,
    },
    brainStatus: {
        type: String,
        enum: ["idle", "processing", "completed", "failed"],
        default: "idle",
        index: true,
    },
    lastBrainRunAt: {
        type: Date,
        default: null,
        index: true,
    },
    escalation: {
        type: EscalationSchema,
        default: null,
    },
    notes: { type: String, trim: true },
    isArchived: {
        type: Boolean,
        default: false,
        index: true,
    },
}, {
    timestamps: true,
    minimize: false,
});
/* =====================================================
   🔥 DATA SANITY (FIXED — NO TS ERRORS)
===================================================== */
LeadSchema.pre("validate", function () {
    const lead = this;
    if (!lead.name?.trim()) {
        lead.name = "Unnamed Lead";
    }
    if (lead.email) {
        lead.email = lead.email.toLowerCase().trim();
    }
    if (lead.phone) {
        lead.phone = lead.phone.trim();
    }
});
/* =====================================================
   🔥 ENTERPRISE INDEXES
===================================================== */
// multi-tenant queries
LeadSchema.index({ organizationId: 1, assignedTo: 1 });
LeadSchema.index({ organizationId: 1, isArchived: 1 });
// analytics
LeadSchema.index({ organizationId: 1, leadScore: -1 });
LeadSchema.index({ organizationId: 1, lastActivityAt: -1 });
// pipeline
LeadSchema.index({ pipelineId: 1, stageId: 1 });
// AI prioritization
LeadSchema.index({ organizationId: 1, brainPriority: 1, isArchived: 1 });
LeadSchema.index({ brainStatus: 1, lastBrainRunAt: -1 });
// escalation
LeadSchema.index({ organizationId: 1, "escalation.recommended": 1 });
LeadSchema.index({ organizationId: 1, "escalation.approved": 1 });
// 🚀 dedup (same phone per org)
LeadSchema.index({ organizationId: 1, phone: 1 }, { unique: false });
/* =====================================================
   MODEL
===================================================== */
const Lead = mongoose.models.Lead ||
    mongoose.model("Lead", LeadSchema);
export default Lead;
//# sourceMappingURL=lead.model.js.map