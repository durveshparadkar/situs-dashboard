// cache.middleware.ts
import type {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";

import { redis } from "../../config/redis.js";
import { dbLogger } from "../../utils/logger.js";

// ============================================================
// CONFIG
// ============================================================

const CACHE_CONFIG = {
  /**
   * Default TTL in seconds when not specified by the caller.
   */
  defaultTtlSeconds: 60,

  /**
   * Max TTL in seconds. Bounds caller-specified values to defend
   * against accidentally huge caches.
   */
  maxTtlSeconds: 24 * 60 * 60,  // 24 hours

  /**
   * Max cache key length. Defends against pathologically long keys
   * that bloat Redis memory and slow lookups.
   */
  maxKeyLength: 250,

  /**
   * Max response body size to cache, in bytes. Bigger responses are
   * served fresh but not cached (caching mega-payloads in Redis
   * defeats the purpose).
   */
  maxBodyBytes: 100_000,  // 100KB

  /**
   * Cache key namespace prefix. Lets you flush all middleware caches
   * with a single SCAN+DEL pattern without affecting other Redis usage.
   */
  keyPrefix: "cache:mw:",

  /**
   * Whether to add X-Cache headers to responses for observability.
   * In production, useful for diagnosing cache hit/miss patterns.
   */
  emitCacheHeaders: true,

  /**
   * Timeout for Redis GET operations. If Redis is slow, we don't
   * want to make API requests slower — fail open and serve fresh.
   */
  redisTimeoutMs: 100,

  /**
   * Status codes that are safe to cache. 2xx responses only; never
   * cache errors (would mask transient failures).
   */
  cacheableStatusCodes: [200, 203] as const,

  /**
   * HTTP methods that are safe to cache. Only idempotent reads.
   * POST/PATCH/DELETE responses are never cached even if cache
   * middleware is applied (would be a serious bug).
   */
  cacheableMethods: ["GET", "HEAD"] as const,
} as const;

// ============================================================
// TYPES
// ============================================================

export type CacheKeyBuilder = (req: Request) => string;

export interface CacheOptions {
  /**
   * TTL in seconds. Capped at maxTtlSeconds.
   * Default: 60s
   */
  ttl?: number;

  /**
   * Whether to vary the cache key by authenticated user.
   * Default: true (prevents user A from seeing user B's cached data).
   *
   * Set false ONLY for endpoints returning identical data across
   * all users (e.g. public reference data, system status).
   */
  varyByUser?: boolean;

  /**
   * Whether to vary the cache key by organization (tenant).
   * Default: true — critical for multi-tenant isolation.
   *
   * Set false ONLY for endpoints that legitimately return cross-tenant
   * data (extremely rare — usually a security bug).
   */
  varyByOrg?: boolean;

  /**
   * Optional predicate to skip caching for specific requests.
   * Return true to bypass cache entirely.
   *
   * Example: skip caching for users with feature flag X enabled.
   */
  skipIf?: (req: Request) => boolean;

  /**
   * Optional predicate to validate response before caching.
   * Return true to cache the response, false to skip caching.
   *
   * Example: don't cache responses with empty data arrays.
   */
  shouldCache?: (body: unknown, statusCode: number) => boolean;
}

interface CacheableResponse {
  statusCode: number;
  body:       unknown;
  cachedAt:   number;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Build the full Redis key with tenant + user scoping and namespace prefix.
 */
function buildCacheKey(
  req:           Request,
  baseKey:       string,
  varyByUser:    boolean,
  varyByOrg:     boolean
): string {
  const parts: string[] = [CACHE_CONFIG.keyPrefix, baseKey];

  if (varyByOrg) {
    const orgId = req.user?.organizationId
      ? String(req.user.organizationId)
      : "anon";
    parts.push("org:" + orgId);
  }

  if (varyByUser) {
    const userId =
      (req.user && typeof req.user.id === "string" && req.user.id) ||
      (req.user?._id ? String(req.user._id) : "anon");
    parts.push("user:" + userId);
  }

  const key = parts.join(":");

  if (key.length > CACHE_CONFIG.maxKeyLength) {
    // Hash long keys to keep Redis happy
    // Simple FNV-1a hash — fast, no crypto needed for cache keys
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return CACHE_CONFIG.keyPrefix + "h:" + hash.toString(36) + ":" +
      key.slice(0, 50);
  }

  return key;
}

/**
 * Get the request ID set by the request logger middleware.
 */
function getRequestId(req: Request): string {
  const reqWithId = req as Request & { requestId?: string };
  return reqWithId.requestId ?? "";
}

/**
 * Wrap a Redis operation with a timeout. If Redis hangs, fall through
 * to serving fresh data instead of blocking the request indefinitely.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

/**
 * Serialize the body for storage. Returns null if too large or unserializable.
 */
function serializeForCache(
  body:       unknown,
  statusCode: number
): { serialized: string; bytes: number } | null {
  try {
    const payload: CacheableResponse = {
      statusCode,
      body,
      cachedAt: Date.now(),
    };
    const serialized = JSON.stringify(payload);

    if (serialized.length > CACHE_CONFIG.maxBodyBytes) {
      return null;
    }

    return { serialized, bytes: serialized.length };
  } catch {
    return null;
  }
}

/**
 * Deserialize cached payload. Returns null on malformed data.
 */
function deserializeFromCache(raw: string): CacheableResponse | null {
  try {
    const parsed = JSON.parse(raw) as CacheableResponse;
    if (
      typeof parsed.statusCode === "number" &&
      typeof parsed.cachedAt === "number" &&
      "body" in parsed
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ============================================================
// MAIN MIDDLEWARE FACTORY
// ============================================================

/**
 * Build a caching middleware for read endpoints.
 *
 * Usage:
 *   router.get("/teams",
 *     cache((req) => "teams:list"),  // 60s, scoped to user+org
 *     listTeams
 *   );
 *
 *   router.get("/dashboard",
 *     cache((req) => "dashboard:" + req.query.range, { ttl: 300 }),
 *     getDashboard
 *   );
 *
 *   router.get("/public/plans",
 *     cache((req) => "public:plans", { varyByUser: false, varyByOrg: false }),
 *     listPlans
 *   );
 */
export function cache(
  keyBuilder: CacheKeyBuilder,
  options:    CacheOptions = {}
): RequestHandler {
  const ttl = Math.min(
    Math.max(options.ttl ?? CACHE_CONFIG.defaultTtlSeconds, 1),
    CACHE_CONFIG.maxTtlSeconds
  );
  const varyByUser = options.varyByUser ?? true;
  const varyByOrg  = options.varyByOrg  ?? true;
  const skipIf      = options.skipIf;
  const shouldCache = options.shouldCache;

  return async (req: Request, res: Response, next: NextFunction) => {
    // -------------------------------------------------------
    // METHOD CHECK
    // Only cache idempotent reads. Apply to other methods = bug.
    // -------------------------------------------------------
    if (!(CACHE_CONFIG.cacheableMethods as readonly string[]).includes(req.method)) {
      if (CACHE_CONFIG.emitCacheHeaders) {
        res.setHeader("X-Cache", "BYPASS-METHOD");
      }
      next();
      return;
    }

    // -------------------------------------------------------
    // SKIP PREDICATE
    // -------------------------------------------------------
    if (skipIf) {
      try {
        if (skipIf(req)) {
          if (CACHE_CONFIG.emitCacheHeaders) {
            res.setHeader("X-Cache", "BYPASS-PREDICATE");
          }
          next();
          return;
        }
      } catch (err) {
        dbLogger.warn(
          "Cache skipIf predicate threw: " +
          ((err as Error)?.message ?? "unknown")
        );
        // Continue with caching — skipIf errors don't abort
      }
    }

    // -------------------------------------------------------
    // BUILD KEY
    // -------------------------------------------------------
    let cacheKey: string;
    try {
      const baseKey = keyBuilder(req);
      if (typeof baseKey !== "string" || baseKey.length === 0) {
        // Bad key — bypass cache, log, continue
        dbLogger.warn(
          "Cache keyBuilder returned invalid key for " + req.method + " " + req.path
        );
        next();
        return;
      }
      cacheKey = buildCacheKey(req, baseKey, varyByUser, varyByOrg);
    } catch (err) {
      dbLogger.warn(
        "Cache keyBuilder threw: " +
        ((err as Error)?.message ?? "unknown")
      );
      next();
      return;
    }

    // -------------------------------------------------------
    // GET FROM CACHE
    // Timeout-bounded so Redis slowness doesn't slow the request.
    // -------------------------------------------------------
    const cached = await withTimeout(
      redis.get(cacheKey),
      CACHE_CONFIG.redisTimeoutMs
    );

    if (cached) {
      const parsed = deserializeFromCache(cached);
      if (parsed) {
        if (CACHE_CONFIG.emitCacheHeaders) {
          const ageSeconds = Math.floor((Date.now() - parsed.cachedAt) / 1000);
          res.setHeader("X-Cache",      "HIT");
          res.setHeader("X-Cache-Age",  String(ageSeconds));
          res.setHeader("X-Cache-Key",  cacheKey.slice(0, 200));
        }
        res.status(parsed.statusCode).json(parsed.body);
        return;
      }
      // Malformed cache entry — delete it and continue to fresh fetch
      redis.del(cacheKey).catch(() => { /* fail silent */ });
    }

    // -------------------------------------------------------
    // CACHE MISS — INTERCEPT res.json TO STORE FRESH RESPONSE
    // -------------------------------------------------------
    if (CACHE_CONFIG.emitCacheHeaders) {
      res.setHeader("X-Cache", "MISS");
    }

    const originalJson = res.json.bind(res);

    res.json = function (body: unknown): Response {
      // Always send the response first — caching never blocks the user
      const result = originalJson(body);

      // Determine if this response is cacheable
      const statusCode = res.statusCode;
      const isCacheableStatus =
        (CACHE_CONFIG.cacheableStatusCodes as readonly number[]).includes(statusCode);

      if (!isCacheableStatus) {
        if (CACHE_CONFIG.emitCacheHeaders) {
          res.setHeader("X-Cache", "SKIP-STATUS");
        }
        return result;
      }

      // Run user-provided shouldCache predicate
      if (shouldCache) {
        try {
          if (!shouldCache(body, statusCode)) {
            return result;
          }
        } catch (err) {
          dbLogger.warn(
            "Cache shouldCache predicate threw: " +
            ((err as Error)?.message ?? "unknown")
          );
          return result;
        }
      }

      // Serialize and check size
      const serialized = serializeForCache(body, statusCode);
      if (!serialized) {
        return result;
      }

      // Fire-and-forget store — never blocks response
      redis.setex(cacheKey, ttl, serialized.serialized).catch((err) => {
        dbLogger.warn(
          "Cache write failed: key=" + cacheKey.slice(0, 100) +
          " bytes=" + serialized.bytes +
          " err=" + ((err as Error)?.message ?? "unknown")
        );
      });

      return result;
    };

    next();
  };
}

// ============================================================
// CACHE INVALIDATION
// ============================================================

/**
 * Delete a specific cache entry by its base key.
 * Caller must reconstruct the full key with the same scope vars.
 *
 * For broad invalidation by pattern, use invalidateCachePattern.
 */
export async function invalidateCacheKey(key: string): Promise<void> {
  const fullKey = key.startsWith(CACHE_CONFIG.keyPrefix)
    ? key
    : CACHE_CONFIG.keyPrefix + key;
  try {
    await redis.del(fullKey);
  } catch (err) {
    dbLogger.warn(
      "Cache invalidation failed: key=" + fullKey +
      " err=" + ((err as Error)?.message ?? "unknown")
    );
  }
}

/**
 * Delete all cache entries matching a pattern. Uses SCAN to avoid
 * blocking Redis.
 *
 * Usage:
 *   await invalidateCachePattern("teams:list:*");      // all team-list caches
 *   await invalidateCachePattern("*:org:" + orgId);    // all entries for an org
 */
export async function invalidateCachePattern(pattern: string): Promise<number> {
  const fullPattern = pattern.startsWith(CACHE_CONFIG.keyPrefix)
    ? pattern
    : CACHE_CONFIG.keyPrefix + pattern;

  let cursor = "0";
  let deletedCount = 0;

  try {
    do {
      const redisAny = redis as unknown as {
        scan: (
          cursor: string,
          options: { MATCH: string; COUNT: number }
        ) => Promise<{ cursor: string; keys: string[] }>;
        del: (key: string | string[]) => Promise<number>;
      };

      const result = await redisAny.scan(cursor, {
        MATCH: fullPattern,
        COUNT: 100,
      });

      cursor = result.cursor;
      if (result.keys.length > 0) {
        deletedCount += await redisAny.del(result.keys);
      }
    } while (cursor !== "0");

    return deletedCount;
  } catch (err) {
    dbLogger.warn(
      "Cache pattern invalidation failed: pattern=" + fullPattern +
      " err=" + ((err as Error)?.message ?? "unknown")
    );
    return deletedCount;
  }
}

/**
 * Invalidate all cache entries for a specific organization.
 * Use after any write that affects org-scoped data.
 *
 * Usage in controllers:
 *   await updateTeam(...);
 *   await invalidateOrgCache(actor.organizationId);
 */
export async function invalidateOrgCache(organizationId: string): Promise<number> {
  return invalidateCachePattern(":org:" + organizationId + "");
}

/**
 * Invalidate all cache entries for a specific user.
 */
export async function invalidateUserCache(userId: string): Promise<number> {
  return invalidateCachePattern(":user:" + userId + "");
}

/**
 * Flush ALL middleware caches. Use only for emergency cache invalidation
 * (e.g. after a schema change that affects cached shapes).
 */
export async function invalidateAllCache(): Promise<number> {
  return invalidateCachePattern("*");
}

export default cache;
