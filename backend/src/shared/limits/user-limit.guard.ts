import { Request, Response, NextFunction } from "express";
import { PLAN_LIMITS, Plan } from "./plan.limits.js";
import User from "../../modules/users/user.model.js";
import Organization from "../../modules/organizations/organization.model.js";

interface AuthRequest extends Request {
  user?: {
    organizationId?: string;
  };
}

export const checkUserLimit = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const orgId = req.user?.organizationId;

    if (!orgId) {
      return res.status(400).json({
        success: false,
        message: "Organization not found on user",
      });
    }

    // ✅ Fetch real organization from DB
    const organization = await Organization.findById(orgId).lean();

    if (!organization) {
      return res.status(400).json({
        success: false,
        message: "Organization not found",
      });
    }

    const plan = organization.plan as Plan;

    if (!PLAN_LIMITS[plan]) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan configuration",
      });
    }

    const limits = PLAN_LIMITS[plan];

    const userCount = await User.countDocuments({
      organizationId: orgId,
    });

    if (userCount >= limits.users) {
      return res.status(403).json({
        success: false,
        message: "User limit reached for your plan",
      });
    }

    next();
  } catch (error) {
    console.error("🔥 USER LIMIT ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "User limit check failed",
    });
  }
};
