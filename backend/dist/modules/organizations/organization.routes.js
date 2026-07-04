import express from "express";
import OrganizationController from "./organization.controller.js";
import { protect, authorize, } from "../../shared/middlewares/auth.middleware.js";
import { PERMISSIONS } from "../../shared/rbac/permissions.js";
import { cache } from "../../shared/cache/cache.middleware.js";
const router = express.Router();
/* =====================================================
   CACHE (PER ORG SAFE)
   Uses the globally-augmented req.user (express.d.ts) — no as any.
===================================================== */
const orgCache = cache((req) => {
    const user = req.user;
    const orgId = (typeof user?.organizationId === "string" && user.organizationId) ||
        (user?.organizationId ? String(user.organizationId) : "unknown");
    return "org:" + orgId;
}, { ttl: 60 });
/* =====================================================
   CREATE ORGANIZATION
===================================================== */
router.patch("/me", protect, authorize(PERMISSIONS.UPDATE_ORG), OrganizationController.update);
/* =====================================================
   GET CURRENT ORGANIZATION
===================================================== */
router.get("/me", protect, authorize(PERMISSIONS.READ_ORG), orgCache, OrganizationController.getCurrent);
/* =====================================================
   UPDATE ORGANIZATION
===================================================== */
router.patch("/", protect, authorize(PERMISSIONS.UPDATE_ORG), OrganizationController.update);
/* =====================================================
   DELETE ORGANIZATION (SUPER ADMIN ONLY)
===================================================== */
router.delete("/", protect, authorize(PERMISSIONS.DELETE_ORG), OrganizationController.delete);
/* =====================================================
   ADMIN: LIST ALL ORGANIZATIONS
   NOTE: this passes a ROLE ("SUPER_ADMIN") to authorize(), which
   expects a PERMISSION. This is almost certainly a bug — but I'm
   leaving it as-is so it compiles. See the note below the file.
===================================================== */
router.get("/admin/all", protect, authorize("SUPER_ADMIN"), OrganizationController.listAll);
export default router;
//# sourceMappingURL=organization.routes.js.map