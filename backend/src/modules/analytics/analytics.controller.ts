// analytics.controller.ts
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

import analyticsService from "./analytics.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { dbLogger } from "../../utils/logger.js";

// ============================================================
// ERRORS
// ============================================================

class AppError extends Error {
  public statusCode: number;
  public code:       string;

  constructor(message: string, statusCode: number = 400, code: string = "APP_ERROR") {
    super(message);
    this.name       = "AppError";
    this.statusCode = statusCode;
    this.code       = code;
  }
}

const HttpStatus = {
  OK:           200,
  BAD_REQUEST:  400,
  UNAUTHORIZED: 401,
  FORBIDDEN:    403,
  INTERNAL:     500,
} as const;

// ============================================================
// ZOD SCHEMAS
// ============================================================

const isoDateSchema = z
  .string()
  .refine((v) => !isNaN(new Date(v).getTime()), {
    message: "Must be a valid ISO 8601 date",
  });

const dashboardQuerySchema = z
  .object({
    fromDate:     isoDateSchema.optional(),
    toDate:       isoDateSchema.optional(),
    trendMonths:  z.string().optional(),
  })
  .strict();

// ============================================================
// HELPERS
// ============================================================

interface AnalyticsActor {
  userId:         string;
  organizationId: string;
  role:           string;
}

function requireAuth(req: Request): AnalyticsActor {
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

function parseTrendMonths(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function buildWindow(
  fromDate: string | undefined,
  toDate:   string | undefined
): { fromDate: Date; toDate: Date } {
  const now = new Date();

  const to = toDate ? new Date(toDate) : now;
  const from = fromDate
    ? new Date(fromDate)
    : new Date(to.getFullYear(), to.getMonth() - 12, to.getDate());

  return { fromDate: from, toDate: to };
}

// ============================================================
// CONTROLLER
// ============================================================

class AnalyticsController {

  // -----------------------------------------------------------
  // GET /api/analytics — full dashboard payload
  // -----------------------------------------------------------
  getDashboard = asyncHandler(async (
    req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    const actor = requireAuth(req);
    const validated = runSchema(dashboardQuerySchema, req.query);

    const window      = buildWindow(validated.fromDate, validated.toDate);
    const trendMonths = parseTrendMonths(validated.trendMonths);

    const data = await analyticsService.getDashboard(actor.organizationId, {
      window,
      ...(trendMonths !== undefined && { trendMonths }),
    });

    dbLogger.info(
      "Analytics dashboard served: org=" + actor.organizationId +
      " user=" + actor.userId
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data,
      meta: {
        fromDate:    window.fromDate.toISOString(),
        toDate:      window.toDate.toISOString(),
        trendMonths: trendMonths ?? 12,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  // -----------------------------------------------------------
  // GET /api/analytics/summary
  // -----------------------------------------------------------
  getSummary = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    const validated = runSchema(dashboardQuerySchema, req.query);

    const window = buildWindow(validated.fromDate, validated.toDate);
    const summary = await analyticsService.getSummary(actor.organizationId, window);

    res.status(HttpStatus.OK).json({
      success: true,
      data: summary,
    });
  });

  // -----------------------------------------------------------
  // GET /api/analytics/funnel
  // -----------------------------------------------------------
  getFunnel = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);

    const funnel = await analyticsService.getFunnel(actor.organizationId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: funnel,
    });
  });

  // -----------------------------------------------------------
  // GET /api/analytics/trend
  // -----------------------------------------------------------
  getTrend = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    const validated = runSchema(dashboardQuerySchema, req.query);

    const trendMonths = parseTrendMonths(validated.trendMonths) ?? 12;
    const trend = await analyticsService.getRevenueTrend(actor.organizationId, trendMonths);

    res.status(HttpStatus.OK).json({
      success: true,
      data: trend,
    });
  });

  // -----------------------------------------------------------
  // GET /api/analytics/insights
  // -----------------------------------------------------------
  getInsights = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    const validated = runSchema(dashboardQuerySchema, req.query);

    const window     = buildWindow(validated.fromDate, validated.toDate);
    const [insights, topActions] = await Promise.all([
      analyticsService.getInsights(actor.organizationId, window),
      analyticsService.getTopActions(actor.organizationId),
    ]);

    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        insights,
        topActions,
      },
    });
  });
}

export default new AnalyticsController();