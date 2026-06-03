import jwt, { SignOptions, JwtPayload } from "jsonwebtoken";
import { ApiError } from "./ApiError.js";

/* =====================================================
   🔐 JWT Utils — Enterprise Grade
===================================================== */

/* ================= CONSTANTS ================= */

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const ACCESS_EXPIRES_IN = (process.env.JWT_ACCESS_EXPIRES_IN ?? "15m") as SignOptions["expiresIn"] & string;
const REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"] & string;

/* ================= TYPES ================= */

export interface TokenPayload {
  sub: string;          // user _id
  organizationId: string;
  roleId: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;    // seconds
}

/* ================= VALIDATION ================= */

function getSecret(secret: string | undefined, name: string): string {
  if (!secret) {
    throw new Error(`${name} is not configured in environment variables`);
  }
  return secret;
}

/* ================= SIGN ================= */

export function generateAccessToken(payload: Omit<TokenPayload, "iat" | "exp">): string {
  const secret = getSecret(ACCESS_SECRET, "JWT_ACCESS_SECRET");

  return jwt.sign(payload, secret, {
    expiresIn: ACCESS_EXPIRES_IN,
    algorithm: "HS256",
  });
}

export function generateRefreshToken(payload: Omit<TokenPayload, "iat" | "exp">): string {
  const secret = getSecret(REFRESH_SECRET, "JWT_REFRESH_SECRET");

  return jwt.sign(payload, secret, {
    expiresIn: REFRESH_EXPIRES_IN,
    algorithm: "HS256",
  });
}

export function generateTokenPair(
  payload: Omit<TokenPayload, "iat" | "exp">
): TokenPair {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    expiresIn: 15 * 60, // 15 minutes in seconds
  };
}

/* ================= VERIFY ================= */

export function verifyAccessToken(token: string): TokenPayload {
  const secret = getSecret(ACCESS_SECRET, "JWT_ACCESS_SECRET");

  try {
    return jwt.verify(token, secret, {
      algorithms: ["HS256"],
    }) as TokenPayload;
  } catch (err) {
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

export function verifyRefreshToken(token: string): TokenPayload {
  const secret = getSecret(REFRESH_SECRET, "JWT_REFRESH_SECRET");

  try {
    return jwt.verify(token, secret, {
      algorithms: ["HS256"],
    }) as TokenPayload;
  } catch (err) {
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

export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload | null;
  } catch {
    return null;
  }
}

/* ================= HELPERS ================= */

export function getTokenExpiry(token: string): Date | null {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return null;
  return new Date(decoded.exp * 1000);
}

export function isTokenExpired(token: string): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;
  return expiry < new Date();
}

/* ================= COOKIE CONFIG ================= */

const isProd = process.env.NODE_ENV === "production";

export const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ("none" as const) : ("lax" as const),
  maxAge: 15 * 60 * 1000,           // 15 minutes
};

export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ("none" as const) : ("lax" as const),
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};