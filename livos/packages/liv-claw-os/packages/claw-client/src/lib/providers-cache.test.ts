import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { providersCache, TTL_MS } from "./providers-cache";

// ────────────────────────────────────────────────────────────────────────────
// Test scaffolding — a minimal in-memory localStorage stand-in.
//
// The default vitest env is node (no window/localStorage). We install a
// shimmed `window` global before each test so the cache module's
// `safeStorage()` resolves to our controlled Storage impl. SSR-safety test
// removes window entirely to assert get/set become no-ops.
// ────────────────────────────────────────────────────────────────────────────

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  setQuota: number | null = null; // when set, throws QuotaExceededError once

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) ?? null) : null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.setQuota !== null) {
      const err = new Error("QuotaExceededError");
      (err as Error & { name: string }).name = "QuotaExceededError";
      // Only throw if this would push us over the quota
      if (this.map.size >= this.setQuota && !this.map.has(key)) {
        throw err;
      }
    }
    this.map.set(key, value);
  }
}

function installWindow(storage: Storage | undefined): void {
  // vitest node env has no window; install a fresh shim each test.
  // Using globalThis avoids ts-strict complaints about window typing.
  if (storage === undefined) {
    // Simulate SSR — no window at all.
    (globalThis as { window?: unknown }).window = undefined;
    return;
  }
  (globalThis as { window?: { localStorage: Storage } }).window = {
    localStorage: storage,
  };
}

describe("providersCache", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    installWindow(storage);
  });

  afterEach(() => {
    installWindow(undefined);
    vi.useRealTimers();
  });

  it("get returns null when key is not present", () => {
    expect(providersCache.get("missing")).toBeNull();
  });

  it("set then get returns the stored value with a storedAt close to Date.now()", () => {
    const before = Date.now();
    providersCache.set("k1", { hello: "world" });
    const after = Date.now();

    const entry = providersCache.get<{ hello: string }>("k1");
    expect(entry).not.toBeNull();
    expect(entry?.value).toEqual({ hello: "world" });
    expect(entry?.storedAt).toBeGreaterThanOrEqual(before);
    expect(entry?.storedAt).toBeLessThanOrEqual(after);
  });

  it("isFresh returns true within TTL and false after TTL", () => {
    providersCache.set("k1", 42);
    const entry = providersCache.get<number>("k1");
    expect(entry).not.toBeNull();
    if (!entry) return;

    // Fresh immediately
    expect(providersCache.isFresh(entry)).toBe(true);

    // Stale TTL_MS + 1 later
    const staleEntry = { value: 42, storedAt: Date.now() - (TTL_MS + 1) };
    expect(providersCache.isFresh(staleEntry)).toBe(false);

    // Just under TTL is still fresh
    const justFresh = { value: 42, storedAt: Date.now() - (TTL_MS - 100) };
    expect(providersCache.isFresh(justFresh)).toBe(true);
  });

  it("invalidate(key) removes that key only; other keys untouched", () => {
    providersCache.set("a", 1);
    providersCache.set("b", 2);
    providersCache.invalidate("a");

    expect(providersCache.get("a")).toBeNull();
    expect(providersCache.get<number>("b")?.value).toBe(2);
  });

  it("invalidateAll removes every namespaced key but leaves other localStorage keys alone", () => {
    // Foreign keys (no PREFIX) — must survive
    storage.setItem("user:settings", "{}");
    storage.setItem("session", "abc");

    providersCache.set("a", 1);
    providersCache.set("b", 2);
    providersCache.invalidateAll();

    expect(providersCache.get("a")).toBeNull();
    expect(providersCache.get("b")).toBeNull();
    expect(storage.getItem("user:settings")).toBe("{}");
    expect(storage.getItem("session")).toBe("abc");
  });

  it("get/set are no-ops when localStorage is undefined (SSR safety)", () => {
    installWindow(undefined);
    // Should not throw and should return null
    expect(providersCache.get("anything")).toBeNull();
    // Should not throw
    expect(() => providersCache.set("anything", { foo: "bar" })).not.toThrow();
    expect(() => providersCache.invalidate("anything")).not.toThrow();
    expect(() => providersCache.invalidateAll()).not.toThrow();
  });

  it("set silently swallows QuotaExceededError and evicts the oldest cache entry", () => {
    // Pre-populate 3 entries with distinct storedAt timestamps
    const t0 = Date.now() - 30_000;
    const t1 = Date.now() - 20_000;
    const t2 = Date.now() - 10_000;
    storage.setItem(
      "livos:providers-cache:old",
      JSON.stringify({ value: "old", storedAt: t0 }),
    );
    storage.setItem(
      "livos:providers-cache:middle",
      JSON.stringify({ value: "middle", storedAt: t1 }),
    );
    storage.setItem(
      "livos:providers-cache:newer",
      JSON.stringify({ value: "newer", storedAt: t2 }),
    );

    // Configure storage to throw QuotaExceededError when size >= 3 and key is new
    storage.setQuota = 3;

    // This set must trigger eviction of "old" then succeed
    expect(() => providersCache.set("brand-new", { v: 1 })).not.toThrow();

    // Oldest evicted
    expect(storage.getItem("livos:providers-cache:old")).toBeNull();
    // Others survive
    expect(storage.getItem("livos:providers-cache:middle")).not.toBeNull();
    expect(storage.getItem("livos:providers-cache:newer")).not.toBeNull();
    // New entry written
    expect(providersCache.get<{ v: number }>("brand-new")?.value).toEqual({
      v: 1,
    });
  });

  it("get returns null and removes the corrupt entry when JSON.parse fails", () => {
    storage.setItem("livos:providers-cache:corrupt", "{this is not json");
    expect(providersCache.get("corrupt")).toBeNull();
    expect(storage.getItem("livos:providers-cache:corrupt")).toBeNull();
  });
});
