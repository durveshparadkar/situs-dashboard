import { Router, Request, Response, NextFunction } from "express";
import leadController from "./lead.controller.js";
import leadIntelligenceService from "./leadIntelligence.service.js";
import { protect } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

/* =====================================================
   APPLY AUTH
===================================================== */
router.use(protect);

/* =====================================================
   INTELLIGENCE ROUTES (MUST STAY ABOVE "/:id")
===================================================== */

router.get(
  "/intelligence/summary",
  leadController.getIntelligenceSummary
);

router.get(
  "/intelligence/overview",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result =
        await leadIntelligenceService.getOverview((req as any).user);

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/intelligence/high-priority",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result =
        await leadIntelligenceService.getHighPriorityLeads((req as any).user);

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/intelligence/stale",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result =
        await leadIntelligenceService.getStaleLeads((req as any).user);

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/intelligence/agent-performance",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result =
        await leadIntelligenceService.getAgentPerformance((req as any).user);

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

/* =====================================================
   CREATE & LIST
===================================================== */

router.post("/", leadController.create);
router.get("/", leadController.findAll);

/* =====================================================
   ACTION ROUTES
   (MUST STAY ABOVE "/:id")
===================================================== */

router.patch(
  "/:id/actions/request-escalation",
  leadController.requestEscalation
);

router.patch(
  "/:id/actions/approve-escalation",
  leadController.approveEscalation
);

router.patch(
  "/:id/actions/stage",
  leadController.updateStage
);

router.patch(
  "/:id/actions/archive",
  leadController.archive
);

router.patch(
  "/:id/actions/restore",
  leadController.restore
);

router.get(
  "/:id/actions/activities",
  leadController.getActivities
);

/* =====================================================
   SINGLE LEAD (ALWAYS LAST)
===================================================== */

router.get("/:id", leadController.findOne);
router.patch("/:id", leadController.update);

export default router;