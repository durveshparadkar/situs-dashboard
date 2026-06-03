import { Request, Response, NextFunction } from "express";
import { ZodError, ZodIssue } from "zod";
import { ApiError } from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/* =====================================================
   🚀 Global Error Handler — Enterprise Grade
===================================================== */

const isDev = process.env.NODE_ENV !== "production";

/* ================= HELPERS ================= */

function buildMeta(req: Request) {
  return {
    timestamp: Date.now(),
    path: req.originalUrl,
    method: req.method,
    ...(isDev && { requestId: req.headers["x-request-id"] }),
  };
}

function handleZodError(err: ZodError, req: Request, res: Response) {
  const errors = err.issues.map((e: ZodIssue) => ({
    field: e.path.join("."),
    message: e.message,
  }));

  logger.warn({ path: req.originalUrl, errors }, "Validation error");

  return res.status(422).json({
    success: false,
    message: "Validation failed",
    errorCode: "VALIDATION_ERROR",
    errors,
    meta: buildMeta(req),
  });
}

function handleApiError(err: ApiError, req: Request, res: Response) {
  const level = err.statusCode >= 500 ? "error" : "warn";

  logger[level](
    {
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      path: req.originalUrl,
      method: req.method,
      ...(isDev && { stack: err.stack }),
      ...(err.cause != null && { cause: err.cause }),
    },
    err.message
  );

  return res.status(err.statusCode).json({
    success: false,
    message: err.message,
    errorCode: err.errorCode,
    ...(err.meta != null && { meta: { ...buildMeta(req), ...err.meta } }),
    ...(err.meta == null && { meta: buildMeta(req) }),
    ...(isDev && { stack: err.stack }),
  });
}

function handleUnknownError(err: unknown, req: Request, res: Response) {
  const message =
    err instanceof Error ? err.message : "Internal Server Error";

  const stack = err instanceof Error ? err.stack : undefined;

  logger.error(
    {
      path: req.originalUrl,
      method: req.method,
      ...(isDev && { stack }),
      raw: err,
    },
    "Unhandled error"
  );

  return res.status(500).json({
    success: false,
    message: isDev ? message : "Internal Server Error",
    errorCode: "INTERNAL_ERROR",
    meta: buildMeta(req),
    ...(isDev && { stack }),
  });
}

/* =====================================================
   MIDDLEWARE
===================================================== */

export const globalErrorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  if (err instanceof ZodError) {
    return handleZodError(err, req, res);
  }

  if (err instanceof ApiError) {
    return handleApiError(err, req, res);
  }

  return handleUnknownError(err, req, res);
};

/* =====================================================
   404 NOT FOUND HANDLER
===================================================== */

export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  logger.warn({ path: req.originalUrl, method: req.method }, "Route not found");

  return res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    errorCode: "NOT_FOUND",
    meta: buildMeta(req),
  });
};