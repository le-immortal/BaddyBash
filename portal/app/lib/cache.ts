/**
 * Simple in-memory cache with TTL.
 *
 * Lives in the Node.js module scope — survives across requests in the same
 * server process but is automatically cleared on restart / redeploys.
 *
 * NOT suited for multi-instance deployments; use Redis or equivalent there.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number; // epoch ms
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 30_000; // 30 seconds

/**
 * Get a value from cache. Returns `undefined` if missing or expired.
 */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

/**
 * Store a value in cache.
 * @param key   Cache key
 * @param data  Value to store
 * @param ttlMs Time-to-live in milliseconds (default 30 s)
 */
export function cacheSet<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

/**
 * Invalidate a single cache entry.
 */
export function cacheDelete(key: string): void {
  store.delete(key);
}

/**
 * Invalidate all entries whose key starts with `prefix`.
 * Useful for busting all category-specific caches at once.
 */
export function cacheDeleteByPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
