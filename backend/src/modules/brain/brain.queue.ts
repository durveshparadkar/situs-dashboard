import { Queue } from "bullmq";

/* =====================================================
   REDIS CONFIG
===================================================== */

const connection = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
};

/* =====================================================
   BRAIN QUEUE
===================================================== */

export const brainQueue = new Queue("brainQueue", {
  connection,

  defaultJobOptions: {
    // Keep system clean
    removeOnComplete: {
      count: 100,
    },
    removeOnFail: {
      count: 50,
    },

    // Retry logic
    attempts: 5,

    backoff: {
      type: "exponential",
      delay: 3000,
    },
  },
});