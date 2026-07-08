// gmail.routes.ts
import { Router } from "express";
import type { RequestHandler } from "express";

import gmailController from "./gmail.controller.js";
import { protect } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

router.get(
  "/connect",
  protect as RequestHandler,
  gmailController.connect as RequestHandler
);

router.get(
  "/callback",
  gmailController.callback as RequestHandler
);

router.get(
  "/status",
  protect as RequestHandler,
  gmailController.status as RequestHandler
);

router.delete(
  "/",
  protect as RequestHandler,
  gmailController.disconnect as RequestHandler
);

router.post(
  "/sync-now",
  protect as RequestHandler,
  gmailController.syncNow as RequestHandler
);

export default router;