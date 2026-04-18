import { Request, Response } from "express";
import { z } from "zod";
import Organization from "./organization.model.js";
import User from "../users/user.model.js";
import Subscription from "../../shared/billing/subscription.model.js";
import { logAudit } from "../../shared/audits/audit.logger.js";
import {
  AuditAction,
  AuditResource,
} from "../audit/audit.model.js";

/* =====================================================
   TYPES
===================================================== */

interface AuthRequest extends Request {
  user?: {
    _id: string;
    organizationId?: string;
    role?: string;
  };
}

/* =====================================================
   VALIDATION SCHEMA
===================================================== */

const createOrganizationSchema = z.object({
  name: z.string().min(2, "Organization name required").max(100),
  plan: z.enum(["SMALL_BUSINESS", "PRO", "ENTERPRISE"]),
});

/* =====================================================
   CREATE ORGANIZATION
===================================================== */

export const createOrganization = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const validated = createOrganizationSchema.parse(req.body);
    const name = validated.name.trim();
    const plan = validated.plan;

    const isEnterprise = plan === "ENTERPRISE";
    const isTrial = !isEnterprise;

    /* ================= CREATE ORGANIZATION ================= */

    const organization = await Organization.create({
      name,
      plan,
      isTrial,
      billingStatus: isEnterprise ? "ACTIVE" : "TRIAL",
      trialEndsAt: isTrial
        ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        : undefined,
    });

    /* ================= CREATE SUBSCRIPTION ================= */

    const subscription = await Subscription.create({
      organizationId: organization._id,
      stripeCustomerId: "manual",
      stripeSubscriptionId: "manual",
      plan,
      status: isEnterprise ? "ACTIVE" : "TRIALING",
    });

    organization.subscriptionId = subscription._id;
    await organization.save();

    /* ================= ASSIGN CREATOR ================= */

    await User.findByIdAndUpdate(req.user._id, {
      organizationId: organization._id,
      role: "ORG_ADMIN",
    });

    /* ================= AUDIT LOG ================= */

    await logAudit({
      organizationId: organization._id.toString(),
      actorId: req.user._id.toString(),
      action: AuditAction.CREATE,
      resource: AuditResource.ORGANIZATION,
      resourceId: organization._id.toString(),
      meta: {
        plan,
        billingStatus: organization.billingStatus,
      },
      req,
    });

    return res.status(201).json({
      success: true,
      organization,
      subscription,
    });
  } catch (error) {
    console.error("CREATE ORG ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create organization",
    });
  }
};

/* =====================================================
   GET ORGANIZATIONS
===================================================== */

export const getOrganizations = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user?.organizationId) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    const organization = await Organization.findById(
      req.user.organizationId
    ).populate("subscriptionId");

    return res.status(200).json({
      success: true,
      organization,
    });
  } catch (error) {
    console.error("GET ORG ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch organization",
    });
  }
};












