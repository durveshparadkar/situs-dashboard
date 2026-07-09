// zoom.routes.ts
import { Router } from "express";
import type { RequestHandler } from "express";

import zoomController from "./zoom.controller.js";

const router = Router();

/**
 * POST /api/integrations/zoom/webhook
 * No protect middleware — Zoom calls this directly. Verified via the
 * CRC secret-token handshake, not a login session.
 */
router.post(
  "/webhook",
  zoomController.webhook as RequestHandler
);

export default router;