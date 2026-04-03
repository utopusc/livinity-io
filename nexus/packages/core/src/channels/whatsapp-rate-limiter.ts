import type Redis from 'ioredis';
import { logger } from '../logger.js';

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Rate Limiter
//
// Prevents WhatsApp account bans by enforcing a sliding-window rate limit on
// outbound messages. Uses a Redis sorted set for accurate per-minute tracking
// and an in-memory queue for overflow messages that are drained automatically.
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_KEY = 'nexus:whatsapp:ratelimit';
const MAX_PER_MINUTE = 10;
const MIN_DELAY_MS = 1000; // 1 second
const MAX_DELAY_MS = 3000; // 3 seconds
const WINDOW_MS = 60_000; // 60 seconds
const DRAIN_INTERVAL_MS = Math.ceil(WINDOW_MS / MAX_PER_MINUTE); // 6s between queue drain attempts

interface QueueItem {
  sendFn: () => Promise<boolean>;
  resolve: (value: boolean) => void;
  reject: (reason: unknown) => void;
}

export class WhatsAppRateLimiter {
  private redis: Redis;
  private queue: QueueItem[] = [];
  private processing = false;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Enqueue a message send through the rate limiter.
   *
   * If the sliding window has capacity (< MAX_PER_MINUTE sends in last 60s),
   * the message is sent immediately after a randomized delay. Otherwise it is
   * queued in-memory and drained automatically as the window opens up.
   */
  async enqueue(sendFn: () => Promise<boolean>): Promise<boolean> {
    const count = await this.getWindowCount();

    if (count < MAX_PER_MINUTE) {
      // Under limit -- send now (with randomized delay)
      await this.recordSend();
      await this.randomDelay();
      const result = await sendFn();
      this.processQueue();
      return result;
    }

    // At or over limit -- queue for later
    return new Promise<boolean>((resolve, reject) => {
      this.queue.push({ sendFn, resolve, reject });
      logger.info('WhatsAppRateLimiter: message queued', { queueDepth: this.queue.length });
      this.processQueue();
    });
  }

  // ── Sliding window operations ──

  /**
   * Count how many sends occurred in the last 60 seconds using a Redis
   * sorted set. Entries older than the window are pruned first.
   */
  private async getWindowCount(): Promise<number> {
    const now = Date.now();
    const windowStart = now - WINDOW_MS;

    // Remove entries outside the window
    await this.redis.zremrangebyscore(REDIS_KEY, 0, windowStart);

    // Count remaining entries
    const count = await this.redis.zcard(REDIS_KEY);

    return count;
  }

  /**
   * Record a send in the sliding window. Uses timestamp as both score and
   * member (with a random suffix to avoid collisions on same-ms sends).
   */
  private async recordSend(): Promise<void> {
    const now = Date.now();
    const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

    await this.redis.zadd(REDIS_KEY, now.toString(), member);
    await this.redis.expire(REDIS_KEY, 120); // Auto-cleanup TTL
  }

  // ── Queue processing ──

  /**
   * Drain the in-memory queue one message at a time. Uses setTimeout to
   * re-check the sliding window after DRAIN_INTERVAL_MS (6s), ensuring we
   * never exceed the rate limit even when draining a backlog.
   */
  private processQueue(): void {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    setTimeout(async () => {
      try {
        const count = await this.getWindowCount();

        if (count < MAX_PER_MINUTE && this.queue.length > 0) {
          const item = this.queue.shift()!;
          await this.recordSend();
          await this.randomDelay();

          try {
            const result = await item.sendFn();
            item.resolve(result);
            logger.info('WhatsAppRateLimiter: queued message sent', {
              remainingQueue: this.queue.length,
            });
          } catch (err) {
            item.reject(err);
          }
        }
      } catch (err) {
        logger.error('WhatsAppRateLimiter: queue processing error', {
          error: (err as Error).message,
        });
      } finally {
        this.processing = false;
        // Continue draining if there are more items
        if (this.queue.length > 0) {
          this.processQueue();
        }
      }
    }, DRAIN_INTERVAL_MS);
  }

  // ── Helpers ──

  /**
   * Apply a randomized delay between MIN_DELAY_MS and MAX_DELAY_MS to mimic
   * human typing patterns and avoid triggering WhatsApp anti-automation.
   */
  private randomDelay(): Promise<void> {
    const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
