import { Router, } from "express";
import activityController from "./activity.controller.js";
import { protect, } from "../../shared/middlewares/auth.middleware.js";
/* =====================================================
   ROUTER
===================================================== */
const router = Router();
/* =====================================================
   TIMELINE
===================================================== */
router.get("/timeline", protect, activityController.getTimeline);
/* =====================================================
   PROVIDER ACTIVITIES
===================================================== */
router.get("/provider/:provider", protect, activityController.getByProvider);
/* =====================================================
   RECENT RISKS
===================================================== */
router.get("/risks", protect, activityController.getRecentRisks);
/* =====================================================
   SENTIMENT SUMMARY
===================================================== */
router.get("/sentiment", protect, activityController.getSentimentSummary);
/* =====================================================
   EXPORT
===================================================== */
export default router;
//# sourceMappingURL=activity.routes.js.map