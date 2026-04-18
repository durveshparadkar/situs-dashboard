import "dotenv/config";
import http from "http";
import app from "./app.js";
import { connectDB } from "./config/db.js";

const PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI;

let server: http.Server;

/* =====================================================
   🚀 BOOTSTRAP SERVER
===================================================== */

async function bootstrap() {
  try {
    if (!MONGO_URI) {
      console.error("❌ MONGO_URI is missing in .env");
      process.exit(1);
    }

    console.log("🔌 Connecting to MongoDB...");
    await connectDB(MONGO_URI);
    console.log("✅ MongoDB connected");

    server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`🚀 SITUS Backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

bootstrap();

/* =====================================================
   🛑 GRACEFUL SHUTDOWN (Production Safe)
===================================================== */

const shutdown = (signal: string) => {
  console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);

  if (server) {
    server.close(() => {
      console.log("✅ HTTP server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error("❌ Forced shutdown");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error("🔥 Uncaught Exception:", err);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (err) => {
  console.error("🔥 Unhandled Rejection:", err);
  shutdown("unhandledRejection");
});














