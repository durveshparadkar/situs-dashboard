// limit.guard.ts
//
// Resource quota enforcement middleware. Reads plan limits from
// plans.ts and blocks requests that would exceed them.
//
// Provides guards for each resource type:
//   - checkTeamLimit         — max teams per org
//   - checkUserLimit         — max users per org
//   - checkPipelineLimit     — max pipelines per org
//   - checkActiveDealsLimit  — max active deals per org
//
// Or build custom guards via the buildLimitGuard factory.
import Organization from "../../modules/organizations/organization.model.js";
import Team from "../../modules/teams/team.model.js";
import User from "../../modules/users/user.model.js";
import { dbLogger } from "../../utils/logger.js";
import { PLANS, getPlan, } from "../billing/plan.js";
// ============================================================
// CONFIG
// ============================================================
const LIMIT_GUARD_CONFIG = {
    /**
     * Roles that bypass quota checks. SUPER_ADMIN is platform-staff
     * debugging customer issues — they shouldn't be blocked.
     */
    bypassRoles: ["SUPER_ADMIN"],
    /**
     * Cache TTL for plan/count lookups. Short enough to pick up
     * upgrades quickly, long enough to skip DB hits on hot endpoints.
     *
     * Set to 0 to disable caching.
     */
    cacheTtlMs: parseInt(process.env.LIMIT_GUARD_CACHE_TTL_MS ?? "30000", 10),
    /** Bounded cache to prevent unbounded memory growth */
    cacheMaxEntries: 10_000,
    /**
     * Default plan to use if an org's plan is invalid or missing.
     * FREE has the most restrictive limits — fail closed by default.
     */
    defaultPlanTier: "FREE",
};
// ============================================================
// CACHES
// ============================================================
const planCache = new Map();
const countCache = new Map();
function evictIfFull(cache) {
    if (cache.size < LIMIT_GUARD_CONFIG.cacheMaxEntries)
        return;
    const target = Math.ceil(LIMIT_GUARD_CONFIG.cacheMaxEntries * 0.1);
    let removed = 0;
    for (const key of cache.keys()) {
        cache.delete(key);
        if (++removed >= target)
            break;
    }
}
function getCached(cache, key) {
    if (LIMIT_GUARD_CONFIG.cacheTtlMs <= 0)
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
    if (LIMIT_GUARD_CONFIG.cacheTtlMs <= 0)
        return;
    evictIfFull(cache);
    cache.set(key, {
        value,
        expiresAt: Date.now() + LIMIT_GUARD_CONFIG.cacheTtlMs,
    });
}
/**
 * Public cache invalidation API. Call after operations that change
 * counts (create/delete team, user, pipeline, etc.) so the next
 * limit check sees fresh state.
 */
export function invalidateLimitCache(organizationId, resource) {
    if (!resource || resource === "all") {
        planCache.delete(organizationId);
        for (const key of countCache.keys()) {
            if (key.startsWith(organizationId + ":")) {
                countCache.delete(key);
            }
        }
        return;
    }
    if (resource === "plan") {
        planCache.delete(organizationId);
        return;
    }
    countCache.delete(organizationId + ":" + resource);
}
export function invalidateAllLimitCache() {
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
 * missing/invalid plan tier — fail closed, never accidentally grant
 * unlimited access.
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
    // Normalize plan tier — uppercase, validate against known plans
    const rawPlan = String(org.plan ?? "").trim().toUpperCase();
    const planTier = PLANS[rawPlan]
        ? rawPlan
        : LIMIT_GUARD_CONFIG.defaultPlanTier;
    if (rawPlan && !planTier) {
        dbLogger.warn("Org has unknown plan, falling back to " + LIMIT_GUARD_CONFIG.defaultPlanTier +
            ": org=" + organizationId + " plan=" + rawPlan);
    }
    const plan = getPlan(planTier);
    if (!plan) {
        // Defensive — should never happen since defaultPlanTier is hardcoded
        dbLogger.error("Default plan not found in PLANS catalog: " +
            LIMIT_GUARD_CONFIG.defaultPlanTier);
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
 * Fetch and cache a resource count.
 */
async function fetchCount(organizationId, resourceLabel, getter) {
    const cacheKey = organizationId + ":" + resourceLabel;
    const cached = getCached(countCache, cacheKey);
    if (cached !== null)
        return cached;
    const count = await getter(organizationId);
    setCached(countCache, cacheKey, count);
    return count;
}
// ============================================================
// GENERIC GUARD FACTORY
// ============================================================
/**
 * Build a limit guard for any quota.
 *
 * Usage:
 *   const customGuard = buildLimitGuard({
 *     quotaKey:        "maxActiveDeals",
 *     resourceLabel:   "active deals",
 *     getCurrentCount: async (orgId) => Deal.countDocuments({ organizationId: orgId, isActive: true }),
 *   });
 */
export function buildLimitGuard(config) {
    const errorCode = config.errorCode ?? "QUOTA_EXCEEDED";
    return async (req, res, next) => {
        try {
            // -------------------------------------------------------
            // 1. AUTH + ORG
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
            if (LIMIT_GUARD_CONFIG.bypassRoles.includes(role)) {
                next();
                return;
            }
            // -------------------------------------------------------
            // 3. FETCH PLAN
            // -------------------------------------------------------
            const planContext = await fetchOrgPlanContext(orgId);
            if (!planContext) {
                sendLimitError(res, 404, "ORG_NOT_FOUND", "Organization not found");
                return;
            }
            const limitRaw = planContext.features[config.quotaKey];
            if (typeof limitRaw !== "number" || !Number.isFinite(limitRaw)) {
                dbLogger.error("Invalid quota value in plan: org=" + orgId +
                    " plan=" + planContext.planTier +
                    " key=" + String(config.quotaKey));
                sendLimitError(res, 500, "INVALID_PLAN_CONFIG", "Plan quota misconfigured");
                return;
            }
            const limit = limitRaw;
            // Limit of 0 means feature is disabled entirely
            if (limit <= 0) {
                sendLimitError(res, 403, "FEATURE_GATED", config.resourceLabel + " is not available on your plan", {
                    plan: planContext.planTier,
                    resource: config.resourceLabel,
                });
                return;
            }
            // -------------------------------------------------------
            // 4. FETCH CURRENT COUNT
            // -------------------------------------------------------
            const currentCount = await fetchCount(orgId, config.resourceLabel, config.getCurrentCount);
            // -------------------------------------------------------
            // 5. ENFORCE
            // -------------------------------------------------------
            const wouldExceed = config.inclusive
                ? currentCount > limit
                : currentCount >= limit;
            if (wouldExceed) {
                dbLogger.info("Quota exceeded: org=" + orgId +
                    " plan=" + planContext.planTier +
                    " resource=" + config.resourceLabel +
                    " current=" + currentCount +
                    " limit=" + limit);
                sendLimitError(res, 403, errorCode, config.resourceLabel + " limit reached. Your " + planContext.planTier +
                    " plan allows " + limit + ".", {
                    plan: planContext.planTier,
                    resource: config.resourceLabel,
                    current: currentCount,
                    limit,
                    upgradeAvailable: planContext.planTier !== "ENTERPRISE",
                });
                return;
            }
            // Attach plan context to req for downstream consumers
            req.planContext = planContext;
            next();
        }
        catch (err) {
            dbLogger.error("Limit guard error: resource=" + config.resourceLabel +
                " error=" + (err?.message ?? "unknown"));
            sendLimitError(res, 500, "LIMIT_CHECK_FAILED", "Quota check failed");
        }
    };
}
// ============================================================
// PRE-BUILT GUARDS
// Common quotas have ready-to-use guards.
// ============================================================
/**
 * Blocks team creation when org has reached its maxTeams quota.
 */
export const checkTeamLimit = buildLimitGuard({
    quotaKey: "maxTeams",
    resourceLabel: "Team",
    errorCode: "TEAM_LIMIT_REACHED",
    getCurrentCount: async (orgId) => {
        const TeamModel = Team;
        return TeamModel.countDocuments({
            organizationId: orgId,
            isDeleted: { $ne: true },
        });
    },
});
/**
 * Blocks user invitations when org has reached its maxUsers quota.
 */
export const checkUserLimit = buildLimitGuard({
    quotaKey: "maxUsers",
    resourceLabel: "User",
    errorCode: "USER_LIMIT_REACHED",
    getCurrentCount: async (orgId) => {
        const UserModel = User;
        return UserModel.countDocuments({
            organizationId: orgId,
            isDeleted: { $ne: true },
            isActive: true,
        });
    },
});
/**
 * Blocks pipeline creation when org has reached its maxPipelines quota.
 * Lazy-loads Pipeline model to avoid circular import issues.
 */
export const checkPipelineLimit = buildLimitGuard({
    quotaKey: "maxPipelines",
    resourceLabel: "Pipeline",
    errorCode: "PIPELINE_LIMIT_REACHED",
    getCurrentCount: async (orgId) => {
        try {
            const mod = await import("../../modules/pipelines/pipeline.model.js");
            const Pipeline = mod.default;
            return Pipeline.countDocuments({
                organizationId: orgId,
                isDeleted: { $ne: true },
            });
        }
        catch (err) {
            dbLogger.warn("Pipeline model not available for limit check: " +
                (err?.message ?? "unknown"));
            return 0;
        }
    },
});
/**
 * Blocks deal creation when org has reached its maxActiveDeals quota.
 * Counts only ACTIVE deals (not closed/lost), matching the plan feature
 * name maxActiveDeals.
 */
export const checkActiveDealsLimit = buildLimitGuard({
    quotaKey: "maxActiveDeals",
    resourceLabel: "Active Deal",
    errorCode: "ACTIVE_DEALS_LIMIT_REACHED",
    getCurrentCount: async (orgId) => {
        try {
            const mod = await import("../../modules/deals/deal.model.js");
            const Deal = mod.default;
            // "Active" = not in terminal stages (WON, LOST, DISQUALIFIED)
            return Deal.countDocuments({
                organizationId: orgId,
                stage: { $nin: ["WON", "LOST", "DISQUALIFIED"] },
                isDeleted: { $ne: true },
            });
        }
        catch (err) {
            dbLogger.warn("Deal model not available for limit check: " +
                (err?.message ?? "unknown"));
            return 0;
        }
    },
});
/**
 * Get current quota status for a specific resource. Use in dashboard
 * endpoints to show "5 of 10 teams used".
 */
export async function getQuotaStatus(organizationId, quotaKey, resourceLabel, countFn) {
    const ctx = await fetchOrgPlanContext(organizationId);
    if (!ctx)
        return null;
    const limitRaw = ctx.features[quotaKey];
    if (typeof limitRaw !== "number")
        return null;
    const limit = limitRaw;
    const current = await fetchCount(organizationId, resourceLabel, countFn);
    const remaining = Math.max(limit - current, 0);
    const percentUsed = limit > 0 ? Math.round((current / limit) * 100) : 0;
    return {
        resource: resourceLabel,
        current,
        limit,
        remaining,
        percentUsed,
        isAtLimit: current >= limit,
        isNearLimit: percentUsed >= 80,
    };
}
export default checkTeamLimit;
//# sourceMappingURL=limit.guard.js.map