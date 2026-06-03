/* ================= HELPERS ================= */
function buildMeta(extra) {
    return {
        timestamp: Date.now(),
        version: process.env.API_VERSION ?? "v1",
        ...extra,
    };
}
function buildPagination(total, page, limit) {
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
export const sendSuccess = (res, data, message = "Success", statusCode = 200, meta) => {
    const body = {
        success: true,
        message,
        data,
        meta: buildMeta(meta),
    };
    return res.status(statusCode).json(body);
};
export const sendCreated = (res, data, message = "Created successfully", meta) => {
    return sendSuccess(res, data, message, 201, meta);
};
export const sendNoContent = (res) => {
    return res.status(204).send();
};
export const sendPaginated = (res, data, total, page, limit, message = "Fetched successfully") => {
    const body = {
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
export const sendError = (res, message, statusCode = 400, errorCode, meta) => {
    const body = {
        success: false,
        message,
        ...(errorCode != null && { errorCode }),
        meta: buildMeta(meta),
    };
    return res.status(statusCode).json(body);
};
export const sendValidationError = (res, errors, message = "Validation failed") => {
    const body = {
        success: false,
        message,
        errorCode: "VALIDATION_ERROR",
        errors,
        meta: buildMeta(),
    };
    return res.status(422).json(body);
};
export const sendUnauthorized = (res, message = "Unauthorized") => {
    return sendError(res, message, 401, "UNAUTHORIZED");
};
export const sendForbidden = (res, message = "Forbidden") => {
    return sendError(res, message, 403, "FORBIDDEN");
};
export const sendNotFound = (res, message = "Resource not found") => {
    return sendError(res, message, 404, "NOT_FOUND");
};
export const sendConflict = (res, message = "Conflict") => {
    return sendError(res, message, 409, "CONFLICT");
};
export const sendInternalError = (res, message = "Internal server error") => {
    return sendError(res, message, 500, "INTERNAL_ERROR");
};
//# sourceMappingURL=ApiResponse.js.map