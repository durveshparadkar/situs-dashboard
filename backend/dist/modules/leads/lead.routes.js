import { Router } from "express";
import leadController from "./lead.controller.js";
import leadIntelligenceService from "./leadIntelligence.service.js";
import { protect } from "../../shared/middlewares/auth.middleware.js";
import { requirePermission } from "../../shared/middlewares/permission.middleware.js";
const router = Router();
/* =====================================================
   🔐 AUTH LAYER (ENABLE IN PROD)
===================================================== */
router.use(protect);
/* =====================================================
   🧠 INTELLIGENCE ROUTES
===================================================== */
router.get("/intelligence/summary", leadController.getIntelligenceSummary);
router.get("/intelligence/overview", async (req, res, next) => {
    try {
        const result = await leadIntelligenceService.getOverview(req.user ?? null);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
});
router.get("/intelligence/high-priority", async (req, res, next) => {
    try {
        const result = await leadIntelligenceService.getHighPriorityLeads(req.user ?? null);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
});
router.get("/intelligence/stale", async (req, res, next) => {
    try {
        const result = await leadIntelligenceService.getStaleLeads(req.user ?? null);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
});
router.get("/intelligence/agent-performance", async (req, res, next) => {
    try {
        const result = await leadIntelligenceService.getAgentPerformance(req.user ?? null);
        res.json({ success: true, data: result });
    }
    catch (err) {
        next(err);
    }
});
/* =====================================================
   📦 CREATE & LIST
===================================================== */
router.post("/", requirePermission("CREATE_LEAD"), leadController.create);
router.get("/", requirePermission("READ_LEAD"), leadController.findAll);
/* =====================================================
   ⚙️ ACTION ROUTES (CLEANED)
===================================================== */
router.patch("/:id/actions/stage", requirePermission("UPDATE_LEAD"), leadController.updateStage);
router.patch("/:id/actions/archive", requirePermission("UPDATE_LEAD"), leadController.archive);
router.patch("/:id/actions/restore", requirePermission("UPDATE_LEAD"), leadController.restore);
router.get("/:id/actions/activities", requirePermission("READ_LEAD"), leadController.getActivities);
/* =====================================================
   📄 SINGLE LEAD
===================================================== */
router.get("/:id", requirePermission("READ_LEAD"), leadController.findOne);
router.patch("/:id", requirePermission("UPDATE_LEAD"), leadController.update);
router.delete("/:id", requirePermission("DELETE_LEAD", "UPDATE_LEAD"), leadController.archive);
export default router;
//# sourceMappingURL=lead.routes.js.map