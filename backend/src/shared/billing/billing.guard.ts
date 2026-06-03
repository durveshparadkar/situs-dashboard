// billing.guard.ts
import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";

import Organization from "../../modules/organizations/organization.model.js";
import { dbLogger } from "../../utils/logger.js";
import { getPlan } from "./plan.js";

// ============================================================
// CONFIG
// ============================================================

const BILLING_GUARD_CONFIG = {
  /**
   * Roles that bypass billing checks entirely.
   * SUPER_ADMIN is platform-staff debugging customer issues —
   * they shouldn't be blocked by a customer's expired plan.
   */
  bypassRoles: ["SUPER_ADMIN"] as const,

  /**
   * In-memory cache TTL for organization billing lookups.
   * 30 seconds is short enough to pick up plan changes quickly,
   * long enough to skip DB hits on hot endpoints.
   *
   * Set to 0 to disable caching (recommended for billing-write endpoints).
   */
  cacheTtlMs: parseInt(process.env.BILLING_GUARD_CACHE_TTL_MS ?? "30000", 10),

  /**
   * Max entries in the in-memory cache to prevent unbounded growth.
   */
  cacheMaxEntries: 10_000,

  /**
   * Whether to auto-expire trials when this guard detects an expired one.
   * In production, prefer a scheduled job for state transitions; this
   * is a fallback if the job is delayed.
   */
  autoExpireTrials: process.env.BILLING_AUTO_EXPIRE_TRIALS !== "false",

  /**
   * Grace period in days for past-due subscriptions when no graceUntil
   * is explicitly set on the org. Provides a safety net.
   */
  defaultGraceDays: parseInt(process.env.BILLING_DEFAULT_GRACE_DAYS ?? "3", 10),
} as const;

// ============================================================
// BILLING STATE CONSTANTS
// ============================================================

const BillingState = {
  ACTIVE:   "ACTIVE",
  TRIAL:    "TRIAL",
  PAST_DUE: "PAST_DUE",
  CANCELED: "CANCELED",
  PAUSED:   "PAUSED",        // Stripe pause feature
  UNPAID:   "UNPAID",        // Final payment-failed state
} as const;

type BillingState = (typeof BillingState)[keyof typeof BillingState];

const ResponseCode = {
  TRIAL_EXPIRED:   "TRIAL_EXPIRED",
  GRACE_EXPIRED:   "GRACE_EXPIRED",
  CANCELED:        "CANCELED",
  PAUSED:          "PAUSED",
  UNPAID:          "UNPAID",
  NOT_CONFIGURED:  "NOT_CONFIGURED",
  INVALID_STATE:   "INVALID_STATE",
  NO_ORG:          "NO_ORG",
  ORG_NOT_FOUND:   "ORG_NOT_FOUND",
  UNAUTHORIZED:    "UNAUTHORIZED",
  CHECK_FAILED:    "CHECK_FAILED",
} as const;

// ============================================================
// TYPES
// ============================================================

interface OrgBillingState {
  _id:             string;
  plan?:           string | undefined;
  billingStatus?:  string | undefined;
  trialEndsAt?:    Date | null | undefined;
  graceUntil?:     Date | null | undefined;
  isTrial?:        boolean | undefined;
}

interface BillingGuardOptions {
  /**
   * If true, the guard allows access during PAST_DUE state even after
   * grace period — but flags the request via req.billingDegraded.
   * Use for read-only endpoints that should remain accessible to
   * customers whose payment failed (lets them see their data while
   * being prompted to update billing).
   */
  allowDegradedRead?: boolean;

  /**
   * If true, skip caching for this specific guard instance.
   * Use on write endpoints where stale state would be problematic.
   */
  skipCache?: boolean;
}

// ============================================================
// REQUEST AUGMENTATION
// ============================================================

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * True when the guard allowed access despite a degraded billing
       * state (e.g. past-due during grace). Downstream code can use this
       * to render banners or restrict actions.
       */
      billingDegraded?: boolean;

      /** Snapshot of the org's billing state when the guard ran */
      billingState?:    string;
    }
  }
}

// ============================================================
// CACHE
// ============================================================

interface CacheEntry {
  state:     OrgBillingState;
  expiresAt: number;
}

const billingCache = new Map<string, CacheEntry>();

function evictIfFull(): void {
  if (billingCache.size < BILLING_GUARD_CONFIG.cacheMaxEntries) return;

  const target = Math.ceil(BILLING_GUARD_CONFIG.cacheMaxEntries * 0.1);
  let removed = 0;
  for (const key of billingCache.keys()) {
    billingCache.delete(key);
    if (++removed >= target) break;
  }
}

function getCached(orgId: string): OrgBillingState | null {
  if (BILLING_GUARD_CONFIG.cacheTtlMs <= 0) return null;
  const entry = billingCache.get(orgId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    billingCache.delete(orgId);
    return null;
  }
  return entry.state;
}

function setCached(orgId: string, state: OrgBillingState): void {
  if (BILLING_GUARD_CONFIG.cacheTtlMs <= 0) return;
  evictIfFull();
  billingCache.set(orgId, {
    state,
    expiresAt: Date.now() + BILLING_GUARD_CONFIG.cacheTtlMs,
  });
}

/**
 * Public cache-invalidation API. Call after billing changes (subscription
 * controller's checkout, change-plan, cancel methods should invoke this
 * after a successful Stripe operation).
 */
export function invalidateBillingCache(orgId: string): void {
  billingCache.delete(orgId);
}

export function invalidateAllBillingCache(): void {
  billingCache.clear();
}

// ============================================================
// HELPERS
// ============================================================

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
  if (typeof orgId === "string") return orgId;
  return String(orgId);
}

function getNormalizedRole(req: Request): string {
  return String(req.user?.role ?? "").trim().toUpperCase();
}

function sendBillingError(
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

/**
 * Fetch the organization's billing state, using cache when available.
 */
async function fetchOrgBillingState(
  orgId: string,
  skipCache: boolean
): Promise<OrgBillingState | null> {
  if (!skipCache) {
    const cached = getCached(orgId);
    if (cached) return cached;
  }

  const OrgModel = Organization as unknown as {
    findById: (id: string) => {
      select: (fields: string) => {
        lean: () => Promise<{
          _id:             unknown;
          plan?:           string;
          billingStatus?:  string;
          trialEndsAt?:    Date | null;
          graceUntil?:     Date | null;
          isTrial?:        boolean;
        } | null>;
      };
    };
  };

  const org = await OrgModel
    .findById(orgId)
    .select("_id plan billingStatus trialEndsAt graceUntil isTrial")
    .lean();

  if (!org) return null;

  const state: OrgBillingState = {
    _id:           String(org._id),
    plan:          org.plan,
    billingStatus: org.billingStatus,
    trialEndsAt:   org.trialEndsAt ?? null,
    graceUntil:    org.graceUntil  ?? null,
    isTrial:       org.isTrial,
  };

  setCached(orgId, state);
  return state;
}

/**
 * Update the org's status when a trial is detected expired.
 * Fire-and-forget — failures logged but don't block the request flow.
 */
async function markTrialExpired(orgId: string): Promise<void> {
  try {
    const OrgModel = Organization as unknown as {
      findByIdAndUpdate: (id: string, update: Record<string, unknown>) => Promise<unknown>;
    };

    await OrgModel.findByIdAndUpdate(orgId, {
      billingStatus: BillingState.PAST_DUE,
      isTrial:       false,
    });

    invalidateBillingCache(orgId);

    dbLogger.info("Trial auto-expired: org=" + orgId);
  } catch (err) {
    dbLogger.warn(
      "Failed to auto-expire trial: org=" + orgId +
      " err=" + ((err as Error)?.message ?? "unknown")
    );
  }
}

// ============================================================
// MAIN GUARD FACTORY
// ============================================================

/**
 * Build a billing guard middleware. Options let you tune behavior
 * per route (e.g. allow read access during grace period).
 *
 * Usage:
 *   router.use(requireActiveBilling);  // strict default
 *   router.use(requireActiveBilling({ allowDegradedRead: true }));  // permissive reads
 */
export function buildBillingGuard(
  options: BillingGuardOptions = {}
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // -------------------------------------------------------
      // 1. AUTHENTICATION
      // -------------------------------------------------------
      const userId = getUserId(req);
      if (!userId) {
        sendBillingError(res, 401, ResponseCode.UNAUTHORIZED, "Authentication required");
        return;
      }

      const orgId = getOrgId(req);
      if (!orgId) {
        dbLogger.warn(
          "Billing guard deny — no org: user=" + userId
        );
        sendBillingError(
          res,
          401,
          ResponseCode.NO_ORG,
          "No organization linked to user"
        );
        return;
      }

      // -------------------------------------------------------
      // 2. BYPASS ROLES (PLATFORM STAFF)
      // -------------------------------------------------------
      const role = getNormalizedRole(req);
      if ((BILLING_GUARD_CONFIG.bypassRoles as readonly string[]).includes(role)) {
        next();
        return;
      }

      // -------------------------------------------------------
      // 3. FETCH ORG STATE
      // -------------------------------------------------------
      const org = await fetchOrgBillingState(orgId, options.skipCache ?? false);

      if (!org) {
        sendBillingError(
          res,
          400,
          ResponseCode.ORG_NOT_FOUND,
          "Organization not found"
        );
        return;
      }

      const now           = new Date();
      const billingStatus = (org.billingStatus ?? "").trim().toUpperCase();

      // Set state on req for downstream consumers
      req.billingState = billingStatus;
      const plan = getPlan(org.plan) ?? getPlan("FREE")!;
      req.planContext = {
        organizationId: org._id,
        planTier: plan.tier,
        features: plan.features,
      };

      // -------------------------------------------------------
      // 4. STATE DECISIONS
      // -------------------------------------------------------

      // No billing configured at all
      if (!billingStatus) {
        sendBillingError(
          res,
          402,
          ResponseCode.NOT_CONFIGURED,
          "Billing not configured for organization"
        );
        return;
      }

      // ACTIVE — happy path
      if (billingStatus === BillingState.ACTIVE) {
        next();
        return;
      }

      // TRIAL — check expiry
      if (billingStatus === BillingState.TRIAL) {
        if (!org.trialEndsAt) {
          dbLogger.error(
            "Trial configuration missing trialEndsAt: org=" + orgId
          );
          sendBillingError(
            res,
            500,
            ResponseCode.NOT_CONFIGURED,
            "Trial configuration missing. Contact support."
          );
          return;
        }

        if (new Date(org.trialEndsAt) > now) {
          // Trial still active — pass through
          next();
          return;
        }

        // Trial expired — auto-expire and respond
        if (BILLING_GUARD_CONFIG.autoExpireTrials) {
          // Fire-and-forget — don't block response on the update
          void markTrialExpired(orgId);
        }

        dbLogger.info(
          "Trial expired access denied: org=" + orgId +
          " user=" + userId +
          " endedAt=" + new Date(org.trialEndsAt).toISOString()
        );

        sendBillingError(
          res,
          402,
          ResponseCode.TRIAL_EXPIRED,
          "Trial expired. Please upgrade your plan.",
          { trialEndedAt: org.trialEndsAt }
        );
        return;
      }

      // PAST_DUE — check grace period
      if (billingStatus === BillingState.PAST_DUE) {
        let graceUntil = org.graceUntil ? new Date(org.graceUntil) : null;

        // Fallback grace if not explicitly set
        if (!graceUntil) {
          // No graceUntil set — apply default from creation of past_due
          // Note: this is a fallback. Better to set graceUntil on the org
          // when transitioning to PAST_DUE in your webhook handler.
          graceUntil = null;
        }

        if (graceUntil && graceUntil > now) {
          // Within grace period
          if (options.allowDegradedRead) {
            req.billingDegraded = true;
            res.setHeader(
              "X-Billing-Status",
              "degraded:past_due_grace"
            );
            next();
            return;
          }
          // Strict mode: allow but mark degraded
          req.billingDegraded = true;
          res.setHeader(
            "X-Billing-Status",
            "degraded:past_due_grace"
          );
          next();
          return;
        }

        // Grace expired or not set
        if (options.allowDegradedRead) {
          // Read-only mode — let it through but flag as degraded
          req.billingDegraded = true;
          res.setHeader("X-Billing-Status", "degraded:grace_expired");
          next();
          return;
        }

        dbLogger.info(
          "Past-due access denied: org=" + orgId +
          " user=" + userId +
          (graceUntil ? " graceUntil=" + graceUntil.toISOString() : " graceUntil=null")
        );

        sendBillingError(
          res,
          402,
          ResponseCode.GRACE_EXPIRED,
          "Billing inactive. Upgrade to continue.",
          graceUntil ? { graceEndedAt: graceUntil } : undefined
        );
        return;
      }

      // CANCELED — terminal state
      if (billingStatus === BillingState.CANCELED) {
        if (options.allowDegradedRead) {
          req.billingDegraded = true;
          res.setHeader("X-Billing-Status", "canceled");
          next();
          return;
        }

        dbLogger.info(
          "Canceled access denied: org=" + orgId + " user=" + userId
        );

        sendBillingError(
          res,
          402,
          ResponseCode.CANCELED,
          "Subscription canceled. Upgrade to continue."
        );
        return;
      }

      // PAUSED — Stripe pause feature
      if (billingStatus === BillingState.PAUSED) {
        sendBillingError(
          res,
          402,
          ResponseCode.PAUSED,
          "Subscription is paused. Resume to continue."
        );
        return;
      }

      // UNPAID — final payment-failed state (after grace exhausted)
      if (billingStatus === BillingState.UNPAID) {
        dbLogger.warn(
          "Unpaid access denied: org=" + orgId + " user=" + userId
        );

        sendBillingError(
          res,
          402,
          ResponseCode.UNPAID,
          "Subscription unpaid. Please update payment to continue."
        );
        return;
      }

      // Unknown state — fail closed
      dbLogger.error(
        "Unknown billing state: org=" + orgId +
        " status=" + billingStatus
      );

      sendBillingError(
        res,
        402,
        ResponseCode.INVALID_STATE,
        "Invalid billing state. Contact support.",
        { billingStatus }
      );
    } catch (err) {
      dbLogger.error(
        "Billing guard error: " +
        ((err as Error)?.message ?? "unknown")
      );
      sendBillingError(
        res,
        500,
        ResponseCode.CHECK_FAILED,
        "Billing check failed"
      );
    }
  };
}

// ============================================================
// DEFAULT EXPORT — backward compatibility
// ============================================================

/**
 * Default billing guard with strict policy (no degraded reads).
 * For permissive read-only access during billing issues, use:
 *   buildBillingGuard({ allowDegradedRead: true })
 */
export const requireActiveBilling: RequestHandler = buildBillingGuard();

/**
 * Read-friendly variant — allows access during grace/canceled states
 * with req.billingDegraded = true set for downstream consumers.
 * Use on GET routes where customers should still see their data
 * while being prompted to fix billing.
 */
export const requireActiveBillingReadOnly: RequestHandler = buildBillingGuard({
  allowDegradedRead: true,
});

export default requireActiveBilling;
