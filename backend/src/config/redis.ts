import { Redis } from "ioredis";

/* =====================================================
   REDIS CONFIG
===================================================== */

const REDIS_URL =
  process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 1,
  retryStrategy: (times: number) => {
    if (times > 3) {
      console.error(
        "❌ Redis not available. Stopping retries."
      );
      return null; // stop retrying
    }
    return 1000; // retry after 1 second
  },
});

/* =====================================================
   EVENTS
===================================================== */

redis.on("connect", () => {
  console.log("🧠 Redis connected");
});

redis.on("error", (err: Error) => {
  console.error("❌ Redis error:", err.message);
});

redis.on("close", () => {
  console.warn("⚠️ Redis connection closed");
});
