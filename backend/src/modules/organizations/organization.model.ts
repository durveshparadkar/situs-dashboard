import mongoose, { Schema, Types, Model } from "mongoose";
import type { HydratedDocument } from "mongoose";
import { createPipeline } from "../pipelines/pipeline.service.js";

/* ================= TYPES ================= */

export type OrganizationPlan =
  | "SMALL_BUSINESS"
  | "PRO"
  | "ENTERPRISE";

export type BillingStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED";

export interface IOrganization {
  name: string;
  slug: string; // 🔥 unique identifier (important for SaaS URLs)

  plan: OrganizationPlan;
  billingStatus: BillingStatus;

  isTrial: boolean;
  trialEndsAt: Date | null;
  graceUntil: Date | null;

  subscriptionId?: Types.ObjectId | null;

  /* 🔥 ENTERPRISE FLAGS */
  isActive: boolean;
  isDeleted: boolean;

  /* 🔥 SETTINGS (future-ready) */
  settings?: {
    timezone?: string;
    currency?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

type OrgDoc = HydratedDocument<IOrganization>;

/* ================= SCHEMA ================= */

const organizationSchema = new Schema<IOrganization>(
  {
    /* ================= BASIC ================= */

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
      index: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true, // 🔥 VERY IMPORTANT
      lowercase: true,
      trim: true,
      index: true,
    },

    /* ================= PLAN ================= */

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

    /* ================= BILLING ================= */

    isTrial: {
      type: Boolean,
      default: true,
      index: true,
    },

    trialEndsAt: {
      type: Date,
      default: null,
      index: true,
    },

    graceUntil: {
      type: Date,
      default: null,
      index: true,
    },

    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
      index: true,
    },

    /* ================= FLAGS ================= */

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    /* ================= SETTINGS ================= */

    settings: {
      timezone: { type: String, default: "UTC" },
      currency: { type: String, default: "USD" },
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

/* ================= INDEXES (🔥 SCALE READY) ================= */

organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ billingStatus: 1, isActive: 1 });
organizationSchema.index({ plan: 1, isActive: 1 });

/* ================= HELPERS ================= */

function generateSlug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

/* ================= NAME + SLUG SAFETY ================= */

organizationSchema.pre("validate", function () {
  const org = this as OrgDoc;

  if (!org.name?.trim()) {
    org.name = "Default Organization";
  }

  if (!org.slug) {
    org.slug = generateSlug(org.name);
  }
});

/* ================= BILLING LOGIC ================= */

organizationSchema.pre("save", function () {
  const org = this as OrgDoc;
  const now = new Date();

  /* 🔥 TRIAL INIT */
  if (org.isNew && org.isTrial && !org.trialEndsAt) {
    org.trialEndsAt = new Date(
      now.getTime() + 14 * 24 * 60 * 60 * 1000
    );
  }

  /* 🔥 TRIAL STATE */
  if (org.isTrial) {
    org.billingStatus = "TRIAL";
  }

  /* 🔥 TRIAL EXPIRED */
  if (org.isTrial && org.trialEndsAt && org.trialEndsAt < now) {
    org.isTrial = false;
    org.billingStatus = "PAST_DUE";
  }

  /* 🔥 GRACE PERIOD */
  if (org.billingStatus === "PAST_DUE" && !org.graceUntil) {
    org.graceUntil = new Date(
      now.getTime() + 7 * 24 * 60 * 60 * 1000
    );
  }

  /* 🔥 ACTIVE RESET */
  if (org.billingStatus === "ACTIVE") {
    org.graceUntil = null;
    org.isTrial = false;
  }

  /* 🔥 AUTO DEACTIVATE */
  if (
    org.billingStatus === "PAST_DUE" &&
    org.graceUntil &&
    org.graceUntil < now
  ) {
    org.isActive = false;
  }
});

/* ================= POST CREATE HOOK ================= */

organizationSchema.post("save", async function (doc: OrgDoc) {
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

    console.log("✅ Default pipeline created for org:", doc.slug);
  } catch (error) {
    console.error("❌ Pipeline creation failed:", error);
  }
});

/* ================= EXPORT ================= */

const Organization: Model<IOrganization> =
  mongoose.models.Organization ||
  mongoose.model<IOrganization>("Organization", organizationSchema);

export default Organization;





