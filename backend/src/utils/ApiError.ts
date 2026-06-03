/* =====================================================
   🚀 ApiError — Enterprise Grade Error Class
===================================================== */

export type HttpStatusCode =
  | 400 | 401 | 403 | 404 | 408 | 409 | 410
  | 422 | 429 | 500 | 501 | 502 | 503 | 504;

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "REQUEST_TIMEOUT"
  | "CONFLICT"
  | "GONE"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "NOT_IMPLEMENTED"
  | "BAD_GATEWAY"
  | "SERVICE_UNAVAILABLE"
  | "GATEWAY_TIMEOUT"
  | (string & {}); // allows custom codes without losing autocomplete

export interface ApiErrorOptions {
  errorCode?: ErrorCode;
  meta?: Record<string, unknown> | undefined;
  isOperational?: boolean;
  cause?: unknown;
}

export interface SerializedError {
  success: false;
  message: string;
  errorCode: ErrorCode | undefined;
  meta?: Record<string, unknown>;
  stack?: string;
}

/* =====================================================
   CLASS
===================================================== */

export class ApiError extends Error {
  readonly statusCode: HttpStatusCode;
  readonly errorCode?: ErrorCode | undefined;
  readonly isOperational: boolean;
  readonly meta?: Record<string, unknown> | undefined;
  override readonly cause?: unknown;
  readonly timestamp: string;

  constructor(
    statusCode: HttpStatusCode,
    message: string,
    options?: ApiErrorOptions
  ) {
    super(message);

    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errorCode = options?.errorCode;
    this.meta = options?.meta;
    this.isOperational = options?.isOperational ?? true;
    this.cause = options?.cause;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  /* =====================================================
     🔍 TYPE GUARDS
  ===================================================== */

  static isApiError(err: unknown): err is ApiError {
    return err instanceof ApiError;
  }

  static isOperational(err: unknown): boolean {
    return ApiError.isApiError(err) && err.isOperational;
  }

  /* =====================================================
     🏭 FACTORY METHODS
  ===================================================== */

  static badRequest(
    message = "Bad Request",
    meta?: Record<string, unknown>
  ): ApiError {
    return new ApiError(400, message, { errorCode: "BAD_REQUEST", meta });
  }

  static unauthorized(
    message = "Unauthorized",
    meta?: Record<string, unknown>
  ): ApiError {
    return new ApiError(401, message, { errorCode: "UNAUTHORIZED", meta });
  }

  static forbidden(
    message = "Forbidden",
    meta?: Record<string, unknown>
  ): ApiError {
    return new ApiError(403, message, { errorCode: "FORBIDDEN", meta });
  }

  static notFound(
    message = "Resource not found",
    meta?: Record<string, unknown>
  ): ApiError {
    return new ApiError(404, message, { errorCode: "NOT_FOUND", meta });
  }

  static timeout(message = "Request timed out"): ApiError {
    return new ApiError(408, message, { errorCode: "REQUEST_TIMEOUT" });
  }

  static conflict(
    message = "Conflict",
    meta?: Record<string, unknown>
  ): ApiError {
    return new ApiError(409, message, { errorCode: "CONFLICT", meta });
  }

  static gone(message = "Resource no longer available"): ApiError {
    return new ApiError(410, message, { errorCode: "GONE" });
  }

  static validation(
    message = "Validation failed",
    meta?: Record<string, unknown>
  ): ApiError {
    return new ApiError(422, message, { errorCode: "VALIDATION_ERROR", meta });
  }

  static tooManyRequests(message = "Too many requests"): ApiError {
    return new ApiError(429, message, { errorCode: "RATE_LIMITED" });
  }

  static internal(
    message = "Internal server error",
    cause?: unknown
  ): ApiError {
    return new ApiError(500, message, {
      errorCode: "INTERNAL_ERROR",
      isOperational: false,
      cause,
    });
  }

  static notImplemented(message = "Not implemented"): ApiError {
    return new ApiError(501, message, { errorCode: "NOT_IMPLEMENTED" });
  }

  static serviceUnavailable(message = "Service unavailable"): ApiError {
    return new ApiError(503, message, {
      errorCode: "SERVICE_UNAVAILABLE",
      isOperational: false,
    });
  }

  /* =====================================================
     🧠 SERIALIZATION
  ===================================================== */

  toJSON(): SerializedError {
    const isDev = process.env.NODE_ENV !== "production";

    return {
      success: false,
      message: this.message,
      errorCode: this.errorCode,
      ...(this.meta != null && { meta: this.meta }),
      ...(isDev && { stack: this.stack }),
    };
  }

  override toString(): string {
    return `[ApiError ${this.statusCode}] ${this.errorCode ?? "UNKNOWN"}: ${this.message}`;
  }
}