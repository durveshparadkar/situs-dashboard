// audit.service.ts
import type { Request } from "express";
import mongoose from "mongoose";

import AuditLog from "./audit.model.js";
import { dbLogger } from "../../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const AUDIT_SERVICE_CONFIG = {
  /**
   * Whether audit failures should throw. Default: false.
   * Audit logging must NEVER break the user's operation.
   * Set true only in tests where audit emission is asserted.
   */
  throwOnFailure: process.env.AUDIT_THROW_ON_FAILURE === "true",

  /**
   * Caps to defend against bloated payloads.
   */
  caps: {
    metadataFieldLength: 10_000,
    metadataDepth:       5,
    metadataKeys:        50,
    userAgentLength:     500,
    ipLength:            100,
    actionLength:        100,
    resourceLength:      100,
    errorMessageLength:  1_000,
  },

  /**
   * Default page size for query helpers.
   */
  defaultLimit: 100,
  maxLimit:     500,

  /**
   * Fields redacted from metadata before storage.
   * Audit logs should never store secrets.
   */
  redactedFields: [
    "password",
    "newpassword",
    "currentpassword",
    "passwordhash",
    "token",
    "refreshtoken",
    "accesstoken",
    "apikey",
    "secret",
    "privatekey",
    "creditcard",
    "cardnumber",
    "cvv",
    "ssn",
  ] as const,
} as const;

// ============================================================
// TYPES
// ============================================================

export interface AuditPayload {
  /** What action was performed (e.g. "CREATE", "DELETE") */
  action:          string;

  /** Resource type (e.g. "TEAM", "DEAL", "USER") */
  resource?:       string;

  /** Specific resource ID if applicable */
  resourceId?:     string | mongoose.Types.ObjectId | null;

  /**
   * User who performed the action. Accepted as 'userId' for legacy
   * compatibility — internally maps to the model's actorId field.
   */
  userId?:         string | mongoose.Types.ObjectId | null;

  /**
   * Same as userId. Either field works — internally both map to actorId.
   * Use whichever fits your controller's naming convention.
   */
  actorId?:        string | mongoose.Types.ObjectId | null;

  /** Organization the audit belongs to (required by schema) */
  organizationId?: string | mongoose.Types.ObjectId | null;

  /**
   * Additional context — will be sanitized before storage.
   * Accepted as 'metadata' for legacy compatibility — internally
   * maps to the model's meta field.
   */
  metadata?:       Record<string, unknown>;

  /** Same as metadata. Either field works. */
  meta?:           Record<string, unknown>;

  /** Client IP */
  ip?:             string;

  /** User-Agent string */
  userAgent?:      string;

  /**
   * Express request — alternative to passing ip/userAgent directly.
   * Extracts request context (IP, user-agent, request ID).
   */
  req?:            Request;

  /** Whether the action succeeded. Defaults to true. */
  success?:        boolean;

  /** Error code/message for failed actions. */
  errorCode?:      string;
  errorMessage?:   string;
}

export interface AuditQueryFilter {
  organizationId: string | mongoose.Types.ObjectId;
  action?:        string;
  resource?:      string;
  resourceId?:    string | mongoose.Types.ObjectId;
  actorId?:       string | mongoose.Types.ObjectId;
  userId?:        string | mongoose.Types.ObjectId;
  fromDate?:      Date | string;
  toDate?:        Date | string;
}

export interface AuditQueryOptions {
  limit?:     number;
  skip?:      number;
  sortOrder?: "asc" | "desc";
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Coerce ID shapes to ObjectId. Returns null on invalid input.
 */
function toObjectId(
  value: string | mongoose.Types.ObjectId | null | undefined
): mongoose.Types.ObjectId | null {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === "string") {
    if (!mongoose.Types.ObjectId.isValid(value)) return null;
    return new mongoose.Types.ObjectId(value);
  }
  return null;
}

/**
 * Normalize an action/resource label — uppercase, trimmed, length-capped.
 */
function normalizeLabel(value: string | undefined, maxLength: number): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

/**
 * Extract client IP from request.
 */
function getClientIp(req?: Request): string {
  if (!req) return "";
  return (
    req.ip ||
    (req.socket?.remoteAddress as string | undefined) ||
    ""
  );
}

/**
 * Extract user-agent from request, length-capped.
 */
function getUserAgent(req?: Request): string {
  if (!req) return "";
  const ua = req.get?.("user-agent") ?? "";
  return String(ua).slice(0, AUDIT_SERVICE_CONFIG.caps.userAgentLength);
}

/**
 * Extract request ID set by the request logger middleware.
 */
function getRequestId(req?: Request): string | undefined {
  if (!req) return undefined;
  const reqWithId = req as Request & { requestId?: string };
  if (typeof reqWithId.requestId === "string") return reqWithId.requestId;

  const header =
    (req.headers["x-request-id"] as string | undefined) ||
    (req.headers["x-correlation-id"] as string | undefined);

  return typeof header === "string" && header.length > 0 ? header : undefined;
}

/**
 * Recursively sanitize metadata: redact sensitive fields, enforce
 * depth and key limits, truncate huge values.
 */
function sanitizeMetadata(
  meta: unknown,
  depth: number = 0
): unknown {
  if (depth > AUDIT_SERVICE_CONFIG.caps.metadataDepth) {
    return "[MAX_DEPTH_EXCEEDED]";
  }

  if (meta === null || meta === undefined) return meta;

  if (typeof meta === "string") {
    if (meta.length > AUDIT_SERVICE_CONFIG.caps.metadataFieldLength) {
      return meta.slice(0, AUDIT_SERVICE_CONFIG.caps.metadataFieldLength) +
        "...[truncated:" + meta.length + "]";
    }
    return meta;
  }

  if (typeof meta === "number" || typeof meta === "boolean") return meta;

  if (Array.isArray(meta)) {
    return meta
      .slice(0, AUDIT_SERVICE_CONFIG.caps.metadataKeys)
      .map((item) => sanitizeMetadata(item, depth + 1));
  }

  if (typeof meta === "object") {
    const obj = meta as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let count = 0;

    for (const [key, value] of Object.entries(obj)) {
      if (count >= AUDIT_SERVICE_CONFIG.caps.metadataKeys) {
        out["_truncated_"] = "Additional keys omitted (max " +
          AUDIT_SERVICE_CONFIG.caps.metadataKeys + ")";
        break;
      }

      if (
        (AUDIT_SERVICE_CONFIG.redactedFields as readonly string[]).includes(
          key.toLowerCase()
        )
      ) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeMetadata(value, depth + 1);
      }

      count++;
    }

    return out;
  }

  // Functions, symbols, etc. — never store
  return undefined;
}

/**
 * Validate required fields. Returns error message or null.
 */
function validatePayload(payload: AuditPayload): string | null {
  if (!payload.action || String(payload.action).trim().length === 0) {
    return "action is required";
  }
  if (!payload.organizationId) {
    return "organizationId is required";
  }
  return null;
}

/**
 * Convert an AuditPayload (with legacy field names) to the document
 * shape that audit.model.ts expects (actorId, meta).
 */
function buildAuditDoc(payload: AuditPayload): Record<string, unknown> | null {
  // Validate required fields
  const validationError = validatePayload(payload);
  if (validationError) {
    dbLogger.warn("Audit skipped — invalid payload: " + validationError);
    return null;
  }

  // Coerce organizationId
  const orgId = toObjectId(payload.organizationId);
  if (!orgId) {
    dbLogger.warn(
      "Audit skipped — invalid organizationId: " +
      String(payload.organizationId)
    );
    return null;
  }

  // Coerce actor — accept either 'userId' (legacy) or 'actorId' (canonical)
  const actorRaw      = payload.actorId ?? payload.userId;
  const actorObjectId = toObjectId(actorRaw);
  let actorIdString:  string | undefined;

  if (!actorObjectId && actorRaw) {
    // Non-ObjectId actor (e.g. "system", "cron-cleanup")
    actorIdString = String(actorRaw).slice(0, 100);
  }

  const resourceObjectId = toObjectId(payload.resourceId);

  // Merge legacy metadata and canonical meta fields
  const mergedMeta: Record<string, unknown> = {
    ...(payload.metadata ?? {}),
    ...(payload.meta ?? {}),
  };

  const sanitizedMeta = sanitizeMetadata(mergedMeta) as Record<string, unknown>;

  // Augment with request context
  if (actorIdString && !sanitizedMeta.actorIdString) {
    sanitizedMeta.actorIdString = actorIdString;
  }
  const requestId = getRequestId(payload.req);
  if (requestId && !sanitizedMeta.requestId) {
    sanitizedMeta.requestId = requestId;
  }
  if (payload.success === false) {
    sanitizedMeta.success = false;
    if (payload.errorCode) {
      sanitizedMeta.errorCode = payload.errorCode;
    }
    if (payload.errorMessage) {
      sanitizedMeta.errorMessage = String(payload.errorMessage)
        .slice(0, AUDIT_SERVICE_CONFIG.caps.errorMessageLength);
    }
  }

  // Build the doc using the MODEL's field names (actorId, meta)
  const doc: Record<string, unknown> = {
    organizationId: orgId,
    action:         normalizeLabel(payload.action, AUDIT_SERVICE_CONFIG.caps.actionLength),
    resource:       normalizeLabel(payload.resource, AUDIT_SERVICE_CONFIG.caps.resourceLength),
    meta:           sanitizedMeta,
    ip:             (payload.ip ?? getClientIp(payload.req)).slice(0, AUDIT_SERVICE_CONFIG.caps.ipLength),
    userAgent:      (payload.userAgent ?? getUserAgent(payload.req)).slice(0, AUDIT_SERVICE_CONFIG.caps.userAgentLength),
  };

  if (actorObjectId)    doc.actorId    = actorObjectId;
  if (resourceObjectId) doc.resourceId = resourceObjectId;

  return doc;
}

// ============================================================
// SERVICE
// ============================================================

class AuditService {

  // -----------------------------------------------------------
  // LOG A SINGLE AUDIT ENTRY
  // -----------------------------------------------------------
  /**
   * Persist a single audit log entry.
   *
   * *Failure isolation:* Errors are logged but never thrown by default —
   * audit failures must not break user operations. Override via the
   * AUDIT_THROW_ON_FAILURE env var (for tests).
   */
  async log(payload: AuditPayload): Promise<void> {
    try {
      const doc = buildAuditDoc(payload);
      if (!doc) return;

      const AuditLogModel = AuditLog as unknown as {
        create: (data: Record<string, unknown>) => Promise<unknown>;
      };

      await AuditLogModel.create(doc);
    } catch (err) {
      dbLogger.error(
        "Audit log failed: " +
        "action=" + String(payload.action) + " " +
        "resource=" + String(payload.resource ?? "") + " " +
        "error=" + ((err as Error)?.message ?? "unknown")
      );

      if (AUDIT_SERVICE_CONFIG.throwOnFailure) {
        throw err;
      }
    }
  }

  // -----------------------------------------------------------
  // BULK LOG — for high-throughput scenarios
  // -----------------------------------------------------------
  /**
   * Persist multiple audit entries in a single bulk write.
   * Use for batch operations to avoid N database round-trips.
   *
   * Same failure-isolation semantics — failures logged, never thrown.
   */
  async logBulk(payloads: AuditPayload[]): Promise<void> {
    if (!Array.isArray(payloads) || payloads.length === 0) return;

    try {
      const docs: Array<Record<string, unknown>> = [];

      for (const payload of payloads) {
        const doc = buildAuditDoc(payload);
        if (doc) docs.push(doc);
      }

      if (docs.length === 0) return;

      const AuditLogModel = AuditLog as unknown as {
        insertMany: (
          docs: Array<Record<string, unknown>>,
          options?: { ordered?: boolean }
        ) => Promise<unknown>;
      };

      await AuditLogModel.insertMany(docs, { ordered: false });
    } catch (err) {
      dbLogger.error(
        "Audit bulk log failed: count=" + payloads.length +
        " error=" + ((err as Error)?.message ?? "unknown")
      );

      if (AUDIT_SERVICE_CONFIG.throwOnFailure) {
        throw err;
      }
    }
  }

  // -----------------------------------------------------------
  // QUERY HELPERS — used by the audit controller
  // -----------------------------------------------------------

  /**
   * Build a Mongo filter from query options. Always scopes to org.
   */
  buildFilter(filter: AuditQueryFilter): Record<string, unknown> {
    const orgId = toObjectId(filter.organizationId);
    if (!orgId) {
      // Should never happen if controllers validate first, but defensive
      throw new Error("buildFilter requires a valid organizationId");
    }

    const out: Record<string, unknown> = {
      organizationId: orgId,
    };

    if (filter.action) {
      out.action = normalizeLabel(filter.action, AUDIT_SERVICE_CONFIG.caps.actionLength);
    }

    if (filter.resource) {
      out.resource = normalizeLabel(filter.resource, AUDIT_SERVICE_CONFIG.caps.resourceLength);
    }

    const resourceId = toObjectId(filter.resourceId);
    if (resourceId) {
      out.resourceId = resourceId;
    }

    // Accept either actorId or userId at the filter layer
    const actor = toObjectId(filter.actorId ?? filter.userId);
    if (actor) {
      out.actorId = actor;
    }

    if (filter.fromDate || filter.toDate) {
      const dateFilter: Record<string, Date> = {};
      if (filter.fromDate) {
        const from = new Date(filter.fromDate);
        if (!isNaN(from.getTime())) dateFilter.$gte = from;
      }
      if (filter.toDate) {
        const to = new Date(filter.toDate);
        if (!isNaN(to.getTime())) dateFilter.$lte = to;
      }
      if (Object.keys(dateFilter).length > 0) {
        out.createdAt = dateFilter;
      }
    }

    return out;
  }

  /**
   * Find audit logs with pagination.
   */
  async find(
    filter:  AuditQueryFilter,
    options: AuditQueryOptions = {}
  ): Promise<unknown[]> {
    const mongoFilter = this.buildFilter(filter);

    const limit = Math.min(
      Math.max(options.limit ?? AUDIT_SERVICE_CONFIG.defaultLimit, 1),
      AUDIT_SERVICE_CONFIG.maxLimit
    );
    const skip  = Math.max(options.skip ?? 0, 0);
    const sort  = options.sortOrder === "asc" ? 1 : -1;

    const AuditLogModel = AuditLog as unknown as {
      find: (q: Record<string, unknown>) => {
        sort: (s: Record<string, number>) => {
          skip: (n: number) => {
            limit: (n: number) => {
              populate: (path: string, fields: string) => {
                lean: () => Promise<unknown[]>;
              };
            };
          };
        };
      };
    };

    return AuditLogModel
      .find(mongoFilter)
      .sort({ createdAt: sort })
      .skip(skip)
      .limit(limit)
      .populate("actorId", "name email")
      .lean();
  }

  /**
   * Count audit logs matching the filter.
   */
  async count(filter: AuditQueryFilter): Promise<number> {
    const mongoFilter = this.buildFilter(filter);

    const AuditLogModel = AuditLog as unknown as {
      countDocuments: (q: Record<string, unknown>) => Promise<number>;
    };

    return AuditLogModel.countDocuments(mongoFilter);
  }

  /**
   * Find a single audit log by ID, scoped to org.
   */
  async findOne(
    id:             string | mongoose.Types.ObjectId,
    organizationId: string | mongoose.Types.ObjectId
  ): Promise<unknown | null> {
    const logId = toObjectId(id);
    const orgId = toObjectId(organizationId);

    if (!logId || !orgId) return null;

    const AuditLogModel = AuditLog as unknown as {
      findOne: (q: Record<string, unknown>) => {
        populate: (path: string, fields: string) => {
          lean: () => Promise<unknown | null>;
        };
      };
    };

    return AuditLogModel
      .findOne({ _id: logId, organizationId: orgId })
      .populate("actorId", "name email")
      .lean();
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

const auditService = new AuditService();

// Legacy named export — backward compatibility with existing callers.
// @deprecated Use auditService.log() directly.
export const logAudit = (payload: AuditPayload): Promise<void> =>
  auditService.log(payload);

export default auditService;
