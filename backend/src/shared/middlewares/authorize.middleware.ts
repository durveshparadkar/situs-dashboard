// authorize.middleware.ts
//
// ROLE-BASED authorization. Checks if the authenticated user holds one
// of the allowed ROLES (e.g. "ORG_ADMIN", "MANAGER").
//
// For PERMISSION-based checks (e.g. "CREATE_TEAM", "READ_DEAL"), import
// authorize from auth.middleware.ts instead.
//
// Both files export a function called authorize — they are different.
// Always check the import path at call sites.

import type {
  Request,
  Response,
  RequestHandler,
} from "express";

import { dbLogger } from "../../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const ROLE_GUARD_CONFIG = {
  /**
   * Roles that bypass per-role checks entirely.
   * SUPER_ADMIN is platform-staff — always allowed.
   */
  bypassRoles: ["SUPER_ADMIN"] as const,
} as const;

// ============================================================
// HELPERS
// ============================================================

/**
 * Standardized auth error response. Single shape across all guard
 * failures so frontends can pattern-match without parsing strings.
 */
function sendAuthError(
  res: Response,
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
): void {
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(extra && { ...extra }),
    },
  });
}

function getUserId(req: Request): string {
  const u = req.user;
  if (!u) return "";
  if (typeof u.id === "string" && u.id.length > 0) return u.id;
  if (u._id) return String(u._id);
  return "";
}

function getRole(req: Request): string {
  return String(req.user?.role ?? "").toUpperCase();
}

// ============================================================
// ROLE-BASED AUTHORIZATION FACTORY
// ============================================================

/**
 * Role-gate middleware. Allows requests only if the authenticated user's
 * role matches one of the listed roles. SUPER_ADMIN bypasses by default.
 *
 * Usage:
 *   router.post("/billing/refund", authorize("ORG_ADMIN", "SUPER_ADMIN"), ...);
 *   router.get("/admin/audit",     authorize(["ORG_ADMIN"]), ...);
 *
 * @param roles One or more role names. Variadic OR array form accepted.
 * @returns RequestHandler that returns 403 if the user's role isn't allowed.
 */
export function authorize(
  first: string | string[],
  ...rest: string[]
): RequestHandler {
  // Normalize all call styles into a single string[]
  let allRoles: string[];
  if (Array.isArray(first)) {
    allRoles = first.slice();
  } else {
    allRoles = [first];
  }
  for (const r of rest) {
    allRoles.push(r);
  }

  // Sanitize: uppercase, trim, dedupe, drop empties
  const allowed = Array.from(
    new Set(
      allRoles
        .map((r) => String(r ?? "").trim().toUpperCase())
        .filter((r) => r.length > 0)
    )
  );

  // Programmer-error guard: empty role list = always-fail config.
  // Fail loudly at boot rather than silently letting traffic through.
  if (allowed.length === 0) {
    throw new Error("authorize() requires at least one role");
  }

  return (req, res, next) => {
    const userId = getUserId(req);
    const role   = getRole(req);

    // Not authenticated
    if (!userId || !role) {
      sendAuthError(res, 401, "UNAUTHORIZED", "Not authenticated");
      return;
    }

    // Fast path: bypass roles skip the check
    if ((ROLE_GUARD_CONFIG.bypassRoles as readonly string[]).includes(role)) {
      next();
      return;
    }

    // Role mismatch
    if (!allowed.includes(role)) {
      dbLogger.warn(
        "Role-gate deny: user=" + userId +
        " role=" + role +
        " required=[" + allowed.join(",") + "]"
      );

      sendAuthError(
        res,
        403,
        "FORBIDDEN",
        "Access denied. Insufficient permissions.",
        { required: allowed }
      );
      return;
    }

    next();
  };
}

export default authorize;

