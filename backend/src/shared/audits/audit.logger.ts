// audit.logger.ts
import type { Request } from "express";
import mongoose from "mongoose";

import AuditLog from "../../modules/audit/audit.model.js";
import { dbLogger } from "../../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const AUDIT_LOGGER_CONFIG = {
  /**
   * Whether audit failures should be allowed to throw.
   * Default: false — audit logging should NEVER break the user's operation.
   * Set true only in tests where you want to assert audit was written.
   */
  throwOnFailure: process.env.AUDIT_THROW_ON_FAILURE === "true",

  /**
   * Max length of any single meta field value (in chars after JSON.stringify).
   * Defends against huge payloads being stored as audit metadata.
   */
  maxMetaFieldLength: 10_000,

  /**
   * Max depth for meta object nesting.
   * Defends against pathological nested objects.
   */
  maxMetaDepth: 5,

  /**
   * Max number of keys in meta object at any level.
   * Defends against bloated metadata.
   */
  maxMetaKeys: 50,

  /**
   * Max user-agent string length stored.
   * Some user agents are absurdly long (1000+ chars).
   */
  maxUserAgentLength: 500,

  /**
   * Fields to redact from meta before storage.
   * Audit logs should never store secrets.
   */
  redactedMetaFields: [
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

export interface LogAuditParams {
  /** Organization the audit belongs to (multi-tenant scoping) */
  organizationId: string | mongoose.Types.ObjectId;

  /** User who performed the action */
  actorId:        string | mongoose.Types.ObjectId;

  /** What action was performed (e.g. "CREATE", "DELETE", "UPDATE") */
  action:         string;

  /** Resource type (e.g. "TEAM", "DEAL", "USER") */
  resource:       string;

  /** Specific resource ID if applicable */
  resourceId?:    string | mongoose.Types.ObjectId | null;

  /** Additional context — will be redacted/sanitized before storage */
  meta?:          Record<string, unknown>;

  /** Express request — used to extract IP, user-agent, request ID */
  req?:           Request;

  /**
   * Override request fields for cases where the audit is logged
   * outside an HTTP context (e.g. cron jobs, queue workers).
   */
  ip?:            string;
  userAgent?:     string;
  requestId?:     string;

  /**
   * Whether the action succeeded. Defaults to true.
   * Use false for "user tried but failed" events (e.g. permission denied).
   */
  success?:       boolean;

  /**
   * Optional error code/message for failed actions.
   */
  errorCode?:     string;
  errorMessage?:  string;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Convert various ID shapes to a Mongoose ObjectId. Returns null if
 * the value can't be coerced to a valid ObjectId.
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
 * Normalize an action/resource string to canonical form.
 * Uppercase, trimmed, length-capped — consistent for filtering/aggregation.
 */
function normalizeLabel(value: string, maxLength: number = 100): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

/**
 * Extract client IP from request, respecting Express's trust-proxy setting.
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
  return String(ua).slice(0, AUDIT_LOGGER_CONFIG.maxUserAgentLength);
}

/**
 * Extract request ID from request (set by your request logger middleware).
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
 * Recursively sanitize meta object: redact sensitive fields, enforce
 * depth and key-count limits, truncate huge values.
 */
function sanitizeMeta(
  meta: unknown,
  depth: number = 0
): unknown {
  if (depth > AUDIT_LOGGER_CONFIG.maxMetaDepth) {
    return "[MAX_DEPTH_EXCEEDED]";
  }

  if (meta === null || meta === undefined) return meta;

  // Primitives — truncate strings if huge
  if (typeof meta === "string") {
    if (meta.length > AUDIT_LOGGER_CONFIG.maxMetaFieldLength) {
      return meta.slice(0, AUDIT_LOGGER_CONFIG.maxMetaFieldLength) +
        "...[truncated:" + meta.length + "]";
    }
    return meta;
  }

  if (typeof meta === "number" || typeof meta === "boolean") return meta;

  // Arrays — recurse, cap length
  if (Array.isArray(meta)) {
    return meta
      .slice(0, AUDIT_LOGGER_CONFIG.maxMetaKeys)
      .map((item) => sanitizeMeta(item, depth + 1));
  }

  // Plain objects — recurse with redaction
  if (typeof meta === "object") {
    const obj = meta as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let count = 0;

    for (const [key, value] of Object.entries(obj)) {
      if (count >= AUDIT_LOGGER_CONFIG.maxMetaKeys) {
        out["_truncated_"] = "Additional keys omitted (max " +
          AUDIT_LOGGER_CONFIG.maxMetaKeys + ")";
        break;
      }

      if (
        (AUDIT_LOGGER_CONFIG.redactedMetaFields as readonly string[]).includes(
          key.toLowerCase()
        )
      ) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeMeta(value, depth + 1);
      }

      count++;
    }

    return out;
  }

  // Functions, symbols, etc. — never store
  return undefined;
}

/**
 * Validate that the required fields are present and well-formed.
 * Returns an error message if validation fails, null if OK.
 */
function validateParams(params: LogAuditParams): string | null {
  if (!params.organizationId) return "organizationId is required";
  if (!params.actorId)        return "actorId is required";
  if (!params.action || params.action.trim().length === 0) {
    return "action is required";
  }
  if (!params.resource || params.resource.trim().length === 0) {
    return "resource is required";
  }
  return null;
}

// ============================================================
// MAIN LOGGER
// ============================================================

/**
 * Persist an audit log entry to the database.
 *
 * *Failure isolation:* Audit logging failures NEVER throw by default —
 * they're logged at warn level so ops can detect them, but the user's
 * actual operation completes regardless. This is intentional: a degraded
 * audit pipeline must not break user workflows.
 *
 * Usage in a controller:
 *   await logAudit({
 *     organizationId: actor.organizationId,
 *     actorId:        actor.userId,
 *     action:         "UPDATE",
 *     resource:       "TEAM",
 *     resourceId:     teamId,
 *     meta:           { changedFields: ["name", "color"] },
 *     req,
 *   });
 *
 * Usage in a background job (no req):
 *   await logAudit({
 *     organizationId: org._id,
 *     actorId:        "system",
 *     action:         "SCHEDULED_CLEANUP",
 *     resource:       "USER",
 *     meta:           { deletedCount: 42 },
 *   });
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    // -------------------------------------------------------
    // VALIDATE
    // -------------------------------------------------------
    const validationError = validateParams(params);
    if (validationError) {
      dbLogger.warn("Audit log skipped — invalid params: " + validationError);
      if (AUDIT_LOGGER_CONFIG.throwOnFailure) {
        throw new Error("Audit log validation failed: " + validationError);
      }
      return;
    }

    // -------------------------------------------------------
    // COERCE IDS
    // -------------------------------------------------------
    const orgId = toObjectId(params.organizationId);
    if (!orgId) {
      dbLogger.warn(
        "Audit log skipped — invalid organizationId: " +
        String(params.organizationId)
      );
      if (AUDIT_LOGGER_CONFIG.throwOnFailure) {
        throw new Error("Invalid organizationId");
      }
      return;
    }

    // actorId may be a system identifier (string like "system" or "cron-job")
    // OR a valid ObjectId. Try to coerce; if not, store as string in meta.
    const actorObjectId = toObjectId(params.actorId);
    let actorIdField:    mongoose.Types.ObjectId | undefined;
    let actorIdString:   string | undefined;

    if (actorObjectId) {
      actorIdField = actorObjectId;
    } else {
      // Non-ObjectId actor (e.g. "system") — preserve as string
      actorIdString = String(params.actorId).slice(0, 100);
    }

    const resourceObjectId = params.resourceId ? toObjectId(params.resourceId) : null;

    // -------------------------------------------------------
    // BUILD METADATA
    // -------------------------------------------------------
    const sanitizedMeta = params.meta
      ? (sanitizeMeta(params.meta) as Record<string, unknown>)
      : {};

    // Augment meta with request-context fields if not already present
    if (actorIdString && !sanitizedMeta.actorIdString) {
      sanitizedMeta.actorIdString = actorIdString;
    }
    const requestId = params.requestId ?? getRequestId(params.req);
    if (requestId && !sanitizedMeta.requestId) {
      sanitizedMeta.requestId = requestId;
    }
    if (params.success === false) {
      sanitizedMeta.success = false;
      if (params.errorCode)    sanitizedMeta.errorCode    = params.errorCode;
      if (params.errorMessage) sanitizedMeta.errorMessage = String(params.errorMessage).slice(0, 1000);
    }

    // -------------------------------------------------------
    // BUILD AND SAVE
    // -------------------------------------------------------
    const doc: Record<string, unknown> = {
      organizationId: orgId,
      action:         normalizeLabel(params.action),
      resource:       normalizeLabel(params.resource),
      meta:           sanitizedMeta,
      ip:             params.ip ?? getClientIp(params.req),
      userAgent:      params.userAgent ?? getUserAgent(params.req),
    };

    if (actorIdField)      doc.actorId    = actorIdField;
    if (resourceObjectId)  doc.resourceId = resourceObjectId;

    const AuditLogModel = AuditLog as unknown as {
      create: (data: Record<string, unknown>) => Promise<unknown>;
    };

    await AuditLogModel.create(doc);
  } catch (err) {
    // -------------------------------------------------------
    // FAILURE — log but never propagate
    // -------------------------------------------------------
    dbLogger.error(
      "Audit log failed: " +
      "action=" + String(params.action) + " " +
      "resource=" + String(params.resource) + " " +
      "error=" + ((err as Error)?.message ?? "unknown")
    );

    if (AUDIT_LOGGER_CONFIG.throwOnFailure) {
      throw err;
    }
    // Silent failure — preserve user operation
  }
}

// ============================================================
// BATCH LOGGER — for high-throughput scenarios
// ============================================================

/**
 * Log multiple audit entries efficiently via a single bulk write.
 * Useful for batch operations (bulk import, bulk delete) where calling
 * logAudit N times would generate N database round-trips.
 *
 * Same failure-isolation semantics: failures are logged, never thrown.
 *
 * Usage:
 *   await logAuditBulk(
 *     userIds.map(userId => ({
 *       organizationId: actor.organizationId,
 *       actorId:        actor.userId,
 *       action:         "ADD_TO_TEAM",
 *       resource:       "USER",
 *       resourceId:     userId,
 *       req,
 *     }))
 *   );
 */
export async function logAuditBulk(entries: LogAuditParams[]): Promise<void> {
  if (!Array.isArray(entries) || entries.length === 0) return;

  try {
    const docs: Array<Record<string, unknown>> = [];

    for (const params of entries) {
      const validationError = validateParams(params);
      if (validationError) {
        dbLogger.warn(
          "Audit bulk skip entry — invalid: " + validationError
        );
        continue;
      }

      const orgId = toObjectId(params.organizationId);
      if (!orgId) continue;

      const actorObjectId = toObjectId(params.actorId);

      const resourceObjectId = params.resourceId
        ? toObjectId(params.resourceId)
        : null;

      const sanitizedMeta = params.meta
        ? (sanitizeMeta(params.meta) as Record<string, unknown>)
        : {};

      const requestId = params.requestId ?? getRequestId(params.req);
      if (requestId && !sanitizedMeta.requestId) {
        sanitizedMeta.requestId = requestId;
      }

      if (!actorObjectId) {
        sanitizedMeta.actorIdString = String(params.actorId).slice(0, 100);
      }

      const doc: Record<string, unknown> = {
        organizationId: orgId,
        action:         normalizeLabel(params.action),
        resource:       normalizeLabel(params.resource),
        meta:           sanitizedMeta,
        ip:             params.ip ?? getClientIp(params.req),
        userAgent:      params.userAgent ?? getUserAgent(params.req),
      };

      if (actorObjectId)    doc.actorId    = actorObjectId;
      if (resourceObjectId) doc.resourceId = resourceObjectId;

      docs.push(doc);
    }

    if (docs.length === 0) return;

    const AuditLogModel = AuditLog as unknown as {
      insertMany: (
        docs: Array<Record<string, unknown>>,
        options?: { ordered?: boolean }
      ) => Promise<unknown>;
    };

    // ordered: false — keep inserting even if some entries fail
    await AuditLogModel.insertMany(docs, { ordered: false });
  } catch (err) {
    dbLogger.error(
      "Audit bulk log failed: entries=" + entries.length +
      " error=" + ((err as Error)?.message ?? "unknown")
    );

    if (AUDIT_LOGGER_CONFIG.throwOnFailure) {
      throw err;
    }
  }
}

export default logAudit;