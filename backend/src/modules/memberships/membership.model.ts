import mongoose, { Schema, Document } from "mongoose";

export type TeamRole = "ORG_ADMIN" | "AGENT" | "USER";

export interface IMembership extends Document {
  userId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  role: TeamRole;
}

const membershipSchema = new Schema<IMembership>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },
    role: {
      type: String,
      enum: ["ORG_ADMIN", "AGENT", "USER"],
      required: true,
    },
  },
  { timestamps: true }
);

// 🚫 Prevent duplicate membership
membershipSchema.index({ userId: 1, teamId: 1 }, { unique: true });

export default mongoose.model<IMembership>("Membership", membershipSchema);
