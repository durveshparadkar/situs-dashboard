// hubspot.routes.ts
import { Router } from "express";
import type { RequestHandler } from "express";

import hubspotController from "./hubspot.controller.js";
import { protect } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

router.get(
  "/connect",
  protect as RequestHandler,
  hubspotController.connect as RequestHandler
);

router.get(
  "/callback",
  hubspotController.callback as RequestHandler
);

router.get(
  "/status",
  protect as RequestHandler,
  hubspotController.status as RequestHandler
);

router.delete(
  "/",
  protect as RequestHandler,
  hubspotController.disconnect as RequestHandler
);

router.post(
  "/import",
  protect as RequestHandler,
  hubspotController.import as RequestHandler
);

export default router;