import mongoose, { Schema, Document } from "mongoose";

export type UserRole = "ADMIN" | "MANAGER" | "AGENT";

export interface IUser extends Document {
  email: string;
  role: UserRole;
  organizationId: mongoose.Types.ObjectId;
  managerId?: mongoose.Types.ObjectId | null;
}

const userSchema = new Schema<IUser>(
  {
    email: { 
      type: String, 
      required: true,
      lowercase: true,
      trim: true,
    },

    role: {
      type: String,
      enum: ["ADMIN", "MANAGER", "AGENT"],
      default: "AGENT",
      required: true,
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    // Only for AGENTS
    // Defines which manager they belong to
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index for multi-tenant SaaS safety
userSchema.index({ organizationId: 1, role: 1 });

const User =
  mongoose.models.User || mongoose.model<IUser>("User", userSchema);

export default User;




