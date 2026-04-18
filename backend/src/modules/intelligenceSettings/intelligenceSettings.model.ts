import mongoose, { Schema, Document } from "mongoose";

export interface IIntelligenceSettings extends Document {
  tenantId: mongoose.Types.ObjectId;

  stallDaysThreshold: number;
  activitySpikeThreshold: number;
  fastMoveDaysWindow: number;

  highValueMultiplier: number;
  hotScoreThreshold: number;
  coldScoreThreshold: number;

  createdAt: Date;
  updatedAt: Date;
}

const intelligenceSettingsSchema = new Schema<IIntelligenceSettings>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
    },

    stallDaysThreshold: {
      type: Number,
      default: 7,
    },

    activitySpikeThreshold: {
      type: Number,
      default: 5,
    },

    fastMoveDaysWindow: {
      type: Number,
      default: 3,
    },

    highValueMultiplier: {
      type: Number,
      default: 1.5,
    },

    hotScoreThreshold: {
      type: Number,
      default: 75,
    },

    coldScoreThreshold: {
      type: Number,
      default: 30,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IIntelligenceSettings>(
  "IntelligenceSettings",
  intelligenceSettingsSchema
);