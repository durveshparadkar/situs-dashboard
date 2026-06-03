// role.middleware.ts
//
// ROLE-BASED authorization middleware. Checks if the authenticated user
// holds one of the allowed ROLES (e.g. "ORG_ADMIN", "MANAGER").
//
// For PERMISSION-based checks (e.g. "CREATE_TEAM", "READ_DEAL"), import
// from auth.middleware.ts or requirePermission.middleware.ts.
import { dbLogger } from "../../utils/logger.js";
// ============================================================
// CONFIG
// ============================================================
const ROLE_MIDDLEWARE_CONFIG = {
    /**
     * Roles that bypass per-role checks entirely.
     * SUPER_ADMIN is platform-staff — always allowed.
     */
    bypassRoles: ["SUPER_ADMIN"],
    /**
     * Whether to expose the user's actual role and allowed roles
     * in the 403 response. Enabled in dev for debugging UX; disabled
     * in prod for stricter information hiding.
     */
    exposeRequiredRoles: process.env.NODE_ENV !== "production",
};
// ============================================================
// HELPERS
// ============================================================
/**
 * Standardized auth error response.
 */
function sendAuthError(res, status, code, message, extra) {
    res.status(status).json({
        success: false,
        error: {
            code,
            message,
            ...(extra && { ...extra }),
        },
    });
}
function getUserId(req) {
    const u = req.user;
    if (!u)
        return "";
    if (typeof u.id === "string" && u.id.length > 0)
        return u.id;
    if (u._id)
        return String(u._id);
    return "";
}
function getNormalizedRole(req) {
    return String(req.user?.role ?? "").trim().toUpperCase();
}
/**
 * Normalize role-list arguments from variadic OR array form into a
 * sanitized, deduplicated, uppercase array.
 */
function normalizeRoles(first, rest) {
    let collected;
    if (Array.isArray(first)) {
        collected = first.slice();
    }
    else {
        collected = [first];
    }
    for (const r of rest) {
        collected.push(r);
    }
    return Array.from(new Set(collected
        .map((r) => String(r ?? "").trim().toUpperCase())
        .filter((r) => r.length > 0)));
}
// ============================================================
// ALLOW ROLES — ALLOWLIST SEMANTICS
// ============================================================
/**
 * Role-allowlist middleware. Permits requests only when the authenticated
 * user's role appears in the allowed set. SUPER_ADMIN bypasses by default.
 *
 * Usage:
 *   router.get("/admin/audit",      allowRoles("ORG_ADMIN", "SUPER_ADMIN"));
 *   router.post("/billing/refund",  allowRoles(["ORG_ADMIN"]));
 *   router.patch("/teams/:id",      allowRoles("MANAGER", "ORG_ADMIN"));
 *
 * @param roles One or more role names. Variadic OR array form accepted.
 * @returns RequestHandler that returns 403 if user's role isn't allowed.
 */
export function allowRoles(first, ...rest) {
    const allowed = normalizeRoles(first, rest);
    if (allowed.length === 0) {
        throw new Error("allowRoles() requires at least one role");
    }
    return (req, res, next) => {
        const userId = getUserId(req);
        const role = getNormalizedRole(req);
        if (!userId || !role) {
            sendAuthError(res, 401, "UNAUTHORIZED", "Authentication required");
            return;
        }
        if (ROLE_MIDDLEWARE_CONFIG.bypassRoles.includes(role)) {
            next();
            return;
        }
        if (!allowed.includes(role)) {
            dbLogger.warn("Role allowlist deny: user=" + userId +
                " role=" + role +
                " allowed=[" + allowed.join(",") + "]");
            const extras = {};
            if (ROLE_MIDDLEWARE_CONFIG.exposeRequiredRoles) {
                extras.allowed = allowed;
            }
            sendAuthError(res, 403, "FORBIDDEN", "Access denied. Insufficient permissions.", extras);
            return;
        }
        next();
    };
}
// ============================================================
// DENY ROLES — BLOCKLIST SEMANTICS
// ============================================================
/**
 * Role-blocklist middleware. Permits requests UNLESS the authenticated
 * user's role appears in the blocked set.
 *
 * Useful when the allowlist would be long but the blocklist is short.
 * Note: SUPER_ADMIN still bypasses — they're never blocked.
 *
 * Usage:
 *   router.post("/comments", denyRoles("VIEWER", "GUEST"));
 */
export function denyRoles(first, ...rest) {
    const blocked = normalizeRoles(first, rest);
    if (blocked.length === 0) {
        throw new Error("denyRoles() requires at least one role");
    }
    return (req, res, next) => {
        const userId = getUserId(req);
        const role = getNormalizedRole(req);
        if (!userId || !role) {
            sendAuthError(res, 401, "UNAUTHORIZED", "Authentication required");
            return;
        }
        // Bypass roles always allowed (even if technically in the blocked list)
        if (ROLE_MIDDLEWARE_CONFIG.bypassRoles.includes(role)) {
            next();
            return;
        }
        if (blocked.includes(role)) {
            dbLogger.warn("Role blocklist deny: user=" + userId +
                " role=" + role +
                " blocked=[" + blocked.join(",") + "]");
            sendAuthError(res, 403, "FORBIDDEN", "Access denied for your role");
            return;
        }
        next();
    };
}
// ============================================================
// REQUIRE ROLE — ALIAS for allowRoles
// Some codebases prefer this naming. Same semantics.
// ============================================================
/**
 * Alias for allowRoles — same allowlist semantics with more imperative
 * naming. Use whichever reads better at the call site.
 */
export const requireRole = allowRoles;
export default allowRoles;
//# sourceMappingURL=role.middleware.js.map