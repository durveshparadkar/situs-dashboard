import mongoose, {
  Schema,
  Types,
  HydratedDocument,
  Model,
} from "mongoose";

/* =====================================================
   TYPES
===================================================== */

export interface IUser {
  email: string;
  password: string;

  organizationId: Types.ObjectId;
  roleId: Types.ObjectId;

  /* Denormalized role string for fast permission checks in middleware.
     Kept in sync with roleId. Reads happen on every authenticated request,
     so we store the string directly to avoid a Role lookup per request. */
  role: string;

  managerId?: Types.ObjectId | null;

  isActive: boolean;
  isEmailVerified: boolean;

  lastLoginAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;

  /* ================= METHODS ================= */
  comparePassword(password: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser>;

/* =====================================================
   SCHEMA
===================================================== */

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false, // 🔥 never expose
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    roleId: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: true,
      index: true,
    },

    role: {
      type: String,
      default: "user",
      index: true,
    },

    managerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    /* ================= SECURITY ================= */

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    /* ================= TRACKING ================= */

    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/* =====================================================
   🔒 UNIQUE CONSTRAINT (MULTI-TENANT SAFE)
===================================================== */

userSchema.index(
  { email: 1, organizationId: 1 },
  { unique: true }
);

/* =====================================================
   ⚡ PERFORMANCE INDEXES
===================================================== */

userSchema.index({ organizationId: 1, roleId: 1 });
userSchema.index({ organizationId: 1, managerId: 1 });

/* =====================================================
   🧠 NORMALIZATION
===================================================== */

userSchema.pre("save", function () {
  if (this.email) {
    this.email = this.email.trim().toLowerCase();
  }
});

/* =====================================================
   🔐 PASSWORD COMPARISON METHOD
===================================================== */

import bcrypt from "bcryptjs";

userSchema.methods.comparePassword = async function (
  candidatePassword: string
) {
  return bcrypt.compare(candidatePassword, this.password);
};

/* =====================================================
   🛡️ GLOBAL SAFE TRANSFORM
   (REMOVES SENSITIVE FIELDS)
===================================================== */

userSchema.set("toJSON", {
  transform: function (_doc: any, ret: any) {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
  virtuals: true,
} as any);

/* =====================================================
   🧱 STATIC HELPERS (ENTERPRISE)
===================================================== */

userSchema.statics.findByEmailAndOrg = function (
  email: string,
  organizationId: Types.ObjectId
) {
  return this.findOne({
    email: email.toLowerCase(),
    organizationId,
  }).select("+password");
};

/* =====================================================
   MODEL
===================================================== */

const User: Model<IUser> =
  mongoose.models.User ||
  mongoose.model<IUser>("User", userSchema);

export default User;




