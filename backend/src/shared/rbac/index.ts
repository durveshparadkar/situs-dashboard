// index.ts (barrel re-export for the rbac module)

// Runtime value
export { ROLE_PERMISSIONS } from "./permissions.js";

// Types — must use export type for type-only re-exports
export type { Role, Permission } from "./permissions.js";

