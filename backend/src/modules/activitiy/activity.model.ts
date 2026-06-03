import mongoose, {
  Schema,
  model,
  models,
  Types,
} from "mongoose";

import {
  ActivityType,
  ActivitySeverity,
} from "./activity.types.js";

/* =====================================================
   TYPES
===================================================== */

export interface IActivity {
  externalId: string;

  organizationId: Types.ObjectId;

  provider: string;

  type: ActivityType;

  severity?: ActivitySeverity;

  title: string;

  description: string;

  sentiment?:
    | "positive"
    | "neutral"
    | "negative";

  metadata?: Record<
    string,
    unknown
  >;

  occurredAt: Date;

  createdAt: Date;

  updatedAt: Date;
}

/* =====================================================
   SCHEMA
===================================================== */

const activitySchema =
  new Schema<IActivity>(
    {
      externalId: {
        type: String,

        required: true,

        index: true,
      },

      organizationId: {
        type: Schema.Types.ObjectId,

        ref: "Organization",

        required: true,

        index: true,
      },

      provider: {
        type: String,

        required: true,

        index: true,
      },

      type: {
        type: String,

        enum: [
          "email",
          "slack",
          "meeting",
          "risk",
          "opportunity",
        ],

        required: true,

        index: true,
      },

      severity: {
        type: String,

        enum: [
          "low",
          "medium",
          "high",
          "critical",
        ],

        default: "medium",
      },

      title: {
        type: String,

        required: true,
      },

      description: {
        type: String,

        required: true,
      },

      sentiment: {
        type: String,

        enum: [
          "positive",
          "neutral",
          "negative",
        ],
      },

      metadata: {
        type: Schema.Types.Mixed,

        default: {},
      },

      occurredAt: {
        type: Date,

        required: true,

        index: true,
      },
    },
    {
      timestamps: true,
    }
  );

/* =====================================================
   INDEXES
===================================================== */

activitySchema.index({
  organizationId: 1,
  occurredAt: -1,
});

activitySchema.index({
  organizationId: 1,
  provider: 1,
});

activitySchema.index({
  organizationId: 1,
  type: 1,
});

/* =====================================================
   UNIQUE EVENT SAFETY
===================================================== */

activitySchema.index(
  {
    externalId: 1,
    provider: 1,
  },
  {
    unique: true,
  }
);

/* =====================================================
   MODEL
===================================================== */

const Activity =
  models.Activity ||
  model<IActivity>(
    "Activity",
    activitySchema
  );

export default Activity;