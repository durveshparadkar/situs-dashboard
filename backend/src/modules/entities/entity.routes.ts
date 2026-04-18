import express from "express";
import type { RequestHandler } from "express";

import { protect, authorize } from "../../shared/middlewares/auth.middleware.js";
import { requireActiveBilling } from "../../shared/billing/billing.guard.js";
import { createEntity, getEntities } from "./entity.controller.js";
import { cache } from "../../shared/cache/cache.middleware.js";

const router = express.Router();

/*
  Middleware Order:
  1️⃣ protect
  2️⃣ requireActiveBilling
  3️⃣ authorize
  4️⃣ cache (for GET)
  5️⃣ controller
*/

// ===============================
// CREATE ENTITY (Paid Feature)
// ===============================
router.post(
  "/",
  protect as RequestHandler,
  requireActiveBilling as RequestHandler,
  authorize("CREATE_ENTITY") as RequestHandler,
  createEntity as RequestHandler
);

// ===============================
// GET ENTITIES (Billing + Cached)
// ===============================

const entityCache: RequestHandler = cache(
  (req) => {
    const user = (req as any).user;
    return 'entities:${user?.organizationId ?? "unknown"}';
  },
  60
);

router.get(
  "/",
  protect as RequestHandler,
  requireActiveBilling as RequestHandler,
  authorize("READ_ENTITY") as RequestHandler,
  entityCache,
  getEntities as RequestHandler
);

export default router;




















