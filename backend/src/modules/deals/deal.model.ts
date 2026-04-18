import mongoose, { Schema, Document } from "mongoose";

export interface IDeal extends Document {
  title: string;
  value: number;

  organizationId: mongoose.Types.ObjectId;
  assignedTo: mongoose.Types.ObjectId;

  lead?: mongoose.Types.ObjectId;

  pipelineId: mongoose.Types.ObjectId;
  stageId: mongoose.Types.ObjectId;

  probability: number;

  /* 🔥 ACTIVITY TRACKING */
  activityCount: number;
  lastActivityAt: Date;

  /* 🔥 RISK ENGINE */
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";

  createdAt: Date;
  updatedAt: Date;
}

const DealSchema = new Schema<IDeal>(
  {
    title: { type: String, required: true },
    value: { type: Number, required: true },

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
    },

    lead: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
    },

    pipelineId: {
      type: Schema.Types.ObjectId,
      ref: "Pipeline",
      required: true,
    },

    stageId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    probability: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    activityCount: {
      type: Number,
      default: 0,
    },

    lastActivityAt: {
      type: Date,
      default: Date.now,
    },

    riskScore: {
      type: Number,
      default: 0,
      index: true,
    },

    riskLevel: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "low",
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IDeal>("Deal", DealSchema);