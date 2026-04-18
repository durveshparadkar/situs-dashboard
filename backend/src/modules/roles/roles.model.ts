import mongoose, { Schema, Document } from "mongoose";

export interface IRole extends Document {
  name: string;
  permissions: string[];
}

const roleSchema = new Schema<IRole>({
  name: {
    type: String,
    required: true,
    enum: ["SUPER_ADMIN", "ORG_ADMIN", "AGENT, USER"],
  },
  permissions: {
    type: [String],
    default: [],
  },
});

const Role = mongoose.model<IRole>("Role", roleSchema);
export default Role;


