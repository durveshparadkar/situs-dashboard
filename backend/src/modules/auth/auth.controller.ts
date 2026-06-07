// auth.controller.ts
import type { Request, Response, NextFunction, CookieOptions } from "express";
import { z } from "zod";

import * as authService from "./auth.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { dbLogger } from "../../utils/logger.js";

/* =====================================================
   CONFIG
===================================================== */

const AUTH_CONFIG = {
  cookieNames: {
    access: process.env.AUTH_COOKIE_NAME || "token",
    refresh: "refreshToken",
  },
  accessTokenMaxAgeMs:  15 * 60 * 1000,
  refreshTokenMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  password: {
    minLength: 8,
    maxLength: 128,
  },
  email: {
    maxLength: 320,
  },
  org: {
    minNameLength: 2,
    maxNameLength: 200,
  },
} as const;

/* =====================================================
   COOKIE BUILDER
===================================================== */

function buildCookieOptions(maxAgeMs?: number): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  const opts: CookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  };
  if (maxAgeMs !== undefined) {
    opts.maxAge = maxAgeMs;
  }
  return opts;
}

/* =====================================================
   VALIDATION SCHEMAS
===================================================== */

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(AUTH_CONFIG.email.maxLength, "Email is too long")
  .email("Invalid email format");

const passwordSchema = z
  .string()
  .min(AUTH_CONFIG.password.minLength, "Password too short")
  .max(AUTH_CONFIG.password.maxLength, "Password too long");

const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    organizationName: z
      .string()
      .trim()
      .min(AUTH_CONFIG.org.minNameLength, "Org name too short")
      .max(AUTH_CONFIG.org.maxNameLength, "Org name too long")
      .optional(),
    fullName: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, "Password required").max(AUTH_CONFIG.password.maxLength),
  })
  .strict();

const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(500),
    password: passwordSchema,
  })
  .strict();

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(AUTH_CONFIG.password.maxLength),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "New password must differ from current password",
    path: ["newPassword"],
  });

const verifyEmailSchema = z
  .object({ token: z.string().min(20).max(500) })
  .strict();

/* =====================================================
   HELPERS
===================================================== */

function getUserId(req: Request): string {
  const u = req.user;
  if (!u) {
    throw ApiError.unauthorized("Unauthorized");
  }

  const id =
    (typeof u.id === "string" && u.id) ||
    (u._id ? u._id.toString() : "");

  if (!id) {
    throw ApiError.unauthorized("User missing identity");
  }
  return id;
}

/**
 * Convert a Zod failure to a single-string ApiError.
 * If your ApiError.badRequest signature later supports a details object,
 * you can extend this to pass the structured array.
 */
function throwValidationError(err: z.ZodError): never {
  const summary = err.issues
    .map((e) => {
      const path = e.path.join(".") || "(root)";
      return `${path}: ${e.message}`;
    })
    .join("; ");
  throw ApiError.badRequest(`Validation failed — ${summary}`);
}

function safeReqDescriptor(req: Request): string {
  const ip = req.ip || "unknown";
  const ua = req.get("user-agent")?.slice(0, 200) || "unknown";
  return `ip=${ip} ua="${ua}"`;
}

/**
 * Generic shape we treat any auth-service result as. Service may return
 * undefined / void / { tokens } / { user } — we coerce safely with this
 * union and only access fields after type-guarding them.
 */
type AuthServiceResult = Record<string, unknown>;

/**
 * Coerce any service return value into a safe object so we can spread/destructure
 * without TS complaining about void. If the service returns undefined, this
 * yields an empty object which is fine to merge into the response.
 */
function asResult(value: unknown): AuthServiceResult {
  if (value && typeof value === "object") {
    return value as AuthServiceResult;
  }
  return {};
}

function setAuthCookies(res: Response, result: AuthServiceResult): void {
  console.log("COOKIE DEBUG", {
    accessToken: !!result.accessToken,
    refreshToken: !!result.refreshToken,
  });

  if (typeof result.accessToken === "string") {
    res.cookie(
      AUTH_CONFIG.cookieNames.access,
      result.accessToken,
      buildCookieOptions(AUTH_CONFIG.accessTokenMaxAgeMs)
    );
  }

  if (typeof result.refreshToken === "string") {
    res.cookie(
      AUTH_CONFIG.cookieNames.refresh,
      result.refreshToken,
      buildCookieOptions(AUTH_CONFIG.refreshTokenMaxAgeMs)
    );
  }
}

function clearAuthCookies(res: Response): void {
  const expired: CookieOptions = { ...buildCookieOptions(), expires: new Date(0) };
  res.cookie(AUTH_CONFIG.cookieNames.access,  "", expired);
  res.cookie(AUTH_CONFIG.cookieNames.refresh, "", expired);
}

/**
 * Strip token fields from a result object before sending the response body.
 * Tokens belong in cookies, never in JSON.
 */
function stripTokens(result: AuthServiceResult): AuthServiceResult {
  const { accessToken, refreshToken, ...safe } = result as {
    accessToken?: unknown;
    refreshToken?: unknown;
  } & AuthServiceResult;
  void accessToken;
  void refreshToken;
  return safe;
}

/* =====================================================
   CONTROLLER
===================================================== */

class AuthController {

  /* =====================================================
     POST /auth/register
  ===================================================== */
  register = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) throwValidationError(parsed.error);

      /* Build payload with explicit organizationName field — service
         requires it to be present (string | undefined), not optional.
         exactOptionalPropertyTypes: true is fine because we set it
         explicitly to either string or undefined. */
      const result = asResult(
  await authService.register({
    email: parsed.data.email,
    password: parsed.data.password,
    ...(parsed.data.organizationName !== undefined && {
      organizationName: parsed.data.organizationName,
    }),
  })
);

      setAuthCookies(res, result);

      dbLogger.info(
        `User registered: email=${parsed.data.email} ${safeReqDescriptor(req)}`
      );

      res.status(201).json({
        success: true,
        message: "Registration successful",
        ...stripTokens(result),
      });
    },
    { name: "auth.register", alwaysLog: true }
  );

  /* =====================================================
     POST /auth/login
  ===================================================== */
  login = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) throwValidationError(parsed.error);

      const result = asResult(
        await authService.login({
          email: parsed.data.email,
          password: parsed.data.password,
        })
      );

      setAuthCookies(res, result);

      dbLogger.info(
        `User login: email=${parsed.data.email} ${safeReqDescriptor(req)}`
      );

      res.status(200).json({
        success: true,
        message: "Login successful",
        ...stripTokens(result),
      });
    },
    { name: "auth.login", alwaysLog: true }
  );

  /* =====================================================
     POST /auth/logout
  ===================================================== */
  logout = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const refreshToken = req.cookies?.[AUTH_CONFIG.cookieNames.refresh];

      const svc = authService as unknown as {
        revokeRefreshToken?: (token: string) => Promise<void>;
      };
      if (refreshToken && typeof svc.revokeRefreshToken === "function") {
        try {
          await svc.revokeRefreshToken(refreshToken);
        } catch (err) {
          dbLogger.warn(
            `Refresh token revoke failed during logout: ${(err as Error).message}`
          );
        }
      }

      clearAuthCookies(res);

      const userId = req.user
        ? (typeof req.user.id === "string" ? req.user.id : String(req.user._id ?? ""))
        : "anonymous";

      dbLogger.info(`Logout: user=${userId} ${safeReqDescriptor(req)}`);

      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    },
    { name: "auth.logout", alwaysLog: true }
  );

  /* =====================================================
     GET /auth/profile
  ===================================================== */
  getProfile = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const userId = getUserId(req);
const user: unknown = await authService.getProfile(userId);

if (!user) {
  throw ApiError.notFound("User not found");
}

      res.status(200).json({
        success: true,
        data: user,
      });
    },
    { name: "auth.getProfile" }
  );

  /* =====================================================
     POST /auth/refresh
  ===================================================== */
  refresh = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const refreshToken = req.cookies?.[AUTH_CONFIG.cookieNames.refresh];
      if (!refreshToken || typeof refreshToken !== "string") {
        throw ApiError.unauthorized("No refresh token");
      }

      const result = asResult(await authService.refresh(refreshToken));

      setAuthCookies(res, result);

      res.status(200).json({
        success: true,
        message: "Tokens refreshed",
        ...stripTokens(result),
      });
    },
    { name: "auth.refresh" }
  );

  /* =====================================================
     POST /auth/forgot-password
  ===================================================== */
  forgotPassword = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) throwValidationError(parsed.error);

      const svc = authService as unknown as {
        forgotPassword?: (email: string) => Promise<void>;
      };

      if (typeof svc.forgotPassword === "function") {
        try {
          await svc.forgotPassword(parsed.data.email);
        } catch (err) {
          dbLogger.warn(
            `Forgot-password handler failed: ${(err as Error).message}`
          );
        }
      }

      dbLogger.info(
        `Password reset requested: email=${parsed.data.email} ${safeReqDescriptor(req)}`
      );

      res.status(200).json({
        success: true,
        message:
          "If an account exists with that email, a password reset link has been sent.",
      });
    },
    { name: "auth.forgotPassword", alwaysLog: true }
  );

  /* =====================================================
     POST /auth/reset-password
  ===================================================== */
  resetPassword = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) throwValidationError(parsed.error);

      const svc = authService as unknown as {
        resetPassword?: (token: string, newPassword: string) => Promise<void>;
      };

      if (typeof svc.resetPassword !== "function") {
        throw ApiError.notFound("Password reset not available");
      }

      await svc.resetPassword(parsed.data.token, parsed.data.password);

      clearAuthCookies(res);

      dbLogger.warn(
        `Password reset completed: ${safeReqDescriptor(req)}`
      );

      res.status(200).json({
        success: true,
        message: "Password reset successful. Please log in.",
      });
    },
    { name: "auth.resetPassword", alwaysLog: true }
  );

  /* =====================================================
     POST /auth/change-password
  ===================================================== */
  changePassword = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const userId = getUserId(req);

      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) throwValidationError(parsed.error);

      const svc = authService as unknown as {
        changePassword?: (
          userId: string,
          currentPassword: string,
          newPassword: string
        ) => Promise<void>;
      };

      if (typeof svc.changePassword !== "function") {
        throw ApiError.notFound("Change password not available");
      }

      await svc.changePassword(
        userId,
        parsed.data.currentPassword,
        parsed.data.newPassword
      );

      clearAuthCookies(res);

      dbLogger.warn(
        `Password changed: user=${userId} ${safeReqDescriptor(req)}`
      );

      res.status(200).json({
        success: true,
        message: "Password changed. Please log in again.",
      });
    },
    { name: "auth.changePassword", alwaysLog: true }
  );

  /* =====================================================
     POST /auth/verify-email
  ===================================================== */
  verifyEmail = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const parsed = verifyEmailSchema.safeParse(req.body);
      if (!parsed.success) throwValidationError(parsed.error);

      const svc = authService as unknown as {
        verifyEmail?: (token: string) => Promise<{ verified: boolean } | void>;
      };

      if (typeof svc.verifyEmail !== "function") {
        throw ApiError.notFound("Email verification not available");
      }

      const result = await svc.verifyEmail(parsed.data.token);

      dbLogger.info(`Email verified: ${safeReqDescriptor(req)}`);

      res.status(200).json({
        success: true,
        message: "Email verified",
        data: result ?? { verified: true },
      });
    },
    { name: "auth.verifyEmail" }
  );

  /* =====================================================
     POST /auth/resend-verification
  ===================================================== */
  resendVerification = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const userId = getUserId(req);

      const svc = authService as unknown as {
        resendVerificationEmail?: (userId: string) => Promise<void>;
      };

      if (typeof svc.resendVerificationEmail !== "function") {
        throw ApiError.notFound("Verification resend not available");
      }

      await svc.resendVerificationEmail(userId);

      dbLogger.info(
        `Verification resent: user=${userId} ${safeReqDescriptor(req)}`
      );

      res.status(200).json({
        success: true,
        message: "Verification email sent",
      });
    },
    { name: "auth.resendVerification" }
  );

  /* =====================================================
     POST /auth/logout-all-sessions
  ===================================================== */
  logoutAllSessions = asyncHandler(
    async (req: Request, res: Response, _next: NextFunction) => {
      const userId = getUserId(req);

      const svc = authService as unknown as {
        logoutAllSessions?: (userId: string) => Promise<void>;
      };

      if (typeof svc.logoutAllSessions !== "function") {
        throw ApiError.notFound("Logout-all not available");
      }

      await svc.logoutAllSessions(userId);
      clearAuthCookies(res);

      dbLogger.warn(
        `All sessions revoked: user=${userId} ${safeReqDescriptor(req)}`
      );

      res.status(200).json({
        success: true,
        message: "All sessions terminated",
      });
    },
    { name: "auth.logoutAllSessions", alwaysLog: true }
  );
}

export default new AuthController();











