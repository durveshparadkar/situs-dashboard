import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";

/* 🔥 REGISTER EVENT LISTENERS */
import "./modules/leads/lead.listener.js";

/* 🧠 REGISTER BRAIN WORKER */
import "./modules/brain/brain.worker.js";

/* ===============================
   ROUTES
=============================== */
import authRoutes from "./modules/auth/auth.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import leadRoutes from "./modules/leads/lead.routes.js";
import dealRoutes from "./modules/deals/deal.routes.js";
import pipelineRoutes from "./modules/pipelines/pipeline.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import billingRoutes from "./shared/billing/billing.routes.js";
import whatsappRoutes from "./modules/whatsapp/whatsapp.routes.js";
import brainRoutes from "./modules/brain/brain.routes.js";

/* 🚨 ALERTS */
import alertRoutes from "./modules/alerts/alert.routes.js";

/* ===============================
   MIDDLEWARES
=============================== */
import { requestLogger } from "./shared/middlewares/logger.middleware.js";
import errorMiddleware from "./shared/middlewares/error.middleware.js";
import { apiLimiter } from "./shared/middlewares/rateLimit.middleware.js";
import { globalLimiter } from "./shared/security/rateLimit.js";
import { serverAdapter } from "./config/queue.ui.js";

const app = express();

/* ===============================
   PRODUCTION SETTINGS
=============================== */
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
}

/* ===============================
   SECURITY
=============================== */
app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

/* ===============================
   GLOBAL RATE LIMITER
=============================== */
app.use(globalLimiter);

/* ===============================
   STRIPE WEBHOOK (RAW BODY FIRST)
=============================== */
app.use(
  "/api/billing/webhook",
  express.raw({ type: "application/json" })
);

/* ===============================
   BODY PARSERS
=============================== */
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "10mb" }));

/* ===============================
   DEV LOGGER
=============================== */
if (process.env.NODE_ENV !== "production") {
  app.use(requestLogger);
}

/* ===============================
   API RATE LIMITER
=============================== */
app.use("/api", apiLimiter);

/* ===============================
   HEALTH CHECK
=============================== */
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    status: "ok",
    uptime: process.uptime(),
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || "development",
  });
});

/* ===============================
   MODULE ROUTES
=============================== */
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/deals", dealRoutes);
app.use("/api/pipelines", pipelineRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/whatsapp", whatsappRoutes);

/* 🧠 INTELLIGENCE */
app.use("/api/brain", brainRoutes);

/* 🚨 ALERTS */
app.use("/api/alerts", alertRoutes);

/* ===============================
   QUEUE DASHBOARD
=============================== */
app.use("/admin/queues", serverAdapter.getRouter());

/* ===============================
   404 HANDLER
=============================== */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});

/* ===============================
   GLOBAL ERROR HANDLER
=============================== */
app.use(errorMiddleware);

/* ===============================
   GRACEFUL SHUTDOWN
=============================== */
const shutdown = (signal: string) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

export default app;



















