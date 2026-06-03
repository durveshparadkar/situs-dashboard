// intelligence.controller.ts
//
// HTTP layer for the intelligence subsystem. Bridges routes to
// intelligenceService (the orchestrator). Each handler:
//   - extracts org scope + actor from req.user / tenant guard
//   - calls the orchestrator
//   - returns a consistent { success, data } envelope
//
// Auth/permission enforcement happens in intelligence.routes.ts via
// protect + tenantGuard + requirePermission — by the time a handler
// runs, req.user and the effective org are already validated.

import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

import intelligenceService, {
  type IntelligenceResult,
} from "../intelligence.service.js";
import { dbLogger } from "../../../utils/logger.js";

/* =====================================================
   ERRORS
===================================================== */

class AppError extends Error {
  public statusCode: number;
  public code: string;

  constructor(message: string, statusCode = 400, code = "APP_ERROR") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const HttpStatus = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
} as const;

/* =====================================================
   HELPERS
===================================================== */

interface IntelligenceActor {
  userId: string;
  organizationId: string;
}

/**
 * Resolve the authenticated actor + effective org. Prefers the
 * tenant guard's effectiveOrganizationId over the raw token claim.
 */
function requireActor(req: Request): IntelligenceActor {
  const u = req.user;
  if (!u) {
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
  }

  const userId =
    (typeof u.id === "string" && u.id) ||
    (u._id ? String(u._id) : "");

  const reqWithTenant = req as Request & { effectiveOrganizationId?: string };
  const organizationId =
    reqWithTenant.effectiveOrganizationId ||
    (typeof u.organizationId === "string"
      ? u.organizationId
      : String(u.organizationId ?? ""));

  if (!userId || !organizationId) {
    throw new AppError(
      "User missing identity or organization",
      HttpStatus.UNAUTHORIZED,
      "UNAUTHORIZED"
    );
  }

  return { userId, organizationId };
}

function requireObjectIdParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || !mongoose.Types.ObjectId.isValid(value)) {
    throw new AppError(
      "Invalid or missing " + name,
      HttpStatus.BAD_REQUEST,
      "INVALID_ID"
    );
  }
  return value;
}

/* =====================================================
   CONTROLLER
===================================================== */

class IntelligenceController {

  /* ── POST /intelligence/refresh ──
     Full orchestrator run: scores deals, writes back, emits alerts. */
  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = requireActor(req);

      const result = await intelligenceService.run({
        organizationId: actor.organizationId,
        actorId: actor.userId,
      });

      dbLogger.info(
        "Intelligence refresh: org=" + actor.organizationId +
        " deals=" + result.meta.dealsProcessed +
        " updated=" + result.meta.dealsUpdated +
        " alerts=" + result.meta.alertsEmitted
      );

      res.status(HttpStatus.OK).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  /* ── POST /intelligence/preview ──
     Dry-run: runs engines, NO persistence, NO alerts. */
  preview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = requireActor(req);

      const result = await intelligenceService.preview({
        organizationId: actor.organizationId,
        actorId: actor.userId,
      });

      res.status(HttpStatus.OK).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  /* ── POST /intelligence/deals/:dealId/refresh ──
     Re-score a single deal. */
  refreshDeal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = requireActor(req);
      const dealId = requireObjectIdParam(req, "dealId");

      const dealRisk = await intelligenceService.refreshOneDeal(
        dealId,
        actor.organizationId,
        actor.userId
      );

      if (!dealRisk) {
        throw new AppError(
          "Deal not found in intelligence scope",
          HttpStatus.NOT_FOUND,
          "DEAL_NOT_FOUND"
        );
      }

      res.status(HttpStatus.OK).json({ success: true, data: dealRisk });
    } catch (err) {
      next(err);
    }
  };

  /* ── GET /intelligence/summary ──
     Full composed result (read-only, dry-run under the hood). */
  summary = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = requireActor(req);

      const result = await intelligenceService.preview({
        organizationId: actor.organizationId,
        actorId: actor.userId,
      });

      res.status(HttpStatus.OK).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  };

  /* ── GET /intelligence/forecast ──
     Just the forecast slice of the composed result. */
  forecast = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = requireActor(req);

      const result = await intelligenceService.preview({
        organizationId: actor.organizationId,
        actorId: actor.userId,
      });

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          forecast: result.forecast,
          meta: result.meta,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  /* ── GET /intelligence/leaks ──
     Just the pipeline-leak slice. */
  leaks = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = requireActor(req);

      const result = await intelligenceService.preview({
        organizationId: actor.organizationId,
        actorId: actor.userId,
      });

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          pipelineLeaks: result.pipelineLeaks,
          meta: result.meta,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  /* ── GET /intelligence/actions ──
     Just the revenue-actions slice (the headline output). */
  actions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = requireActor(req);

      const result = await intelligenceService.preview({
        organizationId: actor.organizationId,
        actorId: actor.userId,
      });

      res.status(HttpStatus.OK).json({
        success: true,
        data: {
          actions: result.actions,
          attentionAlerts: result.attentionAlerts,
          meta: result.meta,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}

export default new IntelligenceController();