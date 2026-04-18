export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ORG_ADMIN: "ORG_ADMIN",
  AGENT: "AGENT",
  USER: "USER",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];


