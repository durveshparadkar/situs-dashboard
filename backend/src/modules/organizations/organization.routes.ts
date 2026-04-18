import express from "express";
import type { RequestHandler } from "express";

import {
  createOrganization,
  getOrganizations,
} from "./organization.controller.js";

import {
  protect,
  authorize,
} from "../../shared/middlewares/auth.middleware.js";

import { PERMISSIONS } from "../../shared/rbac/permissions.js";
import { cache } from "../../shared/cache/cache.middleware.js";

const router = express.Router();

/* =====================================================
   CREATE ORGANIZATION
   Only users with CREATE_ORG permission
===================================================== */

router.post(
  "/",
  protect as RequestHandler,
  authorize(PERMISSIONS.CREATE_ORG) as RequestHandler,
  createOrganization as RequestHandler
);

/* =====================================================
   GET ORGANIZATIONS (CACHED PER ORGANIZATION)
===================================================== */

const orgCache: RequestHandler = cache(
  (req) => {
    const user = (req as any).user;

    // ✅ Proper dynamic cache key
    return 'orgs:${user?.organizationId ?? "unknown"}';
  },
  60 // 60 seconds cache
);

router.get(
  "/",
  protect as RequestHandler,
  authorize(PERMISSIONS.READ_ORG) as RequestHandler,
  orgCache,
  getOrganizations as RequestHandler
);

export default router;










