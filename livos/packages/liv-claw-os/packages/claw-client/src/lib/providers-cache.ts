/**
 * Phase 208-06 R10 — Stale-while-revalidate localStorage cache for the
 * ProvidersTab query fanout (5 parallel callQuery calls, openclaw.models.list
 * being the slow one with ~960 models).
 *
 * Strategy: synchronous get on mount returns stale data IMMEDIATELY so the
 * panel paints in <500ms on a warm cache, then an async refetch runs in
 * the background and refreshes both the UI and the cache entry. TTL = 60s
 * (per 208-CONTEXT R10 Claude's Discretion; ETag deferred).
 *
 * Contract:
 *   - get / set / invalidate / invalidateAll / isFresh
 *   - All operations are SSR-safe (no-op if window.localStorage absent).
 *   - set silently swallows QuotaExceededError and evicts the OLDEST entry
 *     in the namespace before retrying once.
 *   - get auto-removes any corrupt entry on JSON.parse failure.
 *   - Foreign localStorage keys (no PREFIX) are never touched by invalidateAll.
 */

export interface CacheEntry<T> {
  value: T;
  storedAt: number;
}

export const TTL_MS = 60_000;
const PREFIX = "livos:providers-cache:";

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function listOwnKeys(s: Storage): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k && k.startsWith(PREFIX)) out.push(k);
  }
  return out;
}

function evictOldest(s: Storage): void {
  const keys = listOwnKeys(s);
  if (keys.length === 0) return;
  let oldestKey = keys[0] ?? "";
  let oldestAt = Infinity;
  for (const k of keys) {
    try {
      const raw = s.getItem(k);
      if (!raw) continue;
      const e = JSON.parse(raw) as CacheEntry<unknown>;
      if (typeof e.storedAt === "number" && e.storedAt < oldestAt) {
        oldestAt = e.storedAt;
        oldestKey = k;
      }
    } catch {
      // Corrupt entry — treat as evictable
      oldestKey = k;
      break;
    }
  }
  if (oldestKey) s.removeItem(oldestKey);
}

export const providersCache = {
  get<T>(key: string): CacheEntry<T> | null {
    const s = safeStorage();
    if (!s) return null;
    const raw = s.getItem(PREFIX + key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CacheEntry<T>;
    } catch {
      // Self-heal: drop the corrupt entry so a later set can re-populate.
      try {
        s.removeItem(PREFIX + key);
      } catch {
        // Swallow — best-effort cleanup.
      }
      return null;
    }
  },

  set<T>(key: string, value: T): void {
    const s = safeStorage();
    if (!s) return;
    const entry: CacheEntry<T> = { value, storedAt: Date.now() };
    const blob = JSON.stringify(entry);
    try {
      s.setItem(PREFIX + key, blob);
    } catch {
      // Quota or other transient failure — evict the oldest namespace entry
      // and retry exactly once. If the retry also fails, give up silently
      // (the cache is best-effort; the UI's async refetch is authoritative).
      evictOldest(s);
      try {
        s.setItem(PREFIX + key, blob);
      } catch {
        // Give up — cache write is non-critical.
      }
    }
  },

  invalidate(key: string): void {
    const s = safeStorage();
    if (!s) return;
    try {
      s.removeItem(PREFIX + key);
    } catch {
      // Best-effort.
    }
  },

  invalidateAll(): void {
    const s = safeStorage();
    if (!s) return;
    try {
      for (const k of listOwnKeys(s)) s.removeItem(k);
    } catch {
      // Best-effort.
    }
  },

  isFresh<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.storedAt < TTL_MS;
  },
};
