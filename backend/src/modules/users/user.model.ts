import mongoose, {
  Schema,
  Types,
  HydratedDocument,
  Model,
} from "mongoose";
import bcrypt from "bcryptjs";

/* =====================================================
   TYPES
===================================================== */

export interface IUser {
  email: string;
  fullName?: string;
  password: string;

  organizationId: Types.ObjectId;
  roleId: Types.ObjectId;

  role: string;

  managerId?: Types.ObjectId | null;

  isActive: boolean;
  isEmailVerified: boolean;

  lastLoginAt?: Date | null;

  resetPasswordToken?: string | null;
  resetPasswordExpiry?: Date | null;

  createdAt: Date;
  updatedAt: Date;

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

    fullName: {
      type: String,
      trim: true,
      default: "",
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
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

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    resetPasswordToken: {
      type: String,
      default: null,
      select: false,
    },

    resetPasswordExpiry: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

/* =====================================================
   UNIQUE CONSTRAINT (MULTI-TENANT SAFE)
===================================================== */

userSchema.index(
  { email: 1, organizationId: 1 },
  { unique: true }
);

/* =====================================================
   PERFORMANCE INDEXES
===================================================== */

userSchema.index({ organizationId: 1, roleId: 1 });
userSchema.index({ organizationId: 1, managerId: 1 });

/* =====================================================
   NORMALIZATION + PASSWORD HASHING
===================================================== */

userSchema.pre("save", async function () {
  if (this.email) {
    this.email = this.email.trim().toLowerCase();
  }

  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});

/* =====================================================
   PASSWORD COMPARISON METHOD
===================================================== */

userSchema.methods.comparePassword = async function (
  candidatePassword: string
) {
  return bcrypt.compare(candidatePassword, this.password);
};

/* =====================================================
   GLOBAL SAFE TRANSFORM
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
   STATIC HELPERS
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




