// subscription.model.ts
import mongoose, { Schema, } from "mongoose";
// ============================================================
// CONFIG
// ============================================================
const SUBSCRIPTION_CONFIG = {
    caps: {
        stripeId: 200,
        eventId: 200,
        reason: 500,
        metadataKey: 100,
    },
    /**
     * Default trial duration when no explicit trialEndsAt is provided.
     * 14 days matches the SMALL/PRO plan trial in plans.ts.
     */
    defaultTrialDays: 14,
};
// ============================================================
// CONSTANTS — PLANS
// ============================================================
/**
 * Subscription plan identifiers. Must align with PLAN_TIERS from plans.ts.
 * Stored as uppercase strings for case-insensitive matching with Stripe metadata.
 */
export const SUBSCRIPTION_PLANS = [
    "SMALL_BUSINESS",
    "PRO",
    "ENTERPRISE",
];
// ============================================================
// CONSTANTS — STATUSES
// ============================================================
/**
 * Local subscription statuses. Maps to (but extends) Stripe's status
 * vocabulary for clarity.
 *
 * Stored as lowercase to match what Stripe webhook events emit
 * (subscription.status is "active", "trialing", etc. — lowercase).
 */
export const SUBSCRIPTION_STATUSES = [
    "trialing",
    "active",
    "past_due",
    "canceled",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
    "expired",
];
/**
 * Status groups for query filters and business logic.
 */
export const ACTIVE_STATUSES = [
    "trialing",
    "active",
];
export const RECOVERABLE_STATUSES = [
    "past_due",
    "incomplete",
    "paused",
];
export const TERMINAL_STATUSES = [
    "canceled",
    "incomplete_expired",
    "unpaid",
    "expired",
];
// ============================================================
// SCHEMA
// ============================================================
const subscriptionSchema = new Schema({
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        required: [true, "organizationId is required"],
        unique: true,
        index: true,
    },
    stripeCustomerId: {
        type: String,
        trim: true,
        maxlength: SUBSCRIPTION_CONFIG.caps.stripeId,
        index: true,
        sparse: true,
    },
    stripeSubscriptionId: {
        type: String,
        trim: true,
        maxlength: SUBSCRIPTION_CONFIG.caps.stripeId,
        index: true,
        sparse: true,
    },
    stripePriceId: {
        type: String,
        trim: true,
        maxlength: SUBSCRIPTION_CONFIG.caps.stripeId,
    },
    plan: {
        type: String,
        enum: {
            values: SUBSCRIPTION_PLANS,
            message: "Invalid subscription plan: {VALUE}",
        },
        required: [true, "plan is required"],
        uppercase: true,
        trim: true,
        index: true,
    },
    status: {
        type: String,
        enum: {
            values: SUBSCRIPTION_STATUSES,
            message: "Invalid subscription status: {VALUE}",
        },
        required: [true, "status is required"],
        default: "trialing",
        lowercase: true,
        trim: true,
        index: true,
    },
    billingCycle: {
        type: String,
        enum: {
            values: ["monthly", "annual"],
            message: "billingCycle must be monthly or annual",
        },
        default: "monthly",
    },
    trialEndsAt: {
        type: Date,
        default: null,
    },
    currentPeriodStart: {
        type: Date,
        default: null,
    },
    currentPeriodEnd: {
        type: Date,
        default: null,
        index: true, // For renewal queries
    },
    canceledAt: {
        type: Date,
        default: null,
    },
    cancelReason: {
        type: String,
        trim: true,
        maxlength: SUBSCRIPTION_CONFIG.caps.reason,
        default: null,
    },
    cancelAtPeriodEnd: {
        type: Boolean,
        default: false,
    },
    lastWebhookAt: {
        type: Date,
        default: null,
    },
    lastWebhookEventId: {
        type: String,
        trim: true,
        maxlength: SUBSCRIPTION_CONFIG.caps.eventId,
        default: null,
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
    minimize: false,
    versionKey: false,
    toJSON: {
        virtuals: true,
        transform: (_doc, ret) => {
            delete ret.__v;
            return ret;
        },
    },
});
// ============================================================
// VIRTUALS
// ============================================================
/**
 * Convenience accessor: is this subscription currently usable?
 */
subscriptionSchema.virtual("isUsable").get(function () {
    return ACTIVE_STATUSES.includes(this.status);
});
// ============================================================
// INSTANCE METHODS
// ============================================================
subscriptionSchema.method("isActive", function () {
    return ACTIVE_STATUSES.includes(this.status);
});
subscriptionSchema.method("isRecoverable", function () {
    return RECOVERABLE_STATUSES.includes(this.status);
});
subscriptionSchema.method("isTerminal", function () {
    return TERMINAL_STATUSES.includes(this.status);
});
subscriptionSchema.method("daysUntilRenewal", function () {
    if (!this.currentPeriodEnd)
        return null;
    const ms = new Date(this.currentPeriodEnd).getTime() - Date.now();
    if (ms < 0)
        return 0;
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
});
subscriptionSchema.method("trialDaysRemaining", function () {
    if (!this.trialEndsAt)
        return null;
    if (this.status !== "trialing")
        return null;
    const ms = new Date(this.trialEndsAt).getTime() - Date.now();
    if (ms < 0)
        return 0;
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
});
// ============================================================
// STATIC METHODS
// ============================================================
subscriptionSchema.static("findActiveByOrg", function (organizationId) {
    const orgId = new mongoose.Types.ObjectId(organizationId.toString());
    return this.findOne({
        organizationId: orgId,
        isDeleted: { $ne: true },
        status: { $in: ACTIVE_STATUSES },
    }).exec();
});
subscriptionSchema.static("findByStripeSubscriptionId", function (stripeSubscriptionId) {
    if (!stripeSubscriptionId || stripeSubscriptionId.length === 0) {
        return Promise.resolve(null);
    }
    return this.findOne({
        stripeSubscriptionId,
        isDeleted: { $ne: true },
    }).exec();
});
subscriptionSchema.static("findExpiringTrials", function (withinDays = 3) {
    const horizon = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    return this.find({
        status: "trialing",
        trialEndsAt: { $lte: horizon, $gte: new Date() },
        isDeleted: { $ne: true },
    }).exec();
});
// ============================================================
// PRE-HOOKS
// ============================================================
/**
 * Normalize fields and set default trial date on first creation.
 *
 * Mongoose pre-hook signature note: opts FIRST, next OPTIONAL —
 * matches PreMiddlewareFunction in installed Mongoose version.
 * Same fix from role.model.ts and audit.model.ts pre-hook errors.
 */
subscriptionSchema.pre("save", function (_opts, next) {
    // Auto-set trialEndsAt on first creation if missing and status is trialing
    if (this.isNew && this.status === "trialing" && !this.trialEndsAt) {
        this.trialEndsAt = new Date(Date.now() + SUBSCRIPTION_CONFIG.defaultTrialDays * 24 * 60 * 60 * 1000);
    }
    // Set canceledAt automatically when status flips to canceled
    if (this.isModified("status") && this.status === "canceled" && !this.canceledAt) {
        this.canceledAt = new Date();
    }
    // Soft-delete bookkeeping
    if (this.isModified("isDeleted") && this.isDeleted && !this.deletedAt) {
        this.deletedAt = new Date();
    }
    if (next)
        next();
});
/**
 * Exclude soft-deleted records from default queries.
 * Callers explicitly opting in can pass includeDeleted: true via setOptions.
 */
subscriptionSchema.pre(/^find/, function (_opts, next) {
    const options = this.getOptions();
    if (options.includeDeleted !== true) {
        this.where({ isDeleted: { $ne: true } });
    }
    if (next)
        next();
});
// ============================================================
// INDEXES
// ============================================================
// Multi-tenant + state queries — the common dashboard "active subscriptions" query
subscriptionSchema.index({ organizationId: 1, status: 1 });
// Plan distribution analytics
subscriptionSchema.index({ plan: 1, status: 1 });
// Trial expiry batch jobs
subscriptionSchema.index({ status: 1, trialEndsAt: 1 });
// Renewal batch jobs
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
// Webhook lookup by Stripe ID (with sparse since not all subs have one immediately)
subscriptionSchema.index({ stripeSubscriptionId: 1 }, { unique: true, sparse: true });
// ============================================================
// MODEL EXPORT
// ============================================================
const Subscription = mongoose.models.Subscription ||
    mongoose.model("Subscription", subscriptionSchema);
export default Subscription;
//# sourceMappingURL=subscription.model.js.map