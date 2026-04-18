import { Request, Response, NextFunction } from "express";
import leadService from "./lead.service.js";
import {
  createLeadSchema,
  updateLeadSchema,
} from "./lead.schema.js";

/* =====================================================
   TYPES
===================================================== */

interface CurrentUser {
  _id: string;
  role: "org_admin" | "manager" | "agent";
  organizationId: string;
}

/* =====================================================
   HELPER
===================================================== */

function getCurrentUser(req: Request): CurrentUser {
  const user = (req as any).user;

  if (!user) {
    throw new Error("Unauthorized");
  }

  return {
    _id: user._id.toString(),
    // 🔥 Normalize role to lowercase to match LeadService expectations
    role: String(user.role).toLowerCase() as CurrentUser["role"],
    organizationId: user.organizationId.toString(),
  };
}

/* =====================================================
   CONTROLLER
===================================================== */

class LeadController {
  /* =========================
     CREATE
  ========================= */

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createLeadSchema.parse(req.body);

      const lead = await leadService.create(
        parsed,
        getCurrentUser(req)
      );

      res.status(201).json({
        success: true,
        data: lead,
      });
    } catch (error) {
      next(error);
    }
  }

  /* =========================
     FIND ALL
  ========================= */

  async findAll(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await leadService.findAll(
        req.query as any,
        getCurrentUser(req)
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /* =========================
     FIND ONE
  ========================= */

  async findOne(req: Request, res: Response, next: NextFunction) {
    try {
      const lead = await leadService.findOne(
        String(req.params.id),
        getCurrentUser(req)
      );

      res.status(200).json({
        success: true,
        data: lead,
      });
    } catch (error) {
      next(error);
    }
  }

  /* =========================
     UPDATE
  ========================= */

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateLeadSchema.parse(req.body);

      const lead = await leadService.update(
        String(req.params.id),
        parsed,
        getCurrentUser(req)
      );

      res.status(200).json({
        success: true,
        data: lead,
      });
    } catch (error) {
      next(error);
    }
  }

  /* =========================
     MOVE STAGE
  ========================= */

  async updateStage(req: Request, res: Response, next: NextFunction) {
    try {
      const { stageName } = req.body;

      if (!stageName) {
        return res.status(400).json({
          success: false,
          message: "stageName is required",
        });
      }

      const lead = await leadService.updateStage(
        String(req.params.id),
        stageName,
        getCurrentUser(req)
      );

      res.status(200).json({
        success: true,
        message: "Lead stage updated successfully",
        data: lead,
      });
    } catch (error) {
      next(error);
    }
  }

  /* =========================
     ARCHIVE
  ========================= */

  async archive(req: Request, res: Response, next: NextFunction) {
    try {
      const lead = await leadService.archive(
        String(req.params.id),
        getCurrentUser(req)
      );

      res.status(200).json({
        success: true,
        message: "Lead archived successfully",
        data: lead,
      });
    } catch (error) {
      next(error);
    }
  }

  /* =========================
     RESTORE
  ========================= */

  async restore(req: Request, res: Response, next: NextFunction) {
    try {
      const lead = await leadService.restore(
        String(req.params.id),
        getCurrentUser(req)
      );

      res.status(200).json({
        success: true,
        message: "Lead restored successfully",
        data: lead,
      });
    } catch (error) {
      next(error);
    }
  }

  /* =========================
     GET ACTIVITIES
  ========================= */

  async getActivities(req: Request, res: Response, next: NextFunction) {
    try {
      const activities = await leadService.getActivities(
        String(req.params.id),
        getCurrentUser(req)
      );

      res.status(200).json({
        success: true,
        data: activities,
      });
    } catch (error) {
      next(error);
    }
  }

  /* =========================
     🧠 INTELLIGENCE SUMMARY
  ========================= */

  async getIntelligenceSummary(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const summary =
        await leadService.getIntelligenceSummary(
          getCurrentUser(req)
        );

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

  /* =========================
     🚨 REQUEST ESCALATION
  ========================= */

  async requestEscalation(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const lead = await leadService.requestEscalation(
        String(req.params.id),
        getCurrentUser(req)
      );

      res.status(200).json({
        success: true,
        message: "Escalation requested",
        data: lead,
      });
    } catch (error) {
      next(error);
    }
  }

  /* =========================
     🚨 APPROVE ESCALATION
  ========================= */

  async approveEscalation(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const lead = await leadService.approveEscalation(
        String(req.params.id),
        getCurrentUser(req)
      );

      res.status(200).json({
        success: true,
        message: "Escalation approved",
        data: lead,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new LeadController();