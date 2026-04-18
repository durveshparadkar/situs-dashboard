import { Request, Response, NextFunction } from "express";
import { ZodError, ZodIssue } from "zod";

interface AppError extends Error {
  status?: number;
  statusCode?: number;
  code?: number | string;
  errors?: any;
  path?: string;
}

const errorMiddleware = (
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  /* =====================================================
     🔥 LOG FULL ERROR (Internal Only)
  ===================================================== */
  console.error("🔥 GLOBAL ERROR:", {
    message: err.message,
    stack: process.env.NODE_ENV !== "production" ? err.stack : undefined,
    status: err.status || err.statusCode,
    code: err.code,
    name: err.name,
  });

  /* =====================================================
     🧠 BASE STATUS + MESSAGE
  ===================================================== */
  let statusCode =
    typeof err.status === "number"
      ? err.status
      : typeof err.statusCode === "number"
      ? err.statusCode
      : 500;

  let message = err.message || "Internal Server Error";

  /* =====================================================
     🛡 HANDLE ZOD VALIDATION ERRORS
  ===================================================== */
  if (err instanceof ZodError) {
    statusCode = 400;
    message = err.issues
      .map((issue: ZodIssue) => issue.message)
      .join(", ");
  }

  /* =====================================================
     🛡 HANDLE MONGOOSE ERRORS
  ===================================================== */
  if (err.code === 11000) {
    statusCode = 409;
    message = "Duplicate field value entered";
  }

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors || {})
      .map((val: any) => val.message)
      .join(", ");
  }

  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid resource ID";
  }

  /* =====================================================
     🔐 HANDLE JWT ERRORS
  ===================================================== */
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired";
  }

  /* =====================================================
     🧼 SAFETY: ENSURE VALID STATUS RANGE
  ===================================================== */
  if (statusCode < 400 || statusCode > 599) {
    statusCode = 500;
  }

  /* =====================================================
     🧼 PRODUCTION SAFE RESPONSE
  ===================================================== */
  if (process.env.NODE_ENV === "production" && statusCode === 500) {
    message = "Internal Server Error";
  }

  /* =====================================================
     📦 RESPONSE
  ===================================================== */
  res.status(statusCode).json({
    success: false,
    message,
  });
};

export default errorMiddleware;



