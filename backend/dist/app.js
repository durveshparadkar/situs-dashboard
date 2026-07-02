import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { v4 as uuid } from "uuid";
/* 🔥 REGISTER EVENT LISTENERS */
import "./modules/leads/lead.listener.js";
/* 🧠 REGISTER BRAIN WORKER */
import "./modules/brain/brain.worker.js";
/* 🎯 REGISTER INTELLIGENCE SCHEDULER */
import { startIntelligenceWorker, scheduleIntelligenceNightly, } from "./modules/intelligence/intelligence.scheduler.js";
startIntelligenceWorker();
void scheduleIntelligenceNightly();
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
import alertRoutes from "./modules/alerts/alert.routes.js";
import analyticsRoutes from "./modules/analytics/analytics.routes.js";
import intelligenceRoutes from "./modules/intelligence/intelligence.routes.js";
import forecastRoutes from "./modules/forecast/forecast.routes.js";
import organizationRoutes from "./modules/organizations/organization.routes.js";
/* ===============================
   MIDDLEWARES
=============================== */
import { requestLogger } from "./shared/middlewares/logger.middleware.js";
import errorMiddleware from "./shared/middlewares/error.middleware.js";
import { apiLimiter } from "./shared/middlewares/rateLimit.middleware.js";
import { serverAdapter } from "./config/queue.ui.js";
const app = express();
/* ===============================
   ENV
=============================== */
const NODE_ENV = process.env.NODE_ENV || "development";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";
const isDev = NODE_ENV !== "production";
/* ===============================
   PRODUCTION SETTINGS
=============================== */
if (!isDev) {
    app.set("trust proxy", 1);
    app.disable("x-powered-by");
}
/* ===============================
   REQUEST ID (TRACEABLE)
=============================== */
app.use((req, res, next) => {
    const requestId = uuid();
    req.headers["x-request-id"] = requestId;
    res.setHeader("x-request-id", requestId);
    next();
});
/* ===============================
   SECURITY
=============================== */
app.use(helmet({
    crossOriginResourcePolicy: false,
}));
/* 🔥 CRITICAL: CORS FIX FOR COOKIES */
const allowedOrigins = [
    "https://situs-dashboard.vercel.app",
    "https://situs-dashboard-enctreo6m-situs-projects2.vercel.app",
    "https://app.situsrevenue.com",
    "https://situsrevenue.com",
];
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));
/* 🔥 MUST COME BEFORE ROUTES */
app.use(cookieParser());
/* ===============================
   PERFORMANCE
=============================== */
app.use(compression());
/* ===============================
   STRIPE WEBHOOK (RAW BODY FIRST)
=============================== */
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
/* ===============================
   BODY PARSERS
=============================== */
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "10mb" }));
/* ===============================
   LOGGING
=============================== */
if (isDev) {
    app.use(requestLogger);
    app.use(morgan("dev"));
}
else {
    app.use(morgan("combined"));
}
/* ===============================
   HEALTH CHECK
=============================== */
app.get("/health", (_req, res) => {
    res.status(200).json({
        success: true,
        status: "ok",
        uptime: process.uptime(),
        timestamp: Date.now(),
        environment: NODE_ENV,
    });
});
/* ===============================
   🚀 ROUTES ORDER (VERY IMPORTANT)
=============================== */
/* ✅ AUTH ROUTES (NO LIMIT — avoid login block) */
app.use("/api/auth", authRoutes);
/* ✅ APPLY LIMIT AFTER AUTH */
app.use("/api", apiLimiter);
/* ✅ CORE ROUTES */
app.use("/api/users", userRoutes);
app.use("/api/leads", leadRoutes);
app.use("/api/deals", dealRoutes);
app.use("/api/pipelines", pipelineRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/brain", brainRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/intelligence", intelligenceRoutes);
app.use("/api/forecast", forecastRoutes);
app.use("/api/organizations", organizationRoutes);
/* ===============================
   QUEUE DASHBOARD
=============================== */
app.use("/admin/queues", serverAdapter.getRouter());
/* ===============================
   ROOT
=============================== */
app.get("/", (_req, res) => {
    res.json({
        name: "Situs API",
        version: "1.0",
        status: "running",
    });
});
/* ===============================
   404 HANDLER
=============================== */
app.use((req, res) => {
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
const shutdown = (signal) => {
    console.log(`${signal} received. Shutting down...`);
    process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
export default app;
//# sourceMappingURL=app.js.map