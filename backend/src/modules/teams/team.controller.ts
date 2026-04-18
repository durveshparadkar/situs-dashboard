import { Request, Response } from "express";
import { z } from "zod";
import Team from "./team.model.js";
import { logAudit } from "../../shared/audits/audit.logger.js";
import {
  AuditAction,
  AuditResource,
} from "../audit/audit.model.js";

/* ===============================
   TYPES
================================ */

interface AuthRequest extends Request {
  user?: {
    _id: string;
    organizationId?: string;
  };
}

/* ===============================
   VALIDATION SCHEMA
================================ */

const createTeamSchema = z.object({
  name: z
    .string()
    .min(1, "Team name is required")
    .max(100, "Team name too long"),
});

/* ===============================
   CREATE TEAM
================================ */

export const createTeam = async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.organizationId;
    const userId = req.user?._id;

    if (!orgId || !userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const validated = createTeamSchema.parse(req.body);
    const trimmedName = validated.name.trim();

    const existing = await Team.findOne({
      name: trimmedName,
      organizationId: orgId,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Team already exists",
      });
    }

    const team = await Team.create({
      name: trimmedName,
      organizationId: orgId,
      createdBy: userId,
    });

    /* 🔐 AUDIT LOG */
    await logAudit({
      organizationId: orgId.toString(),
      actorId: userId.toString(),
      action: AuditAction.CREATE,
      resource: AuditResource.TEAM,
      resourceId: team._id.toString(),
      req,
    });

    return res.status(201).json({
      success: true,
      data: team,
    });
  } catch (error) {
    console.error("CREATE TEAM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

/* ===============================
   GET TEAMS
================================ */

export const getTeams = async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user?.organizationId;

    if (!orgId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const teams = await Team.find({
      organizationId: orgId,
    })
      .sort({ createdAt: -1 })
      .populate("createdBy", "name email");

    return res.status(200).json({
      success: true,
      data: teams,
    });
  } catch (error) {
    console.error("GET TEAMS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};








