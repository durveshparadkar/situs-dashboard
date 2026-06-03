// insight.routes.ts
import express from "express";
import mongoose from "mongoose";
import insightController from "./insight.controller.js";
const router = express.Router();
/* =====================================================
   MIDDLEWARE STUBS
   Replace with shared imports when ready:

     import { requireAuth }      from "../../shared/middlewares/auth.middleware.js";
     import { authorize }        from "../../shared/middlewares/rbac.middleware.js";
     import { rateLimit }        from "../../shared/middlewares/rateLimit.middleware.js";
     import { validateObjectId } from "../../shared/middlewares/validateObjectId.js";
     import { asyncHandler }     from "../../utils/asyncHandler.js";
===================================================== */
/* Auth — verifies JWT, attaches req.user via global augmentation */
const requireAuth = (_req, _res, next) => {
    next();
};
/* RBAC — restricts to specific permissions */
const authorize = (..._permissions) => (_req, _res, next) => {
    next();
};
/* Rate limiter — replace with express-rate-limit or Redis-backed limiter */
const rateLimit = (_opts) => (_req, _res, next) => {
    next();
};
/* Async wrapper — eliminates try/catch boilerplate */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
/* MongoDB ObjectId param validator */
const validateObjectId = (paramName) => (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({
            success: false,
            error: {
                code: "INVALID_ID",
                message: `Invalid ${paramName} format`,
            },
        });
        return;
    }
    next();
};
/* =====================================================
   ROLE GATES — Defense in depth
   Controller already enforces these, but route-layer rejection
   is cheaper (no DB hit, no body parsing for bulk endpoints).
===================================================== */
const MANAGER_ROLES = ["ORG_ADMIN", "SUPER_ADMIN", "MANAGER"];
const requireManager = (req, res, next) => {
    const role = String(req.user?.role ?? "").toUpperCase();
    if (!MANAGER_ROLES.includes(role)) {
        res.status(403).json({
            success: false,
            error: {
                code: "FORBIDDEN",
                message: "This endpoint is restricted to managers",
            },
        });
        return;
    }
    next();
};
/* =====================================================
   RATE LIMIT POLICIES
   Different endpoints have wildly different costs.
   Tighter limits on heavy/sensitive operations.
===================================================== */
const READ_LIMIT = rateLimit({ windowMs: 60_000, max: 120 }); // dashboard polling
const WRITE_LIMIT = rateLimit({ windowMs: 60_000, max: 30 }); // lifecycle actions
const FEEDBACK_LIMIT = rateLimit({ windowMs: 60_000, max: 20 }); // feedback submission
const BULK_LIMIT = rateLimit({ windowMs: 60_000, max: 10 }); // bulk creates
const STATS_LIMIT = rateLimit({ windowMs: 60_000, max: 30 }); // heavy aggregations
const EXPIRE_LIMIT = rateLimit({ windowMs: 60_000, max: 5 }); // maintenance op
/* =====================================================
   GLOBAL MIDDLEWARE
===================================================== */
router.use(requireAuth);
/* =====================================================
   SPECIFIC ROUTES
   IMPORTANT: more specific paths come BEFORE /:id-style routes.
   Express matches in declaration order — declaring "/" before "/me"
   would shadow it.
===================================================== */
/**
 * @route   GET /insights/me
 * @desc    Active insights assigned to the current user (daily action queue)
 * @access  Authenticated
 * @query   limit, minSeverity
 */
router.get("/me", READ_LIMIT, asyncHandler((req, res, next) => insightController.getMyInsights(req, res, next)));
/**
 * @route   GET /insights/stats
 * @desc    Aggregated stats for the org's insights dashboard
 * @access  Authenticated + READ_INSIGHT
 */
router.get("/stats", STATS_LIMIT, authorize("READ_INSIGHT"), asyncHandler((req, res, next) => insightController.getStats(req, res, next)));
/**
 * @route   POST /insights/expire-stale
 * @desc    Maintenance cleanup of expired insights (cron / admin)
 * @access  Manager+ + ADMIN_INSIGHT
 */
router.post("/expire-stale", EXPIRE_LIMIT, requireManager, authorize("ADMIN_INSIGHT"), asyncHandler((req, res, next) => insightController.expireStale(req, res, next)));
/**
 * @route   POST /insights/bulk
 * @desc    Bulk-create insights (engines, rules, cron jobs)
 * @access  Manager+ + ADMIN_INSIGHT
 */
router.post("/bulk", BULK_LIMIT, requireManager, authorize("ADMIN_INSIGHT"), asyncHandler((req, res, next) => insightController.bulkCreate(req, res, next)));
/**
 * @route   GET /insights/target/:targetType/:targetId
 * @desc    Insights about a specific entity (deal, lead, etc.)
 * @access  Authenticated + READ_INSIGHT
 */
router.get("/target/:targetType/:targetId", READ_LIMIT, authorize("READ_INSIGHT"), validateObjectId("targetId"), asyncHandler((req, res, next) => insightController.getByTarget(req, res, next)));
/* =====================================================
   COLLECTION ROUTES
===================================================== */
/**
 * @route   GET /insights
 * @desc    List org insights with pagination + filters
 * @access  Authenticated + READ_INSIGHT
 * @query   page, limit, status, category, severity, source, targetType,
 *          assignedTo, targetId, generatedAfter, generatedBefore,
 *          sortBy (generatedAt|severity|confidence), sortOrder (asc|desc)
 */
router.get("/", READ_LIMIT, authorize("READ_INSIGHT"), asyncHandler((req, res, next) => insightController.listInsights(req, res, next)));
/**
 * @route   POST /insights
 * @desc    Create a single insight (manual creation)
 * @access  Authenticated + CREATE_INSIGHT
 */
router.post("/", WRITE_LIMIT, authorize("CREATE_INSIGHT"), asyncHandler((req, res, next) => insightController.createInsight(req, res, next)));
/* =====================================================
   ITEM ROUTES (require :id validation)
===================================================== */
/**
 * @route   GET /insights/:id
 * @desc    Get a single insight by ID
 * @access  Authenticated + READ_INSIGHT
 */
router.get("/:id", READ_LIMIT, authorize("READ_INSIGHT"), validateObjectId("id"), asyncHandler((req, res, next) => insightController.getInsightById(req, res, next)));
/**
 * @route   POST /insights/:id/seen
 * @desc    Mark an insight as seen by the current user
 * @access  Authenticated
 */
router.post("/:id/seen", WRITE_LIMIT, validateObjectId("id"), asyncHandler((req, res, next) => insightController.markSeen(req, res, next)));
/**
 * @route   POST /insights/:id/act
 * @desc    Mark an insight as acted upon (rep took the recommended action)
 * @access  Authenticated
 */
router.post("/:id/act", WRITE_LIMIT, validateObjectId("id"), asyncHandler((req, res, next) => insightController.markActed(req, res, next)));
/**
 * @route   POST /insights/:id/dismiss
 * @desc    Dismiss an insight (with optional reason)
 * @access  Authenticated
 * @body    { reason?: string }
 */
router.post("/:id/dismiss", WRITE_LIMIT, validateObjectId("id"), asyncHandler((req, res, next) => insightController.dismissInsight(req, res, next)));
/**
 * @route   POST /insights/:id/snooze
 * @desc    Snooze an insight until a future date (max 90 days)
 * @access  Authenticated
 * @body    { until: ISO date string }
 */
router.post("/:id/snooze", WRITE_LIMIT, validateObjectId("id"), asyncHandler((req, res, next) => insightController.snoozeInsight(req, res, next)));
/**
 * @route   POST /insights/:id/feedback
 * @desc    Submit feedback on insight quality (ML training signal)
 * @access  Authenticated
 * @body    { rating: helpful|not_helpful|irrelevant, comment?: string }
 */
router.post("/:id/feedback", FEEDBACK_LIMIT, validateObjectId("id"), asyncHandler((req, res, next) => insightController.submitFeedback(req, res, next)));
/**
 * @route   POST /insights/:id/archive
 * @desc    Soft-delete an insight (admin/manager only)
 * @access  Manager+ + ADMIN_INSIGHT
 */
router.post("/:id/archive", WRITE_LIMIT, requireManager, authorize("ADMIN_INSIGHT"), validateObjectId("id"), asyncHandler((req, res, next) => insightController.archiveInsight(req, res, next)));
export default router;
//# sourceMappingURL=insight.routes.js.map