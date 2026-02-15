import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import type { ApprovalRequest, ApprovalResponse } from './types.js';
import { logger } from './logger.js';

const APPROVAL_KEY_PREFIX = 'nexus:approval:';
const APPROVAL_CHANNEL = 'nexus:notify:approval';
const APPROVAL_RESPONSE_PREFIX = 'nexus:approval:response:';
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const AUDIT_KEY = 'nexus:approval:audit';

export class ApprovalManager {
  constructor(private redis: Redis) {}

  /** Create a pending approval request. Publishes to notification channel. Returns the request. */
  async createRequest(opts: {
    sessionId: string;
    tool: string;
    params: Record<string, unknown>;
    thought: string;
    timeoutMs?: number;
  }): Promise<ApprovalRequest> {
    const id = randomUUID();
    const now = Date.now();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const request: ApprovalRequest = {
      id,
      sessionId: opts.sessionId,
      tool: opts.tool,
      params: opts.params,
      thought: opts.thought,
      status: 'pending',
      createdAt: now,
      expiresAt: now + timeoutMs,
    };

    // Store in Redis with TTL
    const ttlSec = Math.ceil(timeoutMs / 1000) + 60; // Extra 60s for cleanup
    await this.redis.set(
      `${APPROVAL_KEY_PREFIX}${id}`,
      JSON.stringify(request),
      'EX',
      ttlSec
    );

    // Publish notification so WebSocket clients and channels can display the prompt
    await this.redis.publish(APPROVAL_CHANNEL, JSON.stringify({
      channel: 'approval',
      event: 'approval_request',
      data: request,
      timestamp: now,
    }));

    logger.info('ApprovalManager: created request', { id, tool: opts.tool, sessionId: opts.sessionId });
    return request;
  }

  /** Wait for an approval response. Uses Redis BLPOP on a response key. Returns the decision. */
  async waitForResponse(requestId: string, timeoutMs?: number): Promise<ApprovalResponse | null> {
    const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeoutSec = Math.ceil(timeout / 1000);
    const responseKey = `${APPROVAL_RESPONSE_PREFIX}${requestId}`;

    // BLPOP blocks until a response is pushed or timeout
    // Need a dedicated connection to avoid blocking the main Redis connection
    const subRedis = this.redis.duplicate();
    try {
      const result = await subRedis.blpop(responseKey, timeoutSec);
      if (!result) {
        // Timeout — mark as expired
        await this.updateRequestStatus(requestId, 'expired');
        return null;
      }

      const [, value] = result;
      const response: ApprovalResponse = JSON.parse(value);

      // Update the request status
      const status = response.decision === 'approve' ? 'approved' : 'denied';
      await this.updateRequestStatus(requestId, status, response.respondedBy, response.respondedFrom);

      return response;
    } finally {
      await subRedis.quit().catch(() => {});
    }
  }

  /** Resolve a pending approval (called by any channel: WebSocket, Telegram, Slack, HTTP API) */
  async resolve(response: ApprovalResponse): Promise<boolean> {
    const requestKey = `${APPROVAL_KEY_PREFIX}${response.requestId}`;
    const stored = await this.redis.get(requestKey);
    if (!stored) return false; // Expired or not found

    const request: ApprovalRequest = JSON.parse(stored);
    if (request.status !== 'pending') return false; // Already resolved

    // Push response to the waiting BLPOP
    const responseKey = `${APPROVAL_RESPONSE_PREFIX}${response.requestId}`;
    await this.redis.lpush(responseKey, JSON.stringify(response));

    // Publish resolution notification
    await this.redis.publish(APPROVAL_CHANNEL, JSON.stringify({
      channel: 'approval',
      event: 'approval_resolved',
      data: {
        ...request,
        status: response.decision === 'approve' ? 'approved' : 'denied',
        resolvedBy: response.respondedBy,
        resolvedFrom: response.respondedFrom,
      },
      timestamp: Date.now(),
    }));

    logger.info('ApprovalManager: resolved', {
      requestId: response.requestId,
      decision: response.decision,
      by: response.respondedBy,
    });
    return true;
  }

  /** Get a pending approval request by ID */
  async getRequest(requestId: string): Promise<ApprovalRequest | null> {
    const stored = await this.redis.get(`${APPROVAL_KEY_PREFIX}${requestId}`);
    return stored ? JSON.parse(stored) : null;
  }

  /** List all pending approval requests */
  async listPending(): Promise<ApprovalRequest[]> {
    // Scan for pending approvals
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, results] = await this.redis.scan(cursor, 'MATCH', `${APPROVAL_KEY_PREFIX}*`, 'COUNT', 100);
      cursor = nextCursor;
      // Filter out response keys
      keys.push(...results.filter(k => !k.includes(':response:')));
    } while (cursor !== '0');

    if (keys.length === 0) return [];

    const values = await this.redis.mget(...keys);
    return values
      .filter((v): v is string => v !== null)
      .map(v => JSON.parse(v) as ApprovalRequest)
      .filter(r => r.status === 'pending' && r.expiresAt > Date.now());
  }

  private async updateRequestStatus(
    requestId: string,
    status: ApprovalRequest['status'],
    resolvedBy?: string,
    resolvedFrom?: string,
  ) {
    const key = `${APPROVAL_KEY_PREFIX}${requestId}`;
    const stored = await this.redis.get(key);
    if (!stored) return;

    const request: ApprovalRequest = JSON.parse(stored);
    request.status = status;
    request.resolvedAt = Date.now();
    if (resolvedBy) request.resolvedBy = resolvedBy;
    if (resolvedFrom) request.resolvedFrom = resolvedFrom;

    // Keep for 24h after resolution (for audit trail)
    await this.redis.set(key, JSON.stringify(request), 'EX', 86400);

    // Log to audit trail
    await this.logAudit(request);
  }

  /** Log an approval decision to the audit trail (Redis sorted set, scored by timestamp) */
  async logAudit(request: ApprovalRequest): Promise<void> {
    const entry = {
      requestId: request.id,
      sessionId: request.sessionId,
      tool: request.tool,
      params: request.params,
      thought: request.thought,
      status: request.status,
      createdAt: request.createdAt,
      resolvedAt: request.resolvedAt,
      resolvedBy: request.resolvedBy,
      resolvedFrom: request.resolvedFrom,
    };
    // Score by resolvedAt (or createdAt if not resolved)
    const score = request.resolvedAt || request.createdAt;
    await this.redis.zadd(AUDIT_KEY, score, JSON.stringify(entry));
    // Trim to last 1000 entries
    await this.redis.zremrangebyrank(AUDIT_KEY, 0, -1001);
  }

  /** Query audit trail. Returns entries in reverse chronological order. */
  async getAuditTrail(opts?: { limit?: number; offset?: number }): Promise<unknown[]> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;
    const entries = await this.redis.zrevrange(AUDIT_KEY, offset, offset + limit - 1);
    return entries.map(e => JSON.parse(e));
  }
}
