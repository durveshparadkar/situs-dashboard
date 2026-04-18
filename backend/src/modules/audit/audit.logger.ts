import mongoose from "mongoose";
import AuditLog, {
  AuditAction,
  AuditResource,
} from "../../modules/audit/audit.model.js";

interface LogAuditParams {
  organizationId: string;
  userId?: string; // allow system-level logs
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export const logAudit = async ({
  organizationId,
  userId,
  action,
  resource,
  resourceId,
  metadata = {},
}: LogAuditParams): Promise<void> => {
  try {
    await AuditLog.create({
      organizationId: new mongoose.Types.ObjectId(organizationId),
      userId: userId
        ? new mongoose.Types.ObjectId(userId)
        : undefined,
      action,
      resource,
      resourceId: resourceId
        ? new mongoose.Types.ObjectId(resourceId)
        : undefined,
      metadata,
    });
  } catch (error) {
    // Never throw audit errors (audit must not break main flow)
    console.error("❌ AUDIT LOG FAILED:", {
      action,
      resource,
      organizationId,
      error: error instanceof Error ? error.message : error,
    });
  }
};
