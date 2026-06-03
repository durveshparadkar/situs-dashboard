// insight.controller.ts
import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";

import insightService, {
  CreateInsightInput,
  InsightFilters,
  FeedbackInput,
} from "./insight.service.js";
import {
  InsightStatus,
  InsightCategory,
  InsightType,
  InsightSeverity,
  InsightSource,
  InsightTargetType,
} from "./insights.model.js";
import { dbLogger } from "../../utils/logger.js";

/* =====================================================
   ERRORS
===================================================== */

class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = "APP_ERROR",
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

class ValidationError extends AppError {
  constructor(details: Array<{ field: string; message: string }>) {
    super("Validation failed", 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

/* =====================================================
   HTTP STATUS
===================================================== */

const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
} as const;

/* =====================================================
   CONFIG
===================================================== */

const INSIGHT_CONFIG = {
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
  /* Caps to prevent payload/storage abuse */
  caps: {
    title: 300,
    message: 2000,
    reason: 500,
    comment: 1000,
    maxBulkSize: 1000,
    maxMyInsightsLimit: 200,
  },
  /* Restricted operations — only these roles can call them */
  privilegedRoles: ["ORG_ADMIN", "SUPER_ADMIN", "MANAGER"] as const,
} as const;

/* =====================================================
   ENUM ALLOWLISTS
===================================================== */

const VALID_STATUSES: InsightStatus[] = [
  "active", "seen", "acted", "dismissed", "snoozed", "expired", "archived",
];

const VALID_CATEGORIES: InsightCategory[] = [
  "engagement", "forecast", "velocity", "risk",
  "qualification", "performance", "celebration", "ai",
];

const VALID_SEVERITIES: InsightSeverity[] = [
  "info", "low", "medium", "high", "critical",
];

const VALID_SOURCES: InsightSource[] = [
  "rules_engine", "ai_engine", "risk_engine",
  "scoring_engine", "forecast_engine", "manual",
];

const VALID_TARGET_TYPES: InsightTargetType[] = [
  "deal", "lead", "contact", "account", "user", "pipeline", "organization",
];

const VALID_RATINGS = ["helpful", "not_helpful", "irrelevant"] as const;

const VALID_SORT_FIELDS = [
  "severity",
  "confidence",
  "generatedAt",
] as const;

/* =====================================================
   HELPERS
===================================================== */

interface InsightActor {
  userId: string;
  organizationId: string;
  role: string;
}

/**
 * Extract & validate the authenticated user. Reads from the globally-augmented
 * req.user (express.d.ts) and normalizes _id to a string.
 */
function requireAuth(req: Request): InsightActor {
  const u = req.user;
  if (!u) {
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
  }

  const userId =
    (typeof u.id === "string" && u.id) ||
    (u._id ? u._id.toString() : "");

  const organizationId =
    typeof u.organizationId === "string"
      ? u.organizationId
      : String(u.organizationId ?? "");

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

function requirePrivileged(actor: InsightActor): void {
  if (!(INSIGHT_CONFIG.privilegedRoles as readonly string[]).includes(actor.role)) {
    throw new AppError(
      "This action requires manager-level access",
      HttpStatus.FORBIDDEN,
      "FORBIDDEN"
    );
  }
}

function paramAsString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function requireObjectId(
  value: unknown,
  fieldName: string
): string {
  const id = paramAsString(value);
  if (!id) {
    throw new AppError(
      `${fieldName} is required`,
      HttpStatus.BAD_REQUEST,
      "MISSING_ID"
    );
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(
      `Invalid ${fieldName} format`,
      HttpStatus.BAD_REQUEST,
      "INVALID_ID"
    );
  }
  return id;
}

function parseEnumList<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T[] | undefined {
  if (!value) return undefined;

  const raw = Array.isArray(value) ? value : String(value).split(",");
  const cleaned = raw
    .map((v) => String(v).trim().toLowerCase())
    .filter((v) => (allowed as readonly string[]).includes(v)) as T[];

  return cleaned.length ? cleaned : undefined;
}

function parseEnumSingle<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function parseDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? undefined : d;
}

function parseInt10(value: unknown, fallback: number): number {
  const n = parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clampString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/* =====================================================
   CONTROLLER
===================================================== */

class InsightController {

  /* =====================================================
     POST /insights — manual create
  ===================================================== */
  async createInsight(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = requireAuth(req);
      const body = req.body ?? {};

      /* ── Field-level validation with structured errors ── */
      const missing: string[] = [];
      if (!body.type)    missing.push("type");
      if (!body.title)   missing.push("title");
      if (!body.message) missing.push("message");
      if (!body.target)  missing.push("target");
      if (!body.target?.type) missing.push("target.type");
      if (!body.target?.id)   missing.push("target.id");

      if (missing.length > 0) {
        throw new ValidationError(
          missing.map((field) => ({ field, message: "Required field missing" }))
        );
      }

      /* ── Validate target type against allowlist ── */
      if (!(VALID_TARGET_TYPES as readonly string[]).includes(body.target.type)) {
        throw new AppError(
          `Invalid target.type. Must be one of: ${VALID_TARGET_TYPES.join(", ")}`,
          HttpStatus.BAD_REQUEST,
          "INVALID_TARGET_TYPE"
        );
      }

      /* ── Build target with conditional spreads ── */
      const target: CreateInsightInput["target"] = {
        type: body.target.type as InsightTargetType,
        id:   String(body.target.id),
        ...(body.target.name !== undefined && { name: String(body.target.name).slice(0, 200) }),
        ...(body.target.url  !== undefined && { url:  String(body.target.url).slice(0, 2000) }),
      };

      /* ── Build input with conditional spreads ── */
      const input: CreateInsightInput = {
        organizationId,
        type:      body.type as InsightType,
        title:     clampString(body.title,   INSIGHT_CONFIG.caps.title),
        message:   clampString(body.message, INSIGHT_CONFIG.caps.message),
        reasoning: Array.isArray(body.reasoning) ? body.reasoning : [],
        actions:   Array.isArray(body.actions)   ? body.actions   : [],
        target,
        source: body.source ?? "manual",
        ...(body.severity        !== undefined && { severity:        body.severity }),
        ...(body.engineVersion   !== undefined && { engineVersion:   body.engineVersion }),
        ...(body.assignedTo      !== undefined && { assignedTo:      body.assignedTo }),
        ...(body.visibleToRoles  !== undefined && { visibleToRoles:  body.visibleToRoles }),
        ...(body.confidence      !== undefined && { confidence:      body.confidence }),
        ...(body.expectedImpact  !== undefined && { expectedImpact:  body.expectedImpact }),
        ...(body.estimatedValueAtRisk !== undefined && {
          estimatedValueAtRisk: body.estimatedValueAtRisk,
        }),
        ...(body.metadata        !== undefined && { metadata:        body.metadata }),
      };

      const expiresAt = parseDate(body.expiresAt);
      if (expiresAt) input.expiresAt = expiresAt;

      const insight = await insightService.createInsight(input);

      dbLogger.info(
        `Insight created: type=${input.type} target=${target.type}/${target.id} ` +
        `org=${organizationId} user=${userId}`
      );

      res.status(HttpStatus.CREATED).json({
        success: true,
        data: insight,
        message: "Insight created",
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     GET /insights — list with filters
  ===================================================== */
  async listInsights(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { organizationId } = requireAuth(req);

      /* ── Parse all optional values ── */
      const status          = parseEnumList(req.query.status,   VALID_STATUSES);
      const category        = parseEnumList(req.query.category, VALID_CATEGORIES);
      const severity        = parseEnumList(req.query.severity, VALID_SEVERITIES);
      const source          = parseEnumSingle(req.query.source,     VALID_SOURCES);
      const targetType      = parseEnumSingle(req.query.targetType, VALID_TARGET_TYPES);
      const assignedTo      = paramAsString(req.query.assignedTo);
      const targetId        = paramAsString(req.query.targetId);
      const generatedAfter  = parseDate(req.query.generatedAfter);
      const generatedBefore = parseDate(req.query.generatedBefore);

      /* ── Pagination with bounds ── */
      const page = Math.max(parseInt10(req.query.page, 1), 1);
      const limit = Math.min(
        Math.max(parseInt10(req.query.limit, INSIGHT_CONFIG.pagination.defaultLimit), 1),
        INSIGHT_CONFIG.pagination.maxLimit
      );

      /* ── Sort with allowlist ── */
      const sortByRaw = paramAsString(req.query.sortBy);
      const sortBy: NonNullable<InsightFilters["sortBy"]> =
        sortByRaw && (VALID_SORT_FIELDS as readonly string[]).includes(sortByRaw)
          ? (sortByRaw as (typeof VALID_SORT_FIELDS)[number])
          : "generatedAt";

      const sortOrder: "asc" | "desc" =
        req.query.sortOrder === "asc" ? "asc" : "desc";

      /* ── Build filters with conditional spreads ── */
      const filters: InsightFilters = {
        page,
        limit,
        sortBy,
        sortOrder,
        ...(status     && { status }),
        ...(category   && { category }),
        ...(severity   && { severity }),
        ...(source     && { source }),
        ...(targetType && { targetType }),
        ...(assignedTo && { assignedTo }),
        ...(targetId   && { targetId }),
        ...(generatedAfter  && { generatedAfter }),
        ...(generatedBefore && { generatedBefore }),
      };

      const result = await insightService.listInsights(organizationId, filters);

      res.status(HttpStatus.OK).json({
        success: true,
        data: result.insights,
        pagination: {
          page:       result.page,
          limit:      result.limit,
          total:      result.total,
          totalPages: result.totalPages,
          hasNext:    result.page < result.totalPages,
          hasPrev:    result.page > 1,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     GET /insights/me — the current user's actionable insights
  ===================================================== */
  async getMyInsights(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = requireAuth(req);

      const limit = Math.min(
        Math.max(parseInt10(req.query.limit, 50), 1),
        INSIGHT_CONFIG.caps.maxMyInsightsLimit
      );

      const minSeverity = parseEnumSingle(req.query.minSeverity, VALID_SEVERITIES);

      const insights = await insightService.getInsightsForRep(
        userId,
        organizationId,
        {
          limit,
          ...(minSeverity !== undefined && { minSeverity }),
        }
      );

      res.status(HttpStatus.OK).json({
        success: true,
        data: insights,
        meta: {
          count: insights.length,
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     GET /insights/:id
  ===================================================== */
  async getInsightById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { organizationId } = requireAuth(req);
      const id = requireObjectId(req.params.id, "Insight ID");

      const insight = await insightService.getInsightById(id, organizationId);

      if (!insight) {
        throw new AppError(
          "Insight not found",
          HttpStatus.NOT_FOUND,
          "INSIGHT_NOT_FOUND"
        );
      }

      res.status(HttpStatus.OK).json({ success: true, data: insight });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     GET /insights/target/:targetType/:targetId
  ===================================================== */
  async getByTarget(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { organizationId } = requireAuth(req);

      const targetTypeRaw = paramAsString(req.params.targetType);
      const targetId      = paramAsString(req.params.targetId);

      if (
        !targetTypeRaw ||
        !(VALID_TARGET_TYPES as readonly string[]).includes(targetTypeRaw.toLowerCase())
      ) {
        throw new AppError(
          `Invalid target type. Must be one of: ${VALID_TARGET_TYPES.join(", ")}`,
          HttpStatus.BAD_REQUEST,
          "INVALID_TARGET_TYPE"
        );
      }

      if (!targetId) {
        throw new AppError(
          "targetId is required",
          HttpStatus.BAD_REQUEST,
          "MISSING_TARGET_ID"
        );
      }

      const targetType = targetTypeRaw.toLowerCase() as InsightTargetType;

      const result = await insightService.listInsights(organizationId, {
        targetType,
        targetId,
        limit: 100,
      });

      res.status(HttpStatus.OK).json({
        success: true,
        data: result.insights,
        meta: {
          targetType,
          targetId,
          count: result.total,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     POST /insights/:id/seen
  ===================================================== */
  async markSeen(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = requireAuth(req);
      const id = requireObjectId(req.params.id, "Insight ID");

      const insight = await insightService.markSeen(id, userId, organizationId);

      if (!insight) {
        throw new AppError(
          "Insight not found",
          HttpStatus.NOT_FOUND,
          "INSIGHT_NOT_FOUND"
        );
      }

      res.status(HttpStatus.OK).json({
        success: true,
        data: insight,
        message: "Insight marked as seen",
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     POST /insights/:id/act
  ===================================================== */
  async markActed(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = requireAuth(req);
      const id = requireObjectId(req.params.id, "Insight ID");

      const insight = await insightService.markActed(id, userId, organizationId);

      if (!insight) {
        throw new AppError(
          "Insight not found",
          HttpStatus.NOT_FOUND,
          "INSIGHT_NOT_FOUND"
        );
      }

      dbLogger.info(
        `Insight acted: id=${id} user=${userId} org=${organizationId}`
      );

      res.status(HttpStatus.OK).json({
        success: true,
        data: insight,
        message: "Insight marked as acted",
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     POST /insights/:id/dismiss
  ===================================================== */
  async dismissInsight(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = requireAuth(req);
      const id = requireObjectId(req.params.id, "Insight ID");

      const reason =
        req.body?.reason !== undefined && req.body.reason !== null
          ? clampString(req.body.reason, INSIGHT_CONFIG.caps.reason)
          : undefined;

      const insight = await insightService.dismiss(
        id,
        userId,
        organizationId,
        reason
      );

      if (!insight) {
        throw new AppError(
          "Insight not found",
          HttpStatus.NOT_FOUND,
          "INSIGHT_NOT_FOUND"
        );
      }

      dbLogger.info(
        `Insight dismissed: id=${id} user=${userId} reason=${reason ?? "none"}`
      );

      res.status(HttpStatus.OK).json({
        success: true,
        data: insight,
        message: "Insight dismissed",
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     POST /insights/:id/snooze
  ===================================================== */
  async snoozeInsight(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = requireAuth(req);
      const id = requireObjectId(req.params.id, "Insight ID");

      const until = parseDate(req.body?.until);
      if (!until) {
        throw new AppError(
          "Valid 'until' date (ISO format) is required",
          HttpStatus.BAD_REQUEST,
          "INVALID_SNOOZE_DATE"
        );
      }

      /* Reject snoozing to a past date */
      if (until.getTime() <= Date.now()) {
        throw new AppError(
          "Snooze 'until' must be in the future",
          HttpStatus.BAD_REQUEST,
          "INVALID_SNOOZE_DATE"
        );
      }

      /* Cap snooze at 90 days — long-snoozed insights are usually forgotten */
      const maxSnoozeMs = 90 * 24 * 60 * 60 * 1000;
      if (until.getTime() - Date.now() > maxSnoozeMs) {
        throw new AppError(
          "Cannot snooze more than 90 days",
          HttpStatus.BAD_REQUEST,
          "SNOOZE_TOO_LONG"
        );
      }

      const insight = await insightService.snooze(
        id,
        userId,
        organizationId,
        until
      );

      if (!insight) {
        throw new AppError(
          "Insight not found",
          HttpStatus.NOT_FOUND,
          "INSIGHT_NOT_FOUND"
        );
      }

      res.status(HttpStatus.OK).json({
        success: true,
        data: insight,
        message: `Insight snoozed until ${until.toISOString()}`,
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     POST /insights/:id/feedback — ML training signal
  ===================================================== */
  async submitFeedback(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = requireAuth(req);
      const id = requireObjectId(req.params.id, "Insight ID");

      const rating  = req.body?.rating;
      const comment = req.body?.comment;

      if (!(VALID_RATINGS as readonly string[]).includes(rating)) {
        throw new AppError(
          `Invalid rating. Must be one of: ${VALID_RATINGS.join(", ")}`,
          HttpStatus.BAD_REQUEST,
          "INVALID_RATING"
        );
      }

      const feedback: FeedbackInput = {
        rating: rating as FeedbackInput["rating"],
        ...(comment !== undefined &&
          comment !== null && {
            comment: clampString(comment, INSIGHT_CONFIG.caps.comment),
          }),
      };

      const insight = await insightService.submitFeedback(
        id,
        userId,
        organizationId,
        feedback
      );

      if (!insight) {
        throw new AppError(
          "Insight not found",
          HttpStatus.NOT_FOUND,
          "INSIGHT_NOT_FOUND"
        );
      }

      dbLogger.info(
        `Insight feedback: id=${id} rating=${rating} user=${userId}`
      );

      res.status(HttpStatus.OK).json({
        success: true,
        data: insight,
        message: "Feedback submitted",
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     POST /insights/:id/archive
  ===================================================== */
  async archiveInsight(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, organizationId } = requireAuth(req);
      const id = requireObjectId(req.params.id, "Insight ID");

      const insight = await insightService.archiveInsight(
        id,
        userId,
        organizationId
      );

      if (!insight) {
        throw new AppError(
          "Insight not found",
          HttpStatus.NOT_FOUND,
          "INSIGHT_NOT_FOUND"
        );
      }

      res.status(HttpStatus.OK).json({
        success: true,
        data: insight,
        message: "Insight archived",
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     POST /insights/bulk — engines push batches here
  ===================================================== */
  async bulkCreate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = requireAuth(req);
      requirePrivileged(actor); // engines call this with a service account; reps can't

      const { organizationId, userId } = actor;
      const inputs = req.body?.insights;

      if (!Array.isArray(inputs) || inputs.length === 0) {
        throw new AppError(
          "Request body must contain a non-empty 'insights' array",
          HttpStatus.BAD_REQUEST,
          "INVALID_PAYLOAD"
        );
      }

      if (inputs.length > INSIGHT_CONFIG.caps.maxBulkSize) {
        throw new AppError(
          `Cannot bulk-create more than ${INSIGHT_CONFIG.caps.maxBulkSize} insights at once`,
          HttpStatus.BAD_REQUEST,
          "TOO_MANY_INSIGHTS"
        );
      }

      /* Force every insight into the requesting org — prevents cross-tenant injection */
      const safeInputs: CreateInsightInput[] = inputs.map((i) => ({
        ...i,
        organizationId,
      }));

      const result = await insightService.bulkCreateInsights(safeInputs);

      dbLogger.info(
        `Insight bulk: org=${organizationId} user=${userId} ` +
        `requested=${inputs.length} created=${result.created} ` +
        `updated=${result.updated} failed=${result.failed}`
      );

      res.status(HttpStatus.OK).json({
        success: true,
        data: result,
        message:
          `Bulk processed: ${result.created} created, ` +
          `${result.updated} updated, ${result.failed} failed`,
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     GET /insights/stats — counts by status/category/severity
  ===================================================== */
  async getStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { organizationId } = requireAuth(req);

      const stats = await insightService.getStats(organizationId);

      res.status(HttpStatus.OK).json({
        success: true,
        data: stats,
        meta: { generatedAt: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }

  /* =====================================================
     POST /insights/expire-stale — privileged maintenance
  ===================================================== */
  async expireStale(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = requireAuth(req);
      requirePrivileged(actor);

      const { organizationId, userId } = actor;

      const count = await insightService.expireStale(organizationId);

      dbLogger.warn(
        `Insights expired: org=${organizationId} count=${count} user=${userId}`
      );

      res.status(HttpStatus.OK).json({
        success: true,
        data: { expiredCount: count },
        message: `Expired ${count} stale insight(s)`,
      });
    } catch (err) {
      next(err);
    }
  }
}

export default new InsightController();