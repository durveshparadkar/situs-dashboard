// gmail-sync.service.ts
//
// Polls each user's connected Gmail mailbox for recent messages, matches
// sender/recipient addresses against Lead emails in that org, and logs
// a LeadActivity record for each match. This is what makes
// daysSinceLastActivity accurate without a rep manually logging emails —
// see brain.service.ts's loadActivityMetrics(), which reads LeadActivity
// directly.
//
// Uses gmail.metadata scope only — we read headers (From/To/Subject/Date),
// never the email body. Enough to detect "contact with this lead
// happened," not enough to read message content (deliberately, for both
// privacy and Google's lighter verification requirements on this scope).
//
// Called on a schedule via gmail-sync.worker.ts (BullMQ), not directly
// from any request handler.

import { google } from "googleapis";
import Lead from "../leads/lead.model.js";
import Deal from "../deals/deal.model.js";
import LeadActivity from "../leadActivity/leadActivity.model.js";
import GmailConnection, {
  type GmailConnectionDocument,
} from "./gmailConnection.model.js";
import { createGmailOAuthClient, refreshGmailAccessToken } from "./gmail.oauth.js";
import { dbLogger } from "../../utils/logger.js";

const SYNC_CONFIG = {
  maxMessagesPerSync: 50,
  firstSyncLookbackDays: 7,
} as const;

/* =====================================================
   HELPERS
===================================================== */

function extractEmailAddress(headerValue: string | undefined | null): string | null {
  if (!headerValue) return null;
  const match = headerValue.match(/<([^>]+)>/);
  const addr = match?.[1] ?? headerValue.trim();
  return addr.toLowerCase();
}

function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
  name: string
): string | null {
  if (!headers) return null;
  const found = headers.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return found?.value ?? null;
}

async function ensureFreshToken(
  connection: GmailConnectionDocument
): Promise<string> {
  const now = Date.now();
  const expiresAt = connection.tokenExpiresAt.getTime();

  if (expiresAt - now > 2 * 60 * 1000) {
    return connection.accessToken;
  }

  const refreshed = await refreshGmailAccessToken(connection.refreshToken);

  connection.accessToken = refreshed.accessToken;
  connection.tokenExpiresAt = new Date(refreshed.expiryDate);
  await connection.save();

  return refreshed.accessToken;
}

/* =====================================================
   SYNC A SINGLE MAILBOX
===================================================== */

interface MailboxSyncResult {
  userId: string;
  email: string;
  messagesChecked: number;
  activitiesLogged: number;
  error?: string;
}

async function syncMailbox(
  connectionId: string
): Promise<MailboxSyncResult> {
  const connection = await GmailConnection.findById(connectionId).select(
    "+accessToken +refreshToken"
  );

  if (!connection || !connection.isActive) {
    throw new Error("Connection not found or inactive");
  }

  const result: MailboxSyncResult = {
    userId: connection.userId.toString(),
    email: connection.email,
    messagesChecked: 0,
    activitiesLogged: 0,
  };

  try {
    const accessToken = await ensureFreshToken(connection);

    const client = createGmailOAuthClient();
    client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: "v1", auth: client });

    const afterDate = connection.lastSyncedAt
      ? connection.lastSyncedAt
      : new Date(Date.now() - SYNC_CONFIG.firstSyncLookbackDays * 24 * 60 * 60 * 1000);

    const afterEpochSeconds = Math.floor(afterDate.getTime() / 1000);

    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: `after:${afterEpochSeconds}`,
      maxResults: SYNC_CONFIG.maxMessagesPerSync,
    });

    const messages = listRes.data.messages ?? [];

    const leads = await Lead.find({
      organizationId: connection.organizationId,
      isDeleted: { $ne: true },
    })
      .select("_id email")
      .lean<Array<{ _id: unknown; email?: string }>>();

    const leadsByEmail = new Map<string, string>();
    for (const lead of leads) {
      if (lead.email) {
        leadsByEmail.set(lead.email.toLowerCase(), String(lead._id));
      }
    }

    if (leadsByEmail.size === 0) {
      connection.lastSyncedAt = new Date();
      await connection.save();
      return result;
    }

    for (const msg of messages) {
      if (!msg.id) continue;
      result.messagesChecked++;

      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });

      const headers = detail.data.payload?.headers ?? undefined;
      const fromAddr = extractEmailAddress(getHeader(headers, "From"));
      const toAddr = extractEmailAddress(getHeader(headers, "To"));
      const subject = getHeader(headers, "Subject") ?? "(no subject)";
      const dateHeader = getHeader(headers, "Date");
      const occurredAt = dateHeader ? new Date(dateHeader) : new Date();

      const isOutgoing = fromAddr === connection.email;
      const otherAddr = isOutgoing ? toAddr : fromAddr;

      if (!otherAddr) continue;

      const leadId = leadsByEmail.get(otherAddr);
      if (!leadId) continue;

      try {
        await LeadActivity.logActivity({
          organizationId: connection.organizationId,
          lead: leadId as any,
          action: isOutgoing ? "EMAIL_SENT" : "EMAIL_REPLIED",
          performedBy: connection.userId,
          actorType: "integration",
          actorName: "Gmail",
          description: isOutgoing
            ? `Email sent: "${subject}"`
            : `Email received: "${subject}"`,
          changes: [],
          idempotencyKey: `gmail:${msg.id}`,
        } as any);

        result.activitiesLogged++;

        try {
          await Deal.updateOne(
            {
              lead: leadId,
              organizationId: connection.organizationId,
              status: "open",
              isDeleted: { $ne: true },
            },
            {
              $set: { lastActivityAt: occurredAt, lastContactedAt: occurredAt },
              $inc: { activityCount: 1 },
            }
          );
        } catch (dealErr) {
          dbLogger.warn(
            `Failed to bump linked deal activity for lead ${leadId}: ${(dealErr as Error).message}`
          );
        }
      } catch (err) {
        dbLogger.warn(
          `Failed to log activity for gmail message ${msg.id}: ${(err as Error).message}`
        );
      }
    }

    connection.lastSyncedAt = new Date();
    await connection.save();

    dbLogger.info(
      `Gmail sync complete: user=${result.userId} email=${result.email} ` +
      `checked=${result.messagesChecked} logged=${result.activitiesLogged}`
    );

    return result;
  } catch (err) {
    result.error = (err as Error).message;
    dbLogger.error(
      `Gmail sync failed: user=${result.userId} email=${result.email} error=${result.error}`
    );
    return result;
  }
}

/* =====================================================
   SYNC ALL ACTIVE MAILBOXES
===================================================== */

export async function syncAllGmailConnections(): Promise<{
  totalMailboxes: number;
  succeeded: number;
  failed: number;
}> {
  const connections = await GmailConnection.find({ isActive: true }).select("_id");

  let succeeded = 0;
  let failed = 0;

  for (const conn of connections) {
    const result = await syncMailbox(conn._id.toString());
    if (result.error) failed++;
    else succeeded++;
  }

  dbLogger.info(
    `Gmail sync batch complete: total=${connections.length} succeeded=${succeeded} failed=${failed}`
  );

  return {
    totalMailboxes: connections.length,
    succeeded,
    failed,
  };
}

export async function syncSingleUserGmail(userId: string): Promise<MailboxSyncResult> {
  const connection = await GmailConnection.findOne({ userId, isActive: true }).select("_id");

  if (!connection) {
    throw new Error("No active Gmail connection for this user");
  }

  return syncMailbox(connection._id.toString());
}