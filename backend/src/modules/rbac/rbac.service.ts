// rbac.service.ts
import mongoose, { Types } from "mongoose";
import Role from "./role.model.js";
import Permission from "./permission.model.js";
import { dbLogger } from "../../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const RBAC_SERVICE_CONFIG = {
  cache: {
    ttlMs:           60_000,
    maxEntries:      10_000,
    sweepIntervalMs: 30_000,
  },
  inheritance: {
    maxDepth: 100,
  },
} as const;

// ============================================================
// CACHE TYPES
// ============================================================

interface CacheEntry {
  permissions: Set<string>;
  expiresAt:   number;
}

// ============================================================
// IN-MEMORY TTL CACHE
// Replace with Redis for multi-instance deployments.
// ============================================================

const permissionCache = new Map<string, CacheEntry>();

let sweepHandle: ReturnType<typeof setInterval> | null = null;

function startCacheSweeper(): void {
  if (sweepHandle) return;
  sweepHandle = setInterval(() => {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of permissionCache.entries()) {
      if (entry.expiresAt <= now) {
        permissionCache.delete(key);
        evicted++;
      }
    }
    if (evicted > 0) {
      dbLogger.debug(
        "RBAC cache swept: evicted=" + evicted + " remaining=" + permissionCache.size
      );
    }
  }, RBAC_SERVICE_CONFIG.cache.sweepIntervalMs);

  if (typeof sweepHandle.unref === "function") {
    sweepHandle.unref();
  }
}

startCacheSweeper();

// ============================================================
// HELPERS
// ============================================================

function buildCacheKey(userId: string, orgId: string): string {
  return userId + ":" + orgId;
}

function toObjectId(value: string | Types.ObjectId): Types.ObjectId | null {
  if (value instanceof Types.ObjectId) return value;
  if (typeof value === "string" && Types.ObjectId.isValid(value)) {
    return new Types.ObjectId(value);
  }
  return null;
}

function toIdString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (value instanceof Types.ObjectId) return value.toString();
  if (typeof value === "object" && value !== null) {
    const obj = value as { _id?: unknown; toString?: () => string };
    if (obj._id !== undefined) return toIdString(obj._id);
    if (typeof obj.toString === "function") return obj.toString();
  }
  return String(value);
}

function evictIfFull(): void {
  const maxEntries = RBAC_SERVICE_CONFIG.cache.maxEntries;
  if (permissionCache.size < maxEntries) return;

  const target = Math.ceil(maxEntries * 0.1);
  let removed = 0;
  for (const key of permissionCache.keys()) {
    permissionCache.delete(key);
    if (++removed >= target) break;
  }

  dbLogger.warn(
    "RBAC cache full: evicted oldest " + removed +
    " entries (size now " + permissionCache.size + ")"
  );
}

// ============================================================
// USER MODEL - lazy resolution to avoid circular imports
// ============================================================

interface UserDoc {
  _id:            Types.ObjectId | string;
  roleId?:        Types.ObjectId | string | null;
  roleIds?:       Array<Types.ObjectId | string>;
  organizationId?: Types.ObjectId | string;
}

interface UserModelShape {
  findById: (id: string | Types.ObjectId) => {
    select: (fields: string) => {
      lean: () => Promise<UserDoc | null>;
    };
  };
}

let cachedUserModel: UserModelShape | null = null;

async function getUserModel(): Promise<UserModelShape | null> {
  if (cachedUserModel) return cachedUserModel;

  try {
    const mod = (await import("../users/user.model.js")) as { default?: unknown };
    const m = (mod.default ?? mod) as UserModelShape;
    if (m && typeof m.findById === "function") {
      cachedUserModel = m;
      return m;
    }
  } catch (err) {
    dbLogger.warn(
      "RBAC service: User model not loadable. err=" +
      ((err as Error)?.message ?? "unknown")
    );
  }

  return null;
}

// ============================================================
// RBAC SERVICE
// ============================================================

class RBACService {

  // -----------------------------------------------------------
  // GET PERMISSIONS FOR USER
  // Returns permission NAMES (not IDs), uppercased.
  // -----------------------------------------------------------
  async getUserPermissions(
    userId: string,
    organizationId: string
  ): Promise<Set<string>> {
    if (!userId || !organizationId) {
      return new Set<string>();
    }

    const cacheKey = buildCacheKey(userId, organizationId);

    const cached = permissionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    const orgObjectId = toObjectId(organizationId);
    if (!orgObjectId) {
      dbLogger.warn("RBAC: invalid organizationId=" + organizationId);
      return new Set<string>();
    }

    // 1. Resolve which roles this user has
    const rootRoleIds = await this.resolveUserRoleIds(userId, orgObjectId);

    if (rootRoleIds.length === 0) {
      const empty = new Set<string>();
      this.writeCache(cacheKey, empty);
      return empty;
    }

    // 2. BFS through inheritance with cycle protection
    const visited = new Set<string>();
    const permissionIds = new Set<string>();
    const queue: string[] = rootRoleIds.slice();

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || visited.has(currentId)) continue;
      visited.add(currentId);

      if (visited.size > RBAC_SERVICE_CONFIG.inheritance.maxDepth) {
        dbLogger.warn(
          "RBAC inheritance walk capped at " +
          RBAC_SERVICE_CONFIG.inheritance.maxDepth +
          " for user=" + userId + " org=" + organizationId
        );
        break;
      }

      const role = await Role.findOne({
        _id: currentId,
        $or: [
          { organizationId: null },
          { organizationId: orgObjectId },
        ],
      })
        .select("permissions inherits")
        .lean();

      if (!role) continue;

      const typed = role as {
        permissions?: unknown[];
        inherits?:    unknown[];
      };

      for (const p of typed.permissions ?? []) {
        const pid = toIdString(p);
        if (pid) permissionIds.add(pid);
      }

      for (const r of typed.inherits ?? []) {
        const rid = toIdString(r);
        if (rid && !visited.has(rid)) {
          queue.push(rid);
        }
      }
    }

    // 3. Hydrate permission IDs to NAMES
    const permissionSet = new Set<string>();

    if (permissionIds.size > 0) {
      const permissions = await Permission.find({
        _id: { $in: Array.from(permissionIds) },
      })
        .select("name")
        .lean();

      for (const p of permissions) {
        const typed = p as { name?: unknown };
        const name = typeof typed.name === "string"
          ? typed.name.trim().toUpperCase()
          : "";
        if (name) permissionSet.add(name);
      }
    }

    // 4. Cache it
    this.writeCache(cacheKey, permissionSet);

    dbLogger.debug(
      "RBAC permissions computed: user=" + userId +
      " org=" + organizationId +
      " roles=" + visited.size +
      " permissions=" + permissionSet.size
    );

    return permissionSet;
  }

  // -----------------------------------------------------------
  // RESOLVE USER ROLE IDS
  // Priority: user.roleId -> user.roleIds -> fallback
  // -----------------------------------------------------------
  private async resolveUserRoleIds(
    userId: string,
    orgObjectId: Types.ObjectId
  ): Promise<string[]> {
    if (!Types.ObjectId.isValid(userId)) {
      dbLogger.warn("RBAC: invalid userId=" + userId);
      return [];
    }

    const UserModel = await getUserModel();

    if (UserModel) {
      try {
        const userDoc = await UserModel
          .findById(userId)
          .select("roleId roleIds organizationId")
          .lean();

        if (!userDoc) {
          dbLogger.warn("RBAC: user not found userId=" + userId);
          return [];
        }

        const roleIds: string[] = [];

        if (userDoc.roleId) {
          roleIds.push(toIdString(userDoc.roleId));
        }

        if (Array.isArray(userDoc.roleIds)) {
          for (const r of userDoc.roleIds) {
            const rid = toIdString(r);
            if (rid && !roleIds.includes(rid)) roleIds.push(rid);
          }
        }

        return roleIds.filter((id) => id.length > 0);
      } catch (err) {
        dbLogger.warn(
          "RBAC: user lookup failed userId=" + userId +
          " err=" + ((err as Error)?.message ?? "unknown")
        );
      }
    }

    // FALLBACK - walk all roles in scope (last resort)
    const allRoles = await Role.find({
      $or: [
        { organizationId: null },
        { organizationId: orgObjectId },
      ],
    })
      .select("_id")
      .lean();

    return allRoles.map((r) => toIdString((r as { _id: unknown })._id));
  }

  // -----------------------------------------------------------
  // CHECK A SINGLE PERMISSION
  // -----------------------------------------------------------
  async hasPermission(
    userId: string,
    organizationId: string,
    permission: string
  ): Promise<boolean> {
    if (!permission) return false;
    const normalized = permission.trim().toUpperCase();
    const permissions = await this.getUserPermissions(userId, organizationId);
    return permissions.has(normalized);
  }

  // -----------------------------------------------------------
  // CHECK ANY OF MULTIPLE PERMISSIONS
  // -----------------------------------------------------------
  async hasAnyPermission(
    userId: string,
    organizationId: string,
    permissions: string[]
  ): Promise<boolean> {
    if (!Array.isArray(permissions) || permissions.length === 0) return false;
    const user = await this.getUserPermissions(userId, organizationId);
    return permissions.some((p) => user.has(p.trim().toUpperCase()));
  }

  // -----------------------------------------------------------
  // CHECK ALL OF MULTIPLE PERMISSIONS
  // -----------------------------------------------------------
  async hasAllPermissions(
    userId: string,
    organizationId: string,
    permissions: string[]
  ): Promise<boolean> {
    if (!Array.isArray(permissions) || permissions.length === 0) return false;
    const user = await this.getUserPermissions(userId, organizationId);
    return permissions.every((p) => user.has(p.trim().toUpperCase()));
  }

  // -----------------------------------------------------------
  // CACHE WRITE
  // -----------------------------------------------------------
  private writeCache(key: string, permissions: Set<string>): void {
    evictIfFull();
    permissionCache.set(key, {
      permissions,
      expiresAt: Date.now() + RBAC_SERVICE_CONFIG.cache.ttlMs,
    });
  }

  // -----------------------------------------------------------
  // CACHE INVALIDATION
  // -----------------------------------------------------------

  clearUserCache(userId: string, organizationId: string): void {
    const key = buildCacheKey(userId, organizationId);
    if (permissionCache.delete(key)) {
      dbLogger.debug(
        "RBAC cache cleared: user=" + userId + " org=" + organizationId
      );
    }
  }

  clearOrgCache(organizationId: string): void {
    const suffix = ":" + organizationId;
    let removed = 0;
    for (const key of permissionCache.keys()) {
      if (key.endsWith(suffix)) {
        permissionCache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      dbLogger.info(
        "RBAC cache cleared for org=" + organizationId +
        " entries=" + removed
      );
    }
  }

  async clearRoleCache(roleId: string, organizationId: string): Promise<number> {
    const UserModel = await getUserModel();
    if (!UserModel || !Types.ObjectId.isValid(roleId)) {
      this.clearOrgCache(organizationId);
      return 0;
    }

    try {
      const UserModelAny = UserModel as unknown as {
        find: (filter: Record<string, unknown>) => {
          select: (fields: string) => {
            lean: () => Promise<Array<{ _id: unknown }>>;
          };
        };
      };

      const users = await UserModelAny
        .find({
          organizationId,
          $or: [{ roleId }, { roleIds: roleId }],
        })
        .select("_id")
        .lean();

      let cleared = 0;
      for (const u of users) {
        this.clearUserCache(toIdString(u._id), organizationId);
        cleared++;
      }

      dbLogger.info(
        "RBAC cache cleared by role: role=" + roleId +
        " org=" + organizationId + " users=" + cleared
      );
      return cleared;
    } catch (err) {
      dbLogger.warn(
        "RBAC role-based cache clear failed: role=" + roleId +
        " err=" + ((err as Error)?.message ?? "unknown")
      );
      this.clearOrgCache(organizationId);
      return 0;
    }
  }

  clearAllCache(): void {
    const size = permissionCache.size;
    permissionCache.clear();
    if (size > 0) {
      dbLogger.warn("RBAC cache fully cleared: " + size + " entries");
    }
  }

  getCacheStats(): { size: number; maxEntries: number; ttlMs: number } {
    return {
      size:       permissionCache.size,
      maxEntries: RBAC_SERVICE_CONFIG.cache.maxEntries,
      ttlMs:      RBAC_SERVICE_CONFIG.cache.ttlMs,
    };
  }
}

void mongoose;

export default new RBACService();