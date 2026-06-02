import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
    },

    company: {
      type: String,
      required: true,
      trim: true,
    },

    /* 🔥 CRITICAL FIX */
    value: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["new", "contacted", "qualified", "converted"],
      default: "new",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.Lead ||
  mongoose.model("Lead", LeadSchema);