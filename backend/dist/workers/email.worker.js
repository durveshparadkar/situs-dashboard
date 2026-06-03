import { Worker } from "bullmq";
import nodemailer from "nodemailer";
/* =====================================================
   REDIS CONFIG (ENV BASED)
===================================================== */
const connection = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
};
/* =====================================================
   MAILER (NODEMAILER)
===================================================== */
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});
/* =====================================================
   EMAIL SENDER
===================================================== */
async function sendEmail(data) {
    await transporter.sendMail({
        from: `"Situs" <${process.env.SMTP_USER}>`,
        to: data.to,
        subject: data.subject,
        html: data.html,
    });
}
/* =====================================================
   WORKER
===================================================== */
const worker = new Worker("email-queue", async (job) => {
    const { to, subject } = job.data;
    console.log(`📧 Processing job ${job.id} → ${to}`);
    await sendEmail(job.data);
    return { success: true };
}, {
    connection,
    concurrency: 5, // 🔥 parallel emails
});
/* =====================================================
   EVENTS (CRITICAL FOR DEBUGGING)
===================================================== */
worker.on("completed", (job) => {
    console.log(`✅ Email sent → Job ${job.id}`);
});
worker.on("failed", (job, err) => {
    console.error(`❌ Email failed → Job ${job?.id}, err.message: ${err.message}`);
});
worker.on("error", (err) => {
    console.error("🚨 Worker error:", err);
});
/* =====================================================
   START LOG
===================================================== */
console.log("🚀 Email worker running...");
//# sourceMappingURL=email.worker.js.map