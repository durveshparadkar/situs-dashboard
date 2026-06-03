// roles.ts
export const ROLES = {
    SUPER_ADMIN: "SUPER_ADMIN",
    ORG_ADMIN: "ORG_ADMIN",
    MANAGER: "MANAGER",
    AGENT: "AGENT",
    USER: "USER",
};
export const ROLE_HIERARCHY = [
    ROLES.USER,
    ROLES.AGENT,
    ROLES.MANAGER,
    ROLES.ORG_ADMIN,
    ROLES.SUPER_ADMIN,
];
export const RESERVED_ROLE_NAMES = Object.values(ROLES);
export const ALL_ROLES = Object.values(ROLES);
export function isValidRole(value) {
    if (typeof value !== "string")
        return false;
    return ALL_ROLES.includes(value);
}
export function normalizeRole(value) {
    if (typeof value !== "string")
        return ROLES.USER;
    const cleaned = value.trim().toUpperCase();
    return isValidRole(cleaned) ? cleaned : ROLES.USER;
}
export function compareRoleAuthority(a, b) {
    return ROLE_HIERARCHY.indexOf(a) - ROLE_HIERARCHY.indexOf(b);
}
export function isSeniorRole(actor, target) {
    return compareRoleAuthority(actor, target) > 0;
}
export function isReservedRoleName(name) {
    return RESERVED_ROLE_NAMES.includes(name.trim().toUpperCase());
}
export default ROLES;
//# sourceMappingURL=roles.js.map