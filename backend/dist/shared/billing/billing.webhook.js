import mongoose from "mongoose";
import stripe from "../../config/stripe.js";
import Organization from "../../modules/organizations/organization.model.js";
import Subscription from "./subscription.model.js";
import { emailQueue } from "../../config/queue.js";
import { dbLogger } from "../../utils/logger.js";
import { invalidateBillingCache, } from "../../shared/billing/billing.guard.js";
// ============================================================
// CONFIG
// ============================================================
const WEBHOOK_CONFIG = {
    /**
     * Grace period in days when a payment fails. Customer keeps access
     * during this window to update their billing details.
     */
    graceDays: parseInt(process.env.BILLING_GRACE_DAYS ?? "3", 10),
    /**
     * Whether to emit email notifications. Disable in dev/test to avoid
     * inbox spam during webhook replay.
     */
    emailNotifications: process.env.BILLING_EMAIL_NOTIFICATIONS !== "false",
    /**
     * Maximum age of a webhook event we'll process (in seconds).
     * Stripe sometimes replays old events. Anything older than this
     * is suspect and ignored.
     */
    maxEventAgeSeconds: parseInt(process.env.BILLING_MAX_EVENT_AGE_SECONDS ?? "300", 10),
};
const processedEvents = new Map();
const PROCESSED_EVENT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PROCESSED_EVENT_MAX = 50_000;
function markEventProcessed(eventId) {
    // Bounded growth — evict oldest 10% when at cap
    if (processedEvents.size >= PROCESSED_EVENT_MAX) {
        const target = Math.ceil(PROCESSED_EVENT_MAX * 0.1);
        let removed = 0;
        for (const key of processedEvents.keys()) {
            processedEvents.delete(key);
            if (++removed >= target)
                break;
        }
    }
    processedEvents.set(eventId, {
        expiresAt: Date.now() + PROCESSED_EVENT_TTL_MS,
    });
}
function isEventProcessed(eventId) {
    const entry = processedEvents.get(eventId);
    if (!entry)
        return false;
    if (entry.expiresAt <= Date.now()) {
        processedEvents.delete(eventId);
        return false;
    }
    return true;
}
// ============================================================
// HELPERS
// ============================================================
/**
 * Safely extract metadata from a Stripe object.
 */
function getMetadata(obj) {
    const meta = obj.metadata ?? {};
    return {
        organizationId: typeof meta.organizationId === "string" ? meta.organizationId : undefined,
        plan: typeof meta.plan === "string" ? meta.plan : undefined,
        actorId: typeof meta.actorId === "string" ? meta.actorId : undefined,
    };
}
/**
 * Map Stripe subscription status to local billingStatus.
 */
function mapStripeStatusToBillingStatus(status) {
    switch (status) {
        case "trialing": return "TRIAL";
        case "active": return "ACTIVE";
        case "past_due": return "PAST_DUE";
        case "canceled": return "CANCELED";
        case "incomplete": return "PAST_DUE";
        case "incomplete_expired": return "CANCELED";
        case "unpaid": return "UNPAID";
        case "paused": return "PAUSED";
        default: return null;
    }
}
/**
 * Send an email notification via the queue, swallowing failures so
 * webhook ack isn't blocked by a slow queue.
 */
async function notifyOwner(ownerEmail, subject, body) {
    if (!WEBHOOK_CONFIG.emailNotifications)
        return;
    if (!ownerEmail)
        return;
    try {
        await emailQueue.add("billing-event", {
            to: ownerEmail,
            subject,
            html: body,
        });
    }
    catch (err) {
        dbLogger.warn("Failed to enqueue billing email: " +
            (err?.message ?? "unknown"));
    }
}
/**
 * Validate ObjectId format before passing to Mongoose. Returns null if
 * invalid (rather than throwing — Stripe events with malformed metadata
 * shouldn't crash the webhook handler).
 */
function safeObjectId(id) {
    if (!id)
        return null;
    return mongoose.Types.ObjectId.isValid(id) ? id : null;
}
/**
 * Skip a webhook update if the event is stale (older than what's already
 * been applied). Prevents out-of-order events from regressing state.
 *
 * Returns true if the event should be applied, false if it should be skipped.
 */
function isNewerEvent(eventCreatedAt, lastWebhookAt) {
    if (!lastWebhookAt)
        return true;
    return eventCreatedAt * 1000 >= lastWebhookAt.getTime();
}
/**
 * customer.subscription.created OR customer.subscription.updated
 */
async function handleSubscriptionChange(ctx) {
    const sub = ctx.event.data.object;
    const { organizationId, plan } = getMetadata(sub);
    const orgId = safeObjectId(organizationId);
    if (!orgId || !plan) {
        dbLogger.warn("Subscription event missing metadata: event=" + ctx.event.id +
            " orgId=" + organizationId + " plan=" + plan);
        return;
    }
    const billingStatus = mapStripeStatusToBillingStatus(sub.status);
    if (!billingStatus) {
        dbLogger.warn("Unknown Stripe subscription status: " + sub.status +
            " event=" + ctx.event.id);
        return;
    }
    // Update subscription record (upsert)
    const SubModel = Subscription;
    await SubModel.findOneAndUpdate({ stripeSubscriptionId: sub.id }, {
        organizationId: orgId,
        stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripeSubscriptionId: sub.id,
        plan,
        status: sub.status,
        lastWebhookAt: new Date(ctx.eventCreatedAt * 1000),
        lastWebhookEventId: ctx.event.id,
    }, { upsert: true, new: true });
    // Update organization billing state — but only if this event is newer
    const OrgModel = Organization;
    const org = await OrgModel.findById(orgId);
    if (!org) {
        dbLogger.warn("Organization not found for subscription event: org=" + orgId +
            " event=" + ctx.event.id);
        return;
    }
    if (!isNewerEvent(ctx.eventCreatedAt, org.lastWebhookAt)) {
        dbLogger.info("Skipping stale subscription event: org=" + orgId +
            " event=" + ctx.event.id);
        return;
    }
    const previousStatus = org.billingStatus;
    org.plan = plan;
    org.billingStatus = billingStatus;
    org.isTrial = billingStatus === "TRIAL";
    if (billingStatus === "ACTIVE")
        org.graceUntil = null;
    org.lastWebhookAt = new Date(ctx.eventCreatedAt * 1000);
    await org.save();
    invalidateBillingCache(String(org._id));
    // Notify on meaningful transitions
    if (previousStatus !== billingStatus && org.ownerEmail) {
        await notifyOwner(org.ownerEmail, "Subscription " + billingStatus.toLowerCase(), "Your subscription status has been updated to " + billingStatus + ".");
    }
    dbLogger.info("Subscription synced: org=" + orgId +
        " plan=" + plan +
        " status=" + billingStatus +
        " event=" + ctx.event.id);
}
/**
 * customer.subscription.deleted
 */
async function handleSubscriptionDeleted(ctx) {
    const sub = ctx.event.data.object;
    const { organizationId } = getMetadata(sub);
    const orgId = safeObjectId(organizationId);
    if (!orgId) {
        dbLogger.warn("Subscription deletion missing org metadata: event=" + ctx.event.id);
        return;
    }
    const SubModel = Subscription;
    await SubModel.findOneAndUpdate({ stripeSubscriptionId: sub.id }, {
        status: "canceled",
        canceledAt: new Date(),
        lastWebhookAt: new Date(ctx.eventCreatedAt * 1000),
        lastWebhookEventId: ctx.event.id,
    });
    const OrgModel = Organization;
    const org = await OrgModel.findById(orgId);
    if (!org)
        return;
    if (!isNewerEvent(ctx.eventCreatedAt, org.lastWebhookAt)) {
        dbLogger.info("Skipping stale deletion event: org=" + orgId +
            " event=" + ctx.event.id);
        return;
    }
    org.billingStatus = "CANCELED";
    org.isTrial = false;
    org.graceUntil = null;
    org.lastWebhookAt = new Date(ctx.eventCreatedAt * 1000);
    await org.save();
    invalidateBillingCache(String(org._id));
    if (org.ownerEmail) {
        await notifyOwner(org.ownerEmail, "Subscription Canceled", "Your subscription has been canceled. Re-subscribe anytime to restore access.");
    }
    dbLogger.warn("Subscription canceled: org=" + orgId + " event=" + ctx.event.id);
}
/**
 * invoice.payment_failed
 */
async function handlePaymentFailed(ctx) {
    const invoice = ctx.event.data.object;
    const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
    if (!subscriptionId) {
        dbLogger.warn("Payment failed event without subscription: event=" + ctx.event.id);
        return;
    }
    const SubModel = Subscription;
    const subscription = await SubModel.findOne({ stripeSubscriptionId: subscriptionId });
    if (!subscription) {
        dbLogger.warn("Subscription not found for payment failure: stripe_id=" + subscriptionId +
            " event=" + ctx.event.id);
        return;
    }
    subscription.status = "past_due";
    subscription.lastWebhookAt = new Date(ctx.eventCreatedAt * 1000);
    subscription.lastWebhookEventId = ctx.event.id;
    await subscription.save();
    const OrgModel = Organization;
    const orgId = subscription.organizationId ? String(subscription.organizationId) : null;
    if (!orgId)
        return;
    const org = await OrgModel.findById(orgId);
    if (!org)
        return;
    if (!isNewerEvent(ctx.eventCreatedAt, org.lastWebhookAt)) {
        dbLogger.info("Skipping stale payment-failed event: org=" + orgId +
            " event=" + ctx.event.id);
        return;
    }
    org.billingStatus = "PAST_DUE";
    org.graceUntil = new Date(Date.now() + WEBHOOK_CONFIG.graceDays * 24 * 60 * 60 * 1000);
    org.lastWebhookAt = new Date(ctx.eventCreatedAt * 1000);
    await org.save();
    invalidateBillingCache(String(org._id));
    if (org.ownerEmail) {
        await notifyOwner(org.ownerEmail, "Payment Failed - Action Required", "Your most recent payment failed. You have " + WEBHOOK_CONFIG.graceDays +
            " days to update your billing details before service is restricted.");
    }
    dbLogger.warn("Payment failed - grace applied: org=" + orgId +
        " graceUntil=" + org.graceUntil.toISOString() +
        " event=" + ctx.event.id);
}
/**
 * invoice.payment_succeeded
 */
async function handlePaymentSucceeded(ctx) {
    const invoice = ctx.event.data.object;
    const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
    if (!subscriptionId)
        return;
    const SubModel = Subscription;
    const subscription = await SubModel.findOne({ stripeSubscriptionId: subscriptionId });
    if (!subscription)
        return;
    subscription.status = "active";
    subscription.lastWebhookAt = new Date(ctx.eventCreatedAt * 1000);
    subscription.lastWebhookEventId = ctx.event.id;
    await subscription.save();
    const orgId = subscription.organizationId ? String(subscription.organizationId) : null;
    if (!orgId)
        return;
    const OrgModel = Organization;
    const org = await OrgModel.findById(orgId);
    if (!org)
        return;
    if (!isNewerEvent(ctx.eventCreatedAt, org.lastWebhookAt)) {
        dbLogger.info("Skipping stale payment-success event: org=" + orgId +
            " event=" + ctx.event.id);
        return;
    }
    const wasFailedOrTrial = org.billingStatus === "PAST_DUE" ||
        org.billingStatus === "TRIAL" ||
        org.billingStatus === "UNPAID";
    org.billingStatus = "ACTIVE";
    org.graceUntil = null;
    org.isTrial = false;
    org.lastWebhookAt = new Date(ctx.eventCreatedAt * 1000);
    await org.save();
    invalidateBillingCache(String(org._id));
    if (wasFailedOrTrial && org.ownerEmail) {
        await notifyOwner(org.ownerEmail, "Payment Successful", "Your payment was processed successfully. Your subscription is now active.");
    }
    dbLogger.info("Payment succeeded: org=" + orgId + " event=" + ctx.event.id);
}
// ============================================================
// EVENT DISPATCH
// ============================================================
const EVENT_HANDLERS = {
    "customer.subscription.created": handleSubscriptionChange,
    "customer.subscription.updated": handleSubscriptionChange,
    "customer.subscription.deleted": handleSubscriptionDeleted,
    "invoice.payment_failed": handlePaymentFailed,
    "invoice.payment_succeeded": handlePaymentSucceeded,
};
// ============================================================
// MAIN HANDLER
// ============================================================
export const stripeWebhook = async (req, res) => {
    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    // -------------------------------------------------------
    // 1. SIGNATURE PRESENCE
    // -------------------------------------------------------
    if (!signature || typeof signature !== "string") {
        dbLogger.warn("Stripe webhook missing signature header");
        res.status(400).send("Missing Stripe signature");
        return;
    }
    if (!webhookSecret) {
        dbLogger.error("STRIPE_WEBHOOK_SECRET is not configured");
        res.status(500).send("Webhook secret not configured");
        return;
    }
    // -------------------------------------------------------
    // 2. SIGNATURE VERIFICATION
    // Stripe SDK requires the raw body buffer here.
    // -------------------------------------------------------
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    }
    catch (err) {
        dbLogger.error("Stripe webhook signature verification failed: " +
            (err?.message ?? "unknown"));
        res.status(400).send("Invalid signature");
        return;
    }
    // -------------------------------------------------------
    // 3. EVENT AGE CHECK
    // Reject events older than maxEventAgeSeconds — defends against
    // replay attacks (although signature already provides timing protection).
    // -------------------------------------------------------
    const eventAge = Math.floor(Date.now() / 1000) - event.created;
    if (eventAge > WEBHOOK_CONFIG.maxEventAgeSeconds) {
        dbLogger.warn("Stripe webhook event too old: id=" + event.id +
            " age=" + eventAge + "s");
        // Return 200 — Stripe should stop retrying old events
        res.status(200).json({ received: true, skipped: "event_too_old" });
        return;
    }
    // -------------------------------------------------------
    // 4. IDEMPOTENCY CHECK
    // Stripe retries webhooks with the same event ID. Skip if we've
    // already processed this one.
    // -------------------------------------------------------
    if (isEventProcessed(event.id)) {
        dbLogger.info("Stripe webhook already processed: event=" + event.id +
            " type=" + event.type);
        res.status(200).json({ received: true, skipped: "duplicate" });
        return;
    }
    // -------------------------------------------------------
    // 5. DISPATCH TO HANDLER
    // -------------------------------------------------------
    const handler = EVENT_HANDLERS[event.type];
    if (!handler) {
        dbLogger.info("Unhandled Stripe event type: " + event.type);
        // Mark as processed so we don't reprocess on retry
        markEventProcessed(event.id);
        res.status(200).json({ received: true, handled: false });
        return;
    }
    try {
        await handler({ event, eventCreatedAt: event.created });
        markEventProcessed(event.id);
        dbLogger.info("Stripe webhook processed: event=" + event.id +
            " type=" + event.type);
        res.status(200).json({ received: true, handled: true });
    }
    catch (err) {
        // CRITICAL: don't mark as processed on failure — Stripe will retry.
        // Return 500 so Stripe knows to retry (it uses exponential backoff
        // up to 3 days).
        dbLogger.error("Stripe webhook handler failed: event=" + event.id +
            " type=" + event.type +
            " error=" + (err?.message ?? "unknown"));
        res.status(500).send("Webhook handler failed");
    }
};
export default stripeWebhook;
//# sourceMappingURL=billing.webhook.js.map