import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRole extends Document {
  name: string;
  permissions: Types.ObjectId[];
  organizationId?: Types.ObjectId;
}

const roleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    permissions: [
      {
        type: Schema.Types.ObjectId,
        ref: "Permission",
      },
    ],
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IRole>("Role", roleSchema);
