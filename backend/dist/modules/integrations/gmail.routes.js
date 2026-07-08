// gmail.routes.ts
import { Router } from "express";
import gmailController from "./gmail.controller.js";
import { protect } from "../../shared/middlewares/auth.middleware.js";
const router = Router();
/**
 * GET /api/integrations/gmail/connect
 * Requires login — redirects to Google's consent screen.
 */
router.get("/connect", protect, gmailController.connect);
/**
 * GET /api/integrations/gmail/callback
 * Google redirects here. No protect middleware — see controller
 * comment for why (identity comes from the signed state param).
 */
router.get("/callback", gmailController.callback);
/**
 * GET /api/integrations/gmail/status
 */
router.get("/status", protect, gmailController.status);
/**
 * DELETE /api/integrations/gmail
 */
router.delete("/", protect, gmailController.disconnect);
export default router;
//# sourceMappingURL=gmail.routes.js.map