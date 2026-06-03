// billing.routes.ts
import { Router, } from "express";
import express from "express";
import subscriptionController from "./billing.controller.js";
import { stripeWebhook } from "./billing.webhook.js";
import { protect, authorize, } from "../../shared/middlewares/auth.middleware.js";
import { dbLogger } from "../../utils/logger.js";
const router = Router();
/* =====================================================
   LOCAL MIDDLEWARE
   Replace with shared imports when ready:

     import { rateLimit } from "../../shared/middlewares/rateLimit.middleware.js";
===================================================== */
/**
 * Rate limit stub — replace with express-rate-limit or your Redis-backed
 * limiter. Billing endpoints MUST be rate-limited in production — they
 * trigger expensive Stripe API calls.
 */
const rateLimit = (_opts) => (_req, _res, next) => {
    next();
};
/* =====================================================
   ROLE GATE — BILLING ADMIN
   Billing actions affect money. Strict admin-only access.
===================================================== */
const BILLING_ADMIN_ROLES = ["ORG_ADMIN", "SUPER_ADMIN"];
const requireBillingAdmin = (req, res, next) => {
    const role = String(req.user?.role ?? "").toUpperCase();
    if (!BILLING_ADMIN_ROLES.includes(role)) {
        dbLogger.warn(`Billing access denied: user=${req.user?.id ?? "anon"} role=${role}`);
        res.status(403).json({
            success: false,
            error: {
                code: "FORBIDDEN",
                message: "Billing management requires admin-level access",
            },
        });
        return;
    }
    next();
};
/* =====================================================
   IMPORTED MIDDLEWARE — TYPE BRIDGES
   Migrate when shared middleware moves off local AuthRequest.
===================================================== */
const protectMw = protect;
const authorizeMw = authorize;
/* =====================================================
   PERMISSION KEYS
   Falls back to MANAGE_ORG if BILLING_MANAGE doesn't yet exist in
   PERMISSIONS catalogue. Replace with dedicated keys when added.
===================================================== */
const BILLING_MANAGE_PERM = "MANAGE_BILLING";
const BILLING_READ_PERM = "READ_BILLING";
/* =====================================================
   RATE LIMIT POLICIES
   Billing endpoints hit Stripe and have real cost — strict limits.
===================================================== */
const READ_LIMIT = rateLimit({ windowMs: 60_000, max: 30 }); // 30/min — dashboard polling
const CHECKOUT_LIMIT = rateLimit({ windowMs: 60_000, max: 5 }); // 5/min — anti-spam
const MUTATION_LIMIT = rateLimit({ windowMs: 60 * 60_000, max: 10 }); // 10/hour — plan changes
const CANCEL_LIMIT = rateLimit({ windowMs: 60 * 60_000, max: 3 }); // 3/hour — cancellation
const PORTAL_LIMIT = rateLimit({ windowMs: 60_000, max: 10 }); // 10/min — portal session
/* =====================================================
   STRIPE WEBHOOK
   IMPORTANT: declared BEFORE other middleware so:
   1. The raw body parser runs (Stripe signature verification needs raw bytes)
   2. No auth check applies (Stripe is the caller, not a user)
   3. No global JSON parser interferes
===================================================== */
/**
 * @route   POST /billing/webhook
 * @desc    Stripe webhook receiver — verifies signature and updates state
 * @access  PUBLIC (signature verified inside handler)
 * @note    MUST use raw body parser. Do not register express.json()
 *          before this route OR put this route in a router that has
 *          express.json() globally.
 *
 * Production wiring (in your main app file):
 *   app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
 *   app.use("/api", apiRouter);  // this can have express.json()
 *
 * The raw body parser is also applied here as defense-in-depth.
 */
router.post("/webhook", express.raw({ type: "application/json", limit: "1mb" }), stripeWebhook);
/* =====================================================
   AUTHENTICATED ROUTES BELOW
   All require protect + billing-admin role + permission.
===================================================== */
/**
 * @route   POST /billing/checkout
 * @desc    Create a Stripe Checkout session for new subscription
 * @access  Billing admin + MANAGE_BILLING
 * @body    { plan: "SMALL_BUSINESS" | "PRO", successUrl?, cancelUrl?, referralCode? }
 * @rateLimit 5/min — anti-spam (checkout sessions cost Stripe API quota)
 */
router.post("/checkout", CHECKOUT_LIMIT, protectMw, requireBillingAdmin, authorizeMw(BILLING_MANAGE_PERM), subscriptionController.createCheckoutSession);
/**
 * @route   POST /billing/cancel
 * @desc    Cancel subscription (period-end by default, immediate if requested)
 * @access  Billing admin + MANAGE_BILLING
 * @body    { immediate?: boolean, reason?: string }
 * @rateLimit 3/hour — very rare operation
 */
router.post("/cancel", CANCEL_LIMIT, protectMw, requireBillingAdmin, authorizeMw(BILLING_MANAGE_PERM), subscriptionController.cancelSubscription);
/**
 * @route   POST /billing/change-plan
 * @desc    Change subscription plan with proration
 * @access  Billing admin + MANAGE_BILLING
 * @body    { plan: "SMALL_BUSINESS" | "PRO", prorationBehavior? }
 * @rateLimit 10/hour — guards against rapid plan flipping
 */
router.post("/change-plan", MUTATION_LIMIT, protectMw, requireBillingAdmin, authorizeMw(BILLING_MANAGE_PERM), subscriptionController.changePlan);
/**
 * @route   POST /billing/portal
 * @desc    Create Stripe Customer Portal session (manage cards, view invoices)
 * @access  Billing admin + MANAGE_BILLING
 * @rateLimit 10/min
 */
router.post("/portal", PORTAL_LIMIT, protectMw, requireBillingAdmin, authorizeMw(BILLING_MANAGE_PERM), subscriptionController.createPortalSession);
/**
 * @route   GET /billing/history
 * @desc    List invoices for the organization
 * @access  Billing admin + READ_BILLING
 * @query   limit, startingAfter
 */
router.get("/history", READ_LIMIT, protectMw, requireBillingAdmin, authorizeMw(BILLING_READ_PERM), subscriptionController.getBillingHistory);
/**
 * @route   GET /billing/subscription
 * @desc    Get current subscription state for the organization
 * @access  Billing admin + READ_BILLING
 */
router.get("/subscription", READ_LIMIT, protectMw, requireBillingAdmin, authorizeMw(BILLING_READ_PERM), subscriptionController.getCurrentSubscription);
export default router;
//# sourceMappingURL=billing.routes.js.map