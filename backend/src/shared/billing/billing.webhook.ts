import { Request, Response } from "express";
import Stripe from "stripe";
import stripe from "../../config/stripe.js";
import Organization from "../../modules/organizations/organization.model.js";
import Subscription from "./subscription.model.js";
import { emailQueue } from "../../config/queue.js";

export const stripeWebhook = async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string | undefined;

  if (!signature) {
    console.error("Missing Stripe signature header");
    return res.status(400).send("Missing Stripe signature");
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return res.status(500).send("Webhook secret not configured");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send("Webhook Error");
  }

  console.log("Stripe Event Received:", event.type);

  try {
    const data = event.data.object as any;

    switch (event.type) {

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const orgId = data.metadata?.organizationId;
        const plan = data.metadata?.plan;

        if (!orgId || !plan) break;

        await Subscription.findOneAndUpdate(
          { stripeSubscriptionId: data.id },
          {
            organizationId: orgId,
            stripeCustomerId: data.customer,
            stripeSubscriptionId: data.id,
            plan,
            status: data.status,
          },
          { upsert: true, new: true }
        );

        const org = await Organization.findById(orgId);
        if (!org) break;

        org.plan = plan;

        if (data.status === "trialing") {
          org.billingStatus = "TRIAL";
          org.isTrial = true;
        } else if (data.status === "active") {
          org.billingStatus = "ACTIVE";
          org.isTrial = false;
          org.graceUntil = undefined;
        } else if (data.status === "past_due") {
          org.billingStatus = "PAST_DUE";
        } else if (data.status === "canceled") {
          org.billingStatus = "CANCELED";
          org.isTrial = false;
        }

        await org.save();

        if (org.ownerEmail) {
          await emailQueue.add("billing-event", {
            to: org.ownerEmail,
            subject: "Subscription Updated",
            body: "Your subscription status has been updated to " + org.billingStatus + ".",
          });
        }

        console.log("Subscription synced for org:", orgId);
        break;
      }

      case "customer.subscription.deleted": {
        const orgId = data.metadata?.organizationId;
        if (!orgId) break;

        await Subscription.findOneAndUpdate(
          { stripeSubscriptionId: data.id },
          { status: "canceled" }
        );

        const org = await Organization.findById(orgId);
        if (!org) break;

        org.billingStatus = "CANCELED";
        org.isTrial = false;
        org.graceUntil = undefined;

        await org.save();

        if (org.ownerEmail) {
          await emailQueue.add("billing-event", {
            to: org.ownerEmail,
            subject: "Subscription Canceled",
            body: "Your subscription has been canceled.",
          });
        }

        console.log("Subscription canceled for org:", orgId);
        break;
      }

      case "invoice.payment_failed": {
        const subscriptionId = data.subscription;
        if (!subscriptionId) break;

        const subscription = await Subscription.findOne({
          stripeSubscriptionId: subscriptionId,
        });

        if (!subscription) break;

        subscription.status = "past_due";
        await subscription.save();

        const org = await Organization.findById(subscription.organizationId);
        if (!org) break;

        org.billingStatus = "PAST_DUE";
        org.graceUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

        await org.save();

        if (org.ownerEmail) {
          await emailQueue.add("billing-event", {
            to: org.ownerEmail,
            subject: "Payment Failed",
            body: "Payment failed. You have 3 days to update billing before access is restricted.",
          });
        }

        console.log("Payment failed. Grace applied to org:", org._id);
        break;
      }

      case "invoice.payment_succeeded": {
        const subscriptionId = data.subscription;
        if (!subscriptionId) break;

        const subscription = await Subscription.findOne({
          stripeSubscriptionId: subscriptionId,
        });

        if (!subscription) break;

        subscription.status = "active";
        await subscription.save();

        const org = await Organization.findById(subscription.organizationId);
        if (!org) break;

        org.billingStatus = "ACTIVE";
        org.graceUntil = undefined;
        org.isTrial = false;

        await org.save();

        if (org.ownerEmail) {
          await emailQueue.add("billing-event", {
            to: org.ownerEmail,
            subject: "Payment Successful",
            body: "Your payment was successful. Your subscription is active.",
          });
        }

        console.log("Payment restored for org:", org._id);
        break;
      }

      default:
        console.log("Unhandled event type:", event.type);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook processing failed:", err);
    return res.status(500).send("Webhook handler failed");
  }
};
