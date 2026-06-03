import jwt from "jsonwebtoken";
import { ApiError } from "./ApiError.js";
/* =====================================================
   🔐 JWT Utils — Enterprise Grade
===================================================== */
/* ================= CONSTANTS ================= */
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES_IN = (process.env.JWT_ACCESS_EXPIRES_IN ?? "15m");
const REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN ?? "7d");
/* ================= VALIDATION ================= */
function getSecret(secret, name) {
    if (!secret) {
        throw new Error(`${name} is not configured in environment variables`);
    }
    return secret;
}
/* ================= SIGN ================= */
export function generateAccessToken(payload) {
    const secret = getSecret(ACCESS_SECRET, "JWT_ACCESS_SECRET");
    return jwt.sign(payload, secret, {
        expiresIn: ACCESS_EXPIRES_IN,
        algorithm: "HS256",
    });
}
export function generateRefreshToken(payload) {
    const secret = getSecret(REFRESH_SECRET, "JWT_REFRESH_SECRET");
    return jwt.sign(payload, secret, {
        expiresIn: REFRESH_EXPIRES_IN,
        algorithm: "HS256",
    });
}
export function generateTokenPair(payload) {
    return {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
        expiresIn: 15 * 60, // 15 minutes in seconds
    };
}
/* ================= VERIFY ================= */
export function verifyAccessToken(token) {
    const secret = getSecret(ACCESS_SECRET, "JWT_ACCESS_SECRET");
    try {
        return jwt.verify(token, secret, {
            algorithms: ["HS256"],
        });
    }
    catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            throw ApiError.unauthorized("Access token expired");
        }
        if (err instanceof jwt.JsonWebTokenError) {
            throw ApiError.unauthorized("Invalid access token");
        }
        if (err instanceof jwt.NotBeforeError) {
            throw ApiError.unauthorized("Token not yet valid");
        }
        throw ApiError.unauthorized("Token verification failed");
    }
}
export function verifyRefreshToken(token) {
    const secret = getSecret(REFRESH_SECRET, "JWT_REFRESH_SECRET");
    try {
        return jwt.verify(token, secret, {
            algorithms: ["HS256"],
        });
    }
    catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            throw ApiError.unauthorized("Refresh token expired — please login again");
        }
        if (err instanceof jwt.JsonWebTokenError) {
            throw ApiError.unauthorized("Invalid refresh token");
        }
        throw ApiError.unauthorized("Refresh token verification failed");
    }
}
/* ================= DECODE (NO VERIFY) ================= */
export function decodeToken(token) {
    try {
        return jwt.decode(token);
    }
    catch {
        return null;
    }
}
/* ================= HELPERS ================= */
export function getTokenExpiry(token) {
    const decoded = decodeToken(token);
    if (!decoded?.exp)
        return null;
    return new Date(decoded.exp * 1000);
}
export function isTokenExpired(token) {
    const expiry = getTokenExpiry(token);
    if (!expiry)
        return true;
    return expiry < new Date();
}
/* ================= COOKIE CONFIG ================= */
const isProd = process.env.NODE_ENV === "production";
export const ACCESS_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 15 * 60 * 1000, // 15 minutes
};
export const REFRESH_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};
//# sourceMappingURL=jwt.js.map