import { Router } from "express";
import Twilio from "twilio";

const router = Router();

router.get("/test-whatsapp", async (req, res) => {
  try {
    const client = Twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );

    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER!,
      to: "whatsapp:+917045643910", // replace with your number
      body: "Backend WhatsApp test 🚀"
    });

    res.json({ success: true, sid: message.sid });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send" });
  }
});

export default router;