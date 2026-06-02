import mongoose, { Schema, models } from "mongoose";

const NotificationSchema = new Schema(
  {
    title: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Notification =
  models.Notification || mongoose.model("Notification", NotificationSchema);

export default Notification;