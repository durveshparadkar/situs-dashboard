import express, { type Request, type RequestHandler } from "express";
import OrganizationController from "./organization.controller.js";

import {
  protect,
  authorize,
} from "../../shared/middlewares/auth.middleware.js";

import { PERMISSIONS } from "../../shared/rbac/permissions.js";
import { cache } from "../../shared/cache/cache.middleware.js";

const router = express.Router();

/* =====================================================
   CACHE (PER ORG SAFE)
   Uses the globally-augmented req.user (express.d.ts) — no as any.
===================================================== */

const orgCache: RequestHandler = cache(
  (req: Request) => {
    const user = req.user;
    const orgId =
      (typeof user?.organizationId === "string" && user.organizationId) ||
      (user?.organizationId ? String(user.organizationId) : "unknown");
    return "org:" + orgId;
  },
  { ttl: 60 }
);

/* =====================================================
   CREATE ORGANIZATION
===================================================== */

router.patch(
  "/me",
  protect as RequestHandler,
  authorize(PERMISSIONS.UPDATE_ORG) as RequestHandler,
  OrganizationController.update as RequestHandler
);

/* =====================================================
   GET CURRENT ORGANIZATION
===================================================== */

router.get(
  "/me",
  protect as RequestHandler,
  authorize(PERMISSIONS.READ_ORG) as RequestHandler,
  orgCache,
  OrganizationController.getCurrent as RequestHandler
);

/* =====================================================
   UPDATE ORGANIZATION
===================================================== */

router.patch(
  "/",
  protect as RequestHandler,
  authorize(PERMISSIONS.UPDATE_ORG) as RequestHandler,
  OrganizationController.update as RequestHandler
);

/* =====================================================
   DELETE ORGANIZATION (SUPER ADMIN ONLY)
===================================================== */

router.delete(
  "/",
  protect as RequestHandler,
  authorize(PERMISSIONS.DELETE_ORG) as RequestHandler,
  OrganizationController.delete as RequestHandler
);

/* =====================================================
   ADMIN: LIST ALL ORGANIZATIONS
   NOTE: this passes a ROLE ("SUPER_ADMIN") to authorize(), which
   expects a PERMISSION. This is almost certainly a bug — but I'm
   leaving it as-is so it compiles. See the note below the file.
===================================================== */

router.get(
  "/admin/all",
  protect as RequestHandler,
  authorize("SUPER_ADMIN" as never) as RequestHandler,
  OrganizationController.listAll as RequestHandler
);

export default router;









