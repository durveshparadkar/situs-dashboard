import mongoose, { Schema, Document } from "mongoose";

export interface IWhatsappMessage extends Document {
  phone: string;
  message: string;
  direction: "outgoing" | "incoming";
  status: "sent" | "failed";
  twilioSid?: string;
  createdAt: Date;
}

const WhatsappMessageSchema = new Schema<IWhatsappMessage>(
  {
    phone: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    direction: {
      type: String,
      enum: ["outgoing", "incoming"],
      required: true,
    },
    status: {
      type: String,
      enum: ["sent", "failed"],
      required: true,
    },
    twilioSid: {
      type: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IWhatsappMessage>(
  "WhatsappMessage",
  WhatsappMessageSchema
);