// permissions.ts
//
// Single source of truth for RBAC vocabulary across the Revenue OS platform.
// Defines the universe of permissions and their default role assignments.
//
// Used by:
//   - auth.middleware.ts        — authorize() permission checks
//   - rbac.middleware.ts        — requirePermission() guards
//   - role.model.ts             — system role seeding
//   - audit.routes.ts           — READ_AUDIT gating
//   - billing.routes.ts         — MANAGE_BILLING / READ_BILLING gating
//   - rbac.service.ts           — effective permission resolution
//   - seedSuperAdmin.ts         — super admin permission grant
//
// Design principles:
//   - Permissions are flat strings — no hierarchical implication (READ
//     doesn't imply LIST; declare both if both are needed).
//   - Role-to-permission mapping is the DEFAULT — organizations can
//     customize via custom roles in the DB.
//   - SUPER_ADMIN always has every permission, regardless of this map,
//     enforced by bypass logic in middleware.

// ============================================================
// PERMISSIONS
// ============================================================

/**
 * Master permission catalogue. Adding a permission:
 *   1. Add the key here
 *   2. Decide which built-in roles should receive it (ROLE_PERMISSIONS below)
 *   3. Use it at the call site: authorize("YOUR_PERMISSION")
 *
 * Naming convention: <VERB>_<RESOURCE>. Verbs: CREATE, READ, UPDATE, DELETE,
 * LIST, MANAGE, EXPORT, IMPORT. Use MANAGE_ for "full lifecycle authority"
 * (typically equivalent to CREATE+UPDATE+DELETE on that resource).
 */
export const PERMISSIONS = {

  // ============================================================
  // PLATFORM-LEVEL (organization-wide control)
  // ============================================================

  CREATE_ORG:           "CREATE_ORG",
  READ_ORG:             "READ_ORG",
  UPDATE_ORG:           "UPDATE_ORG",
  DELETE_ORG:           "DELETE_ORG",
  TRANSFER_ORG:         "TRANSFER_ORG",

  // ============================================================
  // USER MANAGEMENT
  // ============================================================

  CREATE_USER:          "CREATE_USER",
  READ_USER:            "READ_USER",
  UPDATE_USER:          "UPDATE_USER",
  DELETE_USER:          "DELETE_USER",
  DEACTIVATE_USER:      "DEACTIVATE_USER",
  REACTIVATE_USER:      "REACTIVATE_USER",
  IMPERSONATE_USER:     "IMPERSONATE_USER",
  RESET_USER_PASSWORD:  "RESET_USER_PASSWORD",

  // ============================================================
  // INVITES
  // ============================================================

  CREATE_INVITE:        "CREATE_INVITE",
  READ_INVITE:          "READ_INVITE",
  RESEND_INVITE:        "RESEND_INVITE",
  REVOKE_INVITE:        "REVOKE_INVITE",

  // ============================================================
  // ENTITIES (generic CRM resource — leads, contacts, accounts)
  // ============================================================

  CREATE_ENTITY:        "CREATE_ENTITY",
  READ_ENTITY:          "READ_ENTITY",
  UPDATE_ENTITY:        "UPDATE_ENTITY",
  DELETE_ENTITY:        "DELETE_ENTITY",
  EXPORT_ENTITY:        "EXPORT_ENTITY",
  IMPORT_ENTITY:        "IMPORT_ENTITY",

  // ============================================================
  // DEALS / OPPORTUNITIES
  // ============================================================

  CREATE_DEAL:          "CREATE_DEAL",
  READ_DEAL:            "READ_DEAL",
  UPDATE_DEAL:          "UPDATE_DEAL",
  DELETE_DEAL:          "DELETE_DEAL",
  REASSIGN_DEAL:        "REASSIGN_DEAL",
  EXPORT_DEAL:          "EXPORT_DEAL",

  // ============================================================
  // LEADS (separate from generic entity for finer-grained control)
  // ============================================================

  CREATE_LEAD:          "CREATE_LEAD",
  READ_LEAD:            "READ_LEAD",
  UPDATE_LEAD:          "UPDATE_LEAD",
  DELETE_LEAD:          "DELETE_LEAD",
  REASSIGN_LEAD:        "REASSIGN_LEAD",
  EXPORT_LEAD:          "EXPORT_LEAD",
  IMPORT_LEAD:          "IMPORT_LEAD",

  // ============================================================
  // PIPELINES
  // ============================================================

  CREATE_PIPELINE:      "CREATE_PIPELINE",
  READ_PIPELINE:        "READ_PIPELINE",
  UPDATE_PIPELINE:      "UPDATE_PIPELINE",
  DELETE_PIPELINE:      "DELETE_PIPELINE",

  // ============================================================
  // TEAMS
  // ============================================================

  CREATE_TEAM:          "CREATE_TEAM",
  READ_TEAM:            "READ_TEAM",
  UPDATE_TEAM:          "UPDATE_TEAM",
  DELETE_TEAM:          "DELETE_TEAM",
  ADD_TEAM_MEMBER:      "ADD_TEAM_MEMBER",
  REMOVE_TEAM_MEMBER:   "REMOVE_TEAM_MEMBER",
  TRANSFER_TEAM_MANAGER: "TRANSFER_TEAM_MANAGER",

  // ============================================================
  // RBAC (role and permission management)
  // ============================================================

  READ_RBAC:            "READ_RBAC",
  CREATE_ROLE:          "CREATE_ROLE",
  UPDATE_ROLE:          "UPDATE_ROLE",
  DELETE_ROLE:          "DELETE_ROLE",
  ASSIGN_ROLE:          "ASSIGN_ROLE",
  ASSIGN_PERMISSIONS:   "ASSIGN_PERMISSIONS",

  // ============================================================
  // BILLING
  // ============================================================

  READ_BILLING:         "READ_BILLING",
  MANAGE_BILLING:       "MANAGE_BILLING",
  EXPORT_INVOICES:      "EXPORT_INVOICES",

  // ============================================================
  // AUDIT & COMPLIANCE
  // ============================================================

  READ_AUDIT:           "READ_AUDIT",
  EXPORT_AUDIT:         "EXPORT_AUDIT",

  // ============================================================
  // FORECASTS & INSIGHTS (Revenue OS decision intelligence)
  // ============================================================

  READ_FORECAST:        "READ_FORECAST",
  MANAGE_FORECAST:      "MANAGE_FORECAST",
  READ_INSIGHTS:        "READ_INSIGHTS",
  ACT_ON_INSIGHTS:      "ACT_ON_INSIGHTS",
  READ_DECISIONS:       "READ_DECISIONS",
  EXECUTE_DECISIONS:    "EXECUTE_DECISIONS",

  // ============================================================
  // ALERTS (decision-engine notifications)
  // ============================================================

  READ_ALERTS:          "READ_ALERTS",
  UPDATE_ALERTS:        "UPDATE_ALERTS",
  DELETE_ALERTS:        "DELETE_ALERTS",

  // ============================================================
  // INTEGRATIONS (CRM sync, webhooks)
  // ============================================================

  MANAGE_INTEGRATIONS:  "MANAGE_INTEGRATIONS",
  READ_INTEGRATIONS:    "READ_INTEGRATIONS",
  TRIGGER_SYNC:         "TRIGGER_SYNC",

  // ============================================================
  // SETTINGS
  // ============================================================

  READ_SETTINGS:        "READ_SETTINGS",
  UPDATE_SETTINGS:      "UPDATE_SETTINGS",

  // ============================================================
  // REPORTS & ANALYTICS
  // ============================================================

  READ_REPORTS:         "READ_REPORTS",
  CREATE_REPORT:        "CREATE_REPORT",
  EXPORT_REPORT:        "EXPORT_REPORT",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ============================================================
// PERMISSION GROUPS — for UI grouping and bulk operations
// ============================================================

/**
 * Logical groupings used by:
 *   - Admin UI: render permission groups in custom-role builder
 *   - Audit logs: categorize permission grants
 *   - Bulk assignment: "give MANAGER all DEAL_* permissions"
 */
export const PERMISSION_GROUP = {
  ORG:           "ORG",
  USER:          "USER",
  INVITE:        "INVITE",
  ENTITY:        "ENTITY",
  DEAL:          "DEAL",
  LEAD:          "LEAD",
  PIPELINE:      "PIPELINE",
  TEAM:          "TEAM",
  RBAC:          "RBAC",
  BILLING:       "BILLING",
  AUDIT:         "AUDIT",
  INTELLIGENCE:  "INTELLIGENCE",
  ALERT:         "ALERT",
  INTEGRATION:   "INTEGRATION",
  SETTINGS:      "SETTINGS",
  REPORTS:       "REPORTS",
} as const;

export type PermissionGroup =
  (typeof PERMISSION_GROUP)[keyof typeof PERMISSION_GROUP];

/**
 * Map permission → group. Used by audit UI and custom-role builder.
 */
export const PERMISSION_TO_GROUP: Record<Permission, PermissionGroup> = {
  [PERMISSIONS.CREATE_ORG]:            PERMISSION_GROUP.ORG,
  [PERMISSIONS.READ_ORG]:              PERMISSION_GROUP.ORG,
  [PERMISSIONS.UPDATE_ORG]:            PERMISSION_GROUP.ORG,
  [PERMISSIONS.DELETE_ORG]:            PERMISSION_GROUP.ORG,
  [PERMISSIONS.TRANSFER_ORG]:          PERMISSION_GROUP.ORG,

  [PERMISSIONS.CREATE_USER]:           PERMISSION_GROUP.USER,
  [PERMISSIONS.READ_USER]:             PERMISSION_GROUP.USER,
  [PERMISSIONS.UPDATE_USER]:           PERMISSION_GROUP.USER,
  [PERMISSIONS.DELETE_USER]:           PERMISSION_GROUP.USER,
  [PERMISSIONS.DEACTIVATE_USER]:       PERMISSION_GROUP.USER,
  [PERMISSIONS.REACTIVATE_USER]:       PERMISSION_GROUP.USER,
  [PERMISSIONS.IMPERSONATE_USER]:      PERMISSION_GROUP.USER,
  [PERMISSIONS.RESET_USER_PASSWORD]:   PERMISSION_GROUP.USER,

  [PERMISSIONS.CREATE_INVITE]:         PERMISSION_GROUP.INVITE,
  [PERMISSIONS.READ_INVITE]:           PERMISSION_GROUP.INVITE,
  [PERMISSIONS.RESEND_INVITE]:         PERMISSION_GROUP.INVITE,
  [PERMISSIONS.REVOKE_INVITE]:         PERMISSION_GROUP.INVITE,

  [PERMISSIONS.CREATE_ENTITY]:         PERMISSION_GROUP.ENTITY,
  [PERMISSIONS.READ_ENTITY]:           PERMISSION_GROUP.ENTITY,
  [PERMISSIONS.UPDATE_ENTITY]:         PERMISSION_GROUP.ENTITY,
  [PERMISSIONS.DELETE_ENTITY]:         PERMISSION_GROUP.ENTITY,
  [PERMISSIONS.EXPORT_ENTITY]:         PERMISSION_GROUP.ENTITY,
  [PERMISSIONS.IMPORT_ENTITY]:         PERMISSION_GROUP.ENTITY,

  [PERMISSIONS.CREATE_DEAL]:           PERMISSION_GROUP.DEAL,
  [PERMISSIONS.READ_DEAL]:             PERMISSION_GROUP.DEAL,
  [PERMISSIONS.UPDATE_DEAL]:           PERMISSION_GROUP.DEAL,
  [PERMISSIONS.DELETE_DEAL]:           PERMISSION_GROUP.DEAL,
  [PERMISSIONS.REASSIGN_DEAL]:         PERMISSION_GROUP.DEAL,
  [PERMISSIONS.EXPORT_DEAL]:           PERMISSION_GROUP.DEAL,

  [PERMISSIONS.CREATE_LEAD]:           PERMISSION_GROUP.LEAD,
  [PERMISSIONS.READ_LEAD]:             PERMISSION_GROUP.LEAD,
  [PERMISSIONS.UPDATE_LEAD]:           PERMISSION_GROUP.LEAD,
  [PERMISSIONS.DELETE_LEAD]:           PERMISSION_GROUP.LEAD,
  [PERMISSIONS.REASSIGN_LEAD]:         PERMISSION_GROUP.LEAD,
  [PERMISSIONS.EXPORT_LEAD]:           PERMISSION_GROUP.LEAD,
  [PERMISSIONS.IMPORT_LEAD]:           PERMISSION_GROUP.LEAD,

  [PERMISSIONS.CREATE_PIPELINE]:       PERMISSION_GROUP.PIPELINE,
  [PERMISSIONS.READ_PIPELINE]:         PERMISSION_GROUP.PIPELINE,
  [PERMISSIONS.UPDATE_PIPELINE]:       PERMISSION_GROUP.PIPELINE,
  [PERMISSIONS.DELETE_PIPELINE]:       PERMISSION_GROUP.PIPELINE,

  [PERMISSIONS.CREATE_TEAM]:           PERMISSION_GROUP.TEAM,
  [PERMISSIONS.READ_TEAM]:             PERMISSION_GROUP.TEAM,
  [PERMISSIONS.UPDATE_TEAM]:           PERMISSION_GROUP.TEAM,
  [PERMISSIONS.DELETE_TEAM]:           PERMISSION_GROUP.TEAM,
  [PERMISSIONS.ADD_TEAM_MEMBER]:       PERMISSION_GROUP.TEAM,
  [PERMISSIONS.REMOVE_TEAM_MEMBER]:    PERMISSION_GROUP.TEAM,
  [PERMISSIONS.TRANSFER_TEAM_MANAGER]: PERMISSION_GROUP.TEAM,

  [PERMISSIONS.READ_RBAC]:             PERMISSION_GROUP.RBAC,
  [PERMISSIONS.CREATE_ROLE]:           PERMISSION_GROUP.RBAC,
  [PERMISSIONS.UPDATE_ROLE]:           PERMISSION_GROUP.RBAC,
  [PERMISSIONS.DELETE_ROLE]:           PERMISSION_GROUP.RBAC,
  [PERMISSIONS.ASSIGN_ROLE]:           PERMISSION_GROUP.RBAC,
  [PERMISSIONS.ASSIGN_PERMISSIONS]:    PERMISSION_GROUP.RBAC,

  [PERMISSIONS.READ_BILLING]:          PERMISSION_GROUP.BILLING,
  [PERMISSIONS.MANAGE_BILLING]:        PERMISSION_GROUP.BILLING,
  [PERMISSIONS.EXPORT_INVOICES]:       PERMISSION_GROUP.BILLING,

  [PERMISSIONS.READ_AUDIT]:            PERMISSION_GROUP.AUDIT,
  [PERMISSIONS.EXPORT_AUDIT]:          PERMISSION_GROUP.AUDIT,

  [PERMISSIONS.READ_FORECAST]:         PERMISSION_GROUP.INTELLIGENCE,
  [PERMISSIONS.MANAGE_FORECAST]:       PERMISSION_GROUP.INTELLIGENCE,
  [PERMISSIONS.READ_INSIGHTS]:         PERMISSION_GROUP.INTELLIGENCE,
  [PERMISSIONS.ACT_ON_INSIGHTS]:       PERMISSION_GROUP.INTELLIGENCE,
  [PERMISSIONS.READ_DECISIONS]:        PERMISSION_GROUP.INTELLIGENCE,
  [PERMISSIONS.EXECUTE_DECISIONS]:     PERMISSION_GROUP.INTELLIGENCE,

  [PERMISSIONS.READ_ALERTS]:           PERMISSION_GROUP.ALERT,
  [PERMISSIONS.UPDATE_ALERTS]:         PERMISSION_GROUP.ALERT,
  [PERMISSIONS.DELETE_ALERTS]:         PERMISSION_GROUP.ALERT,

  [PERMISSIONS.MANAGE_INTEGRATIONS]:   PERMISSION_GROUP.INTEGRATION,
  [PERMISSIONS.READ_INTEGRATIONS]:     PERMISSION_GROUP.INTEGRATION,
  [PERMISSIONS.TRIGGER_SYNC]:          PERMISSION_GROUP.INTEGRATION,

  [PERMISSIONS.READ_SETTINGS]:         PERMISSION_GROUP.SETTINGS,
  [PERMISSIONS.UPDATE_SETTINGS]:       PERMISSION_GROUP.SETTINGS,

  [PERMISSIONS.READ_REPORTS]:          PERMISSION_GROUP.REPORTS,
  [PERMISSIONS.CREATE_REPORT]:         PERMISSION_GROUP.REPORTS,
  [PERMISSIONS.EXPORT_REPORT]:         PERMISSION_GROUP.REPORTS,
};

// ============================================================
// SYSTEM ROLES
// ============================================================

/**
 * Built-in role identifiers. Organizations can also create custom roles
 * via the RBAC system — these are just the seed roles.
 *
 * Order reflects authority: SUPER_ADMIN > ORG_ADMIN > MANAGER > AGENT > USER.
 */
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",   // Platform staff (Anthropic-style)
  ORG_ADMIN:   "ORG_ADMIN",     // Customer org owner / admin
  MANAGER:     "MANAGER",       // Team lead / sales manager
  AGENT:       "AGENT",         // Sales rep / operational user
  USER:        "USER",          // Basic / read-mostly user
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/**
 * Role precedence — higher index = more authority.
 * Used by middleware to decide things like "is this user senior to that user?"
 */
export const ROLE_HIERARCHY: readonly Role[] = [
  ROLES.USER,
  ROLES.AGENT,
  ROLES.MANAGER,
  ROLES.ORG_ADMIN,
  ROLES.SUPER_ADMIN,
];

/**
 * Reserved role names that cannot be used for custom organization roles.
 * Same as ROLES values — system roles are reserved.
 */
export const RESERVED_ROLE_NAMES: readonly string[] = Object.values(ROLES);

// ============================================================
// ROLE → PERMISSION DEFAULTS
// ============================================================

/**
 * Default permission grants per system role. Organizations can override
 * via custom roles in the DB; this map is the seed.
 *
 * SUPER_ADMIN gets EVERY permission — never enumerated, always derived
 * from PERMISSIONS object. Bypass logic in middleware additionally
 * grants implicit access regardless of this map.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {

  // ============================================================
  // SUPER_ADMIN — platform owner (every permission)
  // ============================================================
  SUPER_ADMIN: Object.values(PERMISSIONS),

  // ============================================================
  // ORG_ADMIN — customer org owner
  // Full authority within their organization. Excludes platform-only
  // operations (TRANSFER_ORG, IMPERSONATE_USER are SUPER_ADMIN only).
  // ============================================================
  ORG_ADMIN: [
    // Org
    PERMISSIONS.READ_ORG,
    PERMISSIONS.UPDATE_ORG,
    PERMISSIONS.DELETE_ORG,

    // Users
    PERMISSIONS.CREATE_USER,
    PERMISSIONS.READ_USER,
    PERMISSIONS.UPDATE_USER,
    PERMISSIONS.DELETE_USER,
    PERMISSIONS.DEACTIVATE_USER,
    PERMISSIONS.REACTIVATE_USER,
    PERMISSIONS.RESET_USER_PASSWORD,

    // Invites
    PERMISSIONS.CREATE_INVITE,
    PERMISSIONS.READ_INVITE,
    PERMISSIONS.RESEND_INVITE,
    PERMISSIONS.REVOKE_INVITE,

    // Entities
    PERMISSIONS.CREATE_ENTITY,
    PERMISSIONS.READ_ENTITY,
    PERMISSIONS.UPDATE_ENTITY,
    PERMISSIONS.DELETE_ENTITY,
    PERMISSIONS.EXPORT_ENTITY,
    PERMISSIONS.IMPORT_ENTITY,

    // Deals
    PERMISSIONS.CREATE_DEAL,
    PERMISSIONS.READ_DEAL,
    PERMISSIONS.UPDATE_DEAL,
    PERMISSIONS.DELETE_DEAL,
    PERMISSIONS.REASSIGN_DEAL,
    PERMISSIONS.EXPORT_DEAL,

    // Leads
    PERMISSIONS.CREATE_LEAD,
    PERMISSIONS.READ_LEAD,
    PERMISSIONS.UPDATE_LEAD,
    PERMISSIONS.DELETE_LEAD,
    PERMISSIONS.REASSIGN_LEAD,
    PERMISSIONS.EXPORT_LEAD,
    PERMISSIONS.IMPORT_LEAD,

    // Pipelines
    PERMISSIONS.CREATE_PIPELINE,
    PERMISSIONS.READ_PIPELINE,
    PERMISSIONS.UPDATE_PIPELINE,
    PERMISSIONS.DELETE_PIPELINE,

    // Teams
    PERMISSIONS.CREATE_TEAM,
    PERMISSIONS.READ_TEAM,
    PERMISSIONS.UPDATE_TEAM,
    PERMISSIONS.DELETE_TEAM,
    PERMISSIONS.ADD_TEAM_MEMBER,
    PERMISSIONS.REMOVE_TEAM_MEMBER,
    PERMISSIONS.TRANSFER_TEAM_MANAGER,

    // RBAC (limited to within their org)
    PERMISSIONS.READ_RBAC,
    PERMISSIONS.CREATE_ROLE,
    PERMISSIONS.UPDATE_ROLE,
    PERMISSIONS.DELETE_ROLE,
    PERMISSIONS.ASSIGN_ROLE,
    PERMISSIONS.ASSIGN_PERMISSIONS,

    // Billing
    PERMISSIONS.READ_BILLING,
    PERMISSIONS.MANAGE_BILLING,
    PERMISSIONS.EXPORT_INVOICES,

    // Audit
    PERMISSIONS.READ_AUDIT,
    PERMISSIONS.EXPORT_AUDIT,

    // Intelligence
    PERMISSIONS.READ_FORECAST,
    PERMISSIONS.MANAGE_FORECAST,
    PERMISSIONS.READ_INSIGHTS,
    PERMISSIONS.ACT_ON_INSIGHTS,
    PERMISSIONS.READ_DECISIONS,
    PERMISSIONS.EXECUTE_DECISIONS,

    // Alerts
    PERMISSIONS.READ_ALERTS,
    PERMISSIONS.UPDATE_ALERTS,
    PERMISSIONS.DELETE_ALERTS,

    // Integrations
    PERMISSIONS.MANAGE_INTEGRATIONS,
    PERMISSIONS.READ_INTEGRATIONS,
    PERMISSIONS.TRIGGER_SYNC,

    // Settings
    PERMISSIONS.READ_SETTINGS,
    PERMISSIONS.UPDATE_SETTINGS,

    // Reports
    PERMISSIONS.READ_REPORTS,
    PERMISSIONS.CREATE_REPORT,
    PERMISSIONS.EXPORT_REPORT,
  ],

  // ============================================================
  // MANAGER — team lead / sales manager
  // Read everything in their org; manage their team's work.
  // No billing/audit/RBAC management — that's ORG_ADMIN only.
  // ============================================================
  MANAGER: [
    PERMISSIONS.READ_ORG,

    PERMISSIONS.READ_USER,

    PERMISSIONS.CREATE_INVITE,
    PERMISSIONS.READ_INVITE,
    PERMISSIONS.RESEND_INVITE,
    PERMISSIONS.REVOKE_INVITE,

    PERMISSIONS.CREATE_ENTITY,
    PERMISSIONS.READ_ENTITY,
    PERMISSIONS.UPDATE_ENTITY,
    PERMISSIONS.EXPORT_ENTITY,

    PERMISSIONS.CREATE_DEAL,
    PERMISSIONS.READ_DEAL,
    PERMISSIONS.UPDATE_DEAL,
    PERMISSIONS.REASSIGN_DEAL,
    PERMISSIONS.EXPORT_DEAL,

    PERMISSIONS.CREATE_LEAD,
    PERMISSIONS.READ_LEAD,
    PERMISSIONS.UPDATE_LEAD,
    PERMISSIONS.REASSIGN_LEAD,
    PERMISSIONS.EXPORT_LEAD,
    PERMISSIONS.IMPORT_LEAD,

    PERMISSIONS.READ_PIPELINE,
    PERMISSIONS.UPDATE_PIPELINE,

    PERMISSIONS.CREATE_TEAM,
    PERMISSIONS.READ_TEAM,
    PERMISSIONS.UPDATE_TEAM,
    PERMISSIONS.ADD_TEAM_MEMBER,
    PERMISSIONS.REMOVE_TEAM_MEMBER,

    PERMISSIONS.READ_FORECAST,
    PERMISSIONS.READ_INSIGHTS,
    PERMISSIONS.ACT_ON_INSIGHTS,
    PERMISSIONS.READ_DECISIONS,

    PERMISSIONS.READ_ALERTS,
    PERMISSIONS.UPDATE_ALERTS,

    PERMISSIONS.READ_REPORTS,
    PERMISSIONS.CREATE_REPORT,
    PERMISSIONS.EXPORT_REPORT,

    PERMISSIONS.READ_INTEGRATIONS,
  ],

  // ============================================================
  // AGENT — sales rep / individual contributor
  // Owns their deals and leads; reads team context.
  // ============================================================
  AGENT: [
    PERMISSIONS.READ_ORG,

    PERMISSIONS.READ_USER,

    PERMISSIONS.CREATE_ENTITY,
    PERMISSIONS.READ_ENTITY,
    PERMISSIONS.UPDATE_ENTITY,

    PERMISSIONS.CREATE_DEAL,
    PERMISSIONS.READ_DEAL,
    PERMISSIONS.UPDATE_DEAL,

    PERMISSIONS.CREATE_LEAD,
    PERMISSIONS.READ_LEAD,
    PERMISSIONS.UPDATE_LEAD,

    PERMISSIONS.READ_PIPELINE,

    PERMISSIONS.READ_TEAM,

    PERMISSIONS.READ_INVITE,

    PERMISSIONS.READ_INSIGHTS,
    PERMISSIONS.READ_DECISIONS,

    PERMISSIONS.READ_ALERTS,

    PERMISSIONS.READ_REPORTS,
  ],

  // ============================================================
  // USER — read-mostly basic user
  // Minimal access; primarily for stakeholders, observers, BI users.
  // ============================================================
  USER: [
    PERMISSIONS.READ_ORG,
    PERMISSIONS.READ_ENTITY,
    PERMISSIONS.READ_DEAL,
    PERMISSIONS.READ_LEAD,
    PERMISSIONS.READ_PIPELINE,
    PERMISSIONS.READ_TEAM,
    PERMISSIONS.READ_FORECAST,
    PERMISSIONS.READ_INSIGHTS,
    PERMISSIONS.READ_DECISIONS,
    PERMISSIONS.READ_ALERTS,
    PERMISSIONS.READ_REPORTS,
  ],
};

// ============================================================
// VALIDATION & HELPER FUNCTIONS
// ============================================================

/**
 * Type guard: is the given value a valid permission?
 */
export function isValidPermission(value: unknown): value is Permission {
  if (typeof value !== "string") return false;
  return (Object.values(PERMISSIONS) as string[]).includes(value);
}

/**
 * Type guard: is the given value a valid role?
 */
export function isValidRole(value: unknown): value is Role {
  if (typeof value !== "string") return false;
  return (Object.values(ROLES) as string[]).includes(value);
}

/**
 * Type guard: is the given value a valid permission group?
 */
export function isValidPermissionGroup(value: unknown): value is PermissionGroup {
  if (typeof value !== "string") return false;
  return (Object.values(PERMISSION_GROUP) as string[]).includes(value);
}

/**
 * Normalize an external string to a Permission, or return null.
 * Strips whitespace, uppercases, and validates against the catalogue.
 */
export function normalizePermission(value: unknown): Permission | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toUpperCase();
  if (!isValidPermission(cleaned)) return null;
  return cleaned;
}

/**
 * Normalize a role name. Falls back to USER for unknown values
 * (least-privilege default).
 */
export function normalizeRole(value: unknown): Role {
  if (typeof value !== "string") return ROLES.USER;
  const cleaned = value.trim().toUpperCase();
  if (!isValidRole(cleaned)) return ROLES.USER;
  return cleaned;
}

/**
 * Get the default permission list for a role. Returns an empty array
 * for unknown roles (fail-closed).
 */
export function getPermissionsForRole(role: Role | string): readonly Permission[] {
  const normalized = normalizeRole(role);
  return ROLE_PERMISSIONS[normalized] ?? [];
}

/**
 * Check whether a role has a specific permission by default.
 * Does NOT consult custom org-level role overrides — that's the
 * rbac.service's job at runtime.
 */
export function roleHasPermission(role: Role | string, permission: Permission): boolean {
  const permissions = getPermissionsForRole(role);
  return permissions.includes(permission);
}

/**
 * Get all permissions belonging to a logical group. Useful for the
 * custom-role UI builder: "select all DEAL_* permissions".
 */
export function getPermissionsInGroup(group: PermissionGroup): Permission[] {
  return Object.entries(PERMISSION_TO_GROUP)
    .filter(([, g]) => g === group)
    .map(([p]) => p as Permission);
}

/**
 * Compare role authority. Returns:
 *   positive  if a is more senior than b
 *   negative  if a is junior
 *   zero      if same authority
 */
export function compareRoleAuthority(a: Role, b: Role): number {
  const idxA = ROLE_HIERARCHY.indexOf(a);
  const idxB = ROLE_HIERARCHY.indexOf(b);
  return idxA - idxB;
}

/**
 * Check if role actor is senior to role target. Used by user-management
 * controllers to enforce "you can't modify users senior to yourself".
 */
export function isSeniorRole(actor: Role, target: Role): boolean {
  return compareRoleAuthority(actor, target) > 0;
}

/**
 * Check if a role name is reserved (i.e. a built-in system role that
 * cannot be reused for a custom organization role).
 */
export function isReservedRoleName(name: string): boolean {
  return RESERVED_ROLE_NAMES.includes(name.trim().toUpperCase());
}

// ============================================================
// CONVENIENCE EXPORTS
// ============================================================

export const ALL_PERMISSIONS:        readonly Permission[]     = Object.values(PERMISSIONS);
export const ALL_ROLES:              readonly Role[]           = Object.values(ROLES);
export const ALL_PERMISSION_GROUPS:  readonly PermissionGroup[] = Object.values(PERMISSION_GROUP);

export default PERMISSIONS;















