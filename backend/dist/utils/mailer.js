// mailer.ts
//
// Sends transactional emails via Zoho Mail SMTP. Used for demo request
// notifications for now — can be extended to password resets, etc. later.
import nodemailer from "nodemailer";
const ZOHO_SMTP_USER = process.env.ZOHO_SMTP_USER || ""; // durvesh@situsrevenue.com
const ZOHO_SMTP_PASS = process.env.ZOHO_SMTP_PASS || ""; // app-specific password from Zoho
const transporter = nodemailer.createTransport({
    host: "smtp.zoho.in", // use smtp.zoho.com if your account is on the .com data center
    port: 465,
    secure: true, // true for port 465
    auth: {
        user: ZOHO_SMTP_USER,
        pass: ZOHO_SMTP_PASS,
    },
});
export async function sendEmail({ to, subject, html }) {
    if (!ZOHO_SMTP_USER || !ZOHO_SMTP_PASS) {
        console.error("Email not sent — ZOHO_SMTP_USER / ZOHO_SMTP_PASS env vars not set");
        return;
    }
    try {
        await transporter.sendMail({
            from: `"Situs Revenue" <${ZOHO_SMTP_USER}>`,
            to,
            subject,
            html,
        });
        console.log(`Email sent: to=${to} subject="${subject}"`);
    }
    catch (err) {
        /* Never let email failure break the calling request — log and move on */
        console.error("Failed to send email:", err);
    }
}
/**
 * Notification sent to you (the founder) when a new demo request comes in.
 */
export async function sendDemoRequestNotification(opts) {
    const { name, email, company, message } = opts;
    await sendEmail({
        to: ZOHO_SMTP_USER, // sends to yourself
        subject: `New demo request: ${name}`,
        html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px;">
        <h2 style="color: #0A0A0A;">New demo request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        ${company ? `<p><strong>Company:</strong> ${company}</p>` : ""}
        ${message ? `<p><strong>Message:</strong> ${message}</p>` : ""}
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 13px; color: #888;">
          This lead has also been added to your Leads pipeline.
        </p>
      </div>
    `,
    });
}
//# sourceMappingURL=mailer.js.map