/**
 * HTTP client for the Official MCP Registry API.
 * Provides search and lookup with in-memory caching.
 * Flattens the nested registry response format.
 */

import { logger } from './logger.js';
import type { RegistryServer, RegistryServerRaw, RegistrySearchResult } from './mcp-types.js';

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0.1/servers';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 10_000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/** Raw API search response (before flattening) */
interface RawSearchResponse {
  servers: RegistryServerRaw[];
  next_cursor?: string;
}

export class McpRegistryClient {
  private cache = new Map<string, CacheEntry<unknown>>();

  /** Search the MCP registry for servers */
  async search(query?: string, cursor?: string, limit?: number): Promise<RegistrySearchResult> {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(limit));

    const url = `${REGISTRY_BASE}?${params.toString()}`;
    const cacheKey = `search:${url}`;

    const cached = this.getFromCache<RegistrySearchResult>(cacheKey);
    if (cached) return cached;

    const raw = await this.fetchJson<RawSearchResponse>(url);

    // Flatten the nested { server: {...}, _meta: {...} } format
    const result: RegistrySearchResult = {
      servers: (raw.servers || []).map(item => item.server),
      next_cursor: raw.next_cursor,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  /** Get a specific server by name from the registry */
  async getServer(name: string): Promise<RegistryServer | null> {
    const cacheKey = `server:${name}`;

    const cached = this.getFromCache<RegistryServer>(cacheKey);
    if (cached) return cached;

    const url = `${REGISTRY_BASE}/${encodeURIComponent(name)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        throw new Error(`Registry API error (${res.status}): ${await res.text()}`);
      }
      const rawItem = (await res.json()) as RegistryServerRaw;
      // Flatten: unwrap the nested server object
      const result = rawItem.server || rawItem as unknown as RegistryServer;
      this.setCache(cacheKey, result);
      return result;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Registry API timeout after ${FETCH_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`Registry API error (${res.status}): ${await res.text()}`);
      }
      return (await res.json()) as T;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Registry API timeout after ${FETCH_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCache(key: string, data: unknown): void {
    this.cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    // Evict stale entries periodically
    if (this.cache.size > 100) {
      const now = Date.now();
      const toDelete: string[] = [];
      for (const [k, v] of this.cache) {
        if (now > v.expiresAt) toDelete.push(k);
      }
      for (const k of toDelete) this.cache.delete(k);
    }
  }
}
