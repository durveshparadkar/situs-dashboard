// alert.controller.ts
import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import AlertService from "./alert.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { dbLogger } from "../../utils/logger.js";

// ============================================================
// ERRORS
// ============================================================

class AppError extends Error {
  public statusCode: number;
  public code:       string;
  public details?:   unknown;

  constructor(
    message:    string,
    statusCode: number = 400,
    code:       string = "APP_ERROR",
    details?:   unknown
  ) {
    super(message);
    this.name       = "AppError";
    this.statusCode = statusCode;
    this.code       = code;
    if (details !== undefined) this.details = details;
  }
}

// ============================================================
// HTTP STATUS
// ============================================================

const HttpStatus = {
  OK:           200,
  BAD_REQUEST:  400,
  UNAUTHORIZED: 401,
  FORBIDDEN:    403,
  NOT_FOUND:    404,
  INTERNAL:     500,
} as const;

// ============================================================
// CONFIG
// ============================================================

const ALERT_CONFIG = {
  pagination: {
    defaultLimit: 20,
    maxLimit:     100,
    maxPage:      10_000,
  },
  bulkOperation: {
    maxIds: 100,
  },
} as const;

// ============================================================
// ZOD SCHEMAS
// ============================================================

const objectIdSchema = z
  .string()
  .refine((v) => mongoose.Types.ObjectId.isValid(v), {
    message: "Invalid ObjectId format",
  });

const ALERT_SEVERITIES = ["low", "medium", "high", "critical"] as const;
const ALERT_STATUSES   = ["open", "acknowledged", "resolved", "dismissed"] as const;

const listAlertsSchema = z
  .object({
    page:       z.string().optional(),
    limit:      z.string().optional(),
    status:     z.enum(ALERT_STATUSES).optional(),
    severity:   z.enum(ALERT_SEVERITIES).optional(),
    isRead:     z.enum(["true", "false"]).optional(),
    type:       z.string().trim().max(100).optional(),
    fromDate:   z.string().optional().refine(
      (v) => !v || !isNaN(new Date(v).getTime()),
      { message: "fromDate must be a valid ISO date" }
    ),
    toDate:     z.string().optional().refine(
      (v) => !v || !isNaN(new Date(v).getTime()),
      { message: "toDate must be a valid ISO date" }
    ),
    sortOrder:  z.enum(["asc", "desc"]).optional(),
  })
  .strict();

const bulkActionSchema = z
  .object({
    alertIds: z.array(objectIdSchema)
      .min(1, "At least one alertId required")
      .max(ALERT_CONFIG.bulkOperation.maxIds,
           "Cannot operate on more than " + ALERT_CONFIG.bulkOperation.maxIds + " alerts at once"),
  })
  .strict();

// ============================================================
// HELPERS
// ============================================================

interface AlertActor {
  userId:         string;
  organizationId: string;
  role:           string;
}

function requireAuth(req: Request): AlertActor {
  const u = req.user;
  if (!u) {
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
  }

  const userId =
    (typeof u.id === "string" && u.id) ||
    (u._id ? String(u._id) : "");

  // Prefer tenant guard's effective org for cross-tenant operations
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

  return {
    userId,
    organizationId,
    role: String(u.role ?? "USER").toUpperCase(),
  };
}

function requireObjectId(req: Request, paramName: string = "id"): string {
  const id = req.params[paramName];
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new AppError(
      paramName + " is required",
      HttpStatus.BAD_REQUEST,
      "MISSING_ID"
    );
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(
      "Invalid " + paramName + " format",
      HttpStatus.BAD_REQUEST,
      "INVALID_ID"
    );
  }
  return id;
}

function runSchema<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((e) => (e.path.length ? e.path.join(".") : "(root)") + ": " + e.message)
      .join("; ");
    throw new AppError(
      "Validation failed - " + issues,
      HttpStatus.BAD_REQUEST,
      "VALIDATION_ERROR"
    );
  }
  return result.data;
}

function getNumber(
  value: unknown,
  fallback: number,
  opts: { min?: number; max?: number } = {}
): number {
  let n: number;
  if (typeof value === "string") {
    n = Number(value);
    if (!Number.isFinite(n)) n = fallback;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    n = value;
  } else {
    n = fallback;
  }
  if (opts.min !== undefined) n = Math.max(n, opts.min);
  if (opts.max !== undefined) n = Math.min(n, opts.max);
  return n;
}

// ============================================================
// CONTROLLER
// ============================================================

class AlertController {

  // -----------------------------------------------------------
  // GET /alerts — paginated, filterable listing
  // -----------------------------------------------------------
  getAlerts = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    const validated = runSchema(listAlertsSchema, req.query);

    const page = getNumber(validated.page, 1, {
      min: 1,
      max: ALERT_CONFIG.pagination.maxPage,
    });
    const limit = getNumber(
      validated.limit,
      ALERT_CONFIG.pagination.defaultLimit,
      { min: 1, max: ALERT_CONFIG.pagination.maxLimit }
    );

    const options: Record<string, unknown> = {
      page,
      limit,
      sortOrder: validated.sortOrder ?? "desc",
    };

    if (validated.status)              options.status   = validated.status;
    if (validated.severity)            options.severity = validated.severity;
    if (validated.type)                options.type     = validated.type.toUpperCase();
    if (validated.isRead !== undefined) options.isRead  = validated.isRead === "true";
    if (validated.fromDate)            options.fromDate = new Date(validated.fromDate);
    if (validated.toDate)              options.toDate   = new Date(validated.toDate);

    const result = await AlertService.getAlerts(actor.organizationId, options);

    // Result shape may be { data, total } or { alerts, total } or paginated
    const data       = (result as { data?: unknown[] }).data
                    ?? (result as { alerts?: unknown[] }).alerts
                    ?? [];
    const total      = (result as { total?: number }).total ?? 0;
    const totalPages = Math.ceil(total / limit);

    res.status(HttpStatus.OK).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  });

  // -----------------------------------------------------------
  // GET /alerts/:id — single alert
  // -----------------------------------------------------------
  getAlertById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    const id    = requireObjectId(req);

    const ServiceAny = AlertService as unknown as {
      getAlertById?: (id: string, organizationId: string) => Promise<unknown | null>;
    };

    if (typeof ServiceAny.getAlertById !== "function") {
      throw new AppError(
        "Alert lookup by ID not supported",
        HttpStatus.INTERNAL,
        "NOT_IMPLEMENTED"
      );
    }

    const alert = await ServiceAny.getAlertById(id, actor.organizationId);
    if (!alert) {
      throw new AppError("Alert not found", HttpStatus.NOT_FOUND, "ALERT_NOT_FOUND");
    }

    res.status(HttpStatus.OK).json({
      success: true,
      data: alert,
    });
  });

  // -----------------------------------------------------------
  // GET /alerts/unread-count
  // -----------------------------------------------------------
  getUnreadCount = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);

    const count = await AlertService.getUnreadCount(actor.organizationId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: { count },
    });
  });

  // -----------------------------------------------------------
  // GET /alerts/stats — counts by severity / status
  // -----------------------------------------------------------
  getAlertStats = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);

    const ServiceAny = AlertService as unknown as {
      getStats?: (organizationId: string) => Promise<{
        bySeverity: Array<{ _id: string; count: number }>;
        byStatus:   Array<{ _id: string; count: number }>;
        byType:     Array<{ _id: string; count: number }>;
        total:      number;
        unread:     number;
      } | null>;
    };

    if (typeof ServiceAny.getStats === "function") {
      const stats = await ServiceAny.getStats(actor.organizationId);
      res.status(HttpStatus.OK).json({
        success: true,
        data: stats ?? { bySeverity: [], byStatus: [], byType: [], total: 0, unread: 0 },
      });
      return;
    }

    // Fallback if service doesn't implement getStats yet
    const unread = await AlertService.getUnreadCount(actor.organizationId);
    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        bySeverity: [],
        byStatus:   [],
        byType:     [],
        total:      0,
        unread,
      },
    });
  });

  // -----------------------------------------------------------
  // PATCH /alerts/:id/read — mark single alert as read
  // -----------------------------------------------------------
  markAsRead = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    const id    = requireObjectId(req);

    const ServiceAny = AlertService as unknown as {
      markAsRead: (id: string, organizationId?: string, actorId?: string) => Promise<unknown | null>;
    };

    const alert = await ServiceAny.markAsRead(id, actor.organizationId, actor.userId);
    if (!alert) {
      throw new AppError("Alert not found", HttpStatus.NOT_FOUND, "ALERT_NOT_FOUND");
    }

    dbLogger.info(
      "Alert marked read: id=" + id +
      " org=" + actor.organizationId +
      " user=" + actor.userId
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: alert,
    });
  });

  // -----------------------------------------------------------
  // PATCH /alerts/read-all — mark every unread alert in org as read
  // -----------------------------------------------------------
  markAllAsRead = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);

    const ServiceAny = AlertService as unknown as {
      markAllAsRead: (organizationId: string, actorId?: string) => Promise<{ modifiedCount?: number } | unknown>;
    };

    const result = await ServiceAny.markAllAsRead(actor.organizationId, actor.userId);
    const modifiedCount =
      (result as { modifiedCount?: number })?.modifiedCount ?? 0;

    dbLogger.info(
      "Alerts mark-all-read: org=" + actor.organizationId +
      " user=" + actor.userId +
      " modified=" + modifiedCount
    );

    res.status(HttpStatus.OK).json({
      success: true,
      message: "All alerts marked as read",
      data: { modifiedCount },
    });
  });

  // -----------------------------------------------------------
  // PATCH /alerts/bulk/read — mark multiple alerts as read
  // -----------------------------------------------------------
  bulkMarkAsRead = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    const validated = runSchema(bulkActionSchema, req.body);

    const ServiceAny = AlertService as unknown as {
      bulkMarkAsRead?: (
        alertIds:       string[],
        organizationId: string,
        actorId?:       string
      ) => Promise<{ modifiedCount?: number } | unknown>;
      markAsRead: (id: string, organizationId?: string, actorId?: string) => Promise<unknown | null>;
    };

    let modifiedCount = 0;

    if (typeof ServiceAny.bulkMarkAsRead === "function") {
      const result = await ServiceAny.bulkMarkAsRead(
        validated.alertIds,
        actor.organizationId,
        actor.userId
      );
      modifiedCount = (result as { modifiedCount?: number })?.modifiedCount ?? 0;
    } else {
      // Fallback: iterate
      for (const alertId of validated.alertIds) {
        const result = await ServiceAny.markAsRead(alertId, actor.organizationId, actor.userId);
        if (result) modifiedCount++;
      }
    }

    dbLogger.info(
      "Alerts bulk read: org=" + actor.organizationId +
      " user=" + actor.userId +
      " requested=" + validated.alertIds.length +
      " modified=" + modifiedCount
    );

    res.status(HttpStatus.OK).json({
      success: true,
      message: "Alerts marked as read",
      data: {
        requested: validated.alertIds.length,
        modifiedCount,
      },
    });
  });

  // -----------------------------------------------------------
  // PATCH /alerts/:id/resolve — resolve single alert
  // -----------------------------------------------------------
  resolveAlert = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    const id    = requireObjectId(req);

    const ServiceAny = AlertService as unknown as {
      resolveAlert: (
        id:             string,
        organizationId?: string,
        actorId?:        string
      ) => Promise<unknown | null>;
    };

    const alert = await ServiceAny.resolveAlert(id, actor.organizationId, actor.userId);
    if (!alert) {
      throw new AppError("Alert not found", HttpStatus.NOT_FOUND, "ALERT_NOT_FOUND");
    }

    dbLogger.info(
      "Alert resolved: id=" + id +
      " org=" + actor.organizationId +
      " user=" + actor.userId
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: alert,
    });
  });

  // -----------------------------------------------------------
  // PATCH /alerts/bulk/resolve — resolve multiple alerts
  // -----------------------------------------------------------
  bulkResolve = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    const validated = runSchema(bulkActionSchema, req.body);

    const ServiceAny = AlertService as unknown as {
      bulkResolve?: (
        alertIds:       string[],
        organizationId: string,
        actorId?:       string
      ) => Promise<{ modifiedCount?: number } | unknown>;
      resolveAlert: (
        id:              string,
        organizationId?: string,
        actorId?:        string
      ) => Promise<unknown | null>;
    };

    let modifiedCount = 0;

    if (typeof ServiceAny.bulkResolve === "function") {
      const result = await ServiceAny.bulkResolve(
        validated.alertIds,
        actor.organizationId,
        actor.userId
      );
      modifiedCount = (result as { modifiedCount?: number })?.modifiedCount ?? 0;
    } else {
      for (const alertId of validated.alertIds) {
        const result = await ServiceAny.resolveAlert(
          alertId,
          actor.organizationId,
          actor.userId
        );
        if (result) modifiedCount++;
      }
    }

    dbLogger.warn(
      "Alerts bulk resolved: org=" + actor.organizationId +
      " user=" + actor.userId +
      " requested=" + validated.alertIds.length +
      " modified=" + modifiedCount
    );

    res.status(HttpStatus.OK).json({
      success: true,
      message: "Alerts resolved",
      data: {
        requested: validated.alertIds.length,
        modifiedCount,
      },
    });
  });

  // -----------------------------------------------------------
  // DELETE /alerts/:id
  // -----------------------------------------------------------
  deleteAlert = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    const id    = requireObjectId(req);

    const ServiceAny = AlertService as unknown as {
      deleteAlert: (
        id:              string,
        organizationId?: string,
        actorId?:        string
      ) => Promise<unknown | null>;
    };

    const alert = await ServiceAny.deleteAlert(id, actor.organizationId, actor.userId);
    if (!alert) {
      throw new AppError("Alert not found", HttpStatus.NOT_FOUND, "ALERT_NOT_FOUND");
    }

    dbLogger.warn(
      "Alert deleted: id=" + id +
      " org=" + actor.organizationId +
      " user=" + actor.userId
    );

    res.status(HttpStatus.OK).json({
      success: true,
      message: "Alert deleted",
      data: { id },
    });
  });

  // -----------------------------------------------------------
  // DELETE /alerts/bulk — delete multiple alerts
  // -----------------------------------------------------------
  bulkDelete = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    const validated = runSchema(bulkActionSchema, req.body);

    const ServiceAny = AlertService as unknown as {
      bulkDelete?: (
        alertIds:       string[],
        organizationId: string,
        actorId?:       string
      ) => Promise<{ deletedCount?: number } | unknown>;
      deleteAlert: (
        id:              string,
        organizationId?: string,
        actorId?:        string
      ) => Promise<unknown | null>;
    };

    let deletedCount = 0;

    if (typeof ServiceAny.bulkDelete === "function") {
      const result = await ServiceAny.bulkDelete(
        validated.alertIds,
        actor.organizationId,
        actor.userId
      );
      deletedCount = (result as { deletedCount?: number })?.deletedCount ?? 0;
    } else {
      for (const alertId of validated.alertIds) {
        const result = await ServiceAny.deleteAlert(
          alertId,
          actor.organizationId,
          actor.userId
        );
        if (result) deletedCount++;
      }
    }

    dbLogger.warn(
      "Alerts bulk deleted: org=" + actor.organizationId +
      " user=" + actor.userId +
      " requested=" + validated.alertIds.length +
      " deleted=" + deletedCount
    );

    res.status(HttpStatus.OK).json({
      success: true,
      message: "Alerts deleted",
      data: {
        requested: validated.alertIds.length,
        deletedCount,
      },
    });
  });
}

export default new AlertController();