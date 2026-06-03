import rbacService from "./rbac.service.js";
import { dbLogger } from "../../utils/logger.js";
/* =====================================================
   CONFIG
===================================================== */
const RBAC_MIDDLEWARE_CONFIG = {
    /* Roles that bypass permission checks entirely.
       SUPER_ADMIN is platform-wide (your team); ORG_ADMIN owns one org. */
    bypassRoles: ["SUPER_ADMIN"],
    /* Service call timeout — defends against runaway permission lookups
       blocking the request indefinitely. */
    lookupTimeoutMs: 5_000,
};
/* =====================================================
   HELPERS
===================================================== */
/**
 * Extract userId from the authenticated request, normalizing across the
 * two possible shapes (id string or _id ObjectId/string).
 */
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
/**
 * Extract organizationId from req.user, handling both string and ObjectId.
 */
function getOrganizationId(req) {
    const u = req.user;
    if (!u)
        return "";
    return typeof u.organizationId === "string"
        ? u.organizationId
        : String(u.organizationId ?? "");
}
function getRole(req) {
    return String(req.user?.role ?? "").toUpperCase();
}
/**
 * Wrap any promise in a timeout — rejects if the underlying call
 * doesn't resolve within ms milliseconds.
 */
function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
        promise
            .then((value) => {
            clearTimeout(timer);
            resolve(value);
        })
            .catch((err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
/**
 * Coerce whatever rbacService returns (Set<string>, string[], readonly variants)
 * into a Set<string> for uniform lookup.
 */
function toPermissionSet(value) {
    if (value instanceof Set) {
        const out = new Set();
        for (const item of value)
            out.add(String(item));
        return out;
    }
    if (Array.isArray(value)) {
        return new Set(value.map((v) => String(v)));
    }
    return new Set();
}
/* =====================================================
   AUTHORIZE MIDDLEWARE FACTORY
===================================================== */
/**
 * Permission-check middleware.
 *
 * Usage:
 *   authorize("TEAM_CREATE")
 *   authorize(["TEAM_CREATE", "TEAM_UPDATE"])                  // all-of by default
 *   authorize(["TEAM_CREATE", "TEAM_UPDATE"], { mode: "any" }) // any-of
 *
 *   // Variadic form (matches the call sites in your routes files):
 *   authorize("TEAM_CREATE", "TEAM_UPDATE")
 */
export function authorize(first, ...rest) {
    /* Normalize all call shapes into { permissions, mode } */
    let permissions = [];
    let mode = "all";
    if (Array.isArray(first)) {
        permissions = first.slice();
        const opts = rest[0];
        if (opts && typeof opts === "object" && !Array.isArray(opts)) {
            mode = opts.mode ?? "all";
        }
    }
    else {
        permissions = [first];
        for (const r of rest) {
            if (typeof r === "string") {
                permissions.push(r);
            }
            else if (r && typeof r === "object" && "mode" in r) {
                mode = r.mode ?? "all";
            }
        }
    }
    /* Sanitize permission strings — uppercase, trim, dedupe, drop empties */
    const cleaned = Array.from(new Set(permissions
        .map((p) => String(p ?? "").trim().toUpperCase())
        .filter((p) => p.length > 0)));
    /* Programmer-error guard: an authorize() call with zero permissions
       should fail loudly at boot, not silently let traffic through. */
    if (cleaned.length === 0) {
        throw new Error("authorize() requires at least one permission");
    }
    /* Return the actual middleware */
    const middleware = async (req, res, next) => {
        try {
            const userId = getUserId(req);
            const organizationId = getOrganizationId(req);
            const role = getRole(req);
            if (!userId || !organizationId) {
                res.status(401).json({
                    success: false,
                    error: {
                        code: "UNAUTHORIZED",
                        message: "Authentication required",
                    },
                });
                return;
            }
            /* =====================================================
               FAST PATH — bypass roles skip permission lookup
            ===================================================== */
            if (RBAC_MIDDLEWARE_CONFIG.bypassRoles.includes(role)) {
                next();
                return;
            }
            /* =====================================================
               FETCH USER PERMISSIONS (CACHED IN SERVICE)
            ===================================================== */
            const svc = rbacService;
            const raw = await withTimeout(svc.getUserPermissions(userId, organizationId), RBAC_MIDDLEWARE_CONFIG.lookupTimeoutMs, "rbacService.getUserPermissions");
            const userPermissions = toPermissionSet(raw);
            /* =====================================================
               CHECK ACCESS
            ===================================================== */
            const hasAccess = mode === "any"
                ? cleaned.some((p) => userPermissions.has(p))
                : cleaned.every((p) => userPermissions.has(p));
            if (!hasAccess) {
                const missing = cleaned.filter((p) => !userPermissions.has(p));
                dbLogger.warn(`RBAC deny: user=${userId} org=${organizationId} role=${role} ` +
                    `mode=${mode} required=[${cleaned.join(",")}] missing=[${missing.join(",")}]`);
                res.status(403).json({
                    success: false,
                    error: {
                        code: "FORBIDDEN",
                        message: "Insufficient permissions",
                        required: cleaned,
                        mode,
                    },
                });
                return;
            }
            next();
        }
        catch (err) {
            dbLogger.error(`RBAC middleware error: ${err?.message ?? "unknown"}`);
            next(err);
        }
    };
    return middleware;
}
/* =====================================================
   CONVENIENCE WRAPPERS
===================================================== */
/**
 * Shorthand: user must have ANY of the listed permissions.
 *
 * Example:
 *   router.get("/dashboard", anyPermission("VIEW_DASHBOARD", "ADMIN_DASHBOARD"), ...);
 */
export function anyPermission(...permissions) {
    return authorize(permissions, { mode: "any" });
}
/**
 * Shorthand: user must have ALL of the listed permissions.
 *
 * Example:
 *   router.delete("/deals/:id", allPermissions("DEAL_READ", "DEAL_DELETE"), ...);
 */
export function allPermissions(...permissions) {
    return authorize(permissions, { mode: "all" });
}
/**
 * Strict role gate — checks req.user.role directly without a DB lookup.
 * Useful for routes where permission objects are overkill (e.g. /admin/*).
 *
 * Example:
 *   router.post("/billing/refund", requireAnyRole("ORG_ADMIN", "SUPER_ADMIN"), ...);
 */
export function requireAnyRole(...roles) {
    const allowed = roles.map((r) => r.toUpperCase());
    if (allowed.length === 0) {
        throw new Error("requireAnyRole() requires at least one role");
    }
    return (req, res, next) => {
        const role = getRole(req);
        if (!role) {
            res.status(401).json({
                success: false,
                error: { code: "UNAUTHORIZED", message: "Authentication required" },
            });
            return;
        }
        if (!allowed.includes(role)) {
            dbLogger.warn(`Role gate deny: user=${getUserId(req)} role=${role} required=[${allowed.join(",")}]`);
            res.status(403).json({
                success: false,
                error: {
                    code: "FORBIDDEN",
                    message: "Insufficient role",
                    required: allowed,
                },
            });
            return;
        }
        next();
    };
}
export default authorize;
//# sourceMappingURL=rbac.middleware.js.map