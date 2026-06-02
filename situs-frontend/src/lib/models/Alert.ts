import { Schema, model, models } from "mongoose";

export type AlertSeverity = "critical" | "watch" | "opportunity";
export type AlertStatus = "new" | "resolved";

export interface IAlert {
  title: string;
  message: string;
  company: string;
  severity: AlertSeverity;
  status: AlertStatus;
  impact: number;
  detectedAt: Date;
  action: string;
  detail: string;

  // future-proof
  riskScore?: number;
}

const AlertSchema = new Schema<IAlert>(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    company: { type: String, required: true },

    severity: {
      type: String,
      enum: ["critical", "watch", "opportunity"],
      required: true,
    },

    status: {
      type: String,
      enum: ["new", "resolved"],
      default: "new",
    },

    impact: { type: Number, required: true },

    detectedAt: {
      type: Date,
      default: Date.now,
    },

    action: { type: String },
    detail: { type: String },

    riskScore: { type: Number },
  },
  {
    timestamps: true,
  }
);

// prevent model overwrite in dev
export const Alert =
  models.Alert || model<IAlert>("Alert", AlertSchema);