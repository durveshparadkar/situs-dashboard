import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";
import { Role } from "../../shared/rbac/roles.js";

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: Role;
  organizationId?: mongoose.Types.ObjectId;
  comparePassword(password: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["SUPER_ADMIN", "ORG_ADMIN", "AGENT", "USER"],
      default: "USER",
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: false,
    },
  },
  { timestamps: true }
);

// ✅ HASH PASSWORD BEFORE SAVE
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// ✅ COMPARE PASSWORD
userSchema.methods.comparePassword = async function (
  enteredPassword: string
): Promise<boolean> {
  return bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model<IUser>("User", userSchema);

export default User;



































