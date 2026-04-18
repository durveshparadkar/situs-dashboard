import mongoose, { Schema, Document, Model } from "mongoose";

/* =====================================================
   INTERFACE
===================================================== */

export interface IAlert extends Document {
  type: "risk" | "opportunity" | "warning";
  severity: "low" | "medium" | "high" | "critical";

  title: string;
  message: string;

  relatedTo: {
    type: "lead" | "deal";
    id: mongoose.Types.ObjectId;
  };

  organizationId: mongoose.Types.ObjectId;

  /* 🔥 STATE */
  status: "active" | "resolved";
  isRead: boolean;

  /* 🧠 INTELLIGENCE */
  dedupKey?: string; // prevent duplicate alerts
  metadata?: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

/* =====================================================
   SCHEMA
===================================================== */

const AlertSchema = new Schema<IAlert>(
  {
    /* ================= BASIC ================= */

    type: {
      type: String,
      enum: ["risk", "opportunity", "warning"],
      required: true,
      index: true,
    },

    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      required: true,
      index: true,
    },

    title: { type: String, required: true },
    message: { type: String, required: true },

    /* ================= RELATION ================= */

    relatedTo: {
      type: {
        type: String,
        enum: ["lead", "deal"],
        required: true,
      },
      id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
    },

    /* ================= MULTI TENANT ================= */

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    /* ================= STATE ================= */

    status: {
      type: String,
      enum: ["active", "resolved"],
      default: "active",
      index: true,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    /* ================= INTELLIGENCE ================= */

    dedupKey: {
      type: String,
      index: true,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/* =====================================================
   INDEXES (🔥 VERY IMPORTANT)
===================================================== */

// fast filtering
AlertSchema.index({ organizationId: 1, status: 1 });
AlertSchema.index({ organizationId: 1, isRead: 1 });

// deduplication
AlertSchema.index({ dedupKey: 1 });

// sorting
AlertSchema.index({ createdAt: -1 });

// relation-based queries
AlertSchema.index({ "relatedTo.id": 1 });

/* =====================================================
   EXPORT (SAFE)
===================================================== */

const Alert: Model<IAlert> =
  mongoose.models.Alert ||
  mongoose.model<IAlert>("Alert", AlertSchema);

export default Alert;