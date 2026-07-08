// gmail.controller.ts
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { dbLogger } from "../../utils/logger.js";
import GmailConnection from "./gmailConnection.model.js";
import {
  buildGmailAuthUrl,
  exchangeGmailAuthCode,
} from "./gmail.oauth.js";
import { syncSingleUserGmail } from "./gmail-sync.service.js";

const STATE_SECRET = process.env.JWT_SECRET!;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.situsrevenue.com";

interface GmailStatePayload {
  userId: string;
  organizationId: string;
}

function signState(payload: GmailStatePayload): string {
  return jwt.sign(payload, STATE_SECRET, { expiresIn: "10m" });
}

function verifyState(state: string): GmailStatePayload {
  try {
    return jwt.verify(state, STATE_SECRET) as GmailStatePayload;
  } catch {
    throw ApiError.badRequest("Invalid or expired connection request — please try again");
  }
}

function getActor(req: Request): { userId: string; organizationId: string } {
  const u = req.user;
  if (!u) {
    throw ApiError.unauthorized("Unauthorized");
  }

  const userId =
    (typeof u.id === "string" && u.id) || (u._id ? u._id.toString() : "");
  const organizationId =
    typeof u.organizationId === "string"
      ? u.organizationId
      : String(u.organizationId ?? "");

  if (!userId || !organizationId) {
    throw ApiError.unauthorized("User missing identity or organization");
  }

  return { userId, organizationId };
}

class GmailIntegrationController {
  connect = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId, organizationId } = getActor(req);

    const state = signState({ userId, organizationId });
    const authUrl = buildGmailAuthUrl(state);

    dbLogger.info(`Gmail connect initiated: user=${userId}`);

    res.redirect(authUrl);
  });

  callback = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const errorParam = typeof req.query.error === "string" ? req.query.error : "";

    if (errorParam) {
      dbLogger.info(`Gmail connect declined by user: ${errorParam}`);
      return res.redirect(`${FRONTEND_URL}/dashboard/settings?gmail=declined`);
    }

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}/dashboard/settings?gmail=error`);
    }

    const { userId, organizationId } = verifyState(state);

    let tokens;
    try {
      tokens = await exchangeGmailAuthCode(code);
    } catch (err) {
      dbLogger.error(
        `Gmail token exchange failed: user=${userId} error=${(err as Error).message}`
      );
      return res.redirect(`${FRONTEND_URL}/dashboard/settings?gmail=error`);
    }

    await GmailConnection.findOneAndUpdate(
      { userId },
      {
        userId,
        organizationId,
        email: tokens.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: new Date(tokens.expiryDate),
        isActive: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    dbLogger.info(`Gmail connected: user=${userId} email=${tokens.email}`);

    res.redirect(`${FRONTEND_URL}/dashboard/settings?gmail=connected`);
  });

  status = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = getActor(req);

    const connection = await GmailConnection.findOne({ userId, isActive: true }).select(
      "email lastSyncedAt createdAt"
    );

    res.status(200).json({
      success: true,
      data: {
        connected: Boolean(connection),
        email: connection?.email ?? null,
        lastSyncedAt: connection?.lastSyncedAt ?? null,
        connectedAt: connection?.createdAt ?? null,
      },
    });
  });

  disconnect = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = getActor(req);

    await GmailConnection.findOneAndUpdate({ userId }, { isActive: false });

    dbLogger.info(`Gmail disconnected: user=${userId}`);

    res.status(200).json({
      success: true,
      message: "Gmail disconnected",
    });
  });

  syncNow = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId } = getActor(req);

    try {
      const result = await syncSingleUserGmail(userId);

      res.status(200).json({
        success: true,
        data: result,
        message: `Synced ${result.activitiesLogged} activities from ${result.messagesChecked} messages`,
      });
    } catch (err) {
      throw ApiError.badRequest(
        (err as Error).message || "Gmail sync failed"
      );
    }
  });
}

export default new GmailIntegrationController();