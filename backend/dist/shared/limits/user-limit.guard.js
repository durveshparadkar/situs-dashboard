// checkUserLimit.middleware.ts
//
// User-quota enforcement middleware. Blocks user creation / invitation
// when the organization has reached its plan's maxUsers quota.
//
// Note: Functionally equivalent to checkUserLimit exported from
// limit.guard.ts. Both read from the canonical plans.ts source.
// Use whichever import path matches your existing route declarations —
// they should not be stacked on the same route.
import User from "../../modules/users/user.model.js";
import Organization from "../../modules/organizations/organization.model.js";
import { dbLogger } from "../../utils/logger.js";
import { PLANS, getPlan, } from "../billing/plan.js";
// ============================================================
// CONFIG
// ============================================================
const USER_LIMIT_CONFIG = {
    /**
     * Roles that bypass quota checks. SUPER_ADMIN is platform-staff
     * debugging customer issues — they shouldn't be blocked.
     */
    bypassRoles: ["SUPER_ADMIN"],
    /**
     * Cache TTL for org plan and user-count lookups. Short enough to
     * pick up plan upgrades quickly, long enough to skip DB hits on
     * hot endpoints like user invitation.
     */
    cacheTtlMs: parseInt(process.env.USER_LIMIT_CACHE_TTL_MS ?? "30000", 10),
    /** Bounded cache to prevent unbounded memory growth */
    cacheMaxEntries: 5_000,
    /**
     * Default plan to fall back to if the org's plan is invalid.
     * FREE has the most restrictive limits — fail closed.
     */
    defaultPlanTier: "FREE",
    /**
     * Whether to count only active users (excludes deactivated/deleted).
     * True = aligned with "seats in use" semantic.
     */
    countOnlyActive: true,
};
// ============================================================
// CACHES
// ============================================================
const planCache = new Map();
const countCache = new Map();
function evictIfFull(cache) {
    if (cache.size < USER_LIMIT_CONFIG.cacheMaxEntries)
        return;
    const target = Math.ceil(USER_LIMIT_CONFIG.cacheMaxEntries * 0.1);
    let removed = 0;
    for (const key of cache.keys()) {
        cache.delete(key);
        if (++removed >= target)
            break;
    }
}
function getCached(cache, key) {
    if (USER_LIMIT_CONFIG.cacheTtlMs <= 0)
        return null;
    const entry = cache.get(key);
    if (!entry)
        return null;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}
function setCached(cache, key, value) {
    if (USER_LIMIT_CONFIG.cacheTtlMs <= 0)
        return;
    evictIfFull(cache);
    cache.set(key, {
        value,
        expiresAt: Date.now() + USER_LIMIT_CONFIG.cacheTtlMs,
    });
}
/**
 * Invalidation API — call after user create/delete/deactivate
 * so the next limit check sees fresh state.
 */
export function invalidateUserLimitCache(organizationId) {
    countCache.delete(organizationId);
}
export function invalidateUserPlanCache(organizationId) {
    planCache.delete(organizationId);
}
export function invalidateAllUserLimitCache() {
    planCache.clear();
    countCache.clear();
}
// ============================================================
// HELPERS
// ============================================================
function sendLimitError(res, status, code, message, extra) {
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
function getOrgId(req) {
    const orgId = req.user?.organizationId;
    if (!orgId)
        return "";
    return typeof orgId === "string" ? orgId : String(orgId);
}
function getNormalizedRole(req) {
    return String(req.user?.role ?? "").trim().toUpperCase();
}
/**
 * Fetch org plan context with caching. Falls back to FREE plan on
 * missing/invalid plan tier — fail closed.
 */
async function fetchOrgPlanContext(organizationId) {
    const cached = getCached(planCache, organizationId);
    if (cached)
        return cached;
    const OrgModel = Organization;
    const org = await OrgModel
        .findById(organizationId)
        .select("_id plan")
        .lean();
    if (!org)
        return null;
    // Normalize plan tier, validate, fall back to FREE if unknown
    const rawPlan = String(org.plan ?? "").trim().toUpperCase();
    const planTier = PLANS[rawPlan]
        ? rawPlan
        : USER_LIMIT_CONFIG.defaultPlanTier;
    if (rawPlan && rawPlan !== planTier) {
        dbLogger.warn("Org has unknown plan, falling back to " + USER_LIMIT_CONFIG.defaultPlanTier +
            ": org=" + organizationId + " plan=" + rawPlan);
    }
    const plan = getPlan(planTier);
    if (!plan) {
        // Defensive — should never happen since defaultPlanTier is a known PlanTier
        dbLogger.error("Default plan not found in PLANS catalog: " +
            USER_LIMIT_CONFIG.defaultPlanTier);
        return null;
    }
    const context = {
        organizationId,
        planTier,
        features: plan.features,
    };
    setCached(planCache, organizationId, context);
    return context;
}
/**
 * Fetch user count for an org with caching.
 * Counts only active users when configured (default).
 */
async function fetchUserCount(organizationId) {
    const cached = getCached(countCache, organizationId);
    if (cached !== null)
        return cached;
    const filter = {
        organizationId,
    };
    if (USER_LIMIT_CONFIG.countOnlyActive) {
        filter.isDeleted = { $ne: true };
        filter.isActive = true;
    }
    const UserModel = User;
    const count = await UserModel.countDocuments(filter);
    setCached(countCache, organizationId, count);
    return count;
}
// ============================================================
// MIDDLEWARE
// ============================================================
/**
 * Blocks user creation/invitation when the org has reached its
 * maxUsers plan quota. Returns 403 with structured error so the
 * frontend can render an upgrade prompt.
 *
 * Usage:
 *   router.post(
 *     "/users",
 *     protect,
 *     authorize("CREATE_USER"),
 *     checkUserLimit,
 *     userController.createUser
 *   );
 *
 *   router.post(
 *     "/invites",
 *     protect,
 *     authorize("CREATE_INVITE"),
 *     checkUserLimit,
 *     inviteController.create
 *   );
 */
export const checkUserLimit = async (req, res, next) => {
    try {
        // -------------------------------------------------------
        // 1. AUTHENTICATION + ORG
        // -------------------------------------------------------
        const userId = getUserId(req);
        if (!userId) {
            sendLimitError(res, 401, "UNAUTHORIZED", "Authentication required");
            return;
        }
        const orgId = getOrgId(req);
        if (!orgId) {
            sendLimitError(res, 400, "NO_ORG", "No organization linked to user");
            return;
        }
        // -------------------------------------------------------
        // 2. BYPASS ROLES
        // -------------------------------------------------------
        const role = getNormalizedRole(req);
        if (USER_LIMIT_CONFIG.bypassRoles.includes(role)) {
            next();
            return;
        }
        // -------------------------------------------------------
        // 3. FETCH PLAN CONTEXT
        // -------------------------------------------------------
        const planContext = await fetchOrgPlanContext(orgId);
        if (!planContext) {
            sendLimitError(res, 404, "ORG_NOT_FOUND", "Organization not found");
            return;
        }
        const limitRaw = planContext.features.maxUsers;
        if (typeof limitRaw !== "number" || !Number.isFinite(limitRaw)) {
            dbLogger.error("Invalid maxUsers in plan: org=" + orgId +
                " plan=" + planContext.planTier);
            sendLimitError(res, 500, "INVALID_PLAN_CONFIG", "Plan quota misconfigured");
            return;
        }
        const limit = limitRaw;
        // Limit of 0 means user invitations disabled on this plan
        if (limit <= 0) {
            sendLimitError(res, 403, "FEATURE_GATED", "User invitations are not available on your plan", {
                plan: planContext.planTier,
                resource: "User",
            });
            return;
        }
        // -------------------------------------------------------
        // 4. FETCH CURRENT COUNT
        // -------------------------------------------------------
        const currentCount = await fetchUserCount(orgId);
        // -------------------------------------------------------
        // 5. ENFORCE
        // -------------------------------------------------------
        if (currentCount >= limit) {
            dbLogger.info("User quota exceeded: org=" + orgId +
                " plan=" + planContext.planTier +
                " current=" + currentCount +
                " limit=" + limit);
            sendLimitError(res, 403, "USER_LIMIT_REACHED", "User limit reached. Your " + planContext.planTier +
                " plan allows " + limit + " users.", {
                plan: planContext.planTier,
                resource: "User",
                current: currentCount,
                limit,
                upgradeAvailable: planContext.planTier !== "ENTERPRISE",
            });
            return;
        }
        // -------------------------------------------------------
        // 6. ATTACH CONTEXT + CONTINUE
        // -------------------------------------------------------
        req.planContext = planContext;
        next();
    }
    catch (err) {
        dbLogger.error("User limit guard error: " +
            (err?.message ?? "unknown"));
        sendLimitError(res, 500, "LIMIT_CHECK_FAILED", "User limit check failed");
    }
};
export default checkUserLimit;
//# sourceMappingURL=user-limit.guard.js.map