// alert.routes.ts
//
// Routes for alert management. Alerts surface in the notification panel
// and represent decision-engine outputs (deal at risk, stalled lead),
// billing events (past-due, trial expiring), and system events.
//
// Route order is critical: specific paths (/stats, /unread-count,
// /bulk/*, /read-all) MUST come before /:id to avoid Express routing
// /stats as id="stats".
import { Router, } from "express";
import AlertController from "./alert.controller.js";
import { protect, authorize, } from "../../shared/middlewares/auth.middleware.js";
import { tenantGuard } from "../../shared/middlewares/tenant.middleware.js";
import { requireActiveBillingReadOnly } from "../../shared/billing/billing.guard.js";
const router = Router();
/* =====================================================
   LOCAL MIDDLEWARE STUB
   Replace with real rate-limit when Redis-backed limiter
   is available in shared/middlewares/rateLimit.middleware.ts
===================================================== */
const rateLimit = (_opts) => (_req, _res, next) => {
    next();
};
/* =====================================================
   TYPE BRIDGES
===================================================== */
const protectMw = protect;
const authorizeMw = authorize;
/* =====================================================
   RATE LIMITS
   Different endpoints have different cost profiles
===================================================== */
// General reads — high frequency, low cost
const ALERT_READ_LIMIT = rateLimit({ windowMs: 60_000, max: 120 });
// Unread badge — polled frequently by the frontend, separate bucket
const UNREAD_COUNT_LIMIT = rateLimit({ windowMs: 60_000, max: 240 });
// Stats — heavier aggregation, lower limit
const ALERT_STATS_LIMIT = rateLimit({ windowMs: 60_000, max: 30 });
// Single-alert mutations
const ALERT_MUTATION_LIMIT = rateLimit({ windowMs: 60_000, max: 60 });
// Bulk mutations — destructive, tightest limit
const BULK_MUTATION_LIMIT = rateLimit({ windowMs: 60_000, max: 20 });
// Mark-all-read — destructive across whole org, tight limit
const MARK_ALL_LIMIT = rateLimit({ windowMs: 60_000, max: 10 });
/* =====================================================
   GLOBAL MIDDLEWARE
   Every alert route requires:
     - auth (req.user)
     - tenant scope (req.effectiveOrganizationId)
     - billing not unpaid (soft-degrade allows reads when past-due)
===================================================== */
router.use(protectMw);
router.use(tenantGuard);
router.use(requireActiveBillingReadOnly);
/* =====================================================
   READ ENDPOINTS
   Order matters: specific paths first, then parameterized.
===================================================== */
/**
 * @route   GET /api/alerts/unread-count
 * @desc    Lightweight unread badge count.
 * @access  Authenticated (any role)
 */
router.get("/unread-count", UNREAD_COUNT_LIMIT, authorizeMw("READ_ALERTS"), AlertController.getUnreadCount);
/**
 * @route   GET /api/alerts/stats
 * @desc    Aggregated stats: counts by severity, status, type.
 * @access  Authenticated + READ_ALERTS permission
 */
router.get("/stats", ALERT_STATS_LIMIT, authorizeMw("READ_ALERTS"), AlertController.getAlertStats);
/**
 * @route   GET /api/alerts
 * @desc    Paginated, filterable listing.
 * @access  Authenticated + READ_ALERTS permission
 * @query   page, limit, status, severity, type, isRead, fromDate, toDate, sortOrder
 */
router.get("/", ALERT_READ_LIMIT, authorizeMw("READ_ALERTS"), AlertController.getAlerts);
/**
 * @route   GET /api/alerts/:id
 * @desc    Single alert lookup (tenant-scoped).
 * @access  Authenticated + READ_ALERTS permission
 */
router.get("/:id", ALERT_READ_LIMIT, authorizeMw("READ_ALERTS"), AlertController.getAlertById);
/* =====================================================
   BULK MUTATIONS
   These come BEFORE /:id routes so bulk paths don't get
   interpreted as IDs.
===================================================== */
/**
 * @route   PATCH /api/alerts/bulk/read
 * @desc    Mark multiple alerts as read.
 * @body    { alertIds: string[] }
 * @access  Authenticated + UPDATE_ALERTS permission
 */
router.patch("/bulk/read", BULK_MUTATION_LIMIT, authorizeMw("UPDATE_ALERTS"), AlertController.bulkMarkAsRead);
/**
 * @route   PATCH /api/alerts/bulk/resolve
 * @desc    Resolve multiple alerts.
 * @body    { alertIds: string[] }
 * @access  Authenticated + UPDATE_ALERTS permission
 */
router.patch("/bulk/resolve", BULK_MUTATION_LIMIT, authorizeMw("UPDATE_ALERTS"), AlertController.bulkResolve);
/**
 * @route   DELETE /api/alerts/bulk
 * @desc    Bulk delete alerts (soft delete).
 * @body    { alertIds: string[] }
 * @access  Authenticated + DELETE_ALERTS permission
 */
router.delete("/bulk", BULK_MUTATION_LIMIT, authorizeMw("DELETE_ALERTS"), AlertController.bulkDelete);
/* =====================================================
   ORG-WIDE MUTATION
===================================================== */
/**
 * @route   PATCH /api/alerts/read-all
 * @desc    Mark every unread alert in the org as read.
 * @access  Authenticated + UPDATE_ALERTS permission
 */
router.patch("/read-all", MARK_ALL_LIMIT, authorizeMw("UPDATE_ALERTS"), AlertController.markAllAsRead);
/* =====================================================
   SINGLE-ALERT MUTATIONS
   These MUST come last — parameterized paths catch anything
   not matched above.
===================================================== */
/**
 * @route   PATCH /api/alerts/:id/read
 * @desc    Mark a single alert as read.
 * @access  Authenticated + UPDATE_ALERTS permission
 */
router.patch("/:id/read", ALERT_MUTATION_LIMIT, authorizeMw("UPDATE_ALERTS"), AlertController.markAsRead);
/**
 * @route   PATCH /api/alerts/:id/resolve
 * @desc    Resolve a single alert.
 * @access  Authenticated + UPDATE_ALERTS permission
 */
router.patch("/:id/resolve", ALERT_MUTATION_LIMIT, authorizeMw("UPDATE_ALERTS"), AlertController.resolveAlert);
/**
 * @route   DELETE /api/alerts/:id
 * @desc    Soft-delete a single alert.
 * @access  Authenticated + DELETE_ALERTS permission
 */
router.delete("/:id", ALERT_MUTATION_LIMIT, authorizeMw("DELETE_ALERTS"), AlertController.deleteAlert);
/* =====================================================
   EXPORT
===================================================== */
export default router;
//# sourceMappingURL=alert.routes.js.map