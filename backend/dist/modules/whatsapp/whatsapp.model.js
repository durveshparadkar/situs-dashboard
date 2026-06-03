import mongoose, { Schema } from "mongoose";
const WhatsappMessageSchema = new Schema({
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
}, { timestamps: true });
export default mongoose.model("WhatsappMessage", WhatsappMessageSchema);
//# sourceMappingURL=whatsapp.model.js.map