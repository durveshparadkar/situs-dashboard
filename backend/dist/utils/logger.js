import pino from "pino";
/* =====================================================
   🚀 Logger — Enterprise Grade
===================================================== */
const isDev = process.env.NODE_ENV !== "production";
const isProd = process.env.NODE_ENV === "production";
const LOG_LEVEL = process.env.LOG_LEVEL ?? (isDev ? "debug" : "info");
/* ================= REDACTION ================= */
const REDACT_PATHS = [
    "password",
    "confirmPassword",
    "currentPassword",
    "newPassword",
    "token",
    "accessToken",
    "refreshToken",
    "authorization",
    "req.headers.authorization",
    "req.headers.cookie",
    "*.password",
    "*.token",
    "*.secret",
    "*.apiKey",
    "*.creditCard",
    "*.ssn",
];
/* ================= BASE OPTIONS ================= */
const baseOptions = {
    level: LOG_LEVEL,
    /* ── Standard Fields ── */
    base: {
        pid: process.pid,
        env: process.env.NODE_ENV ?? "development",
        version: process.env.npm_package_version ?? "unknown",
    },
    /* ── Timestamp ── */
    timestamp: pino.stdTimeFunctions.isoTime,
    /* ── Redaction (GDPR / Security) ── */
    redact: {
        paths: REDACT_PATHS,
        censor: "[REDACTED]",
    },
    /* ── Error Serializer ── */
    serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
    },
};
/* ================= DEV TRANSPORT ================= */
const devOptions = {
    ...baseOptions,
    transport: {
        target: "pino-pretty",
        options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
            singleLine: false,
        },
    },
};
/* ================= PROD TRANSPORT ================= */
const prodOptions = {
    ...baseOptions,
    /* Production: structured JSON for log aggregators (Datadog, Loki, etc.) */
    formatters: {
        level(label) {
            return { level: label };
        },
        bindings(bindings) {
            return {
                pid: bindings["pid"],
                host: bindings["hostname"],
                env: bindings["env"],
                version: bindings["version"],
            };
        },
    },
};
/* ================= LOGGER INSTANCE ================= */
const logger = pino(isDev ? devOptions : prodOptions);
/* ================= CHILD LOGGERS ================= */
export const httpLogger = logger.child({ context: "http" });
export const dbLogger = logger.child({ context: "database" });
export const authLogger = logger.child({ context: "auth" });
export const jobLogger = logger.child({ context: "jobs" });
/* ================= STARTUP LOG ================= */
logger.info({
    env: process.env.NODE_ENV,
    level: LOG_LEVEL,
    pid: process.pid,
    isProd,
}, "Logger initialized");
/* ================= PROCESS ERROR LOGGING ================= */
process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception — shutting down");
    process.exit(1);
});
process.on("unhandledRejection", (reason) => {
    logger.fatal({ reason }, "Unhandled promise rejection — shutting down");
    process.exit(1);
});
export default logger;
//# sourceMappingURL=logger.js.map