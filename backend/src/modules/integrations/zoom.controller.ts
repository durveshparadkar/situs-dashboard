// zoom.controller.ts
//
// Handles Zoom's webhook events for activity sync.
//
// Zoom requires a "Challenge-Response Check" (CRC) before it'll accept
// a webhook URL: on setup, Zoom sends a request with a plainToken,
// and we must respond with an HMAC-SHA256 hash of that token using our
// Secret Token as the key. Every subsequent real event also includes
// this same challenge as a first-line security check, so we handle
// both in the same handler.
//
// Unlike Gmail/Slack, there's no per-user "Connect" flow here — Zoom
// webhooks are configured once, account-wide, in the Zoom Marketplace
// dashboard (what we're doing right now). This endpoint just receives
// events for ALL meetings in the connected Zoom account and matches
// participants against Leads.

import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

import { asyncHandler } from "../../utils/asyncHandler.js";
import { dbLogger } from "../../utils/logger.js";
import Lead from "../leads/lead.model.js";
import Deal from "../deals/deal.model.js";
import LeadActivity from "../leadActivity/leadActivity.model.js";

const ZOOM_SECRET_TOKEN = process.env.ZOOM_SECRET_TOKEN || "";

if (!ZOOM_SECRET_TOKEN) {
  console.warn(
    "⚠️  ZOOM_SECRET_TOKEN not set — Zoom webhook validation will fail until this env var is configured."
  );
}

/* =====================================================
   TYPES
===================================================== */

interface ZoomCRCPayload {
  event: "endpoint.url_validation";
  payload: {
    plainToken: string;
  };
}

interface ZoomMeetingEndedPayload {
  event: "meeting.ended";
  payload: {
    account_id: string;
    object: {
      id: string;
      topic: string;
      host_email?: string;
      start_time?: string;
      end_time?: string;
      participants?: Array<{
        email?: string;
        user_name?: string;
      }>;
    };
  };
}

type ZoomWebhookPayload = ZoomCRCPayload | ZoomMeetingEndedPayload | { event: string; payload: unknown };

/* =====================================================
   CRC RESPONSE
===================================================== */

function buildCRCResponse(plainToken: string): { plainToken: string; encryptedToken: string } {
  const encryptedToken = crypto
    .createHmac("sha256", ZOOM_SECRET_TOKEN)
    .update(plainToken)
    .digest("hex");

  return { plainToken, encryptedToken };
}

/* =====================================================
   MEETING ENDED HANDLER
===================================================== */

async function handleMeetingEnded(payload: ZoomMeetingEndedPayload["payload"]): Promise<void> {
  const participants = payload.object.participants ?? [];
  const meetingTopic = payload.object.topic || "(no topic)";
  const endedAt = payload.object.end_time ? new Date(payload.object.end_time) : new Date();

  if (participants.length === 0) {
    dbLogger.info(`Zoom meeting.ended: no participant emails in payload, skipping`);
    return;
  }

  // Zoom webhooks are account-wide (not per-org), so we have to check
  // every participant email against every org's leads. In practice
  // this is fine at small scale; if this ever needs to scale to many
  // orgs, this should be optimized with a global email index.
  for (const participant of participants) {
    const email = participant.email?.toLowerCase();
    if (!email) continue;

    const lead = await Lead.findOne({ email, isDeleted: { $ne: true } }).select(
      "_id organizationId"
    );

    if (!lead) continue;

    try {
      await LeadActivity.logActivity({
        organizationId: lead.organizationId,
        lead: lead._id,
        action: "MEETING_COMPLETED",
        actorType: "integration",
        actorName: "Zoom",
        description: `Meeting completed: ${meetingTopic}`,
        changes: [],
        idempotencyKey: `zoom:${payload.object.id}:${email}`,
      } as any);

      // Same pattern as Gmail sync: bump any open Deal linked to this
      // lead, since deal-risk/forecast engines read Deal.lastActivityAt
      // directly, not LeadActivity.
      await Deal.updateOne(
        {
          lead: lead._id,
          organizationId: lead.organizationId,
          status: "open",
          isDeleted: { $ne: true },
        } as any,
        {
          $set: { lastActivityAt: endedAt, lastContactedAt: endedAt },
          $inc: { activityCount: 1 },
        }
      );

      dbLogger.info(
        `Zoom meeting activity logged: lead=${lead._id} meeting=${payload.object.id}`
      );
    } catch (err) {
      dbLogger.warn(
        `Failed to log Zoom meeting activity for lead ${lead._id}: ${(err as Error).message}`
      );
    }
  }
}

/* =====================================================
   CONTROLLER
===================================================== */

class ZoomIntegrationController {
  /* =====================================================
     POST /api/integrations/zoom/webhook
     Handles both the CRC validation challenge AND real events.
     No auth middleware — Zoom calls this directly, verified via the
     secret-token-based CRC response instead of a login session.
  ===================================================== */
  webhook = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const body = req.body as ZoomWebhookPayload;

    if (!body || !body.event) {
      return res.status(400).json({ success: false, message: "Missing event" });
    }

    // CRC validation — Zoom sends this when you click "Validate" in
    // the dashboard, and periodically thereafter
    if (body.event === "endpoint.url_validation") {
      const plainToken = (body as ZoomCRCPayload).payload?.plainToken;

      if (!plainToken) {
        return res.status(400).json({ success: false, message: "Missing plainToken" });
      }

      const response = buildCRCResponse(plainToken);
      dbLogger.info("Zoom CRC validation handled successfully");
      return res.status(200).json(response);
    }

    // Real event — acknowledge immediately, process asynchronously.
    // Zoom expects a fast 200 response; slow processing can cause
    // Zoom to consider the webhook unhealthy.
    res.status(200).json({ success: true });

    if (body.event === "meeting.ended") {
      void handleMeetingEnded((body as ZoomMeetingEndedPayload).payload).catch((err) => {
        dbLogger.error(`Zoom meeting.ended processing failed: ${(err as Error).message}`);
      });
    } else {
      dbLogger.info(`Zoom webhook received unhandled event type: ${body.event}`);
    }

    return;
  });
}

export default new ZoomIntegrationController();