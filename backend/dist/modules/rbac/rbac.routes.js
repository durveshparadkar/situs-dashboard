// rbac.routes.ts
import { Router, } from "express";
import mongoose from "mongoose";
import rbacController from "./rbac.controller.js";
import { protect, authorize, } from "../../shared/middlewares/auth.middleware.js";
import { PERMISSIONS } from "../../shared/rbac/permissions.js";
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
   ROLE GATE — ADMIN-ONLY FOR RBAC MUTATIONS
   RBAC is the highest-trust surface in the API. A misconfigured
   role grants access to every other module. Defense in depth:
   permission check AND role check.
===================================================== */
const ADMIN_ROLES = ["ORG_ADMIN", "SUPER_ADMIN"];
const requireAdmin = (req, res, next) => {
    const role = String(req.user?.role ?? "").toUpperCase();
    if (!ADMIN_ROLES.includes(role)) {
        dbLogger.warn(`RBAC mutation denied: user=${req.user?.id ?? "anon"} role=${role}`);
        res.status(403).json({
            success: false,
            error: {
                code: "FORBIDDEN",
                message: "RBAC management requires admin-level access",
            },
        });
        return;
    }
    next();
};
/* =====================================================
   IMPORTED MIDDLEWARE — TYPE BRIDGES
   These shared middlewares were authored with a narrower local AuthRequest
   interface. Bridge them via RequestHandler casts until they migrate to
   the global AuthenticatedUser type.
===================================================== */
const protectMw = protect;
const authorizeMw = authorize;
/* =====================================================
   PERMISSION KEYS
   Falls back to READ_ORG / MANAGE_ORG if your PERMISSIONS catalogue doesn't
   yet have RBAC-specific entries. Replace with dedicated keys when added:
     PERMISSIONS.READ_RBAC, PERMISSIONS.MANAGE_RBAC
===================================================== */
const PERMS = PERMISSIONS;
const READ_RBAC_PERM = PERMS.READ_RBAC ?? PERMS.READ_ORG ?? "READ_ORG";
const MANAGE_RBAC_PERM = PERMS.MANAGE_RBAC ?? PERMS.MANAGE_ORG ?? PERMS.READ_ORG ?? "MANAGE_ORG";
/* =====================================================
   RATE LIMIT POLICIES
   RBAC mutations are rare but security-critical. Tight write limits
   reduce blast radius if an admin account is compromised.
===================================================== */
const READ_LIMIT = rateLimit({ windowMs: 60_000, max: 60 }); // 60/min — RBAC reads infrequent
const WRITE_LIMIT = rateLimit({ windowMs: 60_000, max: 20 }); // 20/min — config changes
const CREATE_LIMIT = rateLimit({ windowMs: 60_000, max: 10 }); // 10/min — role creation
const ASSIGN_LIMIT = rateLimit({ windowMs: 60_000, max: 15 }); // 15/min — permission churn
const EFFECTIVE_LIMIT = rateLimit({ windowMs: 60_000, max: 30 }); // 30/min — BFS walker is expensive
/* =====================================================
   GLOBAL MIDDLEWARE
   Every RBAC route requires authentication.
===================================================== */
router.use(protectMw);
/* =====================================================
   PERMISSIONS CATALOGUE
===================================================== */
/**
 * @route   GET /rbac/permissions
 * @desc    List available permissions (system + optionally org-custom)
 * @access  Authenticated + READ_RBAC
 * @query   includeOrg=true (optional)
 */
router.get("/permissions", READ_LIMIT, authorizeMw(READ_RBAC_PERM), rbacController.getPermissions);
/* =====================================================
   ROLE ROUTES — collection
===================================================== */
/**
 * @route   POST /rbac/roles
 * @desc    Create a new custom role
 * @access  Admin+ + MANAGE_RBAC
 * @rateLimit 10/min
 */
router.post("/roles", CREATE_LIMIT, authorizeMw(MANAGE_RBAC_PERM), requireAdmin, rbacController.createRole);
/**
 * @route   GET /rbac/roles
 * @desc    List org roles (system + custom)
 * @access  Authenticated + READ_RBAC
 * @query   includeSystem (default: true), search
 */
router.get("/roles", READ_LIMIT, authorizeMw(READ_RBAC_PERM), rbacController.getRoles);
/* =====================================================
   ROLE ROUTES — item (require :id validation)
===================================================== */
/**
 * @route   GET /rbac/roles/:id
 * @desc    Get a single role with populated permissions + inherits
 * @access  Authenticated + READ_RBAC
 */
router.get("/roles/:id", READ_LIMIT, authorizeMw(READ_RBAC_PERM), validateObjectId("id"), rbacController.getRoleById);
/**
 * @route   PATCH /rbac/roles/:id
 * @desc    Update a role (cannot edit system roles)
 * @access  Admin+ + MANAGE_RBAC
 */
router.patch("/roles/:id", WRITE_LIMIT, authorizeMw(MANAGE_RBAC_PERM), requireAdmin, validateObjectId("id"), rbacController.updateRole);
/**
 * @route   DELETE /rbac/roles/:id
 * @desc    Delete a custom role (cannot delete system roles)
 * @access  Admin+ + MANAGE_RBAC
 */
router.delete("/roles/:id", WRITE_LIMIT, authorizeMw(MANAGE_RBAC_PERM), requireAdmin, validateObjectId("id"), rbacController.deleteRole);
/* =====================================================
   PERMISSION ASSIGNMENT — bulk operations
===================================================== */
/**
 * @route   POST /rbac/roles/:id/permissions
 * @desc    Bulk assign permissions to a role ($addToSet — no duplicates)
 * @access  Admin+ + MANAGE_RBAC
 * @body    { permissions: string[] }
 */
router.post("/roles/:id/permissions", ASSIGN_LIMIT, authorizeMw(MANAGE_RBAC_PERM), requireAdmin, validateObjectId("id"), rbacController.assignPermissions);
/**
 * @route   DELETE /rbac/roles/:id/permissions
 * @desc    Bulk revoke permissions from a role ($pullAll)
 * @access  Admin+ + MANAGE_RBAC
 * @body    { permissions: string[] }
 */
router.delete("/roles/:id/permissions", ASSIGN_LIMIT, authorizeMw(MANAGE_RBAC_PERM), requireAdmin, validateObjectId("id"), rbacController.revokePermissions);
/* =====================================================
   ROLE LIFECYCLE OPERATIONS
===================================================== */
/**
 * @route   POST /rbac/roles/:id/duplicate
 * @desc    Clone an existing role with optional new name
 * @access  Admin+ + MANAGE_RBAC
 * @body    { name?: string }
 */
router.post("/roles/:id/duplicate", CREATE_LIMIT, authorizeMw(MANAGE_RBAC_PERM), requireAdmin, validateObjectId("id"), rbacController.duplicateRole);
/**
 * @route   GET /rbac/roles/:id/effective-permissions
 * @desc    Compute full permission set by walking the inheritance tree (BFS)
 * @access  Authenticated + READ_RBAC
 * @rateLimit 30/min — graph walk is more expensive than a flat read
 */
router.get("/roles/:id/effective-permissions", EFFECTIVE_LIMIT, authorizeMw(READ_RBAC_PERM), validateObjectId("id"), rbacController.getEffectivePermissions);
export default router;
//# sourceMappingURL=rbac.routes.js.map