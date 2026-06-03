/* =====================================================
   🚀 ApiError — Enterprise Grade Error Class
===================================================== */
/* =====================================================
   CLASS
===================================================== */
export class ApiError extends Error {
    statusCode;
    errorCode;
    isOperational;
    meta;
    cause;
    timestamp;
    constructor(statusCode, message, options) {
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
    static isApiError(err) {
        return err instanceof ApiError;
    }
    static isOperational(err) {
        return ApiError.isApiError(err) && err.isOperational;
    }
    /* =====================================================
       🏭 FACTORY METHODS
    ===================================================== */
    static badRequest(message = "Bad Request", meta) {
        return new ApiError(400, message, { errorCode: "BAD_REQUEST", meta });
    }
    static unauthorized(message = "Unauthorized", meta) {
        return new ApiError(401, message, { errorCode: "UNAUTHORIZED", meta });
    }
    static forbidden(message = "Forbidden", meta) {
        return new ApiError(403, message, { errorCode: "FORBIDDEN", meta });
    }
    static notFound(message = "Resource not found", meta) {
        return new ApiError(404, message, { errorCode: "NOT_FOUND", meta });
    }
    static timeout(message = "Request timed out") {
        return new ApiError(408, message, { errorCode: "REQUEST_TIMEOUT" });
    }
    static conflict(message = "Conflict", meta) {
        return new ApiError(409, message, { errorCode: "CONFLICT", meta });
    }
    static gone(message = "Resource no longer available") {
        return new ApiError(410, message, { errorCode: "GONE" });
    }
    static validation(message = "Validation failed", meta) {
        return new ApiError(422, message, { errorCode: "VALIDATION_ERROR", meta });
    }
    static tooManyRequests(message = "Too many requests") {
        return new ApiError(429, message, { errorCode: "RATE_LIMITED" });
    }
    static internal(message = "Internal server error", cause) {
        return new ApiError(500, message, {
            errorCode: "INTERNAL_ERROR",
            isOperational: false,
            cause,
        });
    }
    static notImplemented(message = "Not implemented") {
        return new ApiError(501, message, { errorCode: "NOT_IMPLEMENTED" });
    }
    static serviceUnavailable(message = "Service unavailable") {
        return new ApiError(503, message, {
            errorCode: "SERVICE_UNAVAILABLE",
            isOperational: false,
        });
    }
    /* =====================================================
       🧠 SERIALIZATION
    ===================================================== */
    toJSON() {
        const isDev = process.env.NODE_ENV !== "production";
        return {
            success: false,
            message: this.message,
            errorCode: this.errorCode,
            ...(this.meta != null && { meta: this.meta }),
            ...(isDev && { stack: this.stack }),
        };
    }
    toString() {
        return `[ApiError ${this.statusCode}] ${this.errorCode ?? "UNKNOWN"}: ${this.message}`;
    }
}
//# sourceMappingURL=ApiError.js.map