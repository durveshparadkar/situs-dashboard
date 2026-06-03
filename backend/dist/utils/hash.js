import bcrypt from "bcryptjs";
import { ApiError } from "./ApiError.js";
/* =====================================================
   🔐 Password Utils — Enterprise Grade
===================================================== */
const SALT_ROUNDS = 12; // 12 is OWASP recommended minimum
const MIN_LENGTH = 8;
const MAX_LENGTH = 128; // prevent bcrypt DoS (bcrypt truncates at 72 bytes)
/* ================= VALIDATION ================= */
function validatePassword(password) {
    if (!password || typeof password !== "string") {
        throw ApiError.badRequest("Password is required");
    }
    if (password.length < MIN_LENGTH) {
        throw ApiError.validation(`Password must be at least ${MIN_LENGTH} characters`, { minLength: MIN_LENGTH });
    }
    if (password.length > MAX_LENGTH) {
        throw ApiError.validation(`Password must be at most ${MAX_LENGTH} characters`, { maxLength: MAX_LENGTH });
    }
}
/* ================= HASH ================= */
export async function hashPassword(password) {
    validatePassword(password);
    try {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        return await bcrypt.hash(password, salt);
    }
    catch (err) {
        throw ApiError.internal("Failed to hash password", err);
    }
}
/* ================= COMPARE ================= */
export async function comparePassword(plain, hashed) {
    if (!plain || !hashed)
        return false;
    try {
        return await bcrypt.compare(plain, hashed);
    }
    catch {
        return false;
    }
}
export function checkPasswordStrength(password) {
    let score = 0;
    const suggestions = [];
    if (password.length >= 12)
        score++;
    else
        suggestions.push("Use at least 12 characters");
    if (password.length >= 16)
        score++;
    if (/[a-z]/.test(password))
        score++;
    else
        suggestions.push("Add lowercase letters");
    if (/[A-Z]/.test(password))
        score++;
    else
        suggestions.push("Add uppercase letters");
    if (/[0-9]/.test(password))
        score++;
    else
        suggestions.push("Add numbers");
    if (/[^a-zA-Z0-9]/.test(password))
        score++;
    else
        suggestions.push("Add special characters (!@#$%^&*)");
    const strength = score <= 2 ? "weak" :
        score <= 3 ? "fair" :
            score <= 4 ? "strong" :
                "very_strong";
    return { strength, score, suggestions };
}
/* ================= CONSTANTS ================= */
export const PASSWORD_CONSTRAINTS = {
    MIN_LENGTH,
    MAX_LENGTH,
    SALT_ROUNDS,
};
//# sourceMappingURL=hash.js.map