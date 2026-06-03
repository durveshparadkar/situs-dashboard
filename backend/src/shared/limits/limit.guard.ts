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

import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";

import Organization from "../../modules/organizations/organization.model.js";
import Team from "../../modules/teams/team.model.js";
import User from "../../modules/users/user.model.js";
import { dbLogger } from "../../utils/logger.js";
import {
  PLANS,
  getPlan,
  type PlanFeatures,
  type PlanTier,
} from "../billing/plan.js";

// ============================================================
// CONFIG
// ============================================================

const LIMIT_GUARD_CONFIG = {
  /**
   * Roles that bypass quota checks. SUPER_ADMIN is platform-staff
   * debugging customer issues — they shouldn't be blocked.
   */
  bypassRoles: ["SUPER_ADMIN"] as const,

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
  defaultPlanTier: "FREE" as PlanTier,
} as const;

// ============================================================
// TYPES
// ============================================================

interface CacheEntry<T> {
  value:     T;
  expiresAt: number;
}

interface OrgPlanContext {
  organizationId: string;
  planTier:       PlanTier;
  features:       PlanFeatures;
}

/**
 * Numeric quota keys from PlanFeatures.
 * Used by the generic guard factory.
 */
type NumericFeatureKey = {
  [K in keyof PlanFeatures & string]: PlanFeatures[K] extends number ? K : never
}[keyof PlanFeatures & string];

interface LimitGuardConfig {
  /** Which quota to enforce */
  quotaKey:       NumericFeatureKey;

  /** Human-readable resource name for error messages */
  resourceLabel:  string;

  /** Function that returns the current count for this resource */
  getCurrentCount: (organizationId: string) => Promise<number>;

  /**
   * Whether to subtract 1 from the limit before comparing.
   * Use when the guard runs BEFORE creating the new resource —
   * we want to allow N-1 existing resources so the Nth creation succeeds.
   * Default: false (creation is allowed when current < limit)
   */
  inclusive?: boolean;

  /**
   * Optional override for error code. Defaults to "QUOTA_EXCEEDED".
   */
  errorCode?: string;
}

// ============================================================
// CACHES
// ============================================================

const planCache  = new Map<string, CacheEntry<OrgPlanContext>>();
const countCache = new Map<string, CacheEntry<number>>();

function evictIfFull<T>(cache: Map<string, CacheEntry<T>>): void {
  if (cache.size < LIMIT_GUARD_CONFIG.cacheMaxEntries) return;
  const target = Math.ceil(LIMIT_GUARD_CONFIG.cacheMaxEntries * 0.1);
  let removed = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    if (++removed >= target) break;
  }
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  if (LIMIT_GUARD_CONFIG.cacheTtlMs <= 0) return null;
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
  if (LIMIT_GUARD_CONFIG.cacheTtlMs <= 0) return;
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
export function invalidateLimitCache(
  organizationId: string,
  resource?:      "plan" | "team" | "user" | "pipeline" | "deal" | "all"
): void {
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

export function invalidateAllLimitCache(): void {
  planCache.clear();
  countCache.clear();
}

// ============================================================
// HELPERS
// ============================================================

function sendLimitError(
  res:     Response,
  status:  number,
  code:    string,
  message: string,
  extra?:  Record<string, unknown>
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

function getOrgId(req: Request): string {
  const orgId = req.user?.organizationId;
  if (!orgId) return "";
  return typeof orgId === "string" ? orgId : String(orgId);
}

function getNormalizedRole(req: Request): string {
  return String(req.user?.role ?? "").trim().toUpperCase();
}

/**
 * Fetch org plan context with caching. Falls back to FREE plan on
 * missing/invalid plan tier — fail closed, never accidentally grant
 * unlimited access.
 */
async function fetchOrgPlanContext(
  organizationId: string
): Promise<OrgPlanContext | null> {
  const cached = getCached(planCache, organizationId);
  if (cached) return cached;

  const OrgModel = Organization as unknown as {
    findById: (id: string) => {
      select: (fields: string) => {
        lean: () => Promise<{ _id: unknown; plan?: string } | null>;
      };
    };
  };

  const org = await OrgModel
    .findById(organizationId)
    .select("_id plan")
    .lean();

  if (!org) return null;

  // Normalize plan tier — uppercase, validate against known plans
  const rawPlan  = String(org.plan ?? "").trim().toUpperCase();
  const planTier = (PLANS as Record<string, unknown>)[rawPlan]
    ? (rawPlan as PlanTier)
    : LIMIT_GUARD_CONFIG.defaultPlanTier;

  if (rawPlan && !planTier) {
    dbLogger.warn(
      "Org has unknown plan, falling back to " + LIMIT_GUARD_CONFIG.defaultPlanTier +
      ": org=" + organizationId + " plan=" + rawPlan
    );
  }

  const plan = getPlan(planTier);
  if (!plan) {
    // Defensive — should never happen since defaultPlanTier is hardcoded
    dbLogger.error(
      "Default plan not found in PLANS catalog: " +
      LIMIT_GUARD_CONFIG.defaultPlanTier
    );
    return null;
  }

  const context: OrgPlanContext = {
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
async function fetchCount(
  organizationId: string,
  resourceLabel:  string,
  getter:         (orgId: string) => Promise<number>
): Promise<number> {
  const cacheKey = organizationId + ":" + resourceLabel;
  const cached   = getCached(countCache, cacheKey);
  if (cached !== null) return cached;

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
export function buildLimitGuard(config: LimitGuardConfig): RequestHandler {
  const errorCode = config.errorCode ?? "QUOTA_EXCEEDED";

  return async (req: Request, res: Response, next: NextFunction) => {
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
      if ((LIMIT_GUARD_CONFIG.bypassRoles as readonly string[]).includes(role)) {
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
        dbLogger.error(
          "Invalid quota value in plan: org=" + orgId +
          " plan=" + planContext.planTier +
          " key=" + String(config.quotaKey)
        );
        sendLimitError(
          res,
          500,
          "INVALID_PLAN_CONFIG",
          "Plan quota misconfigured"
        );
        return;
      }
      const limit = limitRaw;

      // Limit of 0 means feature is disabled entirely
      if (limit <= 0) {
        sendLimitError(
          res,
          403,
          "FEATURE_GATED",
          config.resourceLabel + " is not available on your plan",
          {
            plan:          planContext.planTier,
            resource:      config.resourceLabel,
          }
        );
        return;
      }

      // -------------------------------------------------------
      // 4. FETCH CURRENT COUNT
      // -------------------------------------------------------
      const currentCount = await fetchCount(
        orgId,
        config.resourceLabel,
        config.getCurrentCount
      );

      // -------------------------------------------------------
      // 5. ENFORCE
      // -------------------------------------------------------
      const wouldExceed = config.inclusive
        ? currentCount > limit
        : currentCount >= limit;

      if (wouldExceed) {
        dbLogger.info(
          "Quota exceeded: org=" + orgId +
          " plan=" + planContext.planTier +
          " resource=" + config.resourceLabel +
          " current=" + currentCount +
          " limit=" + limit
        );

        sendLimitError(
          res,
          403,
          errorCode,
          config.resourceLabel + " limit reached. Your " + planContext.planTier +
          " plan allows " + limit + ".",
          {
            plan:     planContext.planTier,
            resource: config.resourceLabel,
            current:  currentCount,
            limit,
            upgradeAvailable: planContext.planTier !== "ENTERPRISE",
          }
        );
        return;
      }

      // Attach plan context to req for downstream consumers
      (req as Request & { planContext?: OrgPlanContext }).planContext = planContext;

      next();
    } catch (err) {
      dbLogger.error(
        "Limit guard error: resource=" + config.resourceLabel +
        " error=" + ((err as Error)?.message ?? "unknown")
      );
      sendLimitError(
        res,
        500,
        "LIMIT_CHECK_FAILED",
        "Quota check failed"
      );
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
export const checkTeamLimit: RequestHandler = buildLimitGuard({
  quotaKey:      "maxTeams",
  resourceLabel: "Team",
  errorCode:     "TEAM_LIMIT_REACHED",
  getCurrentCount: async (orgId) => {
    const TeamModel = Team as unknown as {
      countDocuments: (q: Record<string, unknown>) => Promise<number>;
    };
    return TeamModel.countDocuments({
      organizationId: orgId,
      isDeleted:      { $ne: true },
    });
  },
});

/**
 * Blocks user invitations when org has reached its maxUsers quota.
 */
export const checkUserLimit: RequestHandler = buildLimitGuard({
  quotaKey:      "maxUsers",
  resourceLabel: "User",
  errorCode:     "USER_LIMIT_REACHED",
  getCurrentCount: async (orgId) => {
    const UserModel = User as unknown as {
      countDocuments: (q: Record<string, unknown>) => Promise<number>;
    };
    return UserModel.countDocuments({
      organizationId: orgId,
      isDeleted:      { $ne: true },
      isActive:       true,
    });
  },
});

/**
 * Blocks pipeline creation when org has reached its maxPipelines quota.
 * Lazy-loads Pipeline model to avoid circular import issues.
 */
export const checkPipelineLimit: RequestHandler = buildLimitGuard({
  quotaKey:      "maxPipelines",
  resourceLabel: "Pipeline",
  errorCode:     "PIPELINE_LIMIT_REACHED",
  getCurrentCount: async (orgId) => {
    try {
      const mod = await import("../../modules/pipelines/pipeline.model.js");
      const Pipeline = mod.default as unknown as {
        countDocuments: (q: Record<string, unknown>) => Promise<number>;
      };
      return Pipeline.countDocuments({
        organizationId: orgId,
        isDeleted:      { $ne: true },
      });
    } catch (err) {
      dbLogger.warn(
        "Pipeline model not available for limit check: " +
        ((err as Error)?.message ?? "unknown")
      );
      return 0;
    }
  },
});

/**
 * Blocks deal creation when org has reached its maxActiveDeals quota.
 * Counts only ACTIVE deals (not closed/lost), matching the plan feature
 * name maxActiveDeals.
 */
export const checkActiveDealsLimit: RequestHandler = buildLimitGuard({
  quotaKey:      "maxActiveDeals",
  resourceLabel: "Active Deal",
  errorCode:     "ACTIVE_DEALS_LIMIT_REACHED",
  getCurrentCount: async (orgId) => {
    try {
      const mod = await import("../../modules/deals/deal.model.js");
      const Deal = mod.default as unknown as {
        countDocuments: (q: Record<string, unknown>) => Promise<number>;
      };
      // "Active" = not in terminal stages (WON, LOST, DISQUALIFIED)
      return Deal.countDocuments({
        organizationId: orgId,
        stage:          { $nin: ["WON", "LOST", "DISQUALIFIED"] },
        isDeleted:      { $ne: true },
      });
    } catch (err) {
      dbLogger.warn(
        "Deal model not available for limit check: " +
        ((err as Error)?.message ?? "unknown")
      );
      return 0;
    }
  },
});

// ============================================================
// QUOTA QUERY HELPERS
// For controllers that need to display "X/Y used" in UI.
// ============================================================

export interface QuotaStatus {
  resource:         string;
  current:          number;
  limit:            number;
  remaining:        number;
  percentUsed:      number;
  isAtLimit:        boolean;
  isNearLimit:      boolean;  // 80%+ used
}

/**
 * Get current quota status for a specific resource. Use in dashboard
 * endpoints to show "5 of 10 teams used".
 */
export async function getQuotaStatus(
  organizationId: string,
  quotaKey:       NumericFeatureKey,
  resourceLabel:  string,
  countFn:        (orgId: string) => Promise<number>
): Promise<QuotaStatus | null> {
  const ctx = await fetchOrgPlanContext(organizationId);
  if (!ctx) return null;

  const limitRaw = ctx.features[quotaKey];
  if (typeof limitRaw !== "number") return null;
  const limit = limitRaw;

  const current     = await fetchCount(organizationId, resourceLabel, countFn);
  const remaining   = Math.max(limit - current, 0);
  const percentUsed = limit > 0 ? Math.round((current / limit) * 100) : 0;

  return {
    resource:    resourceLabel,
    current,
    limit,
    remaining,
    percentUsed,
    isAtLimit:   current >= limit,
    isNearLimit: percentUsed >= 80,
  };
}

// ============================================================
// REQUEST AUGMENTATION
// ============================================================

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Plan context attached by limit guards. Downstream handlers
       * can read this to render plan-aware UI / responses.
       */
      planContext?: {
        organizationId: string;
        planTier:       PlanTier;
        features:       PlanFeatures;
      };
    }
  }
}

export default checkTeamLimit;










