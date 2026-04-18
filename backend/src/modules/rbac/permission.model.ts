import mongoose, { Schema, Document } from "mongoose";

export interface IPermission extends Document {
  name: string;
  description?: string;
}

const permissionSchema = new Schema<IPermission>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IPermission>("Permission", permissionSchema);
