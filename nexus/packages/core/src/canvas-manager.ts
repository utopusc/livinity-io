import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

/** Canvas artifact types supported by the Live Canvas system */
export type CanvasArtifactType = 'react' | 'html' | 'svg' | 'mermaid' | 'recharts';

/** A canvas artifact stored in Redis — represents a visual component rendered alongside chat */
export interface CanvasArtifact {
  id: string;              // Unique ID, e.g. "canvas_abc12345"
  type: CanvasArtifactType;
  title: string;           // Human-readable title (e.g. "Docker Dashboard")
  content: string;         // The full source code / HTML / SVG / mermaid content
  conversationId: string;  // Links artifact to a chat conversation
  createdAt: number;       // Unix timestamp ms
  updatedAt: number;       // Unix timestamp ms
  version: number;         // Incremented on each update (starts at 1)
}

/** Options for creating a new canvas artifact */
export interface CreateCanvasOpts {
  type: CanvasArtifactType;
  title: string;
  content: string;
  conversationId: string;
}

/** Redis key prefix for canvas artifacts */
const CANVAS_KEY_PREFIX = 'nexus:canvas:';

/** TTL in seconds — canvas artifacts are ephemeral session data (2 hours) */
const CANVAS_TTL_SECONDS = 7200;

/**
 * Manages canvas artifact storage in Redis.
 * Canvas artifacts are visual components (React, HTML, SVG, Mermaid, Recharts)
 * that the AI agent creates and the frontend renders in a split-pane alongside chat.
 */
export class CanvasManager {
  private redis: Redis;

  constructor({ redis }: { redis: Redis }) {
    this.redis = redis;
  }

  /**
   * Create a new canvas artifact.
   * Generates a unique ID, stores in Redis with TTL.
   */
  async create(opts: CreateCanvasOpts): Promise<CanvasArtifact> {
    const id = `canvas_${randomUUID().slice(0, 8)}`;
    const now = Date.now();

    const artifact: CanvasArtifact = {
      id,
      type: opts.type,
      title: opts.title,
      content: opts.content,
      conversationId: opts.conversationId,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    const key = `${CANVAS_KEY_PREFIX}${id}`;
    await this.redis.set(key, JSON.stringify(artifact), 'EX', CANVAS_TTL_SECONDS);

    logger.info('Canvas artifact created', { id, type: opts.type, title: opts.title, conversationId: opts.conversationId });
    return artifact;
  }

  /**
   * Retrieve a canvas artifact by ID.
   * Returns null if not found or expired.
   */
  async get(id: string): Promise<CanvasArtifact | null> {
    const key = `${CANVAS_KEY_PREFIX}${id}`;
    const data = await this.redis.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as CanvasArtifact;
    } catch (err) {
      logger.error('Canvas artifact parse error', { id, error: (err as Error).message });
      return null;
    }
  }

  /**
   * Update an existing canvas artifact's content (and optionally title).
   * Increments version, updates timestamps, refreshes TTL.
   * Returns null if artifact doesn't exist.
   */
  async update(id: string, content: string, title?: string): Promise<CanvasArtifact | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updated: CanvasArtifact = {
      ...existing,
      content,
      title: title ?? existing.title,
      updatedAt: Date.now(),
      version: existing.version + 1,
    };

    const key = `${CANVAS_KEY_PREFIX}${id}`;
    await this.redis.set(key, JSON.stringify(updated), 'EX', CANVAS_TTL_SECONDS);

    logger.info('Canvas artifact updated', { id, version: updated.version, title: updated.title });
    return updated;
  }

  /**
   * Delete a canvas artifact by ID.
   * Returns true if the artifact existed and was deleted.
   */
  async delete(id: string): Promise<boolean> {
    const key = `${CANVAS_KEY_PREFIX}${id}`;
    const deleted = await this.redis.del(key);
    if (deleted > 0) {
      logger.info('Canvas artifact deleted', { id });
    }
    return deleted > 0;
  }

  /**
   * List all canvas artifacts for a given conversation.
   * Uses SCAN to find matching keys, then filters by conversationId.
   * Returns sorted by updatedAt descending (newest first).
   *
   * Note: For small scale (< 100 artifacts), SCAN is fine.
   */
  async listByConversation(conversationId: string): Promise<CanvasArtifact[]> {
    const artifacts: CanvasArtifact[] = [];
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        `${CANVAS_KEY_PREFIX}*`,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        const values = await this.redis.mget(...keys);
        for (const value of values) {
          if (!value) continue;
          try {
            const artifact = JSON.parse(value) as CanvasArtifact;
            if (artifact.conversationId === conversationId) {
              artifacts.push(artifact);
            }
          } catch {
            // Skip malformed entries
          }
        }
      }
    } while (cursor !== '0');

    // Sort by updatedAt descending (newest first)
    return artifacts.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}
