// mailer.ts
//
// Sends transactional emails via the Resend HTTP API (https://resend.com).
// Switched from Zoho SMTP because Render's free tier blocks outbound SMTP
// ports (465/587/25), causing ETIMEDOUT on every send. Resend sends over
// HTTPS (port 443), which Render does not block.
//
// Requires RESEND_API_KEY env var (set on Render dashboard -> Environment).
// The "from" address must be on a domain verified in the Resend dashboard
// (Domains -> situsrevenue.com -> DNS records added -> Verified).
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_API_URL = "https://api.resend.com/emails";
// This must be an address on your Resend-verified domain.
// Using your existing Zoho address is fine as long as situsrevenue.com
// shows "Verified" in the Resend dashboard.
const FROM_ADDRESS = "Situs Revenue <durvesh@situsrevenue.com>";
// Where founder notifications land — change if you want a different inbox.
const NOTIFY_TO = process.env.ZOHO_SMTP_USER || "durvesh@situsrevenue.com";
export async function sendEmail({ to, subject, html }) {
    if (!RESEND_API_KEY) {
        console.error("Email not sent — RESEND_API_KEY env var not set");
        return;
    }
    try {
        const response = await fetch(RESEND_API_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: FROM_ADDRESS,
                to: [to],
                subject,
                html,
            }),
        });
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Failed to send email: ${response.status} ${errorBody}`);
            return;
        }
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
        to: NOTIFY_TO,
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