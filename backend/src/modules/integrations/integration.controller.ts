import { Request, Response, NextFunction, RequestHandler } from "express";
import integrationService from "./integration.service.js";
import { ApiError } from "../../utils/ApiError.js";
import { IntegrationProvider } from "./integration.types.js";

/* =====================================================
   ASYNC HANDLER
===================================================== */

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/* =====================================================
   PROVIDER ALLOWLIST
   Single source of truth for valid providers. Reject anything
   not on this list before it reaches the service layer.
===================================================== */

const VALID_PROVIDERS: readonly IntegrationProvider[] = [
  "salesforce",
  "hubspot",
  "gmail",
  "slack",
  "zoom",
  "calendar",
  "teams",
  "outlook",
  "zoho",
  "pipedrive",
  "googleMeet",
] as const;

function isValidProvider(value: unknown): value is IntegrationProvider {
  return (
    typeof value === "string" &&
    (VALID_PROVIDERS as readonly string[]).includes(value)
  );
}

/* =====================================================
   HELPERS
===================================================== */

function getOrganizationId(req: Request): string {
  const organizationId = req.user?.organizationId;
  if (!organizationId) {
    throw ApiError.unauthorized("Organization not found");
  }
  return organizationId;
}

/**
 * Resolve and validate the provider route param.
 * Throws 400 if missing or not on the allowlist.
 */
function getProvider(req: Request): IntegrationProvider {
  const provider = req.params.provider;
  if (!isValidProvider(provider)) {
    throw ApiError.badRequest(
      "Invalid or unsupported integration provider"
    );
  }
  return provider;
}

/**
 * Validate a required string field from the request body.
 * Returns a trimmed string or throws 400.
 */
function requireBodyString(
  body: Record<string, unknown>,
  field: string
): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw ApiError.badRequest(field + " is required");
  }
  return value.trim();
}

/**
 * Validate an optional string field. Returns trimmed string or undefined.
 * Rejects non-string values (e.g. someone passing an object/array).
 */
function optionalBodyString(
  body: Record<string, unknown>,
  field: string
): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw ApiError.badRequest(field + " must be a string");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validate optional metadata object. Must be a plain object if present.
 */
function optionalMetadata(
  body: Record<string, unknown>
): Record<string, unknown> | undefined {
  const value = body.metadata;
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw ApiError.badRequest("metadata must be an object");
  }
  return value as Record<string, unknown>;
}

/* =====================================================
   CONTROLLER
===================================================== */

class IntegrationController {

  /* ── CONNECT INTEGRATION ── */
  connect = asyncHandler(async (req, res) => {
    const organizationId = getOrganizationId(req);
    const provider       = getProvider(req);

    const body = (req.body ?? {}) as Record<string, unknown>;

    /* accessToken is required to establish a connection.
       refreshToken / externalAccountId / metadata are optional
       depending on the provider's OAuth flow. */
    const accessToken       = requireBodyString(body, "accessToken");
    const refreshToken      = optionalBodyString(body, "refreshToken");
    const externalAccountId = optionalBodyString(body, "externalAccountId");
    const metadata          = optionalMetadata(body);

    const integration = await integrationService.connectIntegration({
      organizationId,
      provider,
      accessToken,
      /* Conditional spread: omit optional keys entirely when absent,
         to satisfy exactOptionalPropertyTypes. */
      ...(refreshToken      !== undefined && { refreshToken }),
      ...(externalAccountId !== undefined && { externalAccountId }),
      ...(metadata          !== undefined && { metadata }),
    });

    res.status(200).json({ success: true, data: integration });
  });

  /* ── DISCONNECT ── */
  disconnect = asyncHandler(async (req, res) => {
    const organizationId = getOrganizationId(req);
    const provider       = getProvider(req);

    const integration = await integrationService.disconnectIntegration(
      organizationId,
      provider
    );

    res.status(200).json({ success: true, data: integration });
  });

  /* ── GET INTEGRATIONS ── */
  findAll = asyncHandler(async (req, res) => {
    const organizationId = getOrganizationId(req);

    const integrations = await integrationService.getOrganizationIntegrations(
      organizationId
    );

    res.status(200).json({ success: true, data: integrations });
  });
}

export default new IntegrationController();