// entity.routes.ts
import express from "express";
import mongoose from "mongoose";
import { protect, authorize } from "../../shared/middlewares/auth.middleware.js";
import { requireActiveBilling } from "../../shared/billing/billing.guard.js";
import { cache } from "../../shared/cache/cache.middleware.js";
import { createEntity, getEntities, getEntityById, updateEntity, deleteEntity, restoreEntity, } from "./entity.controller.js";
const router = express.Router();
/* =====================================================
   HELPERS
===================================================== */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
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
   CACHE KEY BUILDERS
===================================================== */
const listCacheKey = cache((req) => {
    const user = req.user;
    const orgId = (typeof user?.organizationId === "string" && user.organizationId) ||
        (user?.organizationId ? String(user.organizationId) : "unknown");
    const q = req.query;
    return ("entities:list:org=" + orgId +
        ":page=" + (q.page ?? "1") +
        ":limit=" + (q.limit ?? "10") +
        ":type=" + (q.type ?? "") +
        ":search=" + (q.search ?? "").trim().toLowerCase() +
        ":sort=" + (q.sort ?? ""));
}, { ttl: 60 });
const detailCacheKey = cache((req) => {
    const user = req.user;
    const orgId = (typeof user?.organizationId === "string" && user.organizationId) ||
        (user?.organizationId ? String(user.organizationId) : "unknown");
    const id = req.params.id ?? "unknown";
    return "entities:detail:" + orgId + ":" + id;
}, { ttl: 120 });
/* =====================================================
   GLOBAL MIDDLEWARE
===================================================== */
router.use(protect);
router.use(requireActiveBilling);
/* =====================================================
   COLLECTION ROUTES
===================================================== */
/**
 * @route   POST /entities
 * @desc    Create a new entity
 * @access  Authenticated + active billing + CREATE_ENTITY
 */
router.post("/", authorize("CREATE_ENTITY"), asyncHandler((req, res, next) => createEntity(req, res, next)));
/**
 * @route   GET /entities
 * @desc    List org entities with pagination + filters
 * @access  Authenticated + active billing + READ_ENTITY
 * @query   page, limit, search, sort, type
 * @cache   60s keyed by org + filter params
 */
router.get("/", authorize("READ_ENTITY"), listCacheKey, asyncHandler((req, res, next) => getEntities(req, res, next)));
/* =====================================================
   ITEM ROUTES
===================================================== */
/**
 * @route   GET /entities/:id
 * @desc    Get a single entity by ID
 * @access  Authenticated + active billing + READ_ENTITY
 * @cache   120s
 */
router.get("/:id", authorize("READ_ENTITY"), validateObjectId("id"), detailCacheKey, asyncHandler((req, res, next) => getEntityById(req, res, next)));
/**
 * @route   PATCH /entities/:id
 * @desc    Update entity fields
 * @access  Authenticated + active billing + UPDATE_ENTITY
 */
router.patch("/:id", authorize("UPDATE_ENTITY"), validateObjectId("id"), asyncHandler((req, res, next) => updateEntity(req, res, next)));
/**
 * @route   DELETE /entities/:id
 * @desc    Soft-delete an entity
 * @access  Authenticated + active billing + DELETE_ENTITY
 */
router.delete("/:id", authorize("DELETE_ENTITY"), validateObjectId("id"), asyncHandler((req, res, next) => deleteEntity(req, res, next)));
/**
 * @route   POST /entities/:id/restore
 * @desc    Restore a soft-deleted entity
 * @access  Authenticated + active billing + DELETE_ENTITY
 */
router.post("/:id/restore", authorize("DELETE_ENTITY"), validateObjectId("id"), asyncHandler((req, res, next) => restoreEntity(req, res, next)));
export default router;
//# sourceMappingURL=entity.routes.js.map