import mongoose, { Schema, Document, Types } from "mongoose";
import { createPipeline } from "../pipelines/pipeline.service.js";

/* ===============================
   TYPES
================================ */

export type OrganizationPlan =
  | "SMALL_BUSINESS"
  | "PRO"
  | "ENTERPRISE";

export type BillingStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED";

export interface IOrganization extends Document {
  name: string;
  plan: OrganizationPlan;
  billingStatus: BillingStatus;
  isTrial: boolean;
  trialEndsAt?: Date | undefined;
  graceUntil?: Date | undefined;
  subscriptionId?: Types.ObjectId | undefined;
  createdAt: Date;
  updatedAt: Date;
}

/* ===============================
   SCHEMA
================================ */

const organizationSchema = new Schema<IOrganization>(
  {
    name: {
      type: String,
      required: [true, "Organization name is required"],
      unique: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    plan: {
      type: String,
      enum: ["SMALL_BUSINESS", "PRO", "ENTERPRISE"],
      default: "SMALL_BUSINESS",
      required: true,
      index: true,
    },

    billingStatus: {
      type: String,
      enum: ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED"],
      default: "TRIAL",
      index: true,
    },

    isTrial: {
      type: Boolean,
      default: true,
    },

    trialEndsAt: {
      type: Date,
      index: true,
    },

    graceUntil: {
      type: Date,
      index: true,
    },

    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/* ===============================
   AUTO BILLING LOGIC
   (ASYNC STYLE - NO next())
================================ */

organizationSchema.pre("save", async function () {
  const org = this as IOrganization;
  const now = new Date();

  if (org.isNew && org.isTrial && !org.trialEndsAt) {
    org.trialEndsAt = new Date(
      now.getTime() + 14 * 24 * 60 * 60 * 1000
    );
  }

  if (org.isTrial) {
    org.billingStatus = "TRIAL";
  }

  if (
    org.isTrial &&
    org.trialEndsAt &&
    org.trialEndsAt < now
  ) {
    org.isTrial = false;
    org.billingStatus = "PAST_DUE";
  }

  if (
    org.billingStatus === "PAST_DUE" &&
    !org.graceUntil
  ) {
    org.graceUntil = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000
    );
  }

  if (org.billingStatus === "ACTIVE") {
    org.graceUntil = undefined;
    org.isTrial = false;
  }
});

/* ===============================
   AUTO CREATE DEFAULT PIPELINE
================================ */

organizationSchema.post("save", async function (doc: IOrganization) {
  if (!doc.isNew) return;

  try {
    await createPipeline({
      name: "Default Sales Pipeline",
      isDefault: true,
      organizationId: doc._id,
      stages: [
        { name: "New", order: 1, probability: 10 },
        { name: "Contacted", order: 2, probability: 30 },
        { name: "Proposal", order: 3, probability: 60 },
        { name: "Negotiation", order: 4, probability: 80 },
        { name: "Won", order: 5, probability: 100 },
        { name: "Lost", order: 6, probability: 0 },
      ],
    });

    console.log(
      "Default pipeline created for organization:",
      doc.name
    );
  } catch (error) {
    console.error(
      "Failed to create default pipeline:",
      error
    );
  }
});

/* ===============================
   MODEL EXPORT
================================ */

const Organization =
  mongoose.models.Organization ||
  mongoose.model<IOrganization>(
    "Organization",
    organizationSchema
  );

export default Organization;





