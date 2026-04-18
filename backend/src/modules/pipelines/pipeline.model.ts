import mongoose, { Schema, Document, Types } from "mongoose";

/* ===============================
   STAGE TYPE
================================ */

export interface IStage {
  _id: Types.ObjectId;
  name: string;
  order: number;
  probability: number;
  color?: string;

  /* 🔥 INTELLIGENCE LIFECYCLE FLAGS */
  isClosed: boolean;
  isWon: boolean;
  isLost: boolean;
}

/* ===============================
   PIPELINE TYPE
================================ */

export interface IPipeline extends Document {
  name: string;
  organizationId: Types.ObjectId;
  isDefault: boolean;
  stages: IStage[];
  createdAt: Date;
  updatedAt: Date;
}

/* ===============================
   STAGE SCHEMA
================================ */

const stageSchema = new Schema<IStage>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    order: {
      type: Number,
      required: true,
    },

    probability: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    color: {
      type: String,
      default: "#3B82F6",
    },

    /* 🔥 NEW LIFECYCLE FIELDS */

    isClosed: {
      type: Boolean,
      default: false,
    },

    isWon: {
      type: Boolean,
      default: false,
    },

    isLost: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true }
);

/* ===============================
   PIPELINE SCHEMA
================================ */

const pipelineSchema = new Schema<IPipeline>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },

    stages: {
      type: [stageSchema],
      validate: {
        validator: function (value: IStage[]) {
          return value.length > 0;
        },
        message: "Pipeline must have at least one stage",
      },
    },
  },
  {
    timestamps: true,
  }
);

/* ===============================
   ENSURE ONE DEFAULT PIPELINE PER ORG
================================ */

pipelineSchema.index(
  { organizationId: 1, isDefault: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } }
);

const Pipeline =
  mongoose.models.Pipeline ||
  mongoose.model<IPipeline>("Pipeline", pipelineSchema);

export default Pipeline;