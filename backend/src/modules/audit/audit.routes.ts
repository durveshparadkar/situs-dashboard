import { Router, Request, Response } from "express";
import { protect, authorize } from "../../shared/middlewares/auth.middleware.js";
import AuditLog from "./audit.model.js";

const router = Router();

router.get(
  "/",
  protect,
  authorize("READ_ORG"),
  async (req: Request, res: Response) => {
    const logs = await AuditLog.find({
      organizationId: (req as any).user.organizationId,
    })
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      data: logs,
    });
  }
);

export default router;

