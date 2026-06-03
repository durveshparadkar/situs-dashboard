import mongoose from "mongoose";

import Integration from "./integration.model.js";

import {
  IntegrationProvider,
  IntegrationStatus,
} from "./integration.types.js";

import { ApiError } from "../../utils/ApiError.js";

/* =====================================================
   HELPERS
===================================================== */

/**
 * Validate and convert an organizationId string to an ObjectId.
 * Throws a clean 400 instead of letting Mongoose throw a raw
 * BSONError on malformed input.
 */
function toOrgObjectId(organizationId: string): mongoose.Types.ObjectId {
  if (!mongoose.Types.ObjectId.isValid(organizationId)) {
    throw ApiError.badRequest("Invalid organization ID");
  }
  return new mongoose.Types.ObjectId(organizationId);
}

class IntegrationService {
  /* =====================================================
     CREATE / CONNECT
  ===================================================== */

  async connectIntegration(params: {
    organizationId: string;
    provider: IntegrationProvider;
    accessToken?: string;
    refreshToken?: string;
    externalAccountId?: string;
    metadata?: Record<string, unknown>;
  }) {
    const orgId = toOrgObjectId(params.organizationId);

    const integration = await Integration.findOneAndUpdate(
      {
        organizationId: orgId,
        provider: params.provider,
      },
      {
        $set: {
          status: "CONNECTED",
          accessToken: params.accessToken ?? null,
          refreshToken: params.refreshToken ?? null,
          externalAccountId: params.externalAccountId ?? null,
          lastError: null,
          /* Only overwrite metadata when explicitly provided, so a
             reconnect without metadata doesn't wipe existing values. */
          ...(params.metadata !== undefined && {
            metadata: params.metadata,
          }),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return integration;
  }

  /* =====================================================
     DISCONNECT
  ===================================================== */

  async disconnectIntegration(
    organizationId: string,
    provider: IntegrationProvider
  ) {
    const orgId = toOrgObjectId(organizationId);

    const integration = await Integration.findOneAndUpdate(
      {
        organizationId: orgId,
        provider,
      },
      {
        $set: {
          status: "DISCONNECTED",
          accessToken: null,
          refreshToken: null,
        },
      },
      {
        new: true,
      }
    );

    if (!integration) {
      throw ApiError.notFound("Integration not found");
    }

    return integration;
  }

  /* =====================================================
     UPDATE STATUS
  ===================================================== */

  async updateStatus(params: {
    organizationId: string;
    provider: IntegrationProvider;
    status: IntegrationStatus;
    lastError?: string | null;
  }) {
    const orgId = toOrgObjectId(params.organizationId);

    return Integration.findOneAndUpdate(
      {
        organizationId: orgId,
        provider: params.provider,
      },
      {
        $set: {
          status: params.status,
          lastError: params.lastError ?? null,
          ...(params.status === "CONNECTED" && {
            lastSyncAt: new Date(),
          }),
        },
      },
      {
        new: true,
      }
    );
  }

  /* =====================================================
     GET ORG INTEGRATIONS
  ===================================================== */

  async getOrganizationIntegrations(organizationId: string) {
    const orgId = toOrgObjectId(organizationId);

    return Integration.find({
      organizationId: orgId,
    }).lean();
  }
}

export default new IntegrationService();