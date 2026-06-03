// core/index.ts
//
// Barrel for the core subsystem. Exports cross-cutting types and
// utility helpers used throughout the application.
//
// What lives in core/:
//   - types/express.d.ts    : Express augmentation (req.user etc.)
//   - types/common.ts       : shared utility types (if you add them)
//   - errors/AppError.ts    : custom error classes (if you add them)
//   - helpers/asyncHandler  : if you keep it here vs utils/
//
// This barrel re-exports the PUBLIC surface of core. Internal helpers
// stay internal. Add new exports here as the core subsystem grows.
//
// Usage:
//   import {
//     type AuthenticatedRequest,
//     type AuthenticatedUser,
//     type RequestContext,
//   } from "./core/index.js";

// ============================================================
// EXPRESS TYPES
// ============================================================

/**
 * Re-export the types from express.d.ts so consumers can import from
 * core/index.js without going deeper. Pure type re-exports — no
 * runtime cost.
 *
 * Note: the global declare global { namespace Express { ... } } block
 * in express.d.ts is automatically active when any module imports
 * something from that file. This re-export ensures the augmentation
 * is loaded even when consumers only import via the barrel.
 */
export type {
  AuthenticatedUser,
  AuthSource,
  PlanContext,
  BillingState,
  RequestContext,
  RateLimitInfo,
  ValidatedInput,
  AuthenticatedRequest,
  OptionalAuthRequest,
  ValidatedRequest,
  WebhookRequest,
} from "../types/express.d.js";

// ============================================================
// CONSTANTS
// ============================================================

/**
 * Re-export application constants (HTTP codes, error codes, pagination,
 * etc.) so core/ is a one-stop barrel for shared primitives.
 *
 * If your constants.ts lives at src/constants.ts, import from there.
 * If you move it under core/, update this path.
 */
export {
  HTTP_STATUS,
  HTTP_METHODS,
  HEADERS,
  CONTENT_TYPES,
  ERROR_CODES,
  PAGINATION,
  SORT_ORDERS,
  TIME,
  SIZE_LIMITS,
  COOKIE_NAMES,
  CACHE_KEY_PREFIXES,
  REGEX,
  SENSITIVE_FIELDS,
  ENVIRONMENTS,
  REQUEST_ID,
  API_VERSION,
  LOCALE_DEFAULTS,
  INR_THRESHOLDS,
  type HttpStatusCode,
  type HttpMethod,
  type ErrorCode,
  type SortOrder,
  type Environment,
} from "../../config/constants.js";

// ============================================================
// RBAC VOCABULARY
// ============================================================

/**
 * Re-export the canonical RBAC vocabulary so any module needing
 * Role / Permission types can import from core. Keeps consumers from
 * reaching deep into shared/rbac/.
 *
 * Single source of truth lives in permissions.ts — this is just a
 * re-export, not a duplicate definition.
 */
export {
  PERMISSIONS,
  PERMISSION_GROUP,
  PERMISSION_TO_GROUP,
  ROLES,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  RESERVED_ROLE_NAMES,
  ALL_PERMISSIONS,
  ALL_ROLES,
  ALL_PERMISSION_GROUPS,
  isValidPermission,
  isValidRole,
  isValidPermissionGroup,
  normalizePermission,
  normalizeRole,
  getPermissionsForRole,
  roleHasPermission,
  getPermissionsInGroup,
  compareRoleAuthority,
  isSeniorRole,
  isReservedRoleName,
  type Permission,
  type Role,
  type PermissionGroup,
} from "../../shared/rbac/permissions.js";

// ============================================================
// APP ERROR
// ============================================================

/**
 * Cross-cutting AppError class. Used by every controller to throw
 * structured errors that the global error middleware can translate
 * into HTTP responses with proper status codes and error codes.
 *
 * Why here instead of utils/: AppError is a CORE primitive — every
 * layer uses it. Keeping it in core/ signals that.
 *
 * Why a class (not just an interface): need instanceof AppError
 * checks in the error middleware to distinguish our errors from
 * library errors and unknown errors.
 *
 * Usage:
 *   throw new AppError("Deal not found", 404, "DEAL_NOT_FOUND");
 *   throw new AppError("Validation failed", 400, "VALIDATION_ERROR", { issues });
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code:       string;
  public readonly details?:   unknown;
  public readonly isOperational: boolean;

  constructor(
    message:    string,
    statusCode: number  = 500,
    code:       string  = "APP_ERROR",
    details?:   unknown
  ) {
    super(message);
    this.name           = "AppError";
    this.statusCode     = statusCode;
    this.code           = code;
    this.isOperational  = true; // distinguishes from programmer errors
    if (details !== undefined) {
      this.details = details;
    }

    // Capture stack trace, omitting the constructor frame
    if (typeof Error.captureStackTrace === "function") {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to a plain JSON shape suitable for HTTP responses.
   * Used by the global error middleware.
   */
  toJSON(): {
    success: false;
    error: {
      code:    string;
      message: string;
      details?: unknown;
    };
  } {
    const errorPayload: {
      code:    string;
      message: string;
      details?: unknown;
    } = {
      code:    this.code,
      message: this.message,
    };

    if (this.details !== undefined) {
      errorPayload.details = this.details;
    }

    return {
      success: false,
      error:   errorPayload,
    };
  }
}

// ============================================================
// COMMON APP ERROR FACTORIES
// Avoid new AppError(...) repetition at call sites.
// ============================================================

/**
 * 401 Unauthorized — caller is not authenticated.
 */
export function unauthorizedError(message: string = "Authentication required"): AppError {
  return new AppError(message, 401, "UNAUTHORIZED");
}

/**
 * 403 Forbidden — caller is authenticated but lacks permission.
 */
export function forbiddenError(message: string = "Forbidden"): AppError {
  return new AppError(message, 403, "FORBIDDEN");
}

/**
 * 404 Not Found — resource doesn't exist (or caller can't see it).
 */
export function notFoundError(resource: string = "Resource"): AppError {
  return new AppError(resource + " not found", 404, "NOT_FOUND");
}

/**
 * 400 Bad Request — input validation failed.
 */
export function validationError(message: string, details?: unknown): AppError {
  return new AppError(message, 400, "VALIDATION_ERROR", details);
}

/**
 * 409 Conflict — resource state conflicts with the request.
 */
export function conflictError(message: string, details?: unknown): AppError {
  return new AppError(message, 409, "CONFLICT", details);
}

/**
 * 429 Too Many Requests — rate limit hit.
 */
export function rateLimitedError(retryAfter?: number): AppError {
  return new AppError(
    "Too many requests",
    429,
    "RATE_LIMITED",
    retryAfter !== undefined ? { retryAfter } : undefined
  );
}

/**
 * 500 Internal Server Error — unexpected failure.
 */
export function internalError(message: string = "Internal server error"): AppError {
  return new AppError(message, 500, "INTERNAL_ERROR");
}

// ============================================================
// ASYNC HANDLER
// ============================================================

import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";

/**
 * Wrap an async route handler so unhandled promise rejections flow
 * through Express's error middleware instead of crashing the process.
 *
 * Without this, an async handler that throws bypasses Express's
 * error pipeline entirely — Node logs "unhandled rejection" and the
 * request hangs until the client times out.
 *
 * Usage:
 *   router.get("/deals", asyncHandler(async (req, res) => {
 *     const deals = await dealService.list(req.user.organizationId);
 *     res.json({ success: true, data: deals });
 *   }));
 *
 * Typed variant for routes that need AuthenticatedRequest:
 *   router.get("/me",
 *     protect,
 *     asyncHandler<AuthenticatedRequest>(async (req, res) => {
 *       res.json({ user: req.user });  // user typed as AuthenticatedUser
 *     })
 *   );
 */
export function asyncHandler<R extends Request = Request>(
  fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as R, res, next)).catch(next);
  };
}

// ============================================================
// TYPE GUARDS
// ============================================================

/**
 * Check whether an unknown value is an AppError.
 * Use in error middleware to distinguish our errors from library errors.
 */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * Check whether an error is operational (expected business error)
 * versus a programmer error (bug, crash). Operational errors get
 * formatted responses; programmer errors get logged + generic 500.
 */
export function isOperationalError(value: unknown): boolean {
  return value instanceof AppError && value.isOperational === true;
}