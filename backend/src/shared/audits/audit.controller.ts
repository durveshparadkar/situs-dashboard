import { Request, Response } from "express";
import AuditLog from "../../shared/audits/audit.model.js";

interface AuthRequest extends Request {
  user?: {
    _id: string;
    organizationId?: string;
    role?: string;
  };
}

/* ===============================
   GET AUDIT LOGS (ADMIN)
================================ */

export const getAuditLogs = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const orgId = req.user?.organizationId;
    const role = req.user?.role;

    if (!orgId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Optional: Only ORG_ADMIN can view logs
    if (role !== "ORG_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const { page = 1, limit = 20, action } = req.query;

    const filter: any = {
      organizationId: orgId,
    };

    if (action) {
      filter.action = action;
    }

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .populate("userId", "name email");

    const total = await AuditLog.countDocuments(filter);

    return res.status(200).json({
      success: true,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: logs,
    });
  } catch (error) {
    console.error("GET AUDIT LOGS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};