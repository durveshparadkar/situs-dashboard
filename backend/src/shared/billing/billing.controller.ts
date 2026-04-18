import { Request, Response } from "express";
import stripe from "../../config/stripe.js";
import Organization from "../../modules/organizations/organization.model.js";
import Subscription from "./subscription.model.js";

/* ================= TYPES ================= */

type PaidPlan = "SMALL_BUSINESS" | "PRO";

interface AuthRequest extends Request {
  user?: {
    _id: string;
    email: string;
    organizationId?: string;
  };
}

/* ================= STRIPE PRICE MAP ================= */

const PRICE_MAP: Record<PaidPlan, string> = {
  SMALL_BUSINESS: "price_1SypbCSDFR58Nqd0b9X4Pzso",
  PRO: "price_1SypbCSDFR58Nqd0b9X4Pzso",
};

/* ================= CREATE CHECKOUT ================= */

export const createCheckoutSession = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const plan = req.body.plan as PaidPlan;
    const user = req.user;

    if (!user || !user.organizationId) {
      return res.status(400).json({
        success: false,
        message: "User has no organization",
      });
    }

    if (!plan || !(plan in PRICE_MAP)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan",
      });
    }

    const org = await Organization.findById(user.organizationId);
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    let customerId = org.stripeCustomerId as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          organizationId: org._id.toString(),
        },
      });

      customerId = customer.id;
      org.stripeCustomerId = customerId;
      await org.save();
    }

    const successUrl =
      process.env.CLIENT_URL +
      "/billing/success?session_id={CHECKOUT_SESSION_ID}";

    const cancelUrl = process.env.CLIENT_URL + "/billing/cancel";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: PRICE_MAP[plan],
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        trial_period_days: 14,
        metadata: {
          organizationId: org._id.toString(),
          plan,
        },
      },
      metadata: {
        organizationId: org._id.toString(),
        plan,
      },
    });

    return res.status(200).json({
      success: true,
      url: session.url,
    });

  } catch (error) {
    console.error("STRIPE CHECKOUT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Stripe checkout failed",
    });
  }
};

/* ================= CANCEL SUBSCRIPTION ================= */

export const cancelSubscription = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const orgId = req.user?.organizationId;
    if (!orgId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const subscription = await Subscription.findOne({
      organizationId: orgId,
      status: { $in: ["active", "trialing", "past_due"] },
    });

    if (!subscription?.stripeSubscriptionId) {
      return res.status(400).json({
        success: false,
        message: "No active subscription",
      });
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    subscription.status = "canceled";
    await subscription.save();

    const org = await Organization.findById(orgId);
    if (org) {
      org.billingStatus = "CANCELED";
      org.graceUntil = undefined;
      org.isTrial = false;
      await org.save();
    }

    return res.json({
      success: true,
      message: "Subscription will cancel at period end",
    });

  } catch (error) {
    console.error("CANCEL SUBSCRIPTION ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel subscription",
    });
  }
};

/* ================= CHANGE PLAN ================= */

export const changePlan = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const plan = req.body.plan as PaidPlan;
    const orgId = req.user?.organizationId;

    if (!orgId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!plan || !(plan in PRICE_MAP)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan",
      });
    }

    const subscription = await Subscription.findOne({
      organizationId: orgId,
      status: { $in: ["active", "trialing", "past_due"] },
    });

    if (!subscription?.stripeSubscriptionId) {
      return res.status(400).json({
        success: false,
        message: "No active subscription",
      });
    }

    const stripeSub = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId
    );

    const itemId = stripeSub.items.data[0]?.id;
    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: "Subscription item not found",
      });
    }

    await stripe.subscriptions.update(stripeSub.id, {
      items: [{ id: itemId, price: PRICE_MAP[plan] }],
      proration_behavior: "create_prorations",
    });

    subscription.plan = plan;
    subscription.status = "active";
    await subscription.save();

    const org = await Organization.findById(orgId);
    if (org) {
      org.plan = plan;
      org.billingStatus = "ACTIVE";
      org.graceUntil = undefined;
      org.isTrial = false;
      await org.save();
    }

    return res.json({
      success: true,
      message: "Plan updated successfully",
    });

  } catch (e) {
    console.error("❌ CHANGE PLAN ERROR:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to change plan",
    });
  }
};

/* ================= GET BILLING HISTORY ================= */

export const getBillingHistory = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const orgId = req.user?.organizationId;

    if (!orgId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const org = await Organization.findById(orgId);

    if (!org?.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: "No Stripe customer found",
      });
    }

    const invoices = await stripe.invoices.list({
      customer: org.stripeCustomerId,
      limit: 10,
    });

    return res.json({
      success: true,
      data: invoices.data,
    });

  } catch (e) {
    console.error("❌ BILLING HISTORY ERROR:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch billing history",
    });
  }
};




