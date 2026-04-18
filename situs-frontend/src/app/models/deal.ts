import { Schema, models, model, InferSchemaType } from "mongoose";

/* ================= CONSTANTS ================= */

export const VALID_STAGES = [
  "Leads",
  "Qualified",
  "Proposal",
  "Negotiation",
  "Won",
] as const;

/* ================= TYPES ================= */

export type Stage = (typeof VALID_STAGES)[number];

/* ================= SCHEMA ================= */

const DealSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    value: {
      type: Number,
      default: 0,
      min: 0,
    },

    probability: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    owner: {
      type: String,
      default: "You",
      trim: true,
    },

    // ✅ STRICT + SAFE ENUM (no mismatch ever again)
    stage: {
      type: String,
      enum: VALID_STAGES,
      default: "Leads",
      index: true,
    },

    // ✅ REQUIRED for drag-drop ordering
    position: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },

    notes: {
      type: String,
      default: "",
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

/* ================= INDEXES ================= */

// 🔥 Fast pipeline sorting
DealSchema.index({ stage: 1, position: 1 });

/* ================= TYPES INFERENCE ================= */

export type DealType = InferSchemaType<typeof DealSchema>;

/* ================= MODEL ================= */

// ✅ prevents model overwrite in Next.js hot reload
const Deal = models.Deal || model("Deal", DealSchema);

export default Deal;