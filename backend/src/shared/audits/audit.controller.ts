// audit.controller.ts
import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { z } from "zod";

import AuditLog from "../../shared/audits/audit.model.js";
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

const AUDIT_CONFIG = {
  pagination: {
    defaultLimit: 20,
    maxLimit:     100,
    maxPage:      10_000,
  },
  export: {
    maxRows: 10_000,
  },
  search: {
    maxLength: 200,
  },
  retentionMonths: 24,
  /**
   * Roles allowed to view audit logs.
   * Audit logs contain sensitive operational data — keep this tight.
   */
  viewerRoles: ["ORG_ADMIN", "SUPER_ADMIN"] as const,
  /**
   * Roles allowed to export audit logs.
   * Export creates artifacts that leave your platform — stricter than view.
   */
  exporterRoles: ["ORG_ADMIN", "SUPER_ADMIN"] as const,
} as const;

// ============================================================
// ZOD SCHEMAS
// ============================================================

const objectIdSchema = z
  .string()
  .refine((v) => mongoose.Types.ObjectId.isValid(v), {
    message: "Invalid ObjectId format",
  });

const isoDateSchema = z
  .string()
  .refine((v) => !isNaN(new Date(v).getTime()), {
    message: "Must be a valid ISO 8601 date",
  });

const listQuerySchema = z
  .object({
    page:       z.string().optional(),
    limit:      z.string().optional(),
    action:     z.string().optional(),
    resource:   z.string().optional(),
    resourceId: z.string().optional(),
    userId:     z.string().optional(),
    fromDate:   isoDateSchema.optional(),
    toDate:     isoDateSchema.optional(),
    search:     z.string().optional(),
    sortOrder:  z.enum(["asc", "desc"]).optional(),
  })
  .strict();

const exportQuerySchema = z
  .object({
    action:     z.string().optional(),
    resource:   z.string().optional(),
    resourceId: z.string().optional(),
    userId:     z.string().optional(),
    fromDate:   isoDateSchema.optional(),
    toDate:     isoDateSchema.optional(),
    format:     z.enum(["json", "csv"]).optional(),
  })
  .strict();

// ============================================================
// HELPERS
// ============================================================

interface AuditActor {
  userId:         string;
  organizationId: string;
  role:           string;
}

function requireAuth(req: Request): AuditActor {
  const u = req.user;
  if (!u) {
    throw new AppError("Unauthorized", HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
  }

  const userId =
    (typeof u.id === "string" && u.id) ||
    (u._id ? String(u._id) : "");

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

function requireRole(actor: AuditActor, allowed: readonly string[]): void {
  if (!allowed.includes(actor.role)) {
    throw new AppError(
      "Insufficient role for this action",
      HttpStatus.FORBIDDEN,
      "FORBIDDEN"
    );
  }
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

function runSchema<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): z.infer<T> {
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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a Mongo filter object from validated query inputs.
 * Always scopes to the actor's organization (multi-tenant isolation).
 */
function buildFilter(
  actor: AuditActor,
  q: {
    action?:     string | undefined;
    resource?:   string | undefined;
    resourceId?: string | undefined;
    userId?:     string | undefined;
    fromDate?:   string | undefined;
    toDate?:     string | undefined;
    search?:     string | undefined;
  }
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    organizationId: actor.organizationId,
  };

  if (q.action) {
    filter.action = q.action.trim().toUpperCase();
  }

  if (q.resource) {
    filter.resource = q.resource.trim().toUpperCase();
  }

  if (q.resourceId && mongoose.Types.ObjectId.isValid(q.resourceId)) {
    filter.resourceId = q.resourceId;
  }

  if (q.userId && mongoose.Types.ObjectId.isValid(q.userId)) {
    filter.userId = q.userId;
  }

  // Date range filter
  if (q.fromDate || q.toDate) {
    const dateFilter: Record<string, Date> = {};
    if (q.fromDate) dateFilter.$gte = new Date(q.fromDate);
    if (q.toDate)   dateFilter.$lte = new Date(q.toDate);
    filter.createdAt = dateFilter;
  }

  // Text search across resource and action with regex escaping
  if (q.search) {
    const search = q.search.trim().slice(0, AUDIT_CONFIG.search.maxLength);
    if (search.length > 0) {
      const escaped = escapeRegex(search);
      filter.$or = [
        { action:   { $regex: escaped, $options: "i" } },
        { resource: { $regex: escaped, $options: "i" } },
      ];
    }
  }

  return filter;
}

/**
 * Convert audit log records to CSV format.
 * Used by the export endpoint.
 */
function toCsv(logs: Array<Record<string, unknown>>): string {
  if (logs.length === 0) {
    return "timestamp,actor,action,resource,resourceId,ip\n";
  }

  const headers = ["timestamp", "actor", "action", "resource", "resourceId", "ip"];
  const lines: string[] = [headers.join(",")];

  for (const log of logs) {
    const userField = log.userId as { email?: string; name?: string } | string | undefined;
    let actor = "";
    if (typeof userField === "object" && userField !== null) {
      actor = String(userField.email ?? userField.name ?? "");
    } else if (typeof userField === "string") {
      actor = userField;
    }

    const row = [
      String(log.createdAt ?? ""),
      actor,
      String(log.action ?? ""),
      String(log.resource ?? ""),
      String(log.resourceId ?? ""),
      String(log.ip ?? ""),
    ].map((field) => {
      // CSV-escape: wrap in quotes if contains comma/quote/newline
      if (/[,"\n\r]/.test(field)) {
        return '"' + field.replace(/"/g, '""') + '"';
      }
      return field;
    });

    lines.push(row.join(","));
  }

  return lines.join("\n");
}

// ============================================================
// CONTROLLER
// ============================================================

class AuditController {

  // -----------------------------------------------------------
  // GET /audit-logs — paginated audit log listing
  // -----------------------------------------------------------
  getAuditLogs = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    requireRole(actor, AUDIT_CONFIG.viewerRoles);

    const validated = runSchema(listQuerySchema, req.query);

    const page = getNumber(validated.page, 1, {
      min: 1,
      max: AUDIT_CONFIG.pagination.maxPage,
    });
    const limit = getNumber(
      validated.limit,
      AUDIT_CONFIG.pagination.defaultLimit,
      { min: 1, max: AUDIT_CONFIG.pagination.maxLimit }
    );

    const filter    = buildFilter(actor, validated);
    const sortOrder = validated.sortOrder === "asc" ? 1 : -1;

    // Parallel query for items + total — saves a round trip
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("userId", "name email")
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(HttpStatus.OK).json({
      success: true,
      data: logs,
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
  // GET /audit-logs/:id — single audit log entry
  // -----------------------------------------------------------
  getAuditLogById = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    requireRole(actor, AUDIT_CONFIG.viewerRoles);

    const id = requireObjectId(req);

    const log = await AuditLog.findOne({
      _id:            id,
      organizationId: actor.organizationId,
    })
      .populate("userId", "name email")
      .lean();

    if (!log) {
      throw new AppError("Audit log not found", HttpStatus.NOT_FOUND, "AUDIT_NOT_FOUND");
    }

    res.status(HttpStatus.OK).json({
      success: true,
      data: log,
    });
  });

  // -----------------------------------------------------------
  // GET /audit-logs/stats — aggregated counts
  // -----------------------------------------------------------
  getAuditStats = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    requireRole(actor, AUDIT_CONFIG.viewerRoles);

    const validated = runSchema(listQuerySchema, req.query);
    const filter    = buildFilter(actor, validated);

    // Aggregations run in parallel
    const [byAction, byResource, byUser, totalCount] = await Promise.all([
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: "$action",   count: { $sum: 1 } } },
        { $sort:  { count: -1 } },
        { $limit: 20 },
      ]),
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: "$resource", count: { $sum: 1 } } },
        { $sort:  { count: -1 } },
        { $limit: 20 },
      ]),
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: "$userId",   count: { $sum: 1 } } },
        { $sort:  { count: -1 } },
        { $limit: 20 },
        {
          $lookup: {
            from:         "users",
            localField:   "_id",
            foreignField: "_id",
            as:           "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id:   1,
            count: 1,
            name:  "$user.name",
            email: "$user.email",
          },
        },
      ]),
      AuditLog.countDocuments(filter),
    ]);

    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        total:      totalCount,
        byAction,
        byResource,
        byUser,
      },
      meta: {
        generatedAt: new Date().toISOString(),
      },
    });
  });

  // -----------------------------------------------------------
  // GET /audit-logs/export — download as JSON or CSV
  // -----------------------------------------------------------
  exportAuditLogs = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    requireRole(actor, AUDIT_CONFIG.exporterRoles);

    const validated = runSchema(exportQuerySchema, req.query);
    const filter    = buildFilter(actor, validated);
    const format    = validated.format ?? "json";

    // Hard cap on export size — defends against runaway downloads
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(AUDIT_CONFIG.export.maxRows)
      .populate("userId", "name email")
      .lean();

    // Log the export — it's a security-relevant data egress event
    dbLogger.warn(
      "Audit export: actor=" + actor.userId +
      " org=" + actor.organizationId +
      " format=" + format +
      " rows=" + logs.length
    );

    const filename =
      "audit-export-" + actor.organizationId +
      "-" + new Date().toISOString().split("T")[0] +
      "." + format;

    if (format === "csv") {
      const csv = toCsv(logs as unknown as Array<Record<string, unknown>>);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
      res.status(HttpStatus.OK).send(csv);
    } else {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
      res.status(HttpStatus.OK).json({
        success: true,
        exportedAt: new Date().toISOString(),
        organizationId: actor.organizationId,
        rowCount: logs.length,
        truncated: logs.length === AUDIT_CONFIG.export.maxRows,
        data: logs,
      });
    }
  });

  // -----------------------------------------------------------
  // GET /audit-logs/user/:userId — logs for a specific user
  // -----------------------------------------------------------
  getUserAuditLogs = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    requireRole(actor, AUDIT_CONFIG.viewerRoles);

    const userId = requireObjectId(req, "userId");

    const page = getNumber(req.query.page, 1, {
      min: 1,
      max: AUDIT_CONFIG.pagination.maxPage,
    });
    const limit = getNumber(
      req.query.limit,
      AUDIT_CONFIG.pagination.defaultLimit,
      { min: 1, max: AUDIT_CONFIG.pagination.maxLimit }
    );

    const filter = {
      organizationId: actor.organizationId,
      userId,
    };

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("userId", "name email")
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(HttpStatus.OK).json({
      success: true,
      data: logs,
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
  // GET /audit-logs/resource/:resource/:resourceId — logs for a specific entity
  // -----------------------------------------------------------
  getResourceAuditLogs = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const actor = requireAuth(req);
    requireRole(actor, AUDIT_CONFIG.viewerRoles);

    const resource   = String(req.params.resource ?? "").trim().toUpperCase();
    const resourceId = requireObjectId(req, "resourceId");

    if (!resource || resource.length === 0) {
      throw new AppError("Resource is required", HttpStatus.BAD_REQUEST, "MISSING_RESOURCE");
    }

    const page = getNumber(req.query.page, 1, {
      min: 1,
      max: AUDIT_CONFIG.pagination.maxPage,
    });
    const limit = getNumber(
      req.query.limit,
      AUDIT_CONFIG.pagination.defaultLimit,
      { min: 1, max: AUDIT_CONFIG.pagination.maxLimit }
    );

    const filter = {
      organizationId: actor.organizationId,
      resource,
      resourceId,
    };

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("userId", "name email")
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(HttpStatus.OK).json({
      success: true,
      data: logs,
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
}

export default new AuditController();