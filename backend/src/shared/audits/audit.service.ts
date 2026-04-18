import AuditLog from "./audit.model.js";

/* ===============================
   TYPES
================================ */

interface AuditPayload {
  action: string;
  resource?: string;
  resourceId?: string;
  userId?: string;
  organizationId?: string;
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
}

/* ===============================
   AUDIT LOGGER
================================ */

export const logAudit = async ({
  action,
  resource,
  resourceId,
  userId,
  organizationId,
  metadata = {},
  ip,
  userAgent,
}: AuditPayload): Promise<void> => {
  try {
    await AuditLog.create({
      action,
      resource,
      resourceId,
      userId,
      organizationId,
      metadata,
      ip,
      userAgent,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("❌ AUDIT LOG FAILED:", error);
  }
};

