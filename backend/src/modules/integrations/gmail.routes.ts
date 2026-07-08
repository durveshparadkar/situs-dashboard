// gmail.routes.ts
import { Router } from "express";
import type { RequestHandler } from "express";

import gmailController from "./gmail.controller.js";
import { protect } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

/**
 * GET /api/integrations/gmail/connect
 * Requires login — redirects to Google's consent screen.
 */
router.get(
  "/connect",
  protect as RequestHandler,
  gmailController.connect as RequestHandler
);

/**
 * GET /api/integrations/gmail/callback
 * Google redirects here. No protect middleware — see controller
 * comment for why (identity comes from the signed state param).
 */
router.get(
  "/callback",
  gmailController.callback as RequestHandler
);

/**
 * GET /api/integrations/gmail/status
 */
router.get(
  "/status",
  protect as RequestHandler,
  gmailController.status as RequestHandler
);

/**
 * DELETE /api/integrations/gmail
 */
router.delete(
  "/",
  protect as RequestHandler,
  gmailController.disconnect as RequestHandler
);

export default router;