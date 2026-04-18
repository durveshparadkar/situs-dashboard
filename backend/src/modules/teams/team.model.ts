import mongoose, { Schema, Document } from "mongoose";

export interface ITeam extends Document {
  name: string;
  organizationId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  members: mongoose.Types.ObjectId[];
}

const teamSchema = new Schema<ITeam>(
  {
    name: {
      type: String,
      required: true,
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

const Team =
  mongoose.models.Team || mongoose.model<ITeam>("Team", teamSchema);

export default Team;



