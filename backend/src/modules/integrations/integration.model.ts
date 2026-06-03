import mongoose, {
  Schema,
  Types,
  HydratedDocument,
  Model,
} from "mongoose";

import {
  IntegrationProvider,
  IntegrationStatus,
} from "./integration.types.js";

/* =====================================================
   PROVIDER / STATUS ENUMS
   Kept in arrays so the schema enum and the TS type stay
   aligned from a single place. If you add a provider to
   integration.types.ts, add it here too.
===================================================== */

const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  "salesforce",
  "hubspot",
  "gmail",
  "outlook",
  "slack",
  "zoom",
  "calendar",
  "teams",
  "zoho",
  "pipedrive",
  "googleMeet",
];

const INTEGRATION_STATUSES: IntegrationStatus[] = [
  "CONNECTED",
  "DISCONNECTED",
  "ERROR",
  "SYNCING",
];

/* =====================================================
   TYPES
===================================================== */

export interface IIntegration {
  organizationId: Types.ObjectId;

  provider: IntegrationProvider;

  status: IntegrationStatus;

  accessToken?: string | null;

  refreshToken?: string | null;

  externalAccountId?: string | null;

  lastSyncAt?: Date | null;

  lastError?: string | null;

  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

export type IntegrationDocument =
  HydratedDocument<IIntegration>;

/* =====================================================
   SCHEMA
===================================================== */

const integrationSchema = new Schema<IIntegration>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },

    provider: {
      type: String,
      required: true,
      enum: INTEGRATION_PROVIDERS,
      index: true,
    },

    status: {
      type: String,
      required: true,
      enum: INTEGRATION_STATUSES,
      default: "DISCONNECTED",
      index: true,
    },

    accessToken: {
      type: String,
      default: null,
      select: false,
    },

    refreshToken: {
      type: String,
      default: null,
      select: false,
    },

    externalAccountId: {
      type: String,
      default: null,
    },

    lastSyncAt: {
      type: Date,
      default: null,
    },

    lastError: {
      type: String,
      default: null,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

/* =====================================================
   INDEXES
   One organization can have exactly one integration per
   provider — enforced by a compound unique index. This
   also serves all (organizationId, provider) lookups, so
   no separate non-unique index is needed.
===================================================== */

integrationSchema.index(
  { organizationId: 1, provider: 1 },
  { unique: true }
);

/* =====================================================
   MODEL
===================================================== */

const Integration: Model<IIntegration> =
  (mongoose.models.Integration as Model<IIntegration>) ||
  mongoose.model<IIntegration>(
    "Integration",
    integrationSchema
  );

export default Integration;