import { Router } from "express";
import express from "express";
import { protect, authorize } from "../../shared/middlewares/auth.middleware.js";
import { 
  createCheckoutSession,
  cancelSubscription,
  changePlan,
  getBillingHistory      // ✅ added properly
} from "./billing.controller.js";
import { stripeWebhook } from "./billing.webhook.js";

const router = Router();

/**
 * ===============================
 * STRIPE CHECKOUT (AUTH REQUIRED)
 * ===============================
 */
router.post(
  "/checkout",
  protect,
  authorize("CREATE_USER"),
  createCheckoutSession
);

/**
 * ===============================
 * STRIPE WEBHOOK (NO AUTH)
 * Stripe requires raw body
 * ===============================
 */
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

/**
 * ===============================
 * CANCEL SUBSCRIPTION
 * ===============================
 */
router.post(
  "/cancel",
  protect,
  authorize("READ_ORG"),
  cancelSubscription
);

/**
 * ===============================
 * CHANGE PLAN
 * ===============================
 */
router.post(
  "/change-plan",
  protect,
  authorize("READ_ORG"),
  changePlan
);

/**
 * ===============================
 * BILLING HISTORY
 * ===============================
 */
router.get(
  "/history",
  protect,
  authorize("READ_ORG"),
  getBillingHistory
);

export default router;
