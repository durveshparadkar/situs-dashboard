// db.ts
//
// MongoDB connection management. Centralizes connection lifecycle,
// retry logic, graceful shutdown, health checks, and observability.
//
// Design:
//   - Connection pool tuned for production (minPoolSize, maxPoolSize)
//   - Exponential backoff retry on initial connection failure
//   - Connection event listeners for observability
//   - Graceful shutdown on SIGINT/SIGTERM
//   - Health check helper for /health and /ready endpoints
//   - Strict mode + sane defaults
//   - Connection state introspection
//
// Usage:
//   import { connectDB, disconnectDB, isDbConnected } from "./config/db.js";
//
//   await connectDB(process.env.MONGO_URI);
//   // ...app starts...
//
//   process.on("SIGTERM", async () => {
//     await disconnectDB();
//     process.exit(0);
//   });

import mongoose from "mongoose";

import { dbLogger } from "../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const DB_CONFIG = {
  /**
   * Connection pool size.
   *   - minPoolSize: connections kept warm even when idle. Set 2-5 for
   *     production so first requests aren't slow.
   *   - maxPoolSize: ceiling. Mongo Atlas free tier is 500 max connections
   *     across all clients. 10 is a safe per-instance default.
   */
  minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE ?? "2", 10),
  maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE ?? "10", 10),

  /**
   * Server selection timeout — how long to wait for a server to be available
   * before failing the operation. Default 30s is too long; 10s is more
   * appropriate for snappy failure detection.
   */
  serverSelectionTimeoutMs: parseInt(process.env.MONGO_SERVER_TIMEOUT_MS ?? "10000", 10),

  /**
   * Socket timeout — how long an idle socket stays open. Defaults to 0
   * (never timeout) which can hold dead connections forever. 45s is sane.
   */
  socketTimeoutMs: parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS ?? "45000", 10),

  /**
   * Connection timeout — initial TCP connection deadline. 10s.
   */
  connectTimeoutMs: parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS ?? "10000", 10),

  /**
   * Heartbeat frequency — how often Mongo driver pings servers to check
   * health. Default 10s. Lower = faster failure detection, more overhead.
   */
  heartbeatFrequencyMs: parseInt(process.env.MONGO_HEARTBEAT_MS ?? "10000", 10),

  /**
   * Retry logic for initial connection failures. Production deployments
   * sometimes start before the DB is reachable (containers booting in
   * different order). Backoff lets the app retry instead of crashing.
   */
  maxRetries:           parseInt(process.env.MONGO_MAX_RETRIES ?? "5", 10),
  initialRetryDelayMs:  parseInt(process.env.MONGO_INITIAL_RETRY_MS ?? "1000", 10),
  maxRetryDelayMs:      parseInt(process.env.MONGO_MAX_RETRY_MS ?? "30000", 10),

  /**
   * Whether to exit the process on permanent connection failure.
   * Default: true in production, false in development (so dev iteration
   * isn't blocked by transient DB issues).
   */
  exitOnFailure: process.env.MONGO_EXIT_ON_FAILURE !== "false",

  /**
   * Whether to enable Mongoose query debugging. Useful in dev, noisy
   * in production. Set MONGO_DEBUG=true to enable explicitly.
   */
  enableDebug: process.env.MONGO_DEBUG === "true",

  /**
   * Whether to use strict query mode. Mongoose 7+ default. Catches
   * field-name typos in queries.
   */
  strictQuery: true,
} as const;

// ============================================================
// CONNECTION STATE
// ============================================================

let isConnecting        = false;
let connectionPromise: Promise<typeof mongoose> | null = null;
let lastConnectionError: Error | null = null;
let connectionAttempts  = 0;

// ============================================================
// HELPERS
// ============================================================

/**
 * Mongoose connection ready states:
 *   0 = disconnected
 *   1 = connected
 *   2 = connecting
 *   3 = disconnecting
 *   99 = uninitialized
 */
const CONNECTION_STATES = {
  DISCONNECTED:  0,
  CONNECTED:     1,
  CONNECTING:    2,
  DISCONNECTING: 3,
  UNINITIALIZED: 99,
} as const;

type ConnectionStateName = "disconnected" | "connected" | "connecting" | "disconnecting" | "uninitialized";

function getStateName(state: number): ConnectionStateName {
  switch (state) {
    case 0:  return "disconnected";
    case 1:  return "connected";
    case 2:  return "connecting";
    case 3:  return "disconnecting";
    default: return "uninitialized";
  }
}

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter.
 */
function getRetryDelay(attempt: number): number {
  const base   = DB_CONFIG.initialRetryDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(base, DB_CONFIG.maxRetryDelayMs);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = capped * 0.25 * (Math.random() * 2 - 1);
  return Math.max(100, Math.round(capped + jitter));
}

/**
 * Sanitize URI for logging — remove password.
 */
function sanitizeUri(uri: string): string {
  try {
    return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+):[^@]+@/, "$1:**@");
  } catch {
    return "[unparseable-uri]";
  }
}

// ============================================================
// EVENT LISTENERS — observability
// ============================================================

function attachEventListeners(): void {
  const conn = mongoose.connection;

  // Remove any existing listeners to prevent duplicate attachment
  // when connectDB is called multiple times (test suites, retries).
  conn.removeAllListeners("connected");
  conn.removeAllListeners("disconnected");
  conn.removeAllListeners("error");
  conn.removeAllListeners("reconnected");
  conn.removeAllListeners("close");

  conn.on("connected", () => {
    dbLogger.info(
      "MongoDB connection event: connected " +
      "host=" + (conn.host ?? "unknown") +
      " db=" + (conn.name ?? "unknown")
    );
  });

  conn.on("disconnected", () => {
    dbLogger.warn(
      "MongoDB connection event: disconnected " +
      "host=" + (conn.host ?? "unknown")
    );
  });

  conn.on("reconnected", () => {
    dbLogger.info(
      "MongoDB connection event: reconnected " +
      "host=" + (conn.host ?? "unknown")
    );
  });

  conn.on("error", (err: Error) => {
    lastConnectionError = err;
    dbLogger.error(
      "MongoDB connection event: error " +
      "message=" + (err?.message ?? "unknown")
    );
  });

  conn.on("close", () => {
    dbLogger.info("MongoDB connection event: closed");
  });
}

// ============================================================
// CONNECT WITH RETRY
// ============================================================

async function attemptConnection(
  mongoUri: string,
  attempt:  number
): Promise<typeof mongoose> {
  dbLogger.info(
    "MongoDB connecting: attempt=" + attempt + "/" + DB_CONFIG.maxRetries +
    " uri=" + sanitizeUri(mongoUri)
  );

  const connectOptions = {
    minPoolSize:              DB_CONFIG.minPoolSize,
    maxPoolSize:              DB_CONFIG.maxPoolSize,
    serverSelectionTimeoutMS: DB_CONFIG.serverSelectionTimeoutMs,
    socketTimeoutMS:          DB_CONFIG.socketTimeoutMs,
    connectTimeoutMS:         DB_CONFIG.connectTimeoutMs,
    heartbeatFrequencyMS:     DB_CONFIG.heartbeatFrequencyMs,
    // Auto-reconnect is built into the driver as of Mongoose 5+; no manual
    // bufferCommands tweaks needed for typical apps.
    autoIndex:                process.env.NODE_ENV !== "production",
    // In production, indexes should be managed via deploy scripts, not
    // auto-built on app startup (slow + can mask schema drift).
  };

  return mongoose.connect(mongoUri, connectOptions);
}

/**
 * Connect to MongoDB with retry logic and full observability.
 * Idempotent — calling multiple times returns the same connection.
 */
export async function connectDB(mongoUri: string): Promise<typeof mongoose> {
  // Validate input
  if (!mongoUri || typeof mongoUri !== "string") {
    const err = new Error("MongoDB URI is required and must be a string");
    dbLogger.error("MongoDB connect failed: " + err.message);
    if (DB_CONFIG.exitOnFailure) {
      process.exit(1);
    }
    throw err;
  }

  // If already connected, return existing connection
  if (mongoose.connection.readyState === CONNECTION_STATES.CONNECTED) {
    dbLogger.info("MongoDB already connected, reusing connection");
    return mongoose;
  }

  // If connection is in progress, wait for it
  if (isConnecting && connectionPromise) {
    dbLogger.info("MongoDB connection in progress, awaiting existing attempt");
    return connectionPromise;
  }

  isConnecting       = true;
  lastConnectionError = null;
  connectionAttempts  = 0;

  // Apply global Mongoose settings
  mongoose.set("strictQuery", DB_CONFIG.strictQuery);

  if (DB_CONFIG.enableDebug) {
    mongoose.set("debug", true);
    dbLogger.warn("MongoDB query debugging ENABLED — verbose logging");
  }

  // Attach event listeners before connecting
  attachEventListeners();

  connectionPromise = (async () => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= DB_CONFIG.maxRetries; attempt++) {
      connectionAttempts = attempt;

      try {
        const result = await attemptConnection(mongoUri, attempt);

        dbLogger.info(
          "MongoDB connected successfully: " +
          "host=" + (mongoose.connection.host ?? "unknown") +
          " db=" + (mongoose.connection.name ?? "unknown") +
          " attempts=" + attempt
        );

        isConnecting        = false;
        lastConnectionError = null;
        return result;
      } catch (err) {
        lastError = err as Error;
        lastConnectionError = lastError;

        dbLogger.error(
          "MongoDB connection attempt failed: " +
          "attempt=" + attempt + "/" + DB_CONFIG.maxRetries +
          " error=" + (lastError.message ?? "unknown")
        );

        if (attempt < DB_CONFIG.maxRetries) {
          const delay = getRetryDelay(attempt);
          dbLogger.info(
            "MongoDB retrying in " + delay + "ms"
          );
          await sleep(delay);
        }
      }
    }

    // All retries exhausted
    isConnecting = false;

    const finalError = new Error(
      "MongoDB connection failed after " + DB_CONFIG.maxRetries +
      " attempts. Last error: " + (lastError?.message ?? "unknown")
    );

    dbLogger.error(finalError.message);

    if (DB_CONFIG.exitOnFailure) {
      dbLogger.error("Exiting process due to MongoDB connection failure");
      process.exit(1);
    }

    throw finalError;
  })();

  try {
    return await connectionPromise;
  } finally {
    if (!isConnecting) {
      connectionPromise = null;
    }
  }
}

// ============================================================
// DISCONNECT — graceful shutdown
// ============================================================

/**
 * Disconnect from MongoDB. Call from SIGTERM/SIGINT handlers
 * for graceful shutdown.
 */
export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState === CONNECTION_STATES.DISCONNECTED) {
    dbLogger.info("MongoDB already disconnected");
    return;
  }

  try {
    dbLogger.info("MongoDB disconnecting...");
    await mongoose.connection.close();
    dbLogger.info("MongoDB disconnected gracefully");
  } catch (err) {
    dbLogger.error(
      "MongoDB disconnect error: " +
      ((err as Error)?.message ?? "unknown")
    );
    throw err;
  }
}

// ============================================================
// HEALTH CHECK
// ============================================================

export interface DbHealthStatus {
  connected:   boolean;
  state:       ConnectionStateName;
  stateCode:   number;
  host?:       string;
  database?:   string;
  attempts:    number;
  lastError?:  string;
  poolSize?:   {
    min:     number;
    max:     number;
  };
  pingMs?:    number;
}

/**
 * Check DB connection health. Returns detailed status suitable for
 * /health and /ready endpoints.
 */
export async function getDbHealth(): Promise<DbHealthStatus> {
  const state    = mongoose.connection.readyState;
  const stateName = getStateName(state);
  const connected = state === CONNECTION_STATES.CONNECTED;

  const status: DbHealthStatus = {
    connected,
    state:     stateName,
    stateCode: state,
    attempts:  connectionAttempts,
    poolSize: {
      min: DB_CONFIG.minPoolSize,
      max: DB_CONFIG.maxPoolSize,
    },
  };

  if (mongoose.connection.host) {
    status.host = mongoose.connection.host;
  }
  if (mongoose.connection.name) {
    status.database = mongoose.connection.name;
  }
  if (lastConnectionError) {
    status.lastError = lastConnectionError.message;
  }

  // Active ping check if connected
  if (connected) {
    try {
      const start = Date.now();
      const db    = mongoose.connection.db;
      if (db) {
        await db.admin().ping();
        status.pingMs = Date.now() - start;
      }
    } catch (err) {
      // Ping failed — connection is stale despite readyState saying connected
      status.connected = false;
      status.lastError = "Ping failed: " + ((err as Error)?.message ?? "unknown");
    }
  }

  return status;
}

/**
 * Boolean shortcut for the common case.
 */
export function isDbConnected(): boolean {
  return mongoose.connection.readyState === CONNECTION_STATES.CONNECTED;
}

/**
 * Get the current connection state as a string.
 */
export function getDbState(): ConnectionStateName {
  return getStateName(mongoose.connection.readyState);
}

// ============================================================
// GRACEFUL SHUTDOWN HELPER
// ============================================================

/**
 * Register graceful shutdown handlers for SIGTERM/SIGINT.
 * Call this once at app startup.
 *
 * Usage:
 *   await connectDB(mongoUri);
 *   registerShutdownHandlers();
 */
export function registerShutdownHandlers(): void {
  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      dbLogger.warn("Shutdown already in progress, ignoring " + signal);
      return;
    }
    isShuttingDown = true;

    dbLogger.info("Received " + signal + ", shutting down gracefully");

    try {
      await disconnectDB();
      dbLogger.info("Graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      dbLogger.error(
        "Graceful shutdown error: " +
        ((err as Error)?.message ?? "unknown")
      );
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("uncaughtException", (err) => {
    dbLogger.error(
      "Uncaught exception: " + (err?.message ?? "unknown")
    );
    void shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    dbLogger.error(
      "Unhandled promise rejection: " +
      (reason instanceof Error ? reason.message : String(reason))
    );
    // Don't shutdown on unhandled rejection — log only.
    // Rejecting promises shouldn't crash the server.
  });
}

// ============================================================
// EXPORTS
// ============================================================

export default connectDB;



