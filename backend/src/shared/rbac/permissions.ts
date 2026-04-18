// src/shared/rbac/permissions.ts

/* =====================================================
   PERMISSIONS
===================================================== */

export const PERMISSIONS = {
  /* ================= PLATFORM LEVEL ================= */

  CREATE_ORG: "CREATE_ORG",
  READ_ORG: "READ_ORG",
  DELETE_ORG: "DELETE_ORG",

  /* ================= USER MANAGEMENT ================= */

  CREATE_USER: "CREATE_USER",
  READ_USER: "READ_USER",
  UPDATE_USER: "UPDATE_USER",
  DELETE_USER: "DELETE_USER",

  /* ================= INVITES ================= */

  CREATE_INVITE: "CREATE_INVITE",
  READ_INVITE: "READ_INVITE",
  REVOKE_INVITE: "REVOKE_INVITE",

  /* ================= ENTITIES ================= */

  CREATE_ENTITY: "CREATE_ENTITY",
  READ_ENTITY: "READ_ENTITY",
  UPDATE_ENTITY: "UPDATE_ENTITY",
  DELETE_ENTITY: "DELETE_ENTITY",

  /* ================= TEAMS ================= */

  CREATE_TEAM: "CREATE_TEAM",
  READ_TEAM: "READ_TEAM",
  UPDATE_TEAM: "UPDATE_TEAM",
  DELETE_TEAM: "DELETE_TEAM",
  ADD_TEAM_MEMBER: "ADD_TEAM_MEMBER",
  REMOVE_TEAM_MEMBER: "REMOVE_TEAM_MEMBER",

  /* ================= BILLING ================= */

  READ_BILLING: "READ_BILLING",
  MANAGE_BILLING: "MANAGE_BILLING",
} as const;

export type Permission =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS];


/* =====================================================
   ROLES
===================================================== */

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",   // Platform Owner
  ORG_ADMIN: "ORG_ADMIN",       // Organization Owner
  MANAGER: "MANAGER",           // Mid-level
  AGENT: "AGENT",               // Sales / Operational
  USER: "USER",                 // Basic user
} as const;

export type Role =
  (typeof ROLES)[keyof typeof ROLES];


/* =====================================================
   ROLE → PERMISSIONS MAP
===================================================== */

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {

  /* ================= PLATFORM OWNER ================= */

  SUPER_ADMIN: Object.values(PERMISSIONS),

  /* ================= ORG OWNER ================= */

  ORG_ADMIN: [
    PERMISSIONS.CREATE_ORG,     // ✅ Added for flexibility
    PERMISSIONS.READ_ORG,

    PERMISSIONS.CREATE_USER,
    PERMISSIONS.READ_USER,
    PERMISSIONS.UPDATE_USER,
    PERMISSIONS.DELETE_USER,

    PERMISSIONS.CREATE_INVITE,
    PERMISSIONS.READ_INVITE,
    PERMISSIONS.REVOKE_INVITE,

    PERMISSIONS.CREATE_ENTITY,
    PERMISSIONS.READ_ENTITY,
    PERMISSIONS.UPDATE_ENTITY,
    PERMISSIONS.DELETE_ENTITY,

    PERMISSIONS.CREATE_TEAM,
    PERMISSIONS.READ_TEAM,
    PERMISSIONS.UPDATE_TEAM,
    PERMISSIONS.DELETE_TEAM,
    PERMISSIONS.ADD_TEAM_MEMBER,
    PERMISSIONS.REMOVE_TEAM_MEMBER,

    PERMISSIONS.READ_BILLING,
    PERMISSIONS.MANAGE_BILLING,
  ],

  /* ================= MANAGER ================= */

  MANAGER: [
    PERMISSIONS.READ_ORG,

    PERMISSIONS.CREATE_ENTITY,
    PERMISSIONS.READ_ENTITY,
    PERMISSIONS.UPDATE_ENTITY,

    PERMISSIONS.CREATE_TEAM,
    PERMISSIONS.READ_TEAM,
    PERMISSIONS.ADD_TEAM_MEMBER,

    PERMISSIONS.CREATE_INVITE,
    PERMISSIONS.READ_INVITE,
  ],

  /* ================= AGENT ================= */

  AGENT: [
    PERMISSIONS.READ_ORG,
    PERMISSIONS.READ_ENTITY,
    PERMISSIONS.READ_TEAM,
    PERMISSIONS.READ_INVITE,
  ],

  /* ================= BASIC USER ================= */

  USER: [
    PERMISSIONS.READ_ENTITY,
  ],
};
















