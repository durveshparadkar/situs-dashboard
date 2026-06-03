import { Response } from "express";

/* =====================================================
   🚀 API RESPONSE — Enterprise Grade
===================================================== */

/* ================= TYPES ================= */

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type ResponseMeta = {
  timestamp: number;
  requestId?: string | undefined;
  version?: string | undefined;
  pagination?: PaginationMeta | undefined;
  [key: string]: unknown;
};

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T | undefined;
  meta: ResponseMeta;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errorCode?: string | undefined;
  meta: ResponseMeta;
  errors?: ValidationError[] | undefined;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/* ================= HELPERS ================= */

function buildMeta(extra?: Record<string, unknown>): ResponseMeta {
  return {
    timestamp: Date.now(),
    version: process.env.API_VERSION ?? "v1",
    ...extra,
  };
}

function buildPagination(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/* =====================================================
   ✅ SUCCESS RESPONSES
===================================================== */

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message = "Success",
  statusCode = 200,
  meta?: Record<string, unknown>
): Response => {
  const body: ApiResponse<T> = {
    success: true,
    message,
    data,
    meta: buildMeta(meta),
  };

  return res.status(statusCode).json(body);
};

export const sendCreated = <T>(
  res: Response,
  data: T,
  message = "Created successfully",
  meta?: Record<string, unknown>
): Response => {
  return sendSuccess(res, data, message, 201, meta);
};

export const sendNoContent = (res: Response): Response => {
  return res.status(204).send();
};

export const sendPaginated = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  message = "Fetched successfully"
): Response => {
  const body: ApiResponse<T[]> = {
    success: true,
    message,
    data,
    meta: buildMeta({
      pagination: buildPagination(total, page, limit),
    }),
  };

  return res.status(200).json(body);
};

/* =====================================================
   ❌ ERROR RESPONSES
===================================================== */

export const sendError = (
  res: Response,
  message: string,
  statusCode = 400,
  errorCode?: string,
  meta?: Record<string, unknown>
): Response => {
  const body: ApiErrorResponse = {
    success: false,
    message,
    ...(errorCode != null && { errorCode }),
    meta: buildMeta(meta),
  };

  return res.status(statusCode).json(body);
};

export const sendValidationError = (
  res: Response,
  errors: ValidationError[],
  message = "Validation failed"
): Response => {
  const body: ApiErrorResponse = {
    success: false,
    message,
    errorCode: "VALIDATION_ERROR",
    errors,
    meta: buildMeta(),
  };

  return res.status(422).json(body);
};

export const sendUnauthorized = (
  res: Response,
  message = "Unauthorized"
): Response => {
  return sendError(res, message, 401, "UNAUTHORIZED");
};

export const sendForbidden = (
  res: Response,
  message = "Forbidden"
): Response => {
  return sendError(res, message, 403, "FORBIDDEN");
};

export const sendNotFound = (
  res: Response,
  message = "Resource not found"
): Response => {
  return sendError(res, message, 404, "NOT_FOUND");
};

export const sendConflict = (
  res: Response,
  message = "Conflict"
): Response => {
  return sendError(res, message, 409, "CONFLICT");
};

export const sendInternalError = (
  res: Response,
  message = "Internal server error"
): Response => {
  return sendError(res, message, 500, "INTERNAL_ERROR");
};
