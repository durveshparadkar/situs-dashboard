// deal.routes.ts
//
// Routes for the deals subsystem. Every endpoint requires authentication
// and tenant scope. Per-route permission checks use the canonical RBAC
// vocabulary from shared/rbac/permissions.ts.
//
// Auth chain (in order):
//   1. protect            — verify JWT, attach req.user
//   2. tenantGuard        — set req.effectiveOrganizationId
//   3. requirePermission  — check role grants the required permission
//   4. rate limit         — per-bucket throttling
//   5. validateObjectId   — validate route params
//   6. controller method
import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import DealController from "./deal.controller.js";
import { protect } from "../../shared/middlewares/auth.middleware.js";
import { requirePermission } from "../../shared/middlewares/permission.middleware.js";
const router = express.Router();
// ============================================================
// HELPERS
// ============================================================
/**
 * Async wrapper — eliminates try/catch boilerplate inside routes.
 * Exceptions thrown by the handler bubble to the global error middleware.
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
/**
 * Validate MongoDB ObjectId in a route param. Rejects with 400 if invalid.
 */
const validateObjectId = (paramName) => {
    return (req, res, next) => {
        const id = req.params[paramName];
        if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
            res.status(400).json({
                success: false,
                error: {
                    code: "INVALID_ID",
                    message: "Invalid " + paramName + " format",
                },
            });
            return;
        }
        next();
    };
};
// ============================================================
// RATE LIMITS
// ============================================================
const keyByUserOrIp = (req) => req.user?.id ?? ipKeyGenerator(req.ip ?? "unknown");
const READ_LIMIT = rateLimit({
    windowMs: 60_000,
    max: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyByUserOrIp,
    message: {
        success: false,
        error: {
            code: "RATE_LIMITED",
            message: "Too many read requests",
        },
    },
});
const WRITE_LIMIT = rateLimit({
    windowMs: 60_000,
    max: 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyByUserOrIp,
    message: {
        success: false,
        error: {
            code: "RATE_LIMITED",
            message: "Too many write requests",
        },
    },
});
/* Import is heavier (creates many deals) — tighter bucket than normal writes */
const IMPORT_LIMIT = rateLimit({
    windowMs: 60_000,
    max: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: keyByUserOrIp,
    message: {
        success: false,
        error: {
            code: "RATE_LIMITED",
            message: "Too many import requests — please wait a minute",
        },
    },
});
// ============================================================
// PERMISSION CAST
// Matches the pattern from intelligence.routes.ts
// ============================================================
const reqPerm = requirePermission;
// ============================================================
// GLOBAL MIDDLEWARE — every deal route requires auth + tenant scope
// ============================================================
router.use(protect);
/* If you have a tenantGuard middleware ready, uncomment the next line.
   It's in your codebase per the screenshot (tenant.middleware.ts).

   import { tenantGuard } from "../../shared/middlewares/tenant.middleware.js";
   router.use(tenantGuard);
*/
// ============================================================
// ROUTES
// ============================================================
/**
 * POST /deals
 * Create a new deal.
 */
router.post("/", WRITE_LIMIT, reqPerm("CREATE_DEAL", "READ_DEAL"), asyncHandler((req, res, next) => DealController.createDeal(req, res, next)));
/**
 * POST /deals/import
 * Bulk-create deals from parsed CSV rows.
 * Must come BEFORE /:id routes so "import" isn't read as a deal ID.
 */
router.post("/import", IMPORT_LIMIT, reqPerm("CREATE_DEAL", "READ_DEAL"), asyncHandler((req, res, next) => DealController.importDeals(req, res, next)));
/**
 * GET /deals
 * Paginated list with filters.
 * Query: page, limit, stage, ownerId, sortBy, sortOrder, search, minValue, maxValue
 */
router.get("/", READ_LIMIT, reqPerm("READ_DEAL"), asyncHandler((req, res, next) => DealController.getDeals(req, res, next)));
/**
 * GET /deals/:id
 * Single deal by ID.
 */
router.get("/:id", READ_LIMIT, validateObjectId("id"), reqPerm("READ_DEAL"), asyncHandler((req, res, next) => DealController.getDealById(req, res, next)));
/**
 * PATCH /deals/:id
 * Partial update.
 */
router.patch("/:id", WRITE_LIMIT, validateObjectId("id"), reqPerm("UPDATE_DEAL"), asyncHandler((req, res, next) => DealController.updateDeal(req, res, next)));
/**
 * PATCH /deals/:id/stage
 * Move deal to a new pipeline stage.
 */
router.patch("/:id/stage", WRITE_LIMIT, validateObjectId("id"), reqPerm("UPDATE_DEAL"), asyncHandler((req, res, next) => DealController.updateDealStage(req, res, next)));
/**
 * DELETE /deals/:id
 * Soft delete.
 */
router.delete("/:id", WRITE_LIMIT, validateObjectId("id"), reqPerm("DELETE_DEAL"), asyncHandler((req, res, next) => DealController.deleteDeal(req, res, next)));
export default router;
//# sourceMappingURL=deal.routes.js.map