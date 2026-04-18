import { Router } from "express";
import Twilio from "twilio";
import WhatsappMessage from "./whatsapp.model.js";

const router = Router();

/**
 * =====================================
 * SEND WHATSAPP MESSAGE
 * =====================================
 */
router.post("/send", async (req, res) => {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({
      success: false,
      message: "Phone and message are required",
    });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid =
    process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken || !messagingServiceSid) {
    return res.status(500).json({
      success: false,
      message:
        "Twilio environment variables missing (SID / TOKEN / MESSAGING SERVICE)",
    });
  }

  try {
    const client = Twilio(accountSid, authToken);

    const twilioResponse = await client.messages.create({
      body: message,
      to: "whatsapp:" + phone,
      messagingServiceSid: messagingServiceSid,
    });

    const savedMessage = await WhatsappMessage.create({
      phone,
      message,
      direction: "outgoing",
      status: "sent",
      twilioSid: twilioResponse.sid,
    });

    return res.status(200).json({
      success: true,
      data: savedMessage,
    });

  } catch (error: any) {
    console.error("Twilio Error:", error?.code, error?.message);

    await WhatsappMessage.create({
      phone,
      message,
      direction: "outgoing",
      status: "failed",
    });

    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to send WhatsApp message",
    });
  }
});


/**
 * =====================================
 * INCOMING WHATSAPP WEBHOOK
 * =====================================
 * Twilio will call this when user replies
 */
router.post("/webhook", async (req, res) => {
  try {
    const from = req.body.From;   // whatsapp:+9198XXXXXXX
    const body = req.body.Body;   // actual message text

    if (!from || !body) {
      return res.status(400).send("Invalid webhook data");
    }

    const phone = from.replace("whatsapp:", "");

    await WhatsappMessage.create({
      phone,
      message: body,
      direction: "incoming",
      status: "sent",
    });

    return res.status(200).send("Webhook received");

  } catch (error) {
    console.error("Webhook Error:", error);
    return res.status(500).send("Webhook failed");
  }
});

export default router;