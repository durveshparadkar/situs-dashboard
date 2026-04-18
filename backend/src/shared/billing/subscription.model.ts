import mongoose, { Schema, Document } from "mongoose";

/* ================= TYPES ================= */

export type SubscriptionPlan =
  | "SMALL_BUSINESS"
  | "PRO"
  | "ENTERPRISE";

export type SubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "EXPIRED";

/* ================= INTERFACE ================= */

export interface ISubscription extends Document {
  organizationId: mongoose.Types.ObjectId;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialEndsAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/* ================= SCHEMA ================= */

const subscriptionSchema = new Schema<ISubscription>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
      index: true,
    },

    stripeCustomerId: {
      type: String,
    },

    stripeSubscriptionId: {
      type: String,
    },

    plan: {
      type: String,
      enum: {
        values: ["SMALL_BUSINESS", "PRO", "ENTERPRISE"],
        message: "Invalid subscription plan",
      },
      required: true,
    },

    status: {
      type: String,
      enum: {
        values: ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"],
        message: "Invalid subscription status",
      },
      default: "TRIALING", // ✅ Default added
      required: true,
    },

    trialEndsAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

/* ================= MODEL ================= */

const Subscription =
  mongoose.models.Subscription ||
  mongoose.model<ISubscription>("Subscription", subscriptionSchema);

export default Subscription;

