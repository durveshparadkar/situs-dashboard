// slackConnection.model.ts
//
// Stores a single organization's Slack connection for alert delivery.
// Unlike GmailConnection (one per user, for reading email), this is
// one per ORGANIZATION — Slack alerts go to a shared team channel,
// not a personal inbox, so it doesn't make sense to have one per user.
//
// The incoming-webhook OAuth scope means Slack hands us back a
// ready-to-POST webhook URL scoped to whichever channel the user
// picked during the OAuth consent screen — we never need our own
// channel-picker UI.

import mongoose, { Schema, Types, HydratedDocument, Model } from "mongoose";

export interface ISlackConnection {
  organizationId: Types.ObjectId;
  connectedByUserId: Types.ObjectId;

  /** The channel name Slack reports back, e.g. "#sales-alerts" — display only */
  channelName: string;

  /** The ready-to-POST webhook URL for that channel. Treat as a secret. */
  webhookUrl: string;

  /** Slack's team/workspace name — shown in Settings UI */
  teamName: string;

  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export type SlackConnectionDocument = HydratedDocument<ISlackConnection>;

const slackConnectionSchema = new Schema<ISlackConnection>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
      index: true,
    },

    connectedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    channelName: {
      type: String,
      required: true,
      trim: true,
    },

    webhookUrl: {
      type: String,
      required: true,
      select: false,
    },

    teamName: {
      type: String,
      required: true,
      trim: true,
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

const SlackConnection: Model<ISlackConnection> =
  mongoose.models.SlackConnection ||
  mongoose.model<ISlackConnection>("SlackConnection", slackConnectionSchema);

export default SlackConnection;