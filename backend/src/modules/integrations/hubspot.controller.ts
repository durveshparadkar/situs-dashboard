// hubspot.controller.ts
//
// Handles the HubSpot connection flow and one-time (repeatable) CRM
// import:
//   GET  /api/integrations/hubspot/connect    — redirect to HubSpot consent
//   GET  /api/integrations/hubspot/callback   — HubSpot redirects back here
//   GET  /api/integrations/hubspot/status     — is HubSpot connected?
//   DELETE /api/integrations/hubspot          — disconnect
//   POST /api/integrations/hubspot/import     — import contacts + deals
//
// Import is dedup-safe: contacts are matched against
// Lead.externalIds.hubspotContactId, deals against
// Deal.externalIds.hubspotId — running import multiple times updates
// existing records instead of creating duplicates.

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { dbLogger } from "../../utils/logger.js";
import HubspotConnection from "./hubspotConnection.model.js";
import Lead from "../leads/lead.model.js";
import Deal from "../deals/deal.model.js";
import Pipeline from "../pipelines/pipeline.model.js";
import { LeadSource } from "../../shared/enums/lead.enums.js";
import {
  buildHubspotAuthUrl,
  exchangeHubspotAuthCode,
  refreshHubspotAccessToken,
  getHubspotTokenInfo,
} from "./hubspot.oauth.js";
import { error } from "console";
import { connected } from "process";

const STATE_SECRET = process.env.JWT_SECRET!;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.situsrevenue.com";

interface HubspotStatePayload {
  userId: string;
  organizationId: string;
}

function signState(payload: HubspotStatePayload): string {
  return jwt.sign(payload, STATE_SECRET, { expiresIn: "10m" });
}

function verifyState(state: string): HubspotStatePayload {
  try {
    return jwt.verify(state, STATE_SECRET) as HubspotStatePayload;
  } catch {
    throw ApiError.badRequest("Invalid or expired connection request — please try again");
  }
}

function getActor(req: Request): { userId: string; organizationId: string } {
  const u = req.user;
  if (!u) throw ApiError.unauthorized("Unauthorized");

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

/* =====================================================
   HUBSPOT API HELPERS
===================================================== */

interface HubspotContact {
  id: string;
  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    city?: string;
  };
}

interface HubspotDeal {
  id: string;
  properties: {
    dealname?: string;
    amount?: string;
    dealstage?: string;
    closedate?: string;
  };
}

async function ensureFreshToken(
  connection: InstanceType<typeof HubspotConnection>
): Promise<string> {
  const now = Date.now();
  if (connection.tokenExpiresAt.getTime() - now > 2 * 60 * 1000) {
    return connection.accessToken;
  }

  const refreshed = await refreshHubspotAccessToken(connection.refreshToken);
  connection.accessToken = refreshed.accessToken;
  connection.tokenExpiresAt = new Date(refreshed.expiryDate);
  await connection.save();

  return refreshed.accessToken;
}

async function fetchHubspotContacts(accessToken: string): Promise<HubspotContact[]> {
  const res = await fetch(
    "https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email,phone,city",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new Error(`HubSpot contacts fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as { results?: HubspotContact[] };
  return data.results ?? [];
}

async function fetchHubspotDeals(accessToken: string): Promise<HubspotDeal[]> {
  const res = await fetch(
    "https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,amount,dealstage,closedate",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new Error(`HubSpot deals fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as { results?: HubspotDeal[] };
  return data.results ?? [];
}

/* =====================================================
   CONTROLLER
===================================================== */

class HubspotIntegrationController {
  connect = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId, organizationId } = getActor(req);
    const state = signState({ userId, organizationId });
    const authUrl = buildHubspotAuthUrl(state);
    dbLogger.info(`HubSpot connect initiated: user=${userId}`);
    res.redirect(authUrl);
  });

  callback = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const errorParam = typeof req.query.error === "string" ? req.query.error : "";

    if (errorParam) {
      return res.redirect(`${FRONTEND_URL}/dashboard/settings?hubspot=declined`);
    }
    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL}/dashboard/settings?hubspot=error`);
    }

    const { userId, organizationId } = verifyState(state);

    let tokens;
    let hubId: string;
    try {
      tokens = await exchangeHubspotAuthCode(code);
      const info = await getHubspotTokenInfo(tokens.accessToken);
      hubId = info.hubId;
    } catch (err) {
      dbLogger.error(
        `HubSpot token exchange failed: user=${userId} error=${(err as Error).message}`
      );
      return res.redirect(`${FRONTEND_URL}/dashboard/settings?hubspot=error`);
    }

    await HubspotConnection.findOneAndUpdate(
      { organizationId },
      {
        organizationId,
        connectedByUserId: userId,
        hubId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: new Date(tokens.expiryDate),
        isActive: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    dbLogger.info(`HubSpot connected: org=${organizationId} hub=${hubId}`);
    res.redirect(`${FRONTEND_URL}/dashboard/settings?hubspot=connected`);
  });

  status = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { organizationId } = getActor(req);

    const connection = await HubspotConnection.findOne({
      organizationId,
      isActive: true,
    }).select("hubId lastImportedAt createdAt");

    res.status(200).json({
      success: true,
      data: {
        connected: Boolean(connection),
        hubId: connection?.hubId ?? null,
        lastImportedAt: connection?.lastImportedAt ?? null,
        connectedAt: connection?.createdAt ?? null,
      },
    });
  });

  disconnect = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { organizationId } = getActor(req);
    await HubspotConnection.findOneAndUpdate({ organizationId }, { isActive: false });
    dbLogger.info(`HubSpot disconnected: org=${organizationId}`);
    res.status(200).json({ success: true, message: "HubSpot disconnected" });
  });

  /* =====================================================
     POST /api/integrations/hubspot/import
     Dedup-safe: contacts matched on externalIds.hubspotContactId,
     deals matched on externalIds.hubspotId. Re-running this is safe.
  ===================================================== */
  import = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const { userId, organizationId } = getActor(req);

    const connection = await HubspotConnection.findOne({
      organizationId,
      isActive: true,
    }).select("+accessToken +refreshToken");

    if (!connection) {
      throw ApiError.badRequest("HubSpot is not connected");
    }

    const accessToken = await ensureFreshToken(connection);

    // Need a default pipeline + first stage to attach imported leads to
    const pipeline = await Pipeline.findOne({
      organizationId,
      isDefault: true,
    }).select("_id stages");

    if (!pipeline || !pipeline.stages?.length) {
      throw ApiError.badRequest(
        "No default pipeline found for this organization — cannot import leads"
      );
    }

    const firstStage = pipeline.stages[0];
    if (!firstStage) {
      throw ApiError.badRequest(
        "No default pipeline stage found for this organization — cannot import leads"
      );
    }

    let contactsImported = 0;
    let contactsSkipped = 0;
    let dealsImported = 0;
    let dealsSkipped = 0;

    try {
      const contacts = await fetchHubspotContacts(accessToken);

      for (const contact of contacts) {
        const props = contact.properties;
        const name =
          [props.firstname, props.lastname].filter(Boolean).join(" ").trim() ||
          "Unnamed Contact";

        const existing = await Lead.findOne({
          organizationId,
          "externalIds.hubspotContactId": contact.id,
        }).select("_id");

        if (existing) {
          // Update the basics rather than skip entirely — keeps
          // re-imports useful, not just a no-op
          await Lead.updateOne(
            { _id: existing._id as mongoose.Types.ObjectId },
            {
              name,
              email: props.email || null,
              phone: props.phone || existing.get("phone"),
              interestedLocation: props.city || existing.get("interestedLocation"),
              "externalIds.hubspotContactId": contact.id,
              "externalIds.crmSource": "hubspot",
            }
          );
          contactsSkipped++;
          continue;
        }

        await Lead.create({
          name,
          phone: props.phone || "0000000000",
          email: props.email || null,
          budget: 0,
          interestedLocation: props.city || "Unknown",
          source: LeadSource.OTHER ?? "OTHER",
          organizationId,
          assignedTo: userId,
          pipelineId: pipeline._id,
          stageId: `${firstStage._id}`,
          externalIds: {
            hubspotContactId: contact.id,
            crmSource: "hubspot",
          },
        } as any);
        contactsImported++;
      }
    } catch (err) {
      dbLogger.error(`HubSpot contact import failed: ${(err as Error).message}`);
    }

    try {
      const deals = await fetchHubspotDeals(accessToken);

      for (const deal of deals) {
        const props = deal.properties;
        const value = Number(props.amount) || 0;

        const existing = await Deal.findOne({
          organizationId,
          "externalIds.hubspotId": deal.id,
        }).select("_id");

        if (existing) {
          await Deal.updateOne(
            { _id: existing._id },
            { title: props.dealname || "Untitled Deal", value }
          );
          dealsSkipped++;
          continue;
        }

        // Deals require a pipelineId/stageId too — reuse the same
        // default pipeline's first stage as a safe landing spot;
        // the user can move it once imported.
        await Deal.create({
          title: props.dealname || "Untitled Deal",
          value,
          currency: "INR",
          organizationId,
          assignedTo: new mongoose.Types.ObjectId(userId),
          createdBy: new mongoose.Types.ObjectId(userId),
          pipelineId: pipeline._id,
          stageId: `${firstStage._id}`,
          externalIds: {
            hubspotId: deal.id,
            crmSource: "hubspot",
          },
        });
        dealsImported++;
      }
    } catch (err) {
      dbLogger.error(`HubSpot deal import failed: ${(err as Error).message}`);
    }

    connection.lastImportedAt = new Date();
    await connection.save();

    dbLogger.info(
      `HubSpot import complete: org=${organizationId} ` +
      `contacts=${contactsImported}/${contactsSkipped} deals=${dealsImported}/${dealsSkipped}`
    );

    res.status(200).json({
      success: true,
      data: { contactsImported, contactsSkipped, dealsImported, dealsSkipped },
      message: `Imported ${contactsImported} new leads, ${dealsImported} new deals (${contactsSkipped + dealsSkipped} already existed and were updated)`,
    });
  });
}

export default new HubspotIntegrationController();