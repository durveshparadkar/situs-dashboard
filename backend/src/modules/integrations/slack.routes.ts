// slack.routes.ts
import { Router } from "express";
import type { RequestHandler } from "express";

import slackController from "./slack.controller.js";
import { protect } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

/**
 * GET /api/integrations/slack/connect
 */
router.get(
  "/connect",
  protect as RequestHandler,
  slackController.connect as RequestHandler
);

/**
 * GET /api/integrations/slack/callback
 * No protect middleware — identity comes from the signed state param.
 */
router.get(
  "/callback",
  slackController.callback as RequestHandler
);

/**
 * GET /api/integrations/slack/status
 */
router.get(
  "/status",
  protect as RequestHandler,
  slackController.status as RequestHandler
);

/**
 * DELETE /api/integrations/slack
 */
router.delete(
  "/",
  protect as RequestHandler,
  slackController.disconnect as RequestHandler
);

/**
 * POST /api/integrations/slack/test
 */
router.post(
  "/test",
  protect as RequestHandler,
  slackController.test as RequestHandler
);

export default router;