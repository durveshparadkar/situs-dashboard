import mongoose, { Schema, Types, Model } from "mongoose";

/* =====================================================
   TYPES
===================================================== */

export type RoleName =
  | "SUPER_ADMIN"
  | "ORG_ADMIN"
  | "MANAGER"
  | "AGENT"
  | "USER";

export interface IRole {
  name: RoleName;
  permissions: string[];

  isSystem: boolean; // 🔥 system roles cannot be deleted
  organizationId?: Types.ObjectId | null; // 🔥 for custom org roles

  createdAt: Date;
  updatedAt: Date;
}

type RoleDocument = mongoose.HydratedDocument<IRole>;

/* =====================================================
   SCHEMA
===================================================== */

const roleSchema = new Schema<RoleDocument>(
  {
    name: {
      type: String,
      required: true,
      enum: ["SUPER_ADMIN", "ORG_ADMIN", "MANAGER", "AGENT", "USER"],
      uppercase: true,
      trim: true,
      index: true,
    },

    permissions: {
      type: [String],
      default: [],
    },

    /* ================= SYSTEM CONTROL ================= */

    isSystem: {
      type: Boolean,
      default: true,
      index: true,
    },

    /* ================= MULTI-TENANT ================= */

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/* =====================================================
   🔥 UNIQUE CONSTRAINT
===================================================== */

// Prevent duplicate roles per org
roleSchema.index(
  { name: 1, organizationId: 1 },
  { unique: true }
);

/* =====================================================
   🔥 DATA NORMALIZATION
===================================================== */

roleSchema.pre("validate", function () {
  const doc = this as RoleDocument;

  if (doc.name) {
    doc.name = doc.name.toUpperCase() as RoleName;
  }

  // remove duplicate permissions
  if (doc.permissions?.length) {
    doc.permissions = [...new Set(doc.permissions)];
  }
});

/* =====================================================
   🚀 MODEL EXPORT
===================================================== */

const Role: Model<IRole> =
  mongoose.models.Role ||
  mongoose.model<IRole>("Role", roleSchema);

export default Role;

