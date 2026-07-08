// gmail.oauth.ts
//
// Handles the Gmail-specific OAuth flow — separate from the login
// Google strategy in shared/auth/passport.ts. This one requests the
// gmail.metadata scope and is used only for connecting a mailbox for
// activity sync, never for authentication.
//
// We don't use Passport here since Passport's Google strategy is
// already wired for login with a different scope/callback. Simpler
// to hit Google's OAuth endpoints directly with the googleapis client.

import { google } from "googleapis";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GMAIL_CALLBACK_URL =
  process.env.GMAIL_CALLBACK_URL ||
  "https://api.situsrevenue.com/api/integrations/gmail/callback";

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn(
    "⚠️  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Gmail integration will fail until these env vars are configured."
  );
}

/**
 * Creates a fresh OAuth2 client. Stateless — callers attach tokens
 * as needed (either building an auth URL, or exchanging a code / an
 * existing refresh token for a valid access token).
 */
export function createGmailOAuthClient() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GMAIL_CALLBACK_URL
  );
}

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.metadata",
  // Needed to know which Gmail address was connected (metadata scope
  // alone doesn't include profile info)
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * Build the URL to redirect the user to for Gmail connection consent.
 * state should carry the logged-in userId so the callback knows who
 * to attach the connection to (Gmail connect happens from within the
 * already-authenticated app, unlike login).
 */
export function buildGmailAuthUrl(state: string): string {
  const client = createGmailOAuthClient();

  return client.generateAuthUrl({
    access_type: "offline", // required to get a refresh_token back
    prompt: "consent", // force showing consent screen so we always get a refresh_token,
    // even if the user previously connected and Google would otherwise skip it
    scope: GMAIL_SCOPES,
    state,
  });
}

/**
 * Exchange the authorization code (from the callback query string) for
 * access + refresh tokens, and fetch which Gmail address was connected.
 */
export async function exchangeGmailAuthCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  email: string;
}> {
  const client = createGmailOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
    throw new Error(
      "Google did not return the expected tokens — refresh_token is missing. " +
        "This usually means the user already granted consent previously without " +
        "'prompt=consent' forcing a fresh one. Ask them to disconnect and reconnect."
    );
  }

  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: profile } = await oauth2.userinfo.get();

  if (!profile.email) {
    throw new Error("Could not determine the connected Gmail address");
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date,
    email: profile.email,
  };
}

/**
 * Given a stored refresh token, get a fresh access token. Called by
 * gmail-sync.service.ts before each sync run, since access tokens
 * expire after ~1 hour.
 */
export async function refreshGmailAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiryDate: number;
}> {
  const client = createGmailOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await client.refreshAccessToken();

  if (!credentials.access_token || !credentials.expiry_date) {
    throw new Error("Failed to refresh Gmail access token");
  }

  return {
    accessToken: credentials.access_token,
    expiryDate: credentials.expiry_date,
  };
}