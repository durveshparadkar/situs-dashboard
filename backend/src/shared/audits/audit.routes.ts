// audit.routes.ts
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from "express";
import mongoose from "mongoose";

import auditController from "./audit.controller.js";
import {
  protect,
  authorize,
} from "../../shared/middlewares/auth.middleware.js";
import { dbLogger } from "../../utils/logger.js";

const router = Router();

/* =====================================================
   LOCAL MIDDLEWARE
   Replace with shared imports when ready:

     import { rateLimit }        from "../../shared/middlewares/rateLimit.middleware.js";
     import { validateObjectId } from "../../shared/middlewares/validateObjectId.js";
===================================================== */

/**
 * MongoDB ObjectId param validator — rejects malformed IDs at the route layer
 * before they hit the controller or DB.
 */
const validateObjectId = (paramName: string): RequestHandler =>
  (req, res, next) => {
    const id = req.params[paramName] as string | undefined;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        error: {
          code:    "INVALID_ID",
          message: `Invalid ${paramName} format`,
        },
      });
      return;
    }
    next();
  };

/**
 * Rate limit stub — replace with express-rate-limit or Redis-backed limiter.
 */
const rateLimit =
  (_opts: { windowMs: number; max: number }): RequestHandler =>
  (_req, _res, next) => {
    next();
  };

/* =====================================================
   ROLE GATES
   Audit logs are highly sensitive — strict admin-only access.
===================================================== */

const ADMIN_ROLES = ["ORG_ADMIN", "SUPER_ADMIN"] as const;

const requireAdmin: RequestHandler = (req, res, next) => {
  const role = String(req.user?.role ?? "").toUpperCase();
  if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
    dbLogger.warn(
      `Audit access denied: user=${req.user?.id ?? "anon"} role=${role}`
    );
    res.status(403).json({
      success: false,
      error: {
        code:    "FORBIDDEN",
        message: "Audit log access requires admin-level access",
      },
    });
    return;
  }
  next();
};

/* =====================================================
   IMPORTED MIDDLEWARE — TYPE BRIDGES
   These shared middlewares were authored with a narrower local AuthRequest.
   Bridge them via RequestHandler casts until they migrate to the global type.
===================================================== */

const protectMw = protect as unknown as RequestHandler;

const authorizeMw: (...permissions: string[]) => RequestHandler =
  authorize as unknown as (...permissions: string[]) => RequestHandler;

/* =====================================================
   PERMISSION KEY
   Falls back through tiers if AUDIT_READ permission doesn't exist yet
   in your PERMISSIONS catalogue. Use READ_AUDIT when added.
===================================================== */

const AUDIT_READ_PERM = "READ_AUDIT";

/* =====================================================
   RATE LIMIT POLICIES
   Audit logs are sensitive — limits balance compliance access against
   abuse (e.g., scraping audit history to map system activity).
===================================================== */

const READ_LIMIT      = rateLimit({ windowMs: 60_000, max: 60  }); // 60/min — admin browsing
const STATS_LIMIT     = rateLimit({ windowMs: 60_000, max: 20  }); // 20/min — aggregations expensive
const EXPORT_LIMIT    = rateLimit({ windowMs: 60 * 60_000, max: 10 }); // 10/hour — data egress
const RESOURCE_LIMIT  = rateLimit({ windowMs: 60_000, max: 30  }); // 30/min — entity history view

/* =====================================================
   GLOBAL MIDDLEWARE
   Every audit route requires authentication AND admin role.
===================================================== */

router.use(protectMw);
router.use(requireAdmin);

/* =====================================================
   SPECIAL ENDPOINTS
   IMPORTANT: declared BEFORE /:id so Express doesn't parse "stats",
   "export", "user", "resource" as ObjectIds.
===================================================== */

/**
 * @route   GET /audit-logs/stats
 * @desc    Aggregated audit log statistics (by action, resource, user)
 * @access  Admin+ + READ_AUDIT
 * @query   action, resource, resourceId, userId, fromDate, toDate, search
 * @rateLimit 20/min — aggregation is expensive
 */
router.get(
  "/stats",
  STATS_LIMIT,
  authorizeMw(AUDIT_READ_PERM),
  auditController.getAuditStats
);

/**
 * @route   GET /audit-logs/export
 * @desc    Download audit logs as JSON or CSV (max 10,000 rows)
 * @access  Admin+ + READ_AUDIT
 * @query   action, resource, resourceId, userId, fromDate, toDate, format=json|csv
 * @rateLimit 10/hour — data egress, security-sensitive
 */
router.get(
  "/export",
  EXPORT_LIMIT,
  authorizeMw(AUDIT_READ_PERM),
  auditController.exportAuditLogs
);

/**
 * @route   GET /audit-logs/user/:userId
 * @desc    Audit log history for a specific user
 * @access  Admin+ + READ_AUDIT
 */
router.get(
  "/user/:userId",
  RESOURCE_LIMIT,
  authorizeMw(AUDIT_READ_PERM),
  validateObjectId("userId"),
  auditController.getUserAuditLogs
);

/**
 * @route   GET /audit-logs/resource/:resource/:resourceId
 * @desc    Audit log history for a specific entity (e.g. /resource/DEAL/abc123)
 * @access  Admin+ + READ_AUDIT
 */
router.get(
  "/resource/:resource/:resourceId",
  RESOURCE_LIMIT,
  authorizeMw(AUDIT_READ_PERM),
  validateObjectId("resourceId"),
  auditController.getResourceAuditLogs
);

/* =====================================================
   COLLECTION + ITEM ROUTES
===================================================== */

/**
 * @route   GET /audit-logs
 * @desc    Paginated audit log listing with filters
 * @access  Admin+ + READ_AUDIT
 * @query   page, limit, action, resource, resourceId, userId,
 *          fromDate, toDate, search, sortOrder
 */
router.get(
  "/",
  READ_LIMIT,
  authorizeMw(AUDIT_READ_PERM),
  auditController.getAuditLogs
);

/**
 * @route   GET /audit-logs/:id
 * @desc    Single audit log entry by ID
 * @access  Admin+ + READ_AUDIT
 */
router.get(
  "/:id",
  READ_LIMIT,
  authorizeMw(AUDIT_READ_PERM),
  validateObjectId("id"),
  auditController.getAuditLogById
);

export default router;
