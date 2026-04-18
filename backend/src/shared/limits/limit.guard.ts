import { Request, Response, NextFunction } from "express";
import { PLAN_LIMITS } from "./plan.limits.js";
import Organization from "../../modules/organizations/organization.model.js";
import Team from "../../modules/teams/team.model.js";

interface AuthRequest extends Request {
  user?: {
    organizationId?: string;
  };
}

export const checkTeamLimit = async (
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

    // 🔎 Fetch fresh organization from DB
    const organization = await Organization.findById(orgId).lean();

    if (!organization) {
      return res.status(404).json({
        success: false,
        message: "Organization not found",
      });
    }

    // ✅ Strongly typed plan
    const planKey = organization.plan as keyof typeof PLAN_LIMITS;

    const limits = PLAN_LIMITS[planKey];

    if (!limits) {
      console.error("Invalid plan stored in DB:", organization.plan);
      return res.status(500).json({
        success: false,
        message: "Invalid subscription plan configuration",
      });
    }

    const teamCount = await Team.countDocuments({
      organizationId: orgId,
    });

    if (teamCount >= limits.teams) {
      return res.status(403).json({
        success: false,
        message:
          "Team limit reached. Your plan allows " +
          limits.teams +
          " teams.",
      });
    }

    next();
  } catch (error) {
    console.error("TEAM LIMIT GUARD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Team limit guard failed",
    });
  }
};










