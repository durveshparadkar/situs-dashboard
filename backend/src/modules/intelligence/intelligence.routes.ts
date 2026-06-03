// intelligence.routes.ts
//
// Routing layer for the intelligence subsystem.
//
// Security model:
//   - protect: must be authenticated
//   - tenantGuard: validates org scope, sets effectiveOrganizationId
//   - requireActiveBillingReadOnly: read endpoints work even when past_due
//   - requirePermission: READ_INSIGHTS / RUN_INTELLIGENCE permissions
//   - rate limits: separate buckets for cheap reads vs expensive refresh
//
// Performance note:
//   - GET endpoints (summary, forecast, leaks, actions) run preview mode
//     which is fast (engines are pure, single Mongo query for deals + pipeline)
//   - POST endpoints (refresh) write to DB and emit alerts — heavier work,
//     tighter rate limit

import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

import intelligenceController from "./intelligence.controller.js";

import { protect }                        from "../../shared/middlewares/auth.middleware.js";
import { tenantGuard }                    from "../../shared/middlewares/tenant.middleware.js";
import { requireActiveBillingReadOnly }   from "../../shared/billing/billing.guard.js";
import { requirePermission }              from "../../shared/middlewares/permission.middleware.js";

// ============================================================
// RATE LIMITS
// ============================================================

const keyByUserOrIp = (req: import("express").Request): string =>
  req.user?.id ?? ipKeyGenerator(req.ip ?? "unknown");

/**
 * Cheap read endpoints — dashboards may poll these on focus/refresh.
 * 60 requests / minute / user is reasonable.
 */
const readLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             60,
  standardHeaders: "draft-7",
  legacyHeaders:   false,
  keyGenerator:    keyByUserOrIp,
  message: {
    success: false,
    error: {
      code:    "RATE_LIMITED",
      message: "Too many intelligence requests — slow down a moment",
    },
  },
});

/**
 * Refresh endpoints — heavy: re-score all deals, write to DB, emit alerts.
 * 6 requests / minute / user. Users rarely need more than 1-2 per minute.
 */
const refreshLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             6,
  standardHeaders: "draft-7",
  legacyHeaders:   false,
  keyGenerator:    keyByUserOrIp,
  message: {
    success: false,
    error: {
      code:    "RATE_LIMITED",
      message: "Intelligence refresh limit exceeded — please wait a minute",
    },
  },
});

/**
 * Single-deal refresh — moderate cost. 15 requests / minute / user.
 */
const dealRefreshLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             15,
  standardHeaders: "draft-7",
  legacyHeaders:   false,
  keyGenerator:    keyByUserOrIp,
  message: {
    success: false,
    error: {
      code:    "RATE_LIMITED",
      message: "Too many deal-refresh requests",
    },
  },
});

// ============================================================
// PERMISSIONS
// ============================================================

/**
 * Cast helper for authorize-style middleware factories.
 * Matches the pattern used in your other route files.
 */
const reqPerm = requirePermission as unknown as (
  ...permissions: string[]
) => import("express").RequestHandler;

// ============================================================
// ROUTER
// ============================================================

const router = Router();

// All intelligence routes require auth + tenant scope
router.use(protect);
router.use(tenantGuard);

// ============================================================
// WRITE / MUTATING ROUTES (run first to avoid matching order issues)
// ============================================================

/**
 * POST /api/intelligence/refresh
 * Run the full orchestrator. Writes scores + emits alerts.
 */
router.post(
  "/refresh",
  refreshLimiter,
  reqPerm("RUN_INTELLIGENCE"),
  intelligenceController.refresh
);

/**
 * POST /api/intelligence/preview
 * Dry-run — same logic, no writes, no alerts.
 */
router.post(
  "/preview",
  readLimiter,
  reqPerm("READ_INSIGHTS"),
  intelligenceController.preview
);

/**
 * POST /api/intelligence/deals/:dealId/refresh
 * Re-score one deal.
 */
router.post(
  "/deals/:dealId/refresh",
  dealRefreshLimiter,
  reqPerm("RUN_INTELLIGENCE"),
  intelligenceController.refreshDeal
);

// ============================================================
// READ ROUTES
// ============================================================

/**
 * GET /api/intelligence/summary
 * Full composed result.
 */
router.get(
  "/summary",
  readLimiter,
  requireActiveBillingReadOnly,
  reqPerm("READ_INSIGHTS"),
  intelligenceController.summary
);

/**
 * GET /api/intelligence/forecast
 * Just the forecast view.
 */
router.get(
  "/forecast",
  readLimiter,
  requireActiveBillingReadOnly,
  reqPerm("READ_INSIGHTS"),
  intelligenceController.forecast
);

/**
 * GET /api/intelligence/leaks
 * Just the pipeline leaks view.
 */
router.get(
  "/leaks",
  readLimiter,
  requireActiveBillingReadOnly,
  reqPerm("READ_INSIGHTS"),
  intelligenceController.leaks
);

/**
 * GET /api/intelligence/actions
 * Just the revenue actions view.
 */
router.get(
  "/actions",
  readLimiter,
  requireActiveBillingReadOnly,
  reqPerm("READ_INSIGHTS"),
  intelligenceController.actions
);

export default router;
