// gmailConnection.model.ts
//
// Stores a single user's Gmail OAuth connection, separate from the
// login OAuth tokens in User.googleId. A user can be logged in via
// Google (or email/password) and separately choose to "Connect Gmail"
// for activity sync — these are independent authorizations with
// independent scopes (login needs only profile/email; this needs
// gmail.metadata).
//
// One connection per user. Tokens are the raw OAuth values from
// Google — access tokens expire quickly (~1hr) and are refreshed
// automatically by gmail-sync.service.ts using the refresh token.

import mongoose, { Schema, Types, HydratedDocument, Model } from "mongoose";

export interface IGmailConnection {
  userId: Types.ObjectId;
  organizationId: Types.ObjectId;

  /** The Gmail address that was connected — shown in Settings UI */
  email: string;

  accessToken: string;
  refreshToken: string;

  /** When the current accessToken expires — used to decide when to refresh */
  tokenExpiresAt: Date;

  /** Last time we successfully polled this mailbox for new messages */
  lastSyncedAt: Date | null;

  /**
   * Gmail's historyId from the last successful sync — lets future syncs
   * ask Gmail "what changed since X" instead of re-scanning everything.
   * Null until the first sync completes.
   */
  lastHistoryId: string | null;

  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export type GmailConnectionDocument = HydratedDocument<IGmailConnection>;

const gmailConnectionSchema = new Schema<IGmailConnection>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one Gmail connection per user
      index: true,
    },

    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    accessToken: {
      type: String,
      required: true,
      select: false, // never included in default queries — sensitive
    },

    refreshToken: {
      type: String,
      required: true,
      select: false,
    },

    tokenExpiresAt: {
      type: Date,
      required: true,
    },

    lastSyncedAt: {
      type: Date,
      default: null,
    },

    lastHistoryId: {
      type: String,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

gmailConnectionSchema.index({ organizationId: 1, isActive: 1 });

const GmailConnection: Model<IGmailConnection> =
  mongoose.models.GmailConnection ||
  mongoose.model<IGmailConnection>("GmailConnection", gmailConnectionSchema);

export default GmailConnection;