import mongoose, { Schema, Document } from "mongoose";

export interface IInvite extends Document {
  email: string;
  organizationId: mongoose.Types.ObjectId;
  role: "AGENT" | "USER";
  token: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdBy: mongoose.Types.ObjectId;
}

const inviteSchema = new Schema<IInvite>(
  {
    email: { type: String, required: true },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    role: { type: String, enum: ["AGENT", "USER"], default: "AGENT" },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const Invite =
  mongoose.models.Invite || mongoose.model<IInvite>("Invite", inviteSchema);

export default Invite;




