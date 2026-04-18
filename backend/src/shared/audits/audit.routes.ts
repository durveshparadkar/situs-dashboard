import { Router } from "express";
import AuditLog from "./audit.model.js";
import { protect, authorize } from "../../shared/middlewares/auth.middleware.js";

const router = Router();

router.get(
  "/",
  protect,
  authorize("READ_ORG"),
  async (req: any, res) => {
    const logs = await AuditLog.find({
      organizationId: req.user.organizationId,
    })
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: logs });
  }
);

export default router;
