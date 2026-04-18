import mongoose, { Schema, Document, Model } from "mongoose";

export interface IEntity extends Document {
  title: string;
  description?: string;
  type: string;
  ownerId: mongoose.Types.ObjectId;
  organizationId?: mongoose.Types.ObjectId;
}

const EntitySchema = new Schema<IEntity>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
    },

    type: {
      type: String,
      default: "generic",
    },

    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
    },
  },
  { timestamps: true }
);

const Entity: Model<IEntity> =
  mongoose.models.Entity || mongoose.model<IEntity>("Entity", EntitySchema);

export default Entity;











