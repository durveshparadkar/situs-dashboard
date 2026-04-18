import mongoose, { Schema, Document, Types } from "mongoose";
import { LeadSource } from "../../shared/enums/lead.enums.js";

/* =====================================================
   INTERFACE
===================================================== */

export interface ILead extends Document {
  name: string;
  phone: string;
  email?: string;
  budget: number;
  interestedLocation: string;
  source: LeadSource;

  organizationId: Types.ObjectId;
  assignedTo: Types.ObjectId;

  pipelineId: Types.ObjectId;
  stageId: Types.ObjectId;

  probability: number;

  /* ===============================
     AI INTELLIGENCE CORE
  =============================== */
  
  activityCount: number;
  leadScore: number;
  isStale: boolean;
  lastActivityAt: Date;

  brainPriority: "low" | "medium" | "high" | "critical";

  brainSnapshot?: {
    score: number;
    priority: "low" | "medium" | "high" | "critical";
    signals: {
      type: string;
      severity: "low" | "medium" | "high" | "critical";
      message: string;
    }[];
    recommendedActions: string[];
    analyzedAt: Date;
  } | null;

  /* ===============================
     🧠 BRAIN WORKER STATE
  =============================== */

  brainStatus: "idle" | "processing" | "completed" | "failed";
  lastBrainRunAt?: Date;

  /* ===============================
     🚨 ESCALATION SYSTEM
  =============================== */

  escalation?: {
    recommended: boolean;
    reason: string;
    recommendedAt: Date;
    approved: boolean;
    approvedAt?: Date;
    approvedBy?: Types.ObjectId;
  } | null;

  notes?: string;
  isArchived: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/* =====================================================
   🧠 Brain Snapshot Subschemas
===================================================== */

const BrainSignalSchema = new Schema(
  {
    type: { type: String, required: true },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
    },
    message: { type: String, required: true },
  },
  { _id: false }
);

const BrainSnapshotSchema = new Schema(
  {
    score: { type: Number, required: true },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
    },
    signals: {
      type: [BrainSignalSchema],
      default: [],
    },
    recommendedActions: {
      type: [String],
      default: [],
    },
    analyzedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

/* =====================================================
   🚨 Escalation Subschema
===================================================== */

const EscalationSchema = new Schema(
  {
    recommended: {
      type: Boolean,
      default: false,
      index: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    recommendedAt: {
      type: Date,
      index: true,
    },
    approved: {
      type: Boolean,
      default: false,
      index: true,
    },
    approvedAt: {
      type: Date,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { _id: false }
);

/* =====================================================
   LEAD SCHEMA
===================================================== */

const LeadSchema = new Schema<ILead>(
  {
    /* ================= BASIC INFO ================= */

    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    budget: { type: Number, required: true, index: true },
    interestedLocation: { type: String, required: true, index: true },
    source: {
      type: String,
      enum: Object.values(LeadSource),
      required: true,
    },

    /* ================= MULTI-TENANT ================= */

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* ================= PIPELINE ================= */

    pipelineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pipeline",
      required: true,
      index: true,
    },

    stageId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    probability: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    /* ================= AI CORE ================= */
    
    activityCount: {
  type: Number,
  default: 0,
},

    leadScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      index: true,
    },

    isStale: {
      type: Boolean,
      default: false,
      index: true,
    },

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

    /* ================= BRAIN WORKER ================= */

    brainStatus: {
      type: String,
      enum: ["idle", "processing", "completed", "failed"],
      default: "idle",
      index: true,
    },

    lastBrainRunAt: {
      type: Date,
      index: true,
    },

    /* ================= ESCALATION ================= */

    escalation: {
      type: EscalationSchema,
      default: null,
    },

    /* ================= OTHER ================= */

    notes: { type: String, trim: true },

    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

/* =====================================================
   PERFORMANCE INDEXES
===================================================== */

LeadSchema.index({ organizationId: 1, assignedTo: 1 });
LeadSchema.index({ organizationId: 1, isArchived: 1 });
LeadSchema.index({ pipelineId: 1, stageId: 1 });
LeadSchema.index({ source: 1, createdAt: -1 });
LeadSchema.index({ organizationId: 1, leadScore: -1 });
LeadSchema.index({ organizationId: 1, isStale: 1 });
LeadSchema.index({ organizationId: 1, brainPriority: 1 });
LeadSchema.index({ organizationId: 1, brainPriority: 1, isArchived: 1 });
LeadSchema.index({ brainStatus: 1, lastBrainRunAt: -1 });

// 🚨 Escalation filtering
LeadSchema.index({ organizationId: 1, "escalation.recommended": 1 });
LeadSchema.index({ organizationId: 1, "escalation.approved": 1 });

/* =====================================================
   EXPORT
===================================================== */

const Lead =
  mongoose.models.Lead ||
  mongoose.model<ILead>("Lead", LeadSchema);

export default Lead;