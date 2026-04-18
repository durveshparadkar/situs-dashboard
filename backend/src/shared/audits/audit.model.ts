import mongoose, { Schema, Document } from "mongoose";

/* ===============================
   AUDIT ACTIONS (STANDARDIZED)
================================ */

export const AUDIT_ACTIONS = {
  // Generic
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",

  // Organization
  ORGANIZATION_CREATED: "ORGANIZATION_CREATED",

  // Invites
  INVITE_CREATED: "INVITE_CREATED",
  INVITE_ACCEPTED: "INVITE_ACCEPTED",
  INVITE_REVOKED: "INVITE_REVOKED",

  // Users
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  USER_DELETED: "USER_DELETED",

  // Teams
  TEAM_CREATED: "TEAM_CREATED",
  TEAM_UPDATED: "TEAM_UPDATED",
  TEAM_DELETED: "TEAM_DELETED",
} as const;

export type AuditAction =
  (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/* ===============================
   AUDIT RESOURCES
================================ */

export const AUDIT_RESOURCES = {
  ORGANIZATION: "ORGANIZATION",
  USER: "USER",
  INVITE: "INVITE",
  TEAM: "TEAM",
  ENTITY: "ENTITY",
  BILLING: "BILLING",
} as const;

export type AuditResource =
  (typeof AUDIT_RESOURCES)[keyof typeof AUDIT_RESOURCES];

/* ===============================
   INTERFACE
================================ */

export interface IAuditLog extends Document {
  organizationId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: mongoose.Types.ObjectId;
  meta?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

/* ===============================
   SCHEMA
================================ */

const AuditLogSchema = new Schema<IAuditLog>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: Object.values(AUDIT_ACTIONS), // ✅ Controlled enum
      required: true,
      trim: true,
      index: true,
    },

    resource: {
      type: String,
      enum: Object.values(AUDIT_RESOURCES), // ✅ Controlled enum
      required: true,
      trim: true,
      index: true,
    },

    resourceId: {
      type: Schema.Types.ObjectId,
    },

    meta: {
      type: Schema.Types.Mixed,
      default: {},
    },

    ip: {
      type: String,
    },

    userAgent: {
      type: String,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

/* ===============================
   ENTERPRISE INDEXES
================================ */

AuditLogSchema.index({ organizationId: 1, createdAt: -1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ createdAt: -1 });

/* ===============================
   SAFE MODEL EXPORT
================================ */

const AuditLog =
  mongoose.models.AuditLog ||
  mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);

export default AuditLog;
