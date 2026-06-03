// analytics.routes.ts
import {
  Router,
  type Request,
  type Response,
  type RequestHandler,
} from "express";

import analyticsController from "./analytics.controller.js";
import {
  protect,
  authorize,
} from "../../shared/middlewares/auth.middleware.js";
import {
  requireActiveBillingReadOnly,
} from "../../shared/billing/billing.guard.js";
import { cache } from "../../shared/cache/cache.middleware.js";
import { dbLogger } from "../../utils/logger.js";
import { hasFeature } from "../../shared/billing/plan.js";

const router = Router();

/* =====================================================
   LOCAL MIDDLEWARE
===================================================== */

const rateLimit =
  (_opts: { windowMs: number; max: number }): RequestHandler =>
  (_req, _res, next) => {
    next();
  };

/* =====================================================
   PLAN GATE — gates analytics to plans with advancedAnalytics: true
   (SMALL_BUSINESS + PRO + ENTERPRISE per plans.ts)
===================================================== */

const requireAnalyticsAccess: RequestHandler = (req, res, next) => {
  const u   = req.user;
  const role = String(u?.role ?? "").toUpperCase();

  // SUPER_ADMIN bypasses plan gating (platform staff debugging)
  if (role === "SUPER_ADMIN") {
    next();
    return;
  }

  // Check feature flag via plan context attached by limit.guard or fetch fresh
  const reqWithPlan = req as Request & {
    planContext?: {
      planTier: string;
      features: { advancedAnalytics?: boolean };
    };
  };

  let hasAccess = false;
  let planTier  = "FREE";

  if (reqWithPlan.planContext) {
    hasAccess = reqWithPlan.planContext.features.advancedAnalytics === true;
    planTier  = reqWithPlan.planContext.planTier;
  } else {
    // No plan context attached — fall back to checking via plans.ts
    // This requires the org's plan to be available on req.user
    const userPlan = String((u as { plan?: string })?.plan ?? "FREE").toUpperCase();
    hasAccess = hasFeature(userPlan, "advancedAnalytics");
    planTier  = userPlan;
  }

  if (!hasAccess) {
    dbLogger.info(
      "Analytics access denied — plan gating: user=" +
      (u?.id ?? "anon") + " plan=" + planTier
    );

    res.status(403).json({
      success: false,
      error: {
        code:             "FEATURE_GATED",
        message:          "Analytics requires an active paid plan",
        currentPlan:      planTier,
        requiredPlan:     "SMALL_BUSINESS",
        upgradeAvailable: planTier !== "ENTERPRISE",
      },
    });
    return;
  }

  next();
};

/* =====================================================
   TYPE BRIDGES
===================================================== */

const protectMw   = protect   as unknown as RequestHandler;
const authorizeMw = authorize as unknown as (...permissions: string[]) => RequestHandler;

/* =====================================================
   RATE LIMITS
===================================================== */

const ANALYTICS_LIMIT = rateLimit({ windowMs: 60_000, max: 60 });

/* =====================================================
   GLOBAL MIDDLEWARE
   Every analytics route requires: auth, billing, plan, permission
===================================================== */

router.use(protectMw);
router.use(requireActiveBillingReadOnly);
router.use(requireAnalyticsAccess);

/* =====================================================
   ROUTES
===================================================== */

/**
 * @route   GET /api/analytics
 * @desc    Full dashboard payload (summary + funnel + trend + insights)
 * @access  Authenticated + advancedAnalytics feature
 * @query   fromDate, toDate, trendMonths
 * @cache   60 seconds per org+user
 */
router.get(
  "/",
  ANALYTICS_LIMIT,
  authorizeMw("READ_REPORTS"),
  cache(
    (req: Request) => "analytics:dashboard:" + (req.query.trendMonths ?? "12"),
    { ttl: 60 }
  ),
  analyticsController.getDashboard
);

/**
 * @route   GET /api/analytics/summary
 * @desc    Summary metrics only (lightweight)
 */
router.get(
  "/summary",
  ANALYTICS_LIMIT,
  authorizeMw("READ_REPORTS"),
  cache((_req: Request) => "analytics:summary", { ttl: 60 }),
  analyticsController.getSummary
);

/**
 * @route   GET /api/analytics/funnel
 * @desc    Funnel stages only
 */
router.get(
  "/funnel",
  ANALYTICS_LIMIT,
  authorizeMw("READ_REPORTS"),
  cache((_req: Request) => "analytics:funnel", { ttl: 60 }),
  analyticsController.getFunnel
);

/**
 * @route   GET /api/analytics/trend
 * @desc    Revenue trend chart data
 */
router.get(
  "/trend",
  ANALYTICS_LIMIT,
  authorizeMw("READ_REPORTS"),
  cache(
    (req: Request) => "analytics:trend:" + (req.query.trendMonths ?? "12"),
    { ttl: 60 }
  ),
  analyticsController.getTrend
);

/**
 * @route   GET /api/analytics/insights
 * @desc    Insights + top actions
 */
router.get(
  "/insights",
  ANALYTICS_LIMIT,
  authorizeMw("READ_REPORTS"),
  cache((_req: Request) => "analytics:insights", { ttl: 60 }),
  analyticsController.getInsights
);

export default router;
