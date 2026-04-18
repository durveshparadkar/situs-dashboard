import mongoose, { Schema, Document, Model } from "mongoose";

/* ===============================
   ENUMS (Strong Typing)
================================ */

export enum AuditAction {
  CREATE = "CREATE",
  UPDATE = "UPDATE",
  DELETE = "DELETE",
  LOGIN = "LOGIN",
  LOGOUT = "LOGOUT",
  INVITE_SENT = "INVITE_SENT",
}

export enum AuditResource {
  ORGANIZATION = "ORGANIZATION",
  USER = "USER",
  ENTITY = "ENTITY",
  TEAM = "TEAM",
  INVITE = "INVITE",
  BILLING = "BILLING",
}

/* ===============================
   INTERFACE
================================ */

export interface IAuditLog extends Document {
  userId: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/* ===============================
   SCHEMA
================================ */

const auditSchema = new Schema<IAuditLog>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(AuditAction),
      required: true,
      index: true,
    },
    resource: {
      type: String,
      enum: Object.values(AuditResource),
      required: true,
      index: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/* ===============================
   COMPOUND INDEXES
================================ */

// Fast filtering for org activity timeline
auditSchema.index({ organizationId: 1, createdAt: -1 });

// Fast filtering per user
auditSchema.index({ userId: 1, createdAt: -1 });

/* ===============================
   MODEL EXPORT (Safe for HMR)
================================ */

const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog ||
  mongoose.model<IAuditLog>("AuditLog", auditSchema);

export default AuditLog;
