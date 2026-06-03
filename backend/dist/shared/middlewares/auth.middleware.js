import jwt from "jsonwebtoken";
import User from "../../modules/users/user.model.js";
import RoleModel from "../../modules/rbac/role.model.js";
import { ROLE_PERMISSIONS, isValidRole, } from "../rbac/permissions.js";
import { dbLogger } from "../../utils/logger.js";
// ============================================================
// CONFIG
// ============================================================
const AUTH_CONFIG = {
    cookieName: process.env.AUTH_COOKIE_NAME || "token",
    bearerScheme: "Bearer ",
    tokenMaxLength: 4_096,
    userLookupTimeoutMs: 5_000,
    /**
     * Roles that bypass per-permission checks entirely.
     * SUPER_ADMIN is the platform-staff role — gets everything.
     */
    bypassRoles: ["SUPER_ADMIN"],
};
// ============================================================
// HELPERS
// ============================================================
/**
 * Extract the JWT from the request. Tries cookie first (HttpOnly cookies
 * are the recommended primary auth mechanism for web sessions), then
 * Authorization: Bearer header (used for API clients and mobile).
 */
function extractToken(req) {
    // 1. HttpOnly cookie (primary)
    const cookieToken = req.cookies?.[AUTH_CONFIG.cookieName];
    if (typeof cookieToken === "string" && cookieToken.length > 0) {
        return cookieToken;
    }
    // 2. Authorization: Bearer (fallback)
    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith(AUTH_CONFIG.bearerScheme)) {
        const parts = authHeader.split(" ");
        if (parts.length === 2 && parts[1]) {
            return parts[1].trim();
        }
    }
    return undefined;
}
/**
 * Wrap any promise in a timeout — defends against slow DB lookups
 * blocking the request pipeline indefinitely.
 */
function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(label + " timed out after " + ms + "ms"));
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
 * Standardized auth error response. Single shape across all auth failures
 * so frontends can pattern-match without parsing message strings.
 */
function sendAuthError(res, status, code, message) {
    res.status(status).json({
        success: false,
        error: {
            code,
            message,
        },
    });
}
// ============================================================
// PROTECT MIDDLEWARE
// ============================================================
/**
 * Authentication middleware. Verifies the JWT, fetches the user from DB,
 * and attaches a typed user object to req.user.
 *
 * Failure modes:
 *   - 401 NO_TOKEN          — no token in cookie or Bearer header
 *   - 401 TOKEN_TOO_LARGE   — token exceeds size limit (potential abuse)
 *   - 401 TOKEN_INVALID     — token signature mismatch or malformed
 *   - 401 TOKEN_EXPIRED     — token past its exp claim
 *   - 401 USER_NOT_FOUND    — token valid but user was deleted
 *   - 401 USER_INACTIVE     — user exists but is deactivated
 *   - 500 INTERNAL_AUTH_ERR — unexpected error (logged)
 */
export const protect = async (req, res, next) => {
    try {
        // -------------------------------------------------------
        // 1. TOKEN EXTRACTION
        // -------------------------------------------------------
        const token = extractToken(req);
        if (!token) {
            sendAuthError(res, 401, "NO_TOKEN", "Authentication required");
            return;
        }
        // Defense against oversized tokens used as a DoS vector
        if (token.length > AUTH_CONFIG.tokenMaxLength) {
            sendAuthError(res, 401, "TOKEN_TOO_LARGE", "Invalid token");
            return;
        }
        // -------------------------------------------------------
        // 2. JWT VERIFICATION
        // -------------------------------------------------------
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            dbLogger.error("JWT_SECRET environment variable not configured");
            sendAuthError(res, 500, "INTERNAL_AUTH_ERR", "Authentication misconfigured");
            return;
        }
        let decoded;
        try {
            decoded = jwt.verify(token, secret);
        }
        catch (err) {
            const error = err;
            if (error?.name === "TokenExpiredError") {
                sendAuthError(res, 401, "TOKEN_EXPIRED", "Session expired. Please login again.");
                return;
            }
            if (error?.name === "NotBeforeError") {
                sendAuthError(res, 401, "TOKEN_NOT_ACTIVE", "Token not active yet");
                return;
            }
            // JsonWebTokenError covers: invalid signature, malformed, audience mismatch, etc.
            sendAuthError(res, 401, "TOKEN_INVALID", "Invalid token");
            return;
        }
        if (!decoded.id || typeof decoded.id !== "string") {
            sendAuthError(res, 401, "TOKEN_INVALID", "Token missing user identifier");
            return;
        }
        // -------------------------------------------------------
        // 3. USER FETCH (with timeout protection)
        // -------------------------------------------------------
        const UserModel = User;
        const userDoc = await withTimeout(UserModel
            .findById(decoded.id)
            .select("_id role roleId organizationId isActive isDeleted")
            .lean(), AUTH_CONFIG.userLookupTimeoutMs, "auth user lookup");
        if (!userDoc) {
            sendAuthError(res, 401, "USER_NOT_FOUND", "User no longer exists");
            return;
        }
        // Reject deactivated or soft-deleted users — token may still be valid
        // but the account has been disabled.
        if (userDoc.isDeleted === true) {
            sendAuthError(res, 401, "USER_NOT_FOUND", "User no longer exists");
            return;
        }
        if (userDoc.isActive === false) {
            dbLogger.warn("Auth denied for inactive user: id=" + String(userDoc._id));
            sendAuthError(res, 401, "USER_INACTIVE", "Account is deactivated");
            return;
        }
        // -------------------------------------------------------
        // 4. ATTACH USER TO REQUEST
        //    Populates BOTH id (new, string) and _id (legacy) so
        //    every controller works regardless of which it reads.
        // -------------------------------------------------------
        const userId = String(userDoc._id);
        const organizationId = userDoc.organizationId ? String(userDoc.organizationId) : null;
        const roleId = userDoc.roleId ? String(userDoc.roleId) : undefined;
        let role = "USER";
        if (isValidRole(userDoc.role)) {
            role = userDoc.role;
        }
        else if (roleId) {
            const roleDoc = await withTimeout(RoleModel.findById(roleId).select("name").lean(), AUTH_CONFIG.userLookupTimeoutMs, "auth role lookup");
            const roleName = roleDoc?.name;
            if (isValidRole(roleName)) {
                role = roleName;
            }
            else {
                dbLogger.warn("Auth role fallback: user=" + userId +
                    " roleId=" + roleId +
                    " roleName=" + String(roleName ?? "missing"));
            }
        }
        // Assign to req.user — typed via global augmentation
        req.user = {
            id: userId,
            _id: userId,
            role,
            organizationId: organizationId ?? "",
            ...(roleId !== undefined && { roleId }),
        };
        next();
    }
    catch (err) {
        dbLogger.error("Auth middleware error: " +
            (err?.message ?? "unknown error"));
        sendAuthError(res, 500, "INTERNAL_AUTH_ERR", "Authentication failed");
    }
};
// ============================================================
// AUTHORIZE MIDDLEWARE FACTORY
// Variadic API matches your route files:
//   authorize("READ_TEAM")
//   authorize("READ_TEAM", "UPDATE_TEAM")
//   authorize(["READ_TEAM", "UPDATE_TEAM"])
// ============================================================
/**
 * Permission-check middleware. Verifies the authenticated user's role
 * grants ALL of the listed permissions. Falls back to a "deny by default"
 * stance on any error condition.
 *
 * SUPER_ADMIN bypasses all checks per AUTH_CONFIG.bypassRoles.
 */
export function authorize(first, ...rest) {
    // Normalize: accept all three call styles into a single string[]
    let permissions;
    if (Array.isArray(first)) {
        permissions = first.slice();
    }
    else {
        permissions = [first];
    }
    for (const r of rest) {
        permissions.push(r);
    }
    // Sanitize: trim, dedupe, drop empties
    const cleaned = Array.from(new Set(permissions
        .map((p) => String(p ?? "").trim())
        .filter((p) => p.length > 0)));
    // Programmer-error guard: no perms = always-fail config.
    // Fail loudly at boot rather than silently letting traffic through.
    if (cleaned.length === 0) {
        throw new Error("authorize() requires at least one permission");
    }
    return (req, res, next) => {
        const role = req.user?.role;
        if (!role) {
            sendAuthError(res, 401, "UNAUTHORIZED", "Authentication required");
            return;
        }
        // Fast path: bypass roles skip the permission check entirely
        if (AUTH_CONFIG.bypassRoles.includes(role)) {
            next();
            return;
        }
        const allowedPermissions = ROLE_PERMISSIONS[role];
        if (!allowedPermissions) {
            dbLogger.warn("Auth deny — unknown role: user=" + String(req.user?.id ?? "anon") +
                " role=" + String(role));
            sendAuthError(res, 403, "INVALID_ROLE", "Invalid role configuration");
            return;
        }
        const hasAccess = cleaned.every((p) => allowedPermissions.includes(p));
        if (!hasAccess) {
            const missing = cleaned.filter((p) => !allowedPermissions.includes(p));
            dbLogger.warn("Auth deny — insufficient permissions: " +
                "user=" + String(req.user?.id ?? "anon") +
                " role=" + String(role) +
                " required=[" + cleaned.join(",") + "]" +
                " missing=[" + missing.join(",") + "]");
            sendAuthError(res, 403, "FORBIDDEN", "Access denied");
            return;
        }
        next();
    };
}
// ============================================================
// ROLE GATE — direct role check without DB lookup
// Useful for routes where permission objects are overkill.
// ============================================================
/**
 * Strict role gate. Verifies req.user.role is in the allowed list.
 * Doesn't hit the permission catalogue — cheaper than authorize.
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
        const role = String(req.user?.role ?? "").toUpperCase();
        if (!role) {
            sendAuthError(res, 401, "UNAUTHORIZED", "Authentication required");
            return;
        }
        if (!allowed.includes(role)) {
            dbLogger.warn("Role gate deny: user=" + String(req.user?.id ?? "anon") +
                " role=" + role + " required=[" + allowed.join(",") + "]");
            sendAuthError(res, 403, "FORBIDDEN", "Insufficient role");
            return;
        }
        next();
    };
}
export default protect;
//# sourceMappingURL=auth.middleware.js.map