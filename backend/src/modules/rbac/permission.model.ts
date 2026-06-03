import mongoose, {
  Schema,
  Types,
  HydratedDocument,
  Model,
} from "mongoose";

/* =====================================================
   🔐 TYPES
===================================================== */

export interface IPermission {
  name: string; // e.g. CREATE_TEAM
  description?: string;

  resource: string; // e.g. TEAM, LEAD
  action: string; // e.g. CREATE, READ, UPDATE

  isSystem: boolean; // 🔥 system vs custom
  organizationId?: Types.ObjectId | null; // 🔥 multi-tenant override

  createdAt: Date;
  updatedAt: Date;
}

export type PermissionDocument = HydratedDocument<IPermission>;

/* =====================================================
   🧠 SCHEMA
===================================================== */

const permissionSchema = new Schema<IPermission>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    description: {
      type: String,
      trim: true,
    },

    resource: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },

    action: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },

    isSystem: {
      type: Boolean,
      default: true, // 🔥 default = system permission
      index: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

/* =====================================================
   🔥 VALIDATION & NORMALIZATION
===================================================== */

permissionSchema.pre("validate", function () {
  const doc = this as PermissionDocument;

  if (doc.name) doc.name = doc.name.trim().toUpperCase();
  if (doc.resource) doc.resource = doc.resource.trim().toUpperCase();
  if (doc.action) doc.action = doc.action.trim().toUpperCase();
});

/* =====================================================
   ⚡ UNIQUE INDEX STRATEGY
   - System permissions: global unique
   - Custom permissions: per org unique
===================================================== */

permissionSchema.index(
  { name: 1, organizationId: 1 },
  { unique: true }
);

/* =====================================================
   ⚡ QUERY OPTIMIZATION INDEXES
===================================================== */

permissionSchema.index({ resource: 1, action: 1 });
permissionSchema.index({ organizationId: 1, isSystem: 1 });

/* =====================================================
   🚀 MODEL
===================================================== */

const Permission: Model<IPermission> =
  (mongoose.models.Permission as Model<IPermission>) ||
  mongoose.model<IPermission>("Permission", permissionSchema);

export default Permission;
