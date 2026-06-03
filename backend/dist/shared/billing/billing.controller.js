import { z } from "zod";
import stripe from "../../config/stripe.js";
import Organization from "../../modules/organizations/organization.model.js";
import Subscription from "./subscription.model.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { dbLogger } from "../../utils/logger.js";
/* =====================================================
   ERRORS
===================================================== */
class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(message, statusCode = 400, code = "APP_ERROR", details) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code;
        if (details !== undefined)
            this.details = details;
    }
}
/* =====================================================
   HTTP STATUS
===================================================== */
const HttpStatus = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL: 500,
    BAD_GATEWAY: 502,
};
/* =====================================================
   CONFIG
===================================================== */
const SUBSCRIPTION_CONFIG = {
    priceMap: {
        SMALL_BUSINESS: process.env.STRIPE_PRICE_SMALL_BUSINESS || "price_1SypbCSDFR58Nqd0b9X4Pzso",
        PRO: process.env.STRIPE_PRICE_PRO || "price_1SypbCSDFR58Nqd0b9X4Pzso",
    },
    trialPeriodDays: parseInt(process.env.STRIPE_TRIAL_DAYS ?? "14", 10),
    billingAdminRoles: ["ORG_ADMIN", "SUPER_ADMIN"],
    invoiceListLimit: 10,
    invoiceListMaxLimit: 100,
    stripeTimeoutMs: 15_000,
    clientUrl: (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, ""),
};
const PAID_PLANS = ["SMALL_BUSINESS", "PRO"];
/* =====================================================
   ZOD SCHEMAS
===================================================== */
const planSchema = z.enum(PAID_PLANS);
const checkoutBodySchema = z
    .object({
    plan: planSchema,
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
    referralCode: z.string().trim().max(100).optional(),
})
    .strict();
const changePlanBodySchema = z
    .object({
    plan: planSchema,
    prorationBehavior: z.enum(["create_prorations", "none", "always_invoice"]).optional(),
})
    .strict();
const cancelBodySchema = z
    .object({
    immediate: z.boolean().optional(),
    reason: z.string().trim().max(500).optional(),
})
    .strict()
    .optional();
const billingHistoryQuerySchema = z
    .object({
    limit: z.string().optional(),
    startingAfter: z.string().optional(),
})
    .strict();
/* =====================================================
   HELPERS
===================================================== */
function requireAuth(req) {
    const u = req.user;
    if (!u) {
        throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }
    const userId = (typeof u.id === "string" && u.id) ||
        (u._id ? String(u._id) : "");
    const organizationId = typeof u.organizationId === "string"
        ? u.organizationId
        : String(u.organizationId ?? "");
    const email = typeof u.email === "string"
        ? u.email
        : "";
    if (!userId || !organizationId) {
        throw new AppError("User missing identity or organization", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }
    return {
        userId,
        organizationId,
        email,
        role: String(u.role ?? "USER").toUpperCase(),
    };
}
function requireBillingAdmin(actor) {
    if (!SUBSCRIPTION_CONFIG.billingAdminRoles.includes(actor.role)) {
        throw new AppError("Billing actions require admin-level access", HttpStatus.FORBIDDEN, "FORBIDDEN");
    }
}
function runSchema(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const issues = result.error.issues
            .map((e) => (e.path.length ? e.path.join(".") : "(root)") + ": " + e.message)
            .join("; ");
        throw new AppError("Validation failed - " + issues, HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }
    return result.data;
}
function getNumber(value, fallback, opts = {}) {
    let n;
    if (typeof value === "string") {
        n = Number(value);
        if (!Number.isFinite(n))
            n = fallback;
    }
    else if (typeof value === "number" && Number.isFinite(value)) {
        n = value;
    }
    else {
        n = fallback;
    }
    if (opts.min !== undefined)
        n = Math.max(n, opts.min);
    if (opts.max !== undefined)
        n = Math.min(n, opts.max);
    return n;
}
function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(label + " timed out after " + ms + "ms"));
        }, ms);
        promise
            .then((value) => { clearTimeout(timer); resolve(value); })
            .catch((err) => { clearTimeout(timer); reject(err); });
    });
}
/* ── FIX 1: use Stripe's actual error type values, not class names ── */
function translateStripeError(err, defaultMessage) {
    const stripeErr = err;
    const code = stripeErr?.code || stripeErr?.type || "STRIPE_ERROR";
    const message = stripeErr?.message || defaultMessage;
    let status = HttpStatus.BAD_GATEWAY;
    if (stripeErr?.type === "card_error")
        status = HttpStatus.BAD_REQUEST;
    if (stripeErr?.type === "invalid_request_error")
        status = HttpStatus.BAD_REQUEST;
    if (stripeErr?.type === "rate_limit_error")
        status = 429;
    if (stripeErr?.type === "authentication_error")
        status = HttpStatus.INTERNAL;
    return new AppError(message, status, code);
}
function safeRedirectUrl(url, defaultPath) {
    if (!url)
        return SUBSCRIPTION_CONFIG.clientUrl + defaultPath;
    try {
        const parsed = new URL(url);
        const allowedHost = new URL(SUBSCRIPTION_CONFIG.clientUrl).hostname;
        if (parsed.hostname !== allowedHost) {
            dbLogger.warn("Rejected redirect URL with foreign host: " + parsed.hostname +
                " expected=" + allowedHost);
            return SUBSCRIPTION_CONFIG.clientUrl + defaultPath;
        }
        return url;
    }
    catch {
        return SUBSCRIPTION_CONFIG.clientUrl + defaultPath;
    }
}
/* =====================================================
   CONTROLLER
===================================================== */
class SubscriptionController {
    /* ── POST /billing/checkout ── */
    createCheckoutSession = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireBillingAdmin(actor);
        const validated = runSchema(checkoutBodySchema, req.body);
        if (!actor.email) {
            throw new AppError("User email is required for billing", HttpStatus.BAD_REQUEST, "EMAIL_REQUIRED");
        }
        const priceId = SUBSCRIPTION_CONFIG.priceMap[validated.plan];
        if (!priceId) {
            throw new AppError("No price configured for plan: " + validated.plan, HttpStatus.INTERNAL, "PRICE_NOT_CONFIGURED");
        }
        /* ── FIX 2: add _id to org type ── */
        const OrgModel = Organization;
        const org = await OrgModel.findById(actor.organizationId);
        if (!org) {
            throw new AppError("Organization not found", HttpStatus.NOT_FOUND, "ORG_NOT_FOUND");
        }
        let customerId = org.stripeCustomerId;
        if (!customerId) {
            try {
                const customer = await withTimeout(stripe.customers.create({
                    email: actor.email,
                    metadata: {
                        organizationId: String(org._id),
                        actorId: actor.userId,
                    },
                }), SUBSCRIPTION_CONFIG.stripeTimeoutMs, "stripe.customers.create");
                customerId = customer.id;
                org.stripeCustomerId = customerId;
                await org.save();
                dbLogger.info("Stripe customer created: org=" + String(org._id) +
                    " customer=" + customerId);
            }
            catch (err) {
                throw translateStripeError(err, "Failed to create Stripe customer");
            }
        }
        const idempotencyKey = "checkout_" + String(org._id) + "_" + validated.plan +
            "_" + Date.now().toString(36);
        try {
            const successUrl = safeRedirectUrl(validated.successUrl, "/billing/success?session_id={CHECKOUT_SESSION_ID}");
            const cancelUrl = safeRedirectUrl(validated.cancelUrl, "/billing/cancel");
            const session = await withTimeout(stripe.checkout.sessions.create({
                mode: "subscription",
                customer: customerId,
                line_items: [{ price: priceId, quantity: 1 }],
                success_url: successUrl,
                cancel_url: cancelUrl,
                subscription_data: {
                    trial_period_days: SUBSCRIPTION_CONFIG.trialPeriodDays,
                    metadata: {
                        organizationId: String(org._id),
                        plan: validated.plan,
                        actorId: actor.userId,
                    },
                },
                metadata: {
                    organizationId: String(org._id),
                    plan: validated.plan,
                    actorId: actor.userId,
                    ...(validated.referralCode && { referralCode: validated.referralCode }),
                },
                automatic_tax: { enabled: true },
            }, { idempotencyKey }), SUBSCRIPTION_CONFIG.stripeTimeoutMs, "stripe.checkout.sessions.create");
            dbLogger.info("Checkout session created: org=" + String(org._id) +
                " plan=" + validated.plan +
                " session=" + session.id);
            res.status(HttpStatus.OK).json({
                success: true,
                data: {
                    url: session.url,
                    sessionId: session.id,
                    plan: validated.plan,
                },
            });
        }
        catch (err) {
            if (err instanceof AppError)
                throw err;
            throw translateStripeError(err, "Failed to create checkout session");
        }
    });
    /* ── POST /billing/cancel ── */
    cancelSubscription = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireBillingAdmin(actor);
        const validated = req.body ? runSchema(cancelBodySchema, req.body) : undefined;
        const immediate = validated?.immediate ?? false;
        const SubModel = Subscription;
        const subscription = await SubModel.findOne({
            organizationId: actor.organizationId,
            status: { $in: ["active", "trialing", "past_due"] },
        });
        if (!subscription?.stripeSubscriptionId) {
            throw new AppError("No active subscription to cancel", HttpStatus.BAD_REQUEST, "NO_ACTIVE_SUBSCRIPTION");
        }
        try {
            if (immediate) {
                await withTimeout(stripe.subscriptions.cancel(subscription.stripeSubscriptionId), SUBSCRIPTION_CONFIG.stripeTimeoutMs, "stripe.subscriptions.cancel");
            }
            else {
                /* ── FIX 3: conditional spread instead of undefined value ── */
                await withTimeout(stripe.subscriptions.update(subscription.stripeSubscriptionId, {
                    cancel_at_period_end: true,
                    ...(validated?.reason && {
                        cancellation_details: { comment: validated.reason },
                    }),
                }), SUBSCRIPTION_CONFIG.stripeTimeoutMs, "stripe.subscriptions.update");
            }
        }
        catch (err) {
            throw translateStripeError(err, "Failed to cancel subscription with Stripe");
        }
        subscription.status = immediate ? "canceled" : subscription.status;
        subscription.canceledAt = new Date();
        if (validated?.reason)
            subscription.cancelReason = validated.reason;
        await subscription.save();
        const OrgModel = Organization;
        const org = await OrgModel.findById(actor.organizationId);
        if (org) {
            org.billingStatus = "CANCELED";
            org.graceUntil = null;
            org.isTrial = false;
            await org.save();
        }
        dbLogger.warn("Subscription cancellation: org=" + actor.organizationId +
            " actor=" + actor.userId +
            " immediate=" + immediate +
            (validated?.reason ? " reason=" + validated.reason : ""));
        res.status(HttpStatus.OK).json({
            success: true,
            message: immediate
                ? "Subscription canceled immediately"
                : "Subscription will cancel at period end",
            data: {
                canceledAt: subscription.canceledAt,
                cancelAtPeriodEnd: !immediate,
            },
        });
    });
    /* ── POST /billing/change-plan ── */
    changePlan = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireBillingAdmin(actor);
        const validated = runSchema(changePlanBodySchema, req.body);
        const priceId = SUBSCRIPTION_CONFIG.priceMap[validated.plan];
        if (!priceId) {
            throw new AppError("No price configured for plan: " + validated.plan, HttpStatus.INTERNAL, "PRICE_NOT_CONFIGURED");
        }
        const SubModel = Subscription;
        const subscription = await SubModel.findOne({
            organizationId: actor.organizationId,
            status: { $in: ["active", "trialing", "past_due"] },
        });
        if (!subscription?.stripeSubscriptionId) {
            throw new AppError("No active subscription to change", HttpStatus.BAD_REQUEST, "NO_ACTIVE_SUBSCRIPTION");
        }
        if (subscription.plan === validated.plan) {
            throw new AppError("Subscription is already on this plan", HttpStatus.CONFLICT, "ALREADY_ON_PLAN");
        }
        try {
            const stripeSub = await withTimeout(stripe.subscriptions.retrieve(subscription.stripeSubscriptionId), SUBSCRIPTION_CONFIG.stripeTimeoutMs, "stripe.subscriptions.retrieve");
            const itemId = stripeSub.items.data[0]?.id;
            if (!itemId) {
                throw new AppError("Subscription has no items to update", HttpStatus.CONFLICT, "SUBSCRIPTION_INVALID");
            }
            const idempotencyKey = "plan_change_" + subscription.stripeSubscriptionId +
                "_" + validated.plan +
                "_" + Date.now().toString(36);
            await withTimeout(stripe.subscriptions.update(stripeSub.id, {
                items: [{ id: itemId, price: priceId }],
                proration_behavior: validated.prorationBehavior ?? "create_prorations",
                metadata: {
                    ...stripeSub.metadata,
                    plan: validated.plan,
                    lastChangedBy: actor.userId,
                    lastChangedAt: new Date().toISOString(),
                },
            }, { idempotencyKey }), SUBSCRIPTION_CONFIG.stripeTimeoutMs, "stripe.subscriptions.update");
        }
        catch (err) {
            if (err instanceof AppError)
                throw err;
            throw translateStripeError(err, "Failed to update subscription plan");
        }
        subscription.plan = validated.plan;
        subscription.status = "active";
        await subscription.save();
        const OrgModel = Organization;
        const org = await OrgModel.findById(actor.organizationId);
        if (org) {
            org.plan = validated.plan;
            org.billingStatus = "ACTIVE";
            org.graceUntil = null;
            org.isTrial = false;
            await org.save();
        }
        dbLogger.warn("Plan changed: org=" + actor.organizationId +
            " actor=" + actor.userId +
            " plan=" + validated.plan);
        res.status(HttpStatus.OK).json({
            success: true,
            message: "Plan updated successfully",
            data: { plan: validated.plan },
        });
    });
    /* ── GET /billing/history ── */
    getBillingHistory = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireBillingAdmin(actor);
        const validated = runSchema(billingHistoryQuerySchema, req.query);
        const limit = getNumber(validated.limit, SUBSCRIPTION_CONFIG.invoiceListLimit, { min: 1, max: SUBSCRIPTION_CONFIG.invoiceListMaxLimit });
        const OrgModel = Organization;
        const org = await OrgModel.findById(actor.organizationId);
        if (!org?.stripeCustomerId) {
            throw new AppError("No billing history — organization has no Stripe customer", HttpStatus.NOT_FOUND, "NO_STRIPE_CUSTOMER");
        }
        try {
            const invoices = await withTimeout(stripe.invoices.list({
                customer: org.stripeCustomerId,
                limit,
                ...(validated.startingAfter && { starting_after: validated.startingAfter }),
            }), SUBSCRIPTION_CONFIG.stripeTimeoutMs, "stripe.invoices.list");
            const trimmed = invoices.data.map((inv) => ({
                id: inv.id,
                number: inv.number,
                status: inv.status,
                amountDue: inv.amount_due,
                amountPaid: inv.amount_paid,
                currency: inv.currency,
                created: inv.created,
                periodStart: inv.period_start,
                periodEnd: inv.period_end,
                hostedInvoiceUrl: inv.hosted_invoice_url,
                invoicePdf: inv.invoice_pdf,
            }));
            res.status(HttpStatus.OK).json({
                success: true,
                data: trimmed,
                pagination: { hasMore: invoices.has_more, limit },
            });
        }
        catch (err) {
            throw translateStripeError(err, "Failed to fetch billing history");
        }
    });
    /* ── GET /billing/portal ── */
    createPortalSession = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireBillingAdmin(actor);
        const OrgModel = Organization;
        const org = await OrgModel.findById(actor.organizationId);
        if (!org?.stripeCustomerId) {
            throw new AppError("No Stripe customer for organization", HttpStatus.BAD_REQUEST, "NO_STRIPE_CUSTOMER");
        }
        try {
            const session = await withTimeout(stripe.billingPortal.sessions.create({
                customer: org.stripeCustomerId,
                return_url: SUBSCRIPTION_CONFIG.clientUrl + "/billing",
            }), SUBSCRIPTION_CONFIG.stripeTimeoutMs, "stripe.billingPortal.sessions.create");
            res.status(HttpStatus.OK).json({
                success: true,
                data: { url: session.url },
            });
        }
        catch (err) {
            throw translateStripeError(err, "Failed to create billing portal session");
        }
    });
    /* ── GET /billing/subscription ── */
    getCurrentSubscription = asyncHandler(async (req, res, _next) => {
        const actor = requireAuth(req);
        requireBillingAdmin(actor);
        const SubModel = Subscription;
        const subscription = await SubModel
            .findOne({ organizationId: actor.organizationId })
            .lean();
        res.status(HttpStatus.OK).json({
            success: true,
            data: subscription,
        });
    });
}
export default new SubscriptionController();
//# sourceMappingURL=billing.controller.js.map