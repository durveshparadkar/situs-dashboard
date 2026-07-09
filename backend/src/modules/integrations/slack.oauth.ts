// slack.oauth.ts
//
// Handles the Slack OAuth flow for connecting alert delivery. Unlike
// Gmail (which needs the googleapis client library), Slack's OAuth is
// simple enough to hit directly with fetch — no SDK needed.
//
// Flow: user clicks Connect -> Slack's consent screen (where they also
// PICK THE CHANNEL) -> Slack redirects back with a code -> we exchange
// that code for a ready-to-POST webhook URL scoped to whichever
// channel they picked.

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || "";
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || "";
const SLACK_CALLBACK_URL =
  process.env.SLACK_CALLBACK_URL ||
  "https://api.situsrevenue.com/api/integrations/slack/callback";

if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
  console.warn(
    `⚠️  SLACK_CLIENT_ID / SLACK_CLIENT_SECRET not set — Slack integration will fail until these env vars are configured.`
  );
}

export function buildSlackAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    scope: "incoming-webhook",
    redirect_uri: SLACK_CALLBACK_URL,
    state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

interface SlackTokenResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id?: string; name?: string };
  incoming_webhook?: {
    url?: string;
    channel?: string;
    channel_id?: string;
  };
}

export async function exchangeSlackAuthCode(code: string): Promise<{
  webhookUrl: string;
  channelName: string;
  teamName: string;
}> {
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      code,
      redirect_uri: SLACK_CALLBACK_URL,
    }),
  });

  const data = (await res.json()) as SlackTokenResponse;

if (!data.ok) {
    throw new Error(`Slack token exchange failed: ${data.error || "unknown error"}`);
  }

  const webhookUrl = data.incoming_webhook?.url; // ✅ actual property access
  const channelName = data.incoming_webhook?.channel;
  const teamName = data.team?.name;

  if (!webhookUrl || !channelName || !teamName) {
    throw new Error(`Slack did not return the expected webhook details`);
  }

  return { webhookUrl, channelName, teamName };
}

export async function postToSlackWebhook(
  webhookUrl: string,
  text: string
): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook post failed: ${res.status} ${body}`);
  }
}