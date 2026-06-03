/* =====================================================
   ORGANIZATION CORE TYPES
===================================================== */

export type OrganizationPlan =
  | "SMALL_BUSINESS"
  | "PRO"
  | "ENTERPRISE";

export type BillingStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED";

/* =====================================================
   SETTINGS
===================================================== */

export interface OrganizationSettings {
  timezone?: string;
  currency?: string;
}

/* =====================================================
   ORGANIZATION ENTITY (SHARED SHAPE)
===================================================== */

export interface OrganizationDTO {
  _id: string;
  name: string;
  slug: string;

  plan: OrganizationPlan;
  billingStatus: BillingStatus;

  isTrial: boolean;
  trialEndsAt: Date | null;
  graceUntil: Date | null;

  isActive: boolean;
  isDeleted: boolean;

  settings?: OrganizationSettings;

  createdAt: Date;
  updatedAt: Date;
}

/* =====================================================
   CREATE / UPDATE INPUTS
===================================================== */

export interface CreateOrganizationInput {
  name: string;
  plan?: OrganizationPlan;
}

export interface UpdateOrganizationInput {
  name?: string;
  settings?: OrganizationSettings;
}

/* =====================================================
   USER CONTEXT (GLOBAL USE)
===================================================== */

export interface CurrentUserContext {
  _id: string;
  role:
    | "SUPER_ADMIN"
    | "ORG_ADMIN"
    | "MANAGER"
    | "AGENT";
  organizationId: string;
}

/* =====================================================
   RESPONSE TYPES
===================================================== */

export interface OrganizationResponse {
  success: boolean;
  data: OrganizationDTO;
}

export interface OrganizationListResponse {
  success: boolean;
  data: OrganizationDTO[];
}

/* =====================================================
   INTERNAL HELPERS (OPTIONAL)
===================================================== */

export type SafeOrganization = Omit<
  OrganizationDTO,
  "isDeleted"
>;