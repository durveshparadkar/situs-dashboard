import { Queue } from "bullmq";

/* =====================================================
   REDIS CONNECTION CONFIG FOR BULLMQ
===================================================== */

const connection = {
  host: "127.0.0.1",
  port: 6379,
};

/* =====================================================
   EMAIL QUEUE
===================================================== */

export const emailQueue = new Queue("email-queue", {
  connection,
});