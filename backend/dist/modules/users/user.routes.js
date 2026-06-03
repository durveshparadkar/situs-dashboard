// user.routes.ts
import { Router, } from "express";
import mongoose from "mongoose";
import userController from "./user.controller.js";
import { protect, authorize, } from "../../shared/middlewares/auth.middleware.js";
import { checkUserLimit } from "../../shared/limits/user-limit.guard.js";
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
/**
 * Rate limit stub — replace with express-rate-limit or Redis-backed limiter.
 */
const rateLimit = (_opts) => (_req, _res, next) => {
    next();
};
/* =====================================================
   ROLE GATES — Defense in depth
   Controller also enforces these, but route-layer rejection
   is cheaper (no body parsing, no DB hits).
===================================================== */
const MANAGER_ROLES = ["ORG_ADMIN", "SUPER_ADMIN", "MANAGER"];
const ADMIN_ROLES = ["ORG_ADMIN", "SUPER_ADMIN"];
const requireManager = (req, res, next) => {
    const role = String(req.user?.role ?? "").toUpperCase();
    if (!MANAGER_ROLES.includes(role)) {
        dbLogger.warn(`User-mgmt denied: user=${req.user?.id ?? "anon"} role=${role}`);
        res.status(403).json({
            success: false,
            error: {
                code: "FORBIDDEN",
                message: "User management requires manager-level access",
            },
        });
        return;
    }
    next();
};
const requireAdmin = (req, res, next) => {
    const role = String(req.user?.role ?? "").toUpperCase();
    if (!ADMIN_ROLES.includes(role)) {
        dbLogger.warn(`User-admin action denied: user=${req.user?.id ?? "anon"} role=${role}`);
        res.status(403).json({
            success: false,
            error: {
                code: "FORBIDDEN",
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
   interface. Bridge them via RequestHandler casts so Express's overload
   resolution works. Delete bridges once shared middlewares migrate to
   the global AuthenticatedUser type.
===================================================== */
const protectMw = protect;
const checkUserLimitMw = checkUserLimit;
const authorizeMw = authorize;
/* =====================================================
   RATE LIMIT POLICIES
   Different operations have different cost and abuse vectors.
===================================================== */
const READ_LIMIT = rateLimit({ windowMs: 60_000, max: 120 }); // 120/min — dashboard polling
const WRITE_LIMIT = rateLimit({ windowMs: 60_000, max: 30 }); // 30/min — profile updates
const CREATE_LIMIT = rateLimit({ windowMs: 60_000, max: 10 }); // 10/min — user creation
const PASSWORD_LIMIT = rateLimit({ windowMs: 60_000, max: 5 }); // 5/min — own password change
const RESET_LIMIT = rateLimit({ windowMs: 60_000, max: 3 }); // 3/min — admin force-reset
const STATS_LIMIT = rateLimit({ windowMs: 60_000, max: 30 }); // 30/min — admin stats
/* =====================================================
   GLOBAL MIDDLEWARE
   Every user route requires authentication.
===================================================== */
router.use(protectMw);
/* =====================================================
   SELF-SERVICE ROUTES (/me)
   IMPORTANT: declared BEFORE /:id routes so Express doesn't
   try to parse "me" or "stats" as an ObjectId.
===================================================== */
/**
 * @route   GET /users/me
 * @desc    Get the current user's profile
 * @access  Authenticated
 */
router.get("/me", READ_LIMIT, userController.getMe);
/**
 * @route   PATCH /users/me/password
 * @desc    Change own password (requires current password)
 * @access  Authenticated
 * @body    { currentPassword: string, newPassword: string }
 * @rateLimit 5/min — defends against credential-stuffing
 */
router.patch("/me/password", PASSWORD_LIMIT, userController.updatePassword);
/* =====================================================
   ADMIN ROUTES
===================================================== */
/**
 * @route   GET /users/stats
 * @desc    Org-wide user statistics (active/inactive, by role, etc.)
 * @access  Manager+ + READ_USER_STATS
 */
router.get("/stats", STATS_LIMIT, authorizeMw("READ_USER_STATS"), requireManager, userController.getStats);
/* =====================================================
   COLLECTION ROUTES
===================================================== */
/**
 * @route   POST /users
 * @desc    Create a new user (admin-initiated; for self-signup use /auth/register)
 * @access  Manager+ + CREATE_USER + plan user-limit
 * @rateLimit 10/min
 */
router.post("/", CREATE_LIMIT, authorizeMw("CREATE_USER"), requireManager, checkUserLimitMw, userController.create);
/**
 * @route   GET /users
 * @desc    List org users with pagination + search + filters
 * @access  Authenticated + READ_USER
 * @query   page, limit, search, status, roleId, managerId, teamId, sortBy, sortOrder
 */
router.get("/", READ_LIMIT, authorizeMw("READ_USER"), userController.findAll);
/* =====================================================
   ITEM ROUTES (require :id validation)
===================================================== */
/**
 * @route   GET /users/:id
 * @desc    Get a single user by ID
 * @access  Authenticated + READ_USER
 */
router.get("/:id", READ_LIMIT, authorizeMw("READ_USER"), validateObjectId("id"), userController.findOne);
/**
 * @route   PATCH /users/:id
 * @desc    Update a user's profile, role, manager, or active state
 * @access  Authenticated (self) OR Manager+ (others) + UPDATE_USER
 * @note    Controller enforces self-vs-admin permissions for sensitive fields
 */
router.patch("/:id", WRITE_LIMIT, authorizeMw("UPDATE_USER"), validateObjectId("id"), userController.update);
/**
 * @route   DELETE /users/:id
 * @desc    Soft-delete a user (cannot delete yourself)
 * @access  Manager+ + DELETE_USER
 */
router.delete("/:id", WRITE_LIMIT, authorizeMw("DELETE_USER"), requireManager, validateObjectId("id"), userController.remove);
/* =====================================================
   USER LIFECYCLE OPERATIONS
===================================================== */
/**
 * @route   POST /users/:id/reactivate
 * @desc    Un-soft-delete (reactivate) a user
 * @access  Manager+ + UPDATE_USER
 */
router.post("/:id/reactivate", WRITE_LIMIT, authorizeMw("UPDATE_USER"), requireManager, validateObjectId("id"), userController.reactivate);
/**
 * @route   POST /users/:id/reset-password
 * @desc    Admin force-reset another user's password (returns temp password or reset link)
 * @access  Admin+ + UPDATE_USER
 * @rateLimit 3/min — security-critical, rate-limited tight
 */
router.post("/:id/reset-password", RESET_LIMIT, authorizeMw("UPDATE_USER"), requireAdmin, validateObjectId("id"), userController.forceResetPassword);
/**
 * @route   GET /users/:id/teams
 * @desc    List teams a user belongs to
 * @access  Authenticated + READ_USER
 */
router.get("/:id/teams", READ_LIMIT, authorizeMw("READ_USER"), validateObjectId("id"), userController.getTeams);
export default router;
//# sourceMappingURL=user.routes.js.map