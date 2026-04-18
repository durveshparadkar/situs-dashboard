import { Request } from "express";
import mongoose from "mongoose";
import AuditLog from "../../modules/audit/audit.model.js";

interface LogAuditParams {
  organizationId: string;
  actorId: string;
  action: string;
  resource: string;
  resourceId?: string;
  meta?: Record<string, any>;
  req: Request;
}

export const logAudit = async ({
  organizationId,
  actorId,
  action,
  resource,
  resourceId,
  meta = {},
  req,
}: LogAuditParams): Promise<void> => {
  try {
    const audit = new AuditLog({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      actorId: new mongoose.Types.ObjectId(actorId),
      action,
      resource,
      resourceId: resourceId
        ? new mongoose.Types.ObjectId(resourceId)
        : undefined,
      meta,
      ip: req.ip,
      userAgent: req.get("user-agent") || "",
    });

    await audit.save();
  } catch (error) {
    console.error("❌ AUDIT LOG FAILED:", error);
  }
};
