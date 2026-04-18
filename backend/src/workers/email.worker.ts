import { Worker } from "bullmq";

/* =====================================================
   REDIS CONNECTION CONFIG
===================================================== */

const connection = {
  host: "127.0.0.1",
  port: 6379,
};

/* =====================================================
   EMAIL WORKER
===================================================== */

new Worker(
  "email-queue",
  async (job) => {
    const { to, subject, body } = job.data;

    console.log("📧 Sending email:", to, subject);

    // Simulate async email sending
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return { success: true };
  },
  { connection }
);

console.log("🚀 Email worker running...");
