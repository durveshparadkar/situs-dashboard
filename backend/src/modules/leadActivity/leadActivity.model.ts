import mongoose, { Schema, Document, Model } from "mongoose";

/* =====================================================
   ACTION TYPES (Single Source of Truth)
===================================================== */

export const LEAD_ACTIVITY_ACTIONS = [
  "CREATED",
  "UPDATED",
  "STAGE_CHANGED",
  "ARCHIVED",
  "RESTORED",

  // 🚨 Escalation System
  "ESCALATION_REQUESTED",
  "ESCALATION_APPROVED",
  "ESCALATION_REJECTED",
] as const;

export type LeadActivityAction =
  (typeof LEAD_ACTIVITY_ACTIONS)[number];

/* =====================================================
   INTERFACE
===================================================== */

export interface ILeadActivity extends Document {
  lead: mongoose.Types.ObjectId;
  action: LeadActivityAction;
  performedBy: mongoose.Types.ObjectId;
  previousValue?: unknown;
  newValue?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/* =====================================================
   SCHEMA
===================================================== */

const LeadActivitySchema = new Schema<ILeadActivity>(
  {
    lead: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: LEAD_ACTIVITY_ACTIONS,
      required: true,
      index: true,
    },

    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    previousValue: {
      type: Schema.Types.Mixed,
      default: null,
    },

    newValue: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/* =====================================================
   INDEXES (Enterprise Ready)
===================================================== */

LeadActivitySchema.index({ lead: 1, createdAt: -1 });
LeadActivitySchema.index({ performedBy: 1, createdAt: -1 });
LeadActivitySchema.index({ action: 1 });

/* =====================================================
   MODEL EXPORT (Safe Hot Reload)
===================================================== */

const LeadActivity: Model<ILeadActivity> =
  mongoose.models.LeadActivity ||
  mongoose.model<ILeadActivity>(
    "LeadActivity",
    LeadActivitySchema
  );

export default LeadActivity;