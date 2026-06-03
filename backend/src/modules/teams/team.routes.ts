// team.routes.ts
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from "express";
import mongoose from "mongoose";

import teamController from "./team.controller.js";
import {
  protect,
  authorize,
} from "../../shared/middlewares/auth.middleware.js";
import { requireActiveBilling } from "../../shared/billing/billing.guard.js";
import { checkTeamLimit } from "../../shared/limits/limit.guard.js";
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
   ROLE GATE — MANAGER+ FOR SENSITIVE OPS
   Defense in depth: controller also enforces this, but
   route-layer rejection is cheaper (no body parsing).
===================================================== */

const MANAGER_ROLES = ["ORG_ADMIN", "SUPER_ADMIN", "MANAGER"] as const;
const ADMIN_ROLES   = ["ORG_ADMIN", "SUPER_ADMIN"] as const;

const requireManager: RequestHandler = (req, res, next) => {
  const role = String(req.user?.role ?? "").toUpperCase();
  if (!(MANAGER_ROLES as readonly string[]).includes(role)) {
    dbLogger.warn(
      `Team mutation denied: user=${req.user?.id ?? "anon"} role=${role}`
    );
    res.status(403).json({
      success: false,
      error: {
        code:    "FORBIDDEN",
        message: "Team management requires manager-level access",
      },
    });
    return;
  }
  next();
};

const requireAdmin: RequestHandler = (req, res, next) => {
  const role = String(req.user?.role ?? "").toUpperCase();
  if (!(ADMIN_ROLES as readonly string[]).includes(role)) {
    dbLogger.warn(
      `Team admin action denied: user=${req.user?.id ?? "anon"} role=${role}`
    );
    res.status(403).json({
      success: false,
      error: {
        code:    "FORBIDDEN",
        message: "This action requires admin-level access",
      },
    });
    return;
  }
  next();
};

/* =====================================================
   IMPORTED MIDDLEWARE — TYPE BRIDGES
   These shared middlewares were authored with a narrower local AuthRequest
   interface. Until that's migrated to the global type, bridge them via
   RequestHandler casts so Express's overload resolution works.
===================================================== */

const protectMw              = protect              as unknown as RequestHandler;
const requireActiveBillingMw = requireActiveBilling as unknown as RequestHandler;
const checkTeamLimitMw       = checkTeamLimit       as unknown as RequestHandler;

const authorizeMw: (...permissions: string[]) => RequestHandler =
  authorize as unknown as (...permissions: string[]) => RequestHandler;

/* =====================================================
   RATE LIMIT POLICIES
   Teams change rarely but reads happen on every dashboard load.
===================================================== */

const READ_LIMIT     = rateLimit({ windowMs: 60_000, max: 120 }); // 120/min — dashboard polling
const WRITE_LIMIT    = rateLimit({ windowMs: 60_000, max: 30  }); // 30/min — config updates
const CREATE_LIMIT   = rateLimit({ windowMs: 60_000, max: 10  }); // 10/min — team creation
const MEMBER_LIMIT   = rateLimit({ windowMs: 60_000, max: 60  }); // 60/min — member ops more frequent
const BULK_LIMIT     = rateLimit({ windowMs: 60_000, max: 5   }); // 5/min — bulk operations heavy
const TRANSFER_LIMIT = rateLimit({ windowMs: 60_000, max: 3   }); // 3/min — manager transfer very rare

/* =====================================================
   GLOBAL MIDDLEWARE
   Every team route requires authentication.
===================================================== */

router.use(protectMw);

/* =====================================================
   COLLECTION ROUTES
   IMPORTANT: more specific paths come BEFORE /:id-style routes.
===================================================== */

/**
 * @route   POST /teams
 * @desc    Create a new team
 * @access  Manager+ + CREATE_TEAM + active billing + team limit check
 * @rateLimit 10/min
 */
router.post(
  "/",
  CREATE_LIMIT,
  requireActiveBillingMw,
  authorizeMw("CREATE_TEAM"),
  requireManager,
  checkTeamLimitMw,
  teamController.create
);

/**
 * @route   GET /teams
 * @desc    List org teams with pagination + search
 * @access  Authenticated + READ_TEAM
 * @query   page, limit, search, sort
 */
router.get(
  "/",
  READ_LIMIT,
  authorizeMw("READ_TEAM"),
  teamController.getAll
);

/* =====================================================
   ITEM ROUTES (require :id validation)
===================================================== */

/**
 * @route   GET /teams/:id
 * @desc    Get a single team by ID
 * @access  Authenticated + READ_TEAM
 */
router.get(
  "/:id",
  READ_LIMIT,
  authorizeMw("READ_TEAM"),
  validateObjectId("id"),
  teamController.getOne
);

/**
 * @route   PATCH /teams/:id
 * @desc    Update a team's metadata (name, description, manager, color)
 * @access  Manager+ + UPDATE_TEAM + active billing
 */
router.patch(
  "/:id",
  WRITE_LIMIT,
  requireActiveBillingMw,
  authorizeMw("UPDATE_TEAM"),
  requireManager,
  validateObjectId("id"),
  teamController.update
);

/**
 * @route   DELETE /teams/:id
 * @desc    Soft-delete a team
 * @access  Manager+ + DELETE_TEAM + active billing
 */
router.delete(
  "/:id",
  WRITE_LIMIT,
  requireActiveBillingMw,
  authorizeMw("DELETE_TEAM"),
  requireManager,
  validateObjectId("id"),
  teamController.remove
);

/* =====================================================
   TEAM MEMBER ROUTES
===================================================== */

/**
 * @route   GET /teams/:id/members
 * @desc    List members of a team
 * @access  Authenticated + READ_TEAM
 */
router.get(
  "/:id/members",
  READ_LIMIT,
  authorizeMw("READ_TEAM"),
  validateObjectId("id"),
  teamController.getMembers
);

/**
 * @route   POST /teams/:id/members
 * @desc    Add a single member to a team
 * @access  Manager+ + UPDATE_TEAM + active billing
 * @body    { userId: string }
 */
router.post(
  "/:id/members",
  MEMBER_LIMIT,
  requireActiveBillingMw,
  authorizeMw("UPDATE_TEAM"),
  requireManager,
  validateObjectId("id"),
  teamController.addMember
);

/**
 * @route   POST /teams/:id/members/bulk-add
 * @desc    Add multiple members at once (max 100)
 * @access  Manager+ + UPDATE_TEAM + active billing
 * @body    { userIds: string[] }
 * @rateLimit 5/min
 */
router.post(
  "/:id/members/bulk-add",
  BULK_LIMIT,
  requireActiveBillingMw,
  authorizeMw("UPDATE_TEAM"),
  requireManager,
  validateObjectId("id"),
  teamController.bulkAddMembers
);

/**
 * @route   DELETE /teams/:id/members/:userId
 * @desc    Remove a member from a team (REST style)
 * @access  Manager+ + UPDATE_TEAM + active billing
 */
router.delete(
  "/:id/members/:userId",
  MEMBER_LIMIT,
  requireActiveBillingMw,
  authorizeMw("UPDATE_TEAM"),
  requireManager,
  validateObjectId("id"),
  validateObjectId("userId"),
  teamController.removeMember
);

/**
 * @route   DELETE /teams/:id/members
 * @desc    Remove a member from a team (legacy: userId in body)
 * @access  Manager+ + UPDATE_TEAM + active billing
 * @body    { userId: string }
 */
router.delete(
  "/:id/members",
  MEMBER_LIMIT,
  requireActiveBillingMw,
  authorizeMw("UPDATE_TEAM"),
  requireManager,
  validateObjectId("id"),
  teamController.removeMember
);

/* =====================================================
   ADMIN-ONLY ROUTES
===================================================== */

/**
 * @route   POST /teams/:id/transfer-manager
 * @desc    Transfer team manager to another user
 * @access  Admin+ + UPDATE_TEAM + active billing
 * @body    { newManagerId: string }
 * @rateLimit 3/min — very rare operation
 */
router.post(
  "/:id/transfer-manager",
  TRANSFER_LIMIT,
  requireActiveBillingMw,
  authorizeMw("UPDATE_TEAM"),
  requireAdmin,
  validateObjectId("id"),
  teamController.transferManager
);

export default router;













