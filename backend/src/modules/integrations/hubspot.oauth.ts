// hubspot.oauth.ts
//
// Handles the HubSpot OAuth flow for CRM import. Same shape as
// slack.oauth.ts — hits HubSpot's OAuth endpoints directly with
// fetch, no SDK needed.

const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID || "";
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET || "";
const HUBSPOT_CALLBACK_URL =
  process.env.HUBSPOT_CALLBACK_URL ||
  "https://api.situsrevenue.com/api/integrations/hubspot/callback";

if (!HUBSPOT_CLIENT_ID || !HUBSPOT_CLIENT_SECRET) {
  console.warn(
    "⚠️  HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET not set — HubSpot integration will fail until these env vars are configured."
  );
}

const HUBSPOT_SCOPES = [
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.objects.deals.read",
  "crm.objects.deals.write",
].join(" ");

/**
 * Build the URL to redirect the user to for HubSpot connection consent.
 * state carries the logged-in userId + orgId (signed JWT, same
 * pattern as Gmail/Slack/Zoom).
 */
export function buildHubspotAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: HUBSPOT_CLIENT_ID,
    redirect_uri: HUBSPOT_CALLBACK_URL,
    scope: HUBSPOT_SCOPES,
    state,
  });

  return `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
}

interface HubspotTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  status?: string;
  message?: string;
}

/**
 * Exchange the authorization code for access + refresh tokens.
 */
export async function exchangeHubspotAuthCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
}> {
  const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: HUBSPOT_CLIENT_ID,
      client_secret: HUBSPOT_CLIENT_SECRET,
      redirect_uri: HUBSPOT_CALLBACK_URL,
      code,
    }),
  });

  const data = (await res.json()) as HubspotTokenResponse;

  if (!res.ok || !data.access_token || !data.refresh_token) {
    throw new Error(
      `HubSpot token exchange failed: ${data.message || res.statusText}`
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiryDate: Date.now() + (data.expires_in ?? 1800) * 1000,
  };
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshHubspotAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiryDate: number }> {
  const res = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: HUBSPOT_CLIENT_ID,
      client_secret: HUBSPOT_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  const data = (await res.json()) as HubspotTokenResponse;

  if (!res.ok || !data.access_token) {
    throw new Error(
      `HubSpot token refresh failed: ${data.message || res.statusText}`
    );
  }

  return {
    accessToken: data.access_token,
    expiryDate: Date.now() + (data.expires_in ?? 1800) * 1000,
  };
}

/**
 * Look up which HubSpot portal (hub) this access token belongs to —
 * used to show "Connected to Hub #12345" in Settings.
 */
export async function getHubspotTokenInfo(
  accessToken: string
): Promise<{ hubId: string }> {
  const res = await fetch(
    `https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch HubSpot token info: ${res.statusText}`);
  }

  const data = (await res.json()) as { hub_id?: number };

  return { hubId: String(data.hub_id ?? "unknown") };
}