import { Request, Response, NextFunction } from "express";
import Organization, {
  IOrganization,
} from "../../modules/organizations/organization.model.js";

interface AuthRequest extends Request {
  user?: {
    _id: string;
    organizationId?: string;
  };
}

export const requireActiveBilling = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const orgId = req.user?.organizationId;

    if (!orgId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: No organization linked to user",
      });
    }

    const org = await Organization.findById(orgId).lean<IOrganization>();

    if (!org) {
      return res.status(400).json({
        success: false,
        message: "Organization not found",
      });
    }

    const now = new Date();
    const billingStatus = org.billingStatus?.toUpperCase();

    if (!billingStatus) {
      return res.status(402).json({
        success: false,
        message: "Billing not configured for organization.",
      });
    }

    /* ===============================
       SIMPLE ACTIVE CHECK (YOUR ADDITION)
    =============================== */

    if (billingStatus === "ACTIVE") {
      return next();
    }

    /* ===============================
       TRIAL LOGIC
    =============================== */

    if (billingStatus === "TRIAL") {
      if (!org.trialEndsAt) {
        return res.status(500).json({
          success: false,
          message: "Trial configuration missing. Contact support.",
        });
      }

      if (org.trialEndsAt > now) {
        return next();
      }

      // Auto-expire trial
      await Organization.findByIdAndUpdate(orgId, {
        billingStatus: "PAST_DUE",
        isTrial: false,
      });

      return res.status(402).json({
        success: false,
        message: "Trial expired. Please upgrade your plan.",
        billingStatus: "TRIAL_EXPIRED",
        trialEndedAt: org.trialEndsAt,
      });
    }

    /* ===============================
       PAST DUE WITH GRACE
    =============================== */

    if (billingStatus === "PAST_DUE") {
      if (org.graceUntil && org.graceUntil > now) {
        return next(); // Grace still active
      }

      return res.status(402).json({
        success: false,
        message: "Billing inactive. Upgrade to continue.",
        billingStatus: "GRACE_EXPIRED",
      });
    }

    /* ===============================
       CANCELED
    =============================== */

    if (billingStatus === "CANCELED") {
      return res.status(402).json({
        success: false,
        message: "Subscription canceled. Upgrade to continue.",
        billingStatus: "CANCELED",
      });
    }

    /* ===============================
       SAFETY NET
    =============================== */

    return res.status(402).json({
      success: false,
      message: "Invalid billing state.",
      billingStatus,
    });

  } catch (err) {
    console.error("❌ BILLING GUARD ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Billing check failed",
    });
  }
};
