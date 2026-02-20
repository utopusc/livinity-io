import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import type { Daemon } from './daemon.js';
import { logger } from './logger.js';

// ── Types ────────────────────────────────────────────────────────

export interface WebhookRecord {
  id: string;
  name: string;
  secret: string;
  createdAt: string;
  lastUsed: string | null;
  deliveryCount: number;
}

interface WebhookManagerDeps {
  redis: Redis;
  daemon: Daemon;
  bullConnection: { host: string; port: number; password?: string };
}

// ── Redis Key Helpers ────────────────────────────────────────────

const WEBHOOK_KEY = (id: string) => `nexus:webhooks:${id}`;
const WEBHOOK_INDEX = 'nexus:webhooks:index';
const DEDUP_KEY = (deliveryId: string) => `nexus:webhook:dedup:${deliveryId}`;
const DEDUP_TTL = 86400; // 24 hours

// ── WebhookManager ──────────────────────────────────────────────

export class WebhookManager {
  private redis: Redis;
  private daemon: Daemon;
  private queue: Queue;
  private worker: Worker;

  constructor({ redis, daemon, bullConnection }: WebhookManagerDeps) {
    this.redis = redis;
    this.daemon = daemon;

    // BullMQ queue for incoming webhook payloads
    this.queue = new Queue('nexus-webhooks', {
      connection: bullConnection,
      defaultJobOptions: {
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 100 },
      },
    });

    // Worker processes queued webhooks into the daemon inbox
    this.worker = new Worker(
      'nexus-webhooks',
      async (job) => {
        const { webhookName, payload } = job.data as {
          webhookName: string;
          payload: string;
        };
        // Truncate payload summary to 2000 chars for the agent
        const summary = payload.length > 2000 ? payload.slice(0, 2000) + '...(truncated)' : payload;
        const message = `Webhook "${webhookName}" received:\n${summary}`;
        daemon.addToInbox(message, 'webhook');
        logger.info('Webhook job processed', { webhookName, payloadLength: payload.length, jobId: job.id });
      },
      { connection: bullConnection, concurrency: 2 },
    );

    this.worker.on('failed', (job, err) => {
      logger.error('Webhook worker: job failed', { jobId: job?.id, error: err.message });
    });

    logger.info('WebhookManager initialized (queue + worker)');
  }

  // ── CRUD ───────────────────────────────────────────────────────

  async createWebhook(name: string, secret?: string): Promise<{ id: string; secret: string; url: string }> {
    const id = randomUUID();
    const webhookSecret = secret || randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''); // 64 hex-ish chars
    const now = new Date().toISOString();

    const pipeline = this.redis.pipeline();
    pipeline.hset(WEBHOOK_KEY(id), {
      name,
      secret: webhookSecret,
      createdAt: now,
      lastUsed: '',
      deliveryCount: '0',
    });
    pipeline.sadd(WEBHOOK_INDEX, id);
    await pipeline.exec();

    logger.info('Webhook created', { id, name });
    return { id, secret: webhookSecret, url: `/api/webhook/${id}` };
  }

  async getWebhook(id: string): Promise<WebhookRecord | null> {
    const data = await this.redis.hgetall(WEBHOOK_KEY(id));
    if (!data || !data.name) return null;
    return {
      id,
      name: data.name,
      secret: data.secret,
      createdAt: data.createdAt,
      lastUsed: data.lastUsed || null,
      deliveryCount: parseInt(data.deliveryCount || '0', 10),
    };
  }

  async listWebhooks(): Promise<WebhookRecord[]> {
    const ids = await this.redis.smembers(WEBHOOK_INDEX);
    if (ids.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.hgetall(WEBHOOK_KEY(id));
    }
    const results = await pipeline.exec();
    if (!results) return [];

    const webhooks: WebhookRecord[] = [];
    for (let i = 0; i < ids.length; i++) {
      const [err, data] = results[i] as [Error | null, Record<string, string>];
      if (err || !data || !data.name) continue;
      webhooks.push({
        id: ids[i],
        name: data.name,
        secret: data.secret,
        createdAt: data.createdAt,
        lastUsed: data.lastUsed || null,
        deliveryCount: parseInt(data.deliveryCount || '0', 10),
      });
    }
    return webhooks;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const pipeline = this.redis.pipeline();
    pipeline.del(WEBHOOK_KEY(id));
    pipeline.srem(WEBHOOK_INDEX, id);
    const results = await pipeline.exec();
    const deleted = results?.[0]?.[1] === 1;
    if (deleted) {
      logger.info('Webhook deleted', { id });
    }
    return deleted;
  }

  // ── Verification ───────────────────────────────────────────────

  async verifySignature(id: string, payload: Buffer, signature: string): Promise<boolean> {
    const data = await this.redis.hget(WEBHOOK_KEY(id), 'secret');
    if (!data) return false;

    // Expect format: sha256=<hex>
    const providedHex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
    if (!providedHex) return false;

    const expectedHmac = createHmac('sha256', data).update(payload).digest('hex');

    // Timing-safe comparison to prevent timing attacks
    try {
      const expectedBuf = Buffer.from(expectedHmac, 'hex');
      const providedBuf = Buffer.from(providedHex, 'hex');
      if (expectedBuf.length !== providedBuf.length) return false;
      return timingSafeEqual(expectedBuf, providedBuf);
    } catch {
      return false;
    }
  }

  // ── Deduplication ──────────────────────────────────────────────

  async isDuplicate(deliveryId: string): Promise<boolean> {
    // SET NX — atomic check-and-set: returns 'OK' if key was set (new), null if exists (dupe)
    const result = await this.redis.set(DEDUP_KEY(deliveryId), '1', 'EX', DEDUP_TTL, 'NX');
    return result === null; // null means key already existed → duplicate
  }

  // ── Orchestrator ───────────────────────────────────────────────

  async handleIncoming(
    id: string,
    payload: Buffer,
    signature: string,
    deliveryId?: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    // 1. Verify signature
    const webhook = await this.getWebhook(id);
    if (!webhook) {
      return { ok: false, reason: 'not_found' };
    }

    const valid = await this.verifySignature(id, payload, signature);
    if (!valid) {
      logger.warn('Webhook signature verification failed', { id, name: webhook.name });
      return { ok: false, reason: 'invalid_signature' };
    }

    // 2. Dedup check
    if (deliveryId) {
      const dupe = await this.isDuplicate(deliveryId);
      if (dupe) {
        logger.info('Webhook duplicate ignored', { id, deliveryId });
        return { ok: false, reason: 'duplicate' };
      }
    }

    // 3. Update stats
    const now = new Date().toISOString();
    const pipeline = this.redis.pipeline();
    pipeline.hset(WEBHOOK_KEY(id), 'lastUsed', now);
    pipeline.hincrby(WEBHOOK_KEY(id), 'deliveryCount', 1);
    await pipeline.exec();

    // 4. Queue BullMQ job
    const payloadStr = payload.toString('utf-8');
    await this.queue.add('webhook-incoming', {
      webhookId: id,
      webhookName: webhook.name,
      payload: payloadStr,
      deliveryId: deliveryId || null,
      receivedAt: now,
    });

    logger.info('Webhook queued', { id, name: webhook.name, deliveryId, payloadSize: payload.length });
    return { ok: true };
  }

  // ── Cleanup ────────────────────────────────────────────────────

  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    logger.info('WebhookManager closed');
  }
}
