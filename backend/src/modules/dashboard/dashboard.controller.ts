// dashboard.controller.ts
import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

import dashboardService from "./dashboard.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { dbLogger } from "../../utils/logger.js";

/* =====================================================
   CONFIG
===================================================== */

const DASHBOARD_CONFIG = {
  /* Cache hints — tell the client (and any CDN) that this can be
     reused for a few seconds. Dashboards are heavy and rarely change
     within that window. */
  cacheControlSeconds: 30,

  /* Hard caps */
  maxRangeDays: 365,            // any wider window is rejected
  defaultRangeDays: 30,

  /* Slow-query threshold for warnings */
  slowMs: 5_000,
} as const;

/* =====================================================
   ROLE NORMALIZATION
   The global AuthenticatedUser carries the system-wide role enum.
   Dashboards should be visible to most authenticated roles; only
   READ_ONLY-style restricted roles get blocked here.
===================================================== */

const DASHBOARD_FORBIDDEN_ROLES = ["BANNED", "SUSPENDED"] as const;

function isRoleAllowed(role: unknown): boolean {
  const r = String(role ?? "").toUpperCase();
  if (!r) return false;
  return !(DASHBOARD_FORBIDDEN_ROLES as readonly string[]).includes(r);
}

/* =====================================================
   ALLOWLISTS — for query params
===================================================== */

const VALID_RANGES = ["today", "7d", "30d", "90d", "ytd", "custom"] as const;
type DashboardRange = (typeof VALID_RANGES)[number];

const VALID_VIEWS = ["org", "team", "me"] as const;
type DashboardView = (typeof VALID_VIEWS)[number];

const VALID_GROUPBY = ["day", "week", "month", "owner", "stage"] as const;
type DashboardGroupBy = (typeof VALID_GROUPBY)[number];

/* =====================================================
   HELPERS
===================================================== */

function getCurrentUser(req: Request): {
  userId: string;
  organizationId: string;
  role: string;
} {
  const u = req.user;
  if (!u) {
    throw ApiError.unauthorized("Unauthorized");
  }

  /* Normalize id (string) and _id (ObjectId | string) into a clean string */
  const userId =
    (typeof u.id === "string" && u.id) ||
    (u._id ? u._id.toString() : "");

  const organizationId =
    typeof u.organizationId === "string"
      ? u.organizationId
      : String(u.organizationId ?? "");

  if (!userId || !organizationId) {
    throw ApiError.unauthorized("User missing identity or organization");
  }

  if (!isRoleAllowed(u.role)) {
    throw ApiError.forbidden("Your role does not have dashboard access");
  }

  return { userId, organizationId, role: String(u.role ?? "USER").toUpperCase() };
}

function paramAsString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function getEnumParam<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback?: T
): T | undefined {
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function getDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? undefined : d;
}

function isValidObjectId(id: string | undefined): id is string {
  return !!id && mongoose.Types.ObjectId.isValid(id);
}

/**
 * Resolve a range token into a concrete { start, end } pair.
 * Used for time-series and trend endpoints.
 */
function resolveDateWindow(
  range: DashboardRange,
  customStart?: Date,
  customEnd?: Date
): { start: Date; end: Date } {
  const now = new Date();

  if (range === "custom") {
    if (!customStart || !customEnd) {
      throw ApiError.badRequest(
        "startDate and endDate are required when range is 'custom'"
      );
    }
    if (customStart.getTime() >= customEnd.getTime()) {
      throw ApiError.badRequest("startDate must be before endDate");
    }
    const spanMs = customEnd.getTime() - customStart.getTime();
    const maxMs = DASHBOARD_CONFIG.maxRangeDays * 24 * 60 * 60 * 1000;
    if (spanMs > maxMs) {
      throw ApiError.badRequest(
        `Date range cannot exceed ${DASHBOARD_CONFIG.maxRangeDays} days`
      );
    }
    return { start: customStart, end: customEnd };
  }

  const start = new Date(now);
  switch (range) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "7d":
      start.setDate(now.getDate() - 7);
      break;
    case "30d":
      start.setDate(now.getDate() - 30);
      break;
    case "90d":
      start.setDate(now.getDate() - 90);
      break;
    case "ytd":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start, end: now };
}

/**
 * Set a Cache-Control header so clients/CDNs can reuse the response.
 * Private cache only — these are user-specific dashboards.
 */
function setDashboardCacheHeaders(res: Response): void {
  res.setHeader(
    "Cache-Control",
    `private, max-age=${DASHBOARD_CONFIG.cacheControlSeconds}`
  );
}

/**
 * Coerce a service result that may be void/undefined into a safe object.
 */
function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

/* =====================================================
   CONTROLLER
===================================================== */

class DashboardController {

  /* =====================================================
     GET /dashboard/summary
     Top-level KPI cards: pipeline, deals won, leads, etc.
  ===================================================== */
  getDashboardSummary = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const { userId, organizationId, role } = getCurrentUser(req);

      const range = getEnumParam(req.query.range, VALID_RANGES, "30d") ?? "30d";
      const view  = getEnumParam(req.query.view,  VALID_VIEWS, "org")  ?? "org";

      const { start, end } = resolveDateWindow(
        range,
        getDate(req.query.startDate),
        getDate(req.query.endDate)
      );

      dbLogger.info(
        `Dashboard summary: org=${organizationId} user=${userId} ` +
        `range=${range} view=${view}`
      );

      const startedAt = Date.now();

      /* Service shape: getSummary({ userId, organizationId, role, range, view, dateWindow }) */
      const svc = dashboardService as unknown as {
        getSummary: (input: {
          userId: string;
          _id: string;          // legacy field name preserved for back-compat
          role: string;
          organizationId: string;
          range: DashboardRange;
          view: DashboardView;
          startDate: Date;
          endDate: Date;
        }) => Promise<unknown>;
      };

      const data = asObject(
        await svc.getSummary({
          userId,
          _id: userId,
          role,
          organizationId,
          range,
          view,
          startDate: start,
          endDate: end,
        })
      );

      const durationMs = Date.now() - startedAt;

      if (durationMs > DASHBOARD_CONFIG.slowMs) {
        dbLogger.warn(
          `Slow dashboard summary: org=${organizationId} ` +
          `range=${range} durationMs=${durationMs}`
        );
      }

      setDashboardCacheHeaders(res);

      res.status(200).json({
        success: true,
        data,
        meta: {
          generatedAt: new Date().toISOString(),
          durationMs,
          range,
          view,
          dateWindow: {
            start: start.toISOString(),
            end: end.toISOString(),
          },
        },
      });
    },
    { name: "dashboard.getSummary" }
  );

  /* =====================================================
     GET /dashboard/metrics
     Detailed metrics breakdown — multiple charts on one page.
  ===================================================== */
  getMetrics = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const { userId, organizationId, role } = getCurrentUser(req);

      const range   = getEnumParam(req.query.range,   VALID_RANGES,   "30d") ?? "30d";
      const view    = getEnumParam(req.query.view,    VALID_VIEWS,    "org") ?? "org";
      const groupBy = getEnumParam(req.query.groupBy, VALID_GROUPBY,  "day") ?? "day";

      const { start, end } = resolveDateWindow(
        range,
        getDate(req.query.startDate),
        getDate(req.query.endDate)
      );

      const svc = dashboardService as unknown as {
        getMetrics?: (input: {
          userId: string;
          organizationId: string;
          role: string;
          range: DashboardRange;
          view: DashboardView;
          groupBy: DashboardGroupBy;
          startDate: Date;
          endDate: Date;
        }) => Promise<unknown>;
      };

      if (typeof svc.getMetrics !== "function") {
        throw ApiError.notFound("Metrics endpoint not available");
      }

      const startedAt = Date.now();

      const data = asObject(
        await svc.getMetrics({
          userId,
          organizationId,
          role,
          range,
          view,
          groupBy,
          startDate: start,
          endDate: end,
        })
      );

      setDashboardCacheHeaders(res);

      res.status(200).json({
        success: true,
        data,
        meta: {
          generatedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          range,
          view,
          groupBy,
        },
      });
    },
    { name: "dashboard.getMetrics" }
  );

  /* =====================================================
     GET /dashboard/leaderboard
     Top reps by performance — typically gated to manager+ roles.
  ===================================================== */
  getLeaderboard = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const { userId, organizationId, role } = getCurrentUser(req);

      /* Leaderboards are sometimes restricted to managers — uncomment to
         enforce. Keeping open by default; tighten when you have RBAC. */
      // if (!["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"].includes(role)) {
      //   throw ApiError.forbidden("Leaderboard restricted to managers");
      // }

      const range = getEnumParam(req.query.range, VALID_RANGES, "30d") ?? "30d";
      const limit = Math.min(
        Math.max(parseInt(String(req.query.limit ?? "10"), 10) || 10, 1),
        100
      );

      const { start, end } = resolveDateWindow(
        range,
        getDate(req.query.startDate),
        getDate(req.query.endDate)
      );

      const svc = dashboardService as unknown as {
        getLeaderboard?: (input: {
          organizationId: string;
          role: string;
          requestedBy: string;
          range: DashboardRange;
          limit: number;
          startDate: Date;
          endDate: Date;
        }) => Promise<unknown>;
      };

      if (typeof svc.getLeaderboard !== "function") {
        throw ApiError.notFound("Leaderboard not available");
      }

      const data = await svc.getLeaderboard({
        organizationId,
        role,
        requestedBy: userId,
        range,
        limit,
        startDate: start,
        endDate: end,
      });

      setDashboardCacheHeaders(res);

      res.status(200).json({
        success: true,
        data,
        meta: {
          generatedAt: new Date().toISOString(),
          range,
          limit,
        },
      });
    },
    { name: "dashboard.getLeaderboard" }
  );

  /* =====================================================
     GET /dashboard/activity-feed
     Real-time-ish stream of recent activities (calls, emails, deal moves).
     Cursor-based pagination — scales to high-activity orgs.
  ===================================================== */
  getActivityFeed = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const { userId, organizationId, role } = getCurrentUser(req);

      const limit = Math.min(
        Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1),
        200
      );
      const cursor = paramAsString(req.query.cursor);
      const ownerId = paramAsString(req.query.ownerId);

      const svc = dashboardService as unknown as {
        getActivityFeed?: (input: {
          organizationId: string;
          requestedBy: string;
          role: string;
          limit: number;
          cursor?: string;
          ownerId?: string;
        }) => Promise<unknown>;
      };

      if (typeof svc.getActivityFeed !== "function") {
        throw ApiError.notFound("Activity feed not available");
      }

      const data = await svc.getActivityFeed({
        organizationId,
        requestedBy: userId,
        role,
        limit,
        ...(cursor && { cursor }),
        ...(ownerId && isValidObjectId(ownerId) && { ownerId }),
      });

      /* Don't cache feeds — they should always be fresh */
      res.setHeader("Cache-Control", "no-store");

      res.status(200).json({
        success: true,
        data,
        meta: {
          generatedAt: new Date().toISOString(),
          limit,
        },
      });
    },
    { name: "dashboard.getActivityFeed" }
  );

  /* =====================================================
     GET /dashboard/trends
     Time-series data: pipeline value over time, deals won per week, etc.
  ===================================================== */
  getTrends = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const { userId, organizationId, role } = getCurrentUser(req);

      const range   = getEnumParam(req.query.range,   VALID_RANGES,  "90d") ?? "90d";
      const groupBy = getEnumParam(req.query.groupBy, VALID_GROUPBY, "week") ?? "week";
      const metric  =
        paramAsString(req.query.metric) ?? "pipelineValue";

      const { start, end } = resolveDateWindow(
        range,
        getDate(req.query.startDate),
        getDate(req.query.endDate)
      );

      const svc = dashboardService as unknown as {
        getTrends?: (input: {
          organizationId: string;
          requestedBy: string;
          role: string;
          range: DashboardRange;
          groupBy: DashboardGroupBy;
          metric: string;
          startDate: Date;
          endDate: Date;
        }) => Promise<unknown>;
      };

      if (typeof svc.getTrends !== "function") {
        throw ApiError.notFound("Trends not available");
      }

      const startedAt = Date.now();

      const data = await svc.getTrends({
        organizationId,
        requestedBy: userId,
        role,
        range,
        groupBy,
        metric,
        startDate: start,
        endDate: end,
      });

      setDashboardCacheHeaders(res);

      res.status(200).json({
        success: true,
        data,
        meta: {
          generatedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt,
          range,
          groupBy,
          metric,
        },
      });
    },
    { name: "dashboard.getTrends" }
  );

  /* =====================================================
     GET /dashboard/health
     Quick health/freshness signal for the dashboard data layer.
  ===================================================== */
  getHealth = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const { organizationId } = getCurrentUser(req);

      const svc = dashboardService as unknown as {
        healthCheck?: (orgId: string) => Promise<unknown>;
      };

      let healthy = true;
      let details: unknown = { status: "ok" };

      if (typeof svc.healthCheck === "function") {
        try {
          details = asObject(await svc.healthCheck(organizationId));
        } catch (err) {
          healthy = false;
          details = {
            status: "unhealthy",
            error: (err as Error)?.message ?? "Unknown error",
          };
        }
      }

      res.status(healthy ? 200 : 503).json({
        success: healthy,
        data: details,
        meta: {
          checkedAt: new Date().toISOString(),
        },
      });
    },
    { name: "dashboard.health" }
  );
}

/* =====================================================
   EXPORTS
===================================================== */

const dashboardController = new DashboardController();
export default dashboardController;

/**
 * Backwards-compatible named exports — preserves the original API
 * for any router still importing functions directly.
 */
export const getDashboardSummary = dashboardController.getDashboardSummary;
export const getMetrics          = dashboardController.getMetrics;
export const getLeaderboard      = dashboardController.getLeaderboard;
export const getActivityFeed     = dashboardController.getActivityFeed;
export const getTrends           = dashboardController.getTrends;
export const getHealth           = dashboardController.getHealth;