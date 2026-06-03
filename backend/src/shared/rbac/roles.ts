// roles.ts

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ORG_ADMIN:   "ORG_ADMIN",
  MANAGER:     "MANAGER",
  AGENT:       "AGENT",
  USER:        "USER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: readonly Role[] = [
  ROLES.USER,
  ROLES.AGENT,
  ROLES.MANAGER,
  ROLES.ORG_ADMIN,
  ROLES.SUPER_ADMIN,
];

export const RESERVED_ROLE_NAMES: readonly string[] = Object.values(ROLES);

export const ALL_ROLES: readonly Role[] = Object.values(ROLES);

export function isValidRole(value: unknown): value is Role {
  if (typeof value !== "string") return false;
  return (ALL_ROLES as readonly string[]).includes(value);
}

export function normalizeRole(value: unknown): Role {
  if (typeof value !== "string") return ROLES.USER;
  const cleaned = value.trim().toUpperCase();
  return isValidRole(cleaned) ? cleaned : ROLES.USER;
}

export function compareRoleAuthority(a: Role, b: Role): number {
  return ROLE_HIERARCHY.indexOf(a) - ROLE_HIERARCHY.indexOf(b);
}

export function isSeniorRole(actor: Role, target: Role): boolean {
  return compareRoleAuthority(actor, target) > 0;
}

export function isReservedRoleName(name: string): boolean {
  return RESERVED_ROLE_NAMES.includes(name.trim().toUpperCase());
}

export default ROLES;


