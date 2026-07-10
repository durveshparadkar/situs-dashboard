// hubspotConnection.model.ts
//
// Stores a single organization's HubSpot OAuth connection, used for
// one-time (or repeatable on-demand) import of contacts and deals
// into Situs. Unlike Gmail (continuous sync) or Slack (ongoing alert
// delivery), HubSpot's primary use case here is import — but we still
// store the connection so a user can re-run an import later without
// re-authorizing every time, and so token refresh works automatically.

import mongoose, { Schema, Types, HydratedDocument, Model } from "mongoose";

export interface IHubspotConnection {
  organizationId: Types.ObjectId;
  connectedByUserId: Types.ObjectId;

  /** HubSpot's portal/hub ID for the connected account — display only */
  hubId: string;

  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;

  /** Last time an import was run using this connection */
  lastImportedAt: Date | null;

  isActive: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export type HubspotConnectionDocument = HydratedDocument<IHubspotConnection>;

const hubspotConnectionSchema = new Schema<IHubspotConnection>(
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

    hubId: {
      type: String,
      required: true,
      trim: true,
    },

    accessToken: {
      type: String,
      required: true,
      select: false,
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

    lastImportedAt: {
      type: Date,
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

const HubspotConnection: Model<IHubspotConnection> =
  mongoose.models.HubspotConnection ||
  mongoose.model<IHubspotConnection>("HubspotConnection", hubspotConnectionSchema);

export default HubspotConnection;