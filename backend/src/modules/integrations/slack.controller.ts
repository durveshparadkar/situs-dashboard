// slack.controller.ts
//
// Handles the Slack connection flow for alert delivery:
//   GET  /api/integrations/slack/connect    — redirect to Slack consent
//   GET  /api/integrations/slack/callback   — Slack redirects back here
//   GET  /api/integrations/slack/status     — is Slack connected? which channel?
//   DELETE /api/integrations/slack          — disconnect
//   POST /api/integrations/slack/test       — send a test message
//
// Same state-JWT pattern as gmail.controller.ts: /connect encodes the
// logged-in user's identity into a short-lived signed JWT passed as
// the OAuth state parameter, which /callback verifies independently
// rather than relying on the session cookie surviving Slack's redirect.

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { dbLogger } from "../../utils/logger.js";
import SlackConnection from "./slackConnection.model.js";
import {
  buildSlackAuthUrl,
  exchangeSlackAuthCode,
  postToSlackWebhook,
} from "./slack.oauth.js";
import { error } from "console";
import { connected } from "process";

const STATE_SECRET = process.env.JWT_SECRET!;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.situsrevenue.com";

interface SlackStatePayload {
  userId: string;
  organizationId: string;
}

function signState(payload: SlackStatePayload): string {
  return jwt.sign(payload, STATE_SECRET, { expiresIn: "10m" });
}

function verifyState(state: string): SlackStatePayload {
  try {
    return jwt.verify(state, STATE_SECRET) as SlackStatePayload;
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

class SlackIntegrationController {
  /* =====================================================
     GET /api/integrations/slack/connect
  ===================================================== */
  connect = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId, organizationId } = getActor(req);

    const state = signState({ userId, organizationId });
    const authUrl = buildSlackAuthUrl(state);

    dbLogger.info(`Slack connect initiated: user=${userId}`);

    res.redirect(authUrl);
  });

  /* =====================================================
     GET /api/integrations/slack/callback
  ===================================================== */
  callback = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const errorParam = typeof req.query.error === "string" ? req.query.error : "";

    if (errorParam) {
      dbLogger.info(`Slack connect declined by user: ${errorParam}`);
      return res.redirect(`${FRONTEND_URL}/dashboard/settings?slack=declined`);
    }

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}/dashboard/settings?slack=error`);
    }

    const { userId, organizationId } = verifyState(state);

    let result;
    try {
      result = await exchangeSlackAuthCode(code);
    } catch (err) {
      dbLogger.error(
        `Slack token exchange failed: user=${userId} error=${(err as Error).message}`
      );
      return res.redirect(`${FRONTEND_URL}/dashboard/settings?slack=error`);
    }

    await SlackConnection.findOneAndUpdate(
      { organizationId },
      {
        organizationId,
        connectedByUserId: userId,
        channelName: result.channelName,
        webhookUrl: result.webhookUrl,
        teamName: result.teamName,
        isActive: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    dbLogger.info(
      `Slack connected: org=${organizationId} team=${result.teamName} channel=${result.channelName}`
    );

    res.redirect(`${FRONTEND_URL}/dashboard/settings?slack=connected`);
  });

  /* =====================================================
     GET /api/integrations/slack/status
  ===================================================== */
  status = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { organizationId } = getActor(req);

    const connection = await SlackConnection.findOne({
      organizationId,
      isActive: true,
    }).select("channelName teamName createdAt");

    res.status(200).json({
      success: true,
      data: {
        connected: Boolean(connection),
        channelName: connection?.channelName ?? null,
        teamName: connection?.teamName ?? null,
        connectedAt: connection?.createdAt ?? null,
      },
    });
  });

  /* =====================================================
     DELETE /api/integrations/slack
  ===================================================== */
  disconnect = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { organizationId } = getActor(req);

    await SlackConnection.findOneAndUpdate({ organizationId }, { isActive: false });

    dbLogger.info(`Slack disconnected: org=${organizationId}`);

    res.status(200).json({
      success: true,
      message: "Slack disconnected",
    });
  });

  /* =====================================================
     POST /api/integrations/slack/test
     Sends a test message so the user can confirm the connection
     actually works before relying on it for real alerts.
  ===================================================== */
  test = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { organizationId } = getActor(req);

    const connection = await SlackConnection.findOne({
      organizationId,
      isActive: true,
    }).select("+webhookUrl channelName");

    if (!connection) {
      throw ApiError.badRequest("Slack is not connected");
    }

    try {
      await postToSlackWebhook(
        connection.webhookUrl,
        "👋 Situs is connected! You'll see deal risk and forecast alerts here."
      );

      res.status(200).json({
        success: true,
        message: `Test message sent to ${connection.channelName}`,
      });
    } catch (err) {
      throw ApiError.badRequest(
        (err as Error).message || "Failed to send test message"
      );
    }
  });
}

export default new SlackIntegrationController();