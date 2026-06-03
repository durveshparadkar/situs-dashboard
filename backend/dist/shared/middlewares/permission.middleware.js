import { ROLE_PERMISSIONS, } from "../rbac/permissions.js";
import { dbLogger } from "../../utils/logger.js";
// ============================================================
// CONFIG
// ============================================================
const PERMISSION_CHECK_CONFIG = {
    /**
     * Roles that bypass per-permission checks entirely.
     * SUPER_ADMIN is platform-staff — always allowed.
     */
    bypassRoles: ["SUPER_ADMIN"],
    /**
     * Whether to expose the user's actual role and required permissions
     * in the 403 response. Useful for debugging UX (frontend can show
     * "You need TEAM_DELETE permission") but leaks role structure.
     *
     * Enable in dev, disable in prod for stricter information hiding.
     */
    exposeRequiredPermissions: process.env.NODE_ENV !== "production",
};
// ============================================================
// HELPERS
// ============================================================
/**
 * Standardized auth error response. Single shape across all guard
 * failures so frontends can pattern-match without parsing strings.
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
// ============================================================
// REQUIRE PERMISSION MIDDLEWARE FACTORY
// ============================================================
/**
 * Permission-check middleware. Verifies the authenticated user's role
 * grants the listed permissions per ROLE_PERMISSIONS catalogue.
 *
 * Default mode is "any" — user passes if they have AT LEAST ONE of the
 * listed permissions. This matches the original behavior. For stricter
 * "all" semantics, use requireAllPermissions or pass { mode: "all" }.
 *
 * SUPER_ADMIN bypasses all checks per PERMISSION_CHECK_CONFIG.bypassRoles.
 *
 * Usage:
 *   router.get("/deals",         requirePermission("DEAL_READ"));
 *   router.delete("/deals/:id",  requirePermission("DEAL_DELETE", "DEAL_MANAGE"));
 *   router.post("/deals",        requirePermission(["DEAL_CREATE"], { mode: "all" }));
 */
export function requirePermission(first, ...rest) {
    // -----------------------------------------------------------
    // Normalize all call shapes into { permissions, mode }
    // -----------------------------------------------------------
    let permissions;
    let mode = "any";
    if (Array.isArray(first)) {
        permissions = first.slice();
        const opts = rest[0];
        if (opts && typeof opts === "object" && !Array.isArray(opts)) {
            mode = opts.mode ?? "any";
        }
    }
    else {
        permissions = [first];
        for (const r of rest) {
            if (typeof r === "string") {
                permissions.push(r);
            }
            else if (r && typeof r === "object" && "mode" in r) {
                mode = r.mode ?? "any";
            }
        }
    }
    // Sanitize: trim, dedupe, drop empties
    const cleaned = Array.from(new Set(permissions
        .map((p) => String(p ?? "").trim())
        .filter((p) => p.length > 0)));
    // Programmer-error guard: empty permission list = always-fail config.
    // Fail loudly at boot rather than silently letting traffic through.
    if (cleaned.length === 0) {
        throw new Error("requirePermission() requires at least one permission");
    }
    // -----------------------------------------------------------
    // Return the actual middleware
    // -----------------------------------------------------------
    return (req, res, next) => {
        const userId = getUserId(req);
        const role = getNormalizedRole(req);
        // Not authenticated
        if (!userId || !role) {
            sendAuthError(res, 401, "UNAUTHORIZED", "Authentication required");
            return;
        }
        // Fast path: bypass roles skip the permission lookup entirely
        if (PERMISSION_CHECK_CONFIG.bypassRoles.includes(role)) {
            next();
            return;
        }
        // Look up the role's permission set
        const allowedPermissions = ROLE_PERMISSIONS[role];
        if (!allowedPermissions) {
            dbLogger.warn("Permission check denied — unknown role: user=" + userId + " role=" + role);
            sendAuthError(res, 403, "INVALID_ROLE", "Invalid role configuration");
            return;
        }
        // Check access per the configured mode
        const allowedSet = new Set(allowedPermissions);
        const hasAccess = mode === "all"
            ? cleaned.every((p) => allowedSet.has(p))
            : cleaned.some((p) => allowedSet.has(p));
        if (!hasAccess) {
            const missing = cleaned.filter((p) => !allowedSet.has(p));
            dbLogger.warn("Permission deny: user=" + userId +
                " role=" + role +
                " mode=" + mode +
                " required=[" + cleaned.join(",") + "]" +
                " missing=[" + missing.join(",") + "]");
            const errorExtras = {};
            // Expose details only in dev / when configured.
            // In prod, generic "Permission denied" — don't leak permission structure.
            if (PERMISSION_CHECK_CONFIG.exposeRequiredPermissions) {
                errorExtras.required = cleaned;
                errorExtras.mode = mode;
            }
            sendAuthError(res, 403, "FORBIDDEN", "Permission denied", errorExtras);
            return;
        }
        next();
    };
}
// ============================================================
// CONVENIENCE WRAPPERS
// ============================================================
/**
 * Shorthand: user must have ANY of the listed permissions (default mode).
 * Identical to requirePermission(...), but more explicit at call sites.
 */
export function requireAnyPermission(...permissions) {
    return requirePermission(permissions, { mode: "any" });
}
/**
 * Shorthand: user must have ALL of the listed permissions.
 * Useful for endpoints requiring composite permissions, e.g. "you need
 * BOTH read AND write to use this endpoint".
 */
export function requireAllPermissions(...permissions) {
    return requirePermission(permissions, { mode: "all" });
}
export default requirePermission;
//# sourceMappingURL=permission.middleware.js.map