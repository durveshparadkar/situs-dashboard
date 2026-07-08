// gmail.controller.ts
//
// Handles the Gmail connection flow for activity sync:
//   GET  /api/integrations/gmail/connect    — redirect to Google consent
//   GET  /api/integrations/gmail/callback   — Google redirects back here
//   GET  /api/integrations/gmail/status     — is Gmail connected? which address?
//   DELETE /api/integrations/gmail          — disconnect
//
// The callback route does NOT rely on the user's session cookie being
// present (Google's redirect is a fresh top-level navigation, and we'd
// rather not depend on cookie edge cases). Instead, /connect encodes the
// logged-in user's identity into a short-lived signed JWT passed as the
// OAuth state parameter, which /callback verifies independently.
import jwt from "jsonwebtoken";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/ApiError.js";
import { dbLogger } from "../../utils/logger.js";
import GmailConnection from "./gmailConnection.model.js";
import { buildGmailAuthUrl, exchangeGmailAuthCode, } from "./gmail.oauth.js";
const STATE_SECRET = process.env.JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://app.situsrevenue.com";
function signState(payload) {
    return jwt.sign(payload, STATE_SECRET, { expiresIn: "10m" });
}
function verifyState(state) {
    try {
        return jwt.verify(state, STATE_SECRET);
    }
    catch {
        throw ApiError.badRequest("Invalid or expired connection request — please try again");
    }
}
function getActor(req) {
    const u = req.user;
    if (!u) {
        throw ApiError.unauthorized("Unauthorized");
    }
    const userId = (typeof u.id === "string" && u.id) || (u._id ? u._id.toString() : "");
    const organizationId = typeof u.organizationId === "string"
        ? u.organizationId
        : String(u.organizationId ?? "");
    if (!userId || !organizationId) {
        throw ApiError.unauthorized("User missing identity or organization");
    }
    return { userId, organizationId };
}
class GmailIntegrationController {
    /* =====================================================
       GET /api/integrations/gmail/connect
       User must already be logged in (protect middleware). Redirects
       to Google's consent screen with a signed state param carrying
       their identity for the callback to pick up.
    ===================================================== */
    connect = asyncHandler(async (req, res, _next) => {
        const { userId, organizationId } = getActor(req);
        const state = signState({ userId, organizationId });
        const authUrl = buildGmailAuthUrl(state);
        dbLogger.info(`Gmail connect initiated: user=${userId}`);
        res.redirect(authUrl);
    });
    /* =====================================================
       GET /api/integrations/gmail/callback
       Google redirects here after consent. No protect middleware —
       identity comes from the signed state param instead.
    ===================================================== */
    callback = asyncHandler(async (req, res, _next) => {
        const code = typeof req.query.code === "string" ? req.query.code : "";
        const state = typeof req.query.state === "string" ? req.query.state : "";
        const errorParam = typeof req.query.error === "string" ? req.query.error : "";
        if (errorParam) {
            // User clicked "Cancel" on Google's consent screen
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
        }
        catch (err) {
            dbLogger.error(`Gmail token exchange failed: user=${userId} error=${err.message}`);
            return res.redirect(`${FRONTEND_URL}/dashboard/settings?gmail=error`);
        }
        await GmailConnection.findOneAndUpdate({ userId }, {
            userId,
            organizationId,
            email: tokens.email,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            tokenExpiresAt: new Date(tokens.expiryDate),
            isActive: true,
        }, { upsert: true, new: true, setDefaultsOnInsert: true });
        dbLogger.info(`Gmail connected: user=${userId} email=${tokens.email}`);
        res.redirect(`${FRONTEND_URL}/dashboard/settings?gmail=connected`);
    });
    /* =====================================================
       GET /api/integrations/gmail/status
    ===================================================== */
    status = asyncHandler(async (req, res, _next) => {
        const { userId } = getActor(req);
        const connection = await GmailConnection.findOne({ userId, isActive: true }).select("email lastSyncedAt createdAt");
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
    /* =====================================================
       DELETE /api/integrations/gmail
    ===================================================== */
    disconnect = asyncHandler(async (req, res, _next) => {
        const { userId } = getActor(req);
        await GmailConnection.findOneAndUpdate({ userId }, { isActive: false });
        dbLogger.info(`Gmail disconnected: user=${userId}`);
        res.status(200).json({
            success: true,
            message: "Gmail disconnected",
        });
    });
}
export default new GmailIntegrationController();
//# sourceMappingURL=gmail.controller.js.map