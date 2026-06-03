import mongoose from "mongoose";
import { dbLogger } from "../../utils/logger.js";
// ============================================================
// CONFIG
// ============================================================
const TENANT_GUARD_CONFIG = {
    /**
     * Roles that can operate cross-tenant — typically your platform staff
     * who need to debug customer issues across org boundaries.
     *
     * SUPER_ADMIN bypasses tenant isolation by default. Be cautious adding
     * other roles here — every entry weakens multi-tenant isolation.
     */
    bypassRoles: ["SUPER_ADMIN"],
    /**
     * Whether to allow cross-tenant access when an org ID is explicitly
     * passed in the request (via header or query param). Only meaningful
     * for bypass roles — regular users can never override their org.
     *
     * Default: true (your support team needs this for customer assistance).
     */
    allowCrossTenantOverride: true,
    /**
     * Header name for explicit tenant override (used by bypass roles only).
     * Convention: X-Tenant-Override or X-Organization-Id
     */
    tenantOverrideHeader: "x-tenant-override",
    /**
     * Whether to expose detailed error reasons in non-prod environments.
     */
    exposeDetailsInDev: process.env.NODE_ENV !== "production",
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
 * Safely extract organizationId from req.user, normalizing across the
 * string vs ObjectId vs nested-object representations.
 */
function getUserOrganizationId(req) {
    const orgId = req.user?.organizationId;
    if (!orgId)
        return "";
    return String(orgId).trim();
}
/**
 * Read the tenant override header and validate it as an ObjectId.
 * Returns the validated string, or empty string if absent/invalid.
 */
function readTenantOverride(req) {
    const header = req.headers[TENANT_GUARD_CONFIG.tenantOverrideHeader];
    if (typeof header !== "string" || header.trim().length === 0) {
        return "";
    }
    const trimmed = header.trim();
    if (!mongoose.Types.ObjectId.isValid(trimmed))
        return "";
    return trimmed;
}
// ============================================================
// TENANT GUARD MIDDLEWARE
// ============================================================
/**
 * Multi-tenant isolation middleware. Validates the authenticated user
 * has a valid organization assignment and attaches the tenant context
 * to the request for downstream consumers.
 *
 * Must be registered AFTER auth middleware (which populates req.user)
 * and BEFORE any route handler that performs tenant-scoped DB queries.
 *
 * On success, req gains these fields:
 *   - req.organizationId          — actor's home organization
 *   - req.effectiveOrganizationId — scope for DB queries (= organizationId
 *                                   unless a bypass role overrode it)
 *   - req.isCrossTenantAccess     — true if a bypass role is acting on
 *                                   another org's data
 *
 * Failure modes:
 *   - 401 UNAUTHORIZED        — no authenticated user
 *   - 403 NO_ORG              — authenticated but not assigned to an org
 *   - 403 INVALID_ORG_FORMAT  — org ID isn't a valid ObjectId format
 *   - 403 CROSS_TENANT_DENIED — non-bypass role tried to override tenant
 */
export const tenantGuard = (req, res, next) => {
    // -------------------------------------------------------
    // 1. AUTHENTICATION CHECK
    // -------------------------------------------------------
    const userId = getUserId(req);
    if (!userId) {
        sendAuthError(res, 401, "UNAUTHORIZED", "Authentication required");
        return;
    }
    // -------------------------------------------------------
    // 2. ORGANIZATION ASSIGNMENT CHECK
    // -------------------------------------------------------
    const homeOrgId = getUserOrganizationId(req);
    if (!homeOrgId) {
        dbLogger.warn("Tenant guard deny — no org: user=" + userId +
            " role=" + getNormalizedRole(req));
        sendAuthError(res, 403, "NO_ORG", "Tenant access denied");
        return;
    }
    // -------------------------------------------------------
    // 3. ORGANIZATION ID FORMAT VALIDATION
    // Defends against malformed values that could cause DB errors
    // or query injection if passed unchecked to Mongoose.
    // -------------------------------------------------------
    if (!mongoose.Types.ObjectId.isValid(homeOrgId)) {
        dbLogger.error("Tenant guard error — invalid org format: user=" + userId +
            " orgId=" + homeOrgId);
        sendAuthError(res, 403, "INVALID_ORG_FORMAT", "Invalid tenant configuration");
        return;
    }
    // -------------------------------------------------------
    // 4. CROSS-TENANT OVERRIDE (BYPASS ROLES ONLY)
    // -------------------------------------------------------
    const role = getNormalizedRole(req);
    const isBypassRole = TENANT_GUARD_CONFIG.bypassRoles.includes(role);
    const overrideOrgId = TENANT_GUARD_CONFIG.allowCrossTenantOverride
        ? readTenantOverride(req)
        : "";
    let effectiveOrgId = homeOrgId;
    let isCrossTenantAccess = false;
    if (overrideOrgId) {
        if (!isBypassRole) {
            // Regular user tried to override — security violation worth logging loudly
            dbLogger.warn("Tenant guard deny — cross-tenant override attempt: " +
                "user=" + userId +
                " role=" + role +
                " homeOrg=" + homeOrgId +
                " attemptedOrg=" + overrideOrgId);
            sendAuthError(res, 403, "CROSS_TENANT_DENIED", "Cross-tenant access not permitted");
            return;
        }
        if (overrideOrgId !== homeOrgId) {
            effectiveOrgId = overrideOrgId;
            isCrossTenantAccess = true;
            // Cross-tenant access by a bypass role is a security-relevant event —
            // log it explicitly so it shows up in audit trails.
            dbLogger.warn("Cross-tenant access: actor=" + userId +
                " role=" + role +
                " homeOrg=" + homeOrgId +
                " targetOrg=" + effectiveOrgId);
        }
    }
    // -------------------------------------------------------
    // 5. ATTACH TENANT CONTEXT
    // -------------------------------------------------------
    req.organizationId = homeOrgId;
    req.effectiveOrganizationId = effectiveOrgId;
    req.isCrossTenantAccess = isCrossTenantAccess;
    next();
};
// ============================================================
// COMPANION: STRICT TENANT GUARD
// Never allows cross-tenant access, even for bypass roles.
// Use for the most sensitive endpoints (billing, ownership transfer).
// ============================================================
/**
 * Strict variant — denies cross-tenant access for ALL roles, including
 * SUPER_ADMIN. Use for endpoints where cross-tenant operations would be
 * dangerous even for platform staff (e.g. billing actions, account
 * deletion, ownership transfer).
 *
 * Usage:
 *   router.post("/billing/process", protect, tenantGuardStrict, ...);
 */
export const tenantGuardStrict = (req, res, next) => {
    const userId = getUserId(req);
    if (!userId) {
        sendAuthError(res, 401, "UNAUTHORIZED", "Authentication required");
        return;
    }
    const homeOrgId = getUserOrganizationId(req);
    if (!homeOrgId) {
        sendAuthError(res, 403, "NO_ORG", "Tenant access denied");
        return;
    }
    if (!mongoose.Types.ObjectId.isValid(homeOrgId)) {
        dbLogger.error("Tenant guard (strict) — invalid org format: user=" + userId +
            " orgId=" + homeOrgId);
        sendAuthError(res, 403, "INVALID_ORG_FORMAT", "Invalid tenant configuration");
        return;
    }
    // Reject ANY cross-tenant override attempt, regardless of role
    const overrideOrgId = readTenantOverride(req);
    if (overrideOrgId && overrideOrgId !== homeOrgId) {
        dbLogger.warn("Strict tenant guard — cross-tenant override blocked: " +
            "user=" + userId +
            " role=" + getNormalizedRole(req) +
            " homeOrg=" + homeOrgId +
            " attemptedOrg=" + overrideOrgId);
        sendAuthError(res, 403, "CROSS_TENANT_DENIED", "Cross-tenant access not permitted for this endpoint");
        return;
    }
    req.organizationId = homeOrgId;
    req.effectiveOrganizationId = homeOrgId;
    req.isCrossTenantAccess = false;
    next();
};
export default tenantGuard;
//# sourceMappingURL=tenant.middleware.js.map