/**
 * Session Manager
 * Handles session lifecycle, idle timeout, and context management.
 */

import type Redis from 'ioredis';
import { logger } from './logger.js';
import type { NexusConfig } from './config/schema.js';
import type { Brain } from './brain.js';

export interface SessionState {
  id: string;
  senderId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  inputTokens: number;
  outputTokens: number;
  /** Custom context stored by the session */
  context?: Record<string, unknown>;
  /** Summary text from last compaction */
  compactedSummary?: string;
}

export interface SessionManagerConfig {
  redis: Redis;
  /** Session scope: per-sender or global */
  scope?: 'per-sender' | 'global';
  /** Idle timeout in minutes before session resets */
  idleMinutes?: number;
  /** Commands that trigger session reset */
  resetTriggers?: string[];
  /** Maximum messages to keep in history */
  maxHistoryMessages?: number;
}

const REDIS_SESSIONS_PREFIX = 'nexus:session:';
const REDIS_HISTORY_PREFIX = 'nexus:session_history:';
const DEFAULT_IDLE_MINUTES = 60;
const DEFAULT_MAX_HISTORY = 100;
const DEFAULT_RESET_TRIGGERS = ['/new', '/reset', '/clear'];

export class SessionManager {
  private redis: Redis;
  private scope: 'per-sender' | 'global';
  private idleMinutes: number;
  private resetTriggers: string[];
  private maxHistoryMessages: number;
  private sessions = new Map<string, SessionState>();

  constructor(config: SessionManagerConfig) {
    this.redis = config.redis;
    this.scope = config.scope || 'per-sender';
    this.idleMinutes = config.idleMinutes || DEFAULT_IDLE_MINUTES;
    this.resetTriggers = config.resetTriggers || DEFAULT_RESET_TRIGGERS;
    this.maxHistoryMessages = config.maxHistoryMessages || DEFAULT_MAX_HISTORY;
  }

  /**
   * Update configuration from NexusConfig
   */
  updateConfig(nexusConfig: NexusConfig): void {
    const sessionConfig = nexusConfig.session;
    if (sessionConfig) {
      this.scope = sessionConfig.scope || this.scope;
      this.idleMinutes = sessionConfig.idleMinutes || this.idleMinutes;
      this.resetTriggers = sessionConfig.reset?.triggers || this.resetTriggers;
      this.maxHistoryMessages = sessionConfig.maxHistoryMessages || this.maxHistoryMessages;
    }
  }

  /**
   * Get session ID based on scope
   */
  private getSessionId(senderId?: string): string {
    if (this.scope === 'global') {
      return 'global';
    }
    return senderId || 'default';
  }

  /**
   * Check if a message is a reset trigger
   */
  isResetTrigger(message: string): boolean {
    const normalizedMessage = message.trim().toLowerCase();
    return this.resetTriggers.some((trigger) =>
      normalizedMessage === trigger.toLowerCase() ||
      normalizedMessage.startsWith(trigger.toLowerCase() + ' ')
    );
  }

  /**
   * Get or create a session
   */
  async getSession(senderId?: string): Promise<SessionState> {
    const sessionId = this.getSessionId(senderId);

    // Check memory cache first
    let session = this.sessions.get(sessionId);

    if (!session) {
      // Try to load from Redis
      const stored = await this.redis.get(`${REDIS_SESSIONS_PREFIX}${sessionId}`);
      if (stored) {
        try {
          session = JSON.parse(stored) as SessionState;
          this.sessions.set(sessionId, session);
        } catch {
          // Invalid session data, create new
        }
      }
    }

    // Check if session should be reset due to idle timeout
    if (session && this.isSessionExpired(session)) {
      logger.info('SessionManager: session expired due to idle timeout', {
        sessionId,
        lastUpdate: session.updatedAt,
        idleMinutes: this.idleMinutes,
      });
      await this.resetSession(senderId);
      session = undefined;
    }

    // Create new session if needed
    if (!session) {
      session = {
        id: sessionId,
        senderId: senderId || 'anonymous',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      await this.saveSession(session);
    }

    return session;
  }

  /**
   * Check if session is expired due to idle timeout
   */
  private isSessionExpired(session: SessionState): boolean {
    const idleMs = this.idleMinutes * 60 * 1000;
    const now = Date.now();
    return (now - session.updatedAt) > idleMs;
  }

  /**
   * Update session activity
   */
  async updateSession(
    senderId: string | undefined,
    updates: {
      inputTokens?: number;
      outputTokens?: number;
      context?: Record<string, unknown>;
    }
  ): Promise<SessionState> {
    const session = await this.getSession(senderId);

    session.updatedAt = Date.now();
    session.messageCount++;

    if (updates.inputTokens) {
      session.inputTokens += updates.inputTokens;
    }
    if (updates.outputTokens) {
      session.outputTokens += updates.outputTokens;
    }
    if (updates.context) {
      session.context = { ...session.context, ...updates.context };
    }

    await this.saveSession(session);
    return session;
  }

  /**
   * Save session to Redis
   */
  private async saveSession(session: SessionState): Promise<void> {
    this.sessions.set(session.id, session);
    try {
      await this.redis.set(
        `${REDIS_SESSIONS_PREFIX}${session.id}`,
        JSON.stringify(session),
        'EX',
        this.idleMinutes * 60 * 2 // TTL = 2x idle timeout
      );
    } catch (err: any) {
      logger.error('SessionManager: failed to save session', { error: err.message });
    }
  }

  /**
   * Reset/clear a session
   */
  async resetSession(senderId?: string): Promise<void> {
    const sessionId = this.getSessionId(senderId);

    this.sessions.delete(sessionId);

    try {
      await this.redis.del(`${REDIS_SESSIONS_PREFIX}${sessionId}`);
      await this.redis.del(`${REDIS_HISTORY_PREFIX}${sessionId}`);
      logger.info('SessionManager: session reset', { sessionId });
    } catch (err: any) {
      logger.error('SessionManager: failed to reset session', { error: err.message });
    }
  }

  /**
   * Add a message to session history
   */
  async addToHistory(
    senderId: string | undefined,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    const sessionId = this.getSessionId(senderId);
    const historyKey = `${REDIS_HISTORY_PREFIX}${sessionId}`;

    const entry = JSON.stringify({
      role,
      content: content.slice(0, 2000), // Limit content size
      timestamp: Date.now(),
    });

    try {
      await this.redis.lpush(historyKey, entry);
      await this.redis.ltrim(historyKey, 0, this.maxHistoryMessages - 1);
      await this.redis.expire(historyKey, this.idleMinutes * 60 * 2);
    } catch (err: any) {
      logger.error('SessionManager: failed to add to history', { error: err.message });
    }
  }

  /**
   * Get conversation history for a session
   */
  async getHistory(
    senderId: string | undefined,
    limit?: number
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }>> {
    const sessionId = this.getSessionId(senderId);
    const historyKey = `${REDIS_HISTORY_PREFIX}${sessionId}`;

    try {
      const entries = await this.redis.lrange(historyKey, 0, (limit || this.maxHistoryMessages) - 1);
      return entries.map((entry) => JSON.parse(entry)).reverse();
    } catch (err: any) {
      logger.error('SessionManager: failed to get history', { error: err.message });
      return [];
    }
  }

  /**
   * Get history formatted as context string
   */
  async getHistoryContext(
    senderId: string | undefined,
    limit?: number
  ): Promise<string> {
    const history = await this.getHistory(senderId, limit);
    if (history.length === 0) return '';

    return history
      .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
      .join('\n\n');
  }

  /**
   * Prune old history entries based on config
   */
  async pruneHistory(
    senderId: string | undefined,
    options?: {
      keepLast?: number;
      maxTokens?: number;
    }
  ): Promise<number> {
    const sessionId = this.getSessionId(senderId);
    const historyKey = `${REDIS_HISTORY_PREFIX}${sessionId}`;
    const keepLast = options?.keepLast || this.maxHistoryMessages;

    try {
      const currentLength = await this.redis.llen(historyKey);
      if (currentLength <= keepLast) return 0;

      const pruned = currentLength - keepLast;
      await this.redis.ltrim(historyKey, 0, keepLast - 1);
      logger.info('SessionManager: pruned history', { sessionId, pruned });
      return pruned;
    } catch (err: any) {
      logger.error('SessionManager: failed to prune history', { error: err.message });
      return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Session Compaction (COMP-01 through COMP-06)
  // ---------------------------------------------------------------------------

  /**
   * Estimate token count from text using ~4 chars per token approximation.
   */
  estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Extract critical facts from messages that must never be lost during compaction.
   * Scans for file paths, error codes, user preferences, IPs, URLs, and port numbers.
   */
  extractCriticalFacts(
    messages: Array<{ role: string; content: string; timestamp: number }>
  ): string[] {
    const facts = new Set<string>();

    for (const msg of messages) {
      const text = msg.content;

      // Unix file paths
      const unixPaths = text.match(/\/[\w/\-.]+\.\w+/g);
      if (unixPaths) {
        for (const p of unixPaths) facts.add(`[PINNED] File path: ${p}`);
      }

      // Windows file paths
      const winPaths = text.match(/[A-Z]:\\[\w\\.\-\s]+/gi);
      if (winPaths) {
        for (const p of winPaths) facts.add(`[PINNED] File path: ${p.trim()}`);
      }

      // Error codes and patterns
      const errorCodes = text.match(/\b(ERR_\w+|E\d{4,}|error\s*code\s*[:=]\s*\S+)/gi);
      if (errorCodes) {
        for (const e of errorCodes) facts.add(`[PINNED] Error: ${e}`);
      }

      // IP addresses
      const ips = text.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g);
      if (ips) {
        for (const ip of ips) facts.add(`[PINNED] IP: ${ip}`);
      }

      // URLs
      const urls = text.match(/https?:\/\/[^\s)>"]+/gi);
      if (urls) {
        for (const url of urls) facts.add(`[PINNED] URL: ${url}`);
      }

      // Port numbers in context (e.g., "port 3000", ":8080")
      const ports = text.match(/(?:port\s+|:)(\d{2,5})\b/gi);
      if (ports) {
        for (const port of ports) facts.add(`[PINNED] Port: ${port}`);
      }

      // User preferences (messages containing preference keywords)
      const prefKeywords = /\b(prefer|always|never|don't like|i want|i need|make sure)\b/i;
      if (msg.role === 'user' && prefKeywords.test(text)) {
        // Extract the sentence containing the preference keyword
        const sentences = text.split(/[.!?\n]+/).filter((s) => prefKeywords.test(s));
        for (const s of sentences) {
          const trimmed = s.trim();
          if (trimmed.length > 10 && trimmed.length < 300) {
            facts.add(`[PINNED] User preference: ${trimmed}`);
          }
        }
      }
    }

    return Array.from(facts);
  }

  /**
   * Compact session history by summarizing older messages via Brain (haiku tier).
   *
   * Preserves the last 10 messages verbatim and pins critical facts.
   * The Brain instance is passed as a parameter to avoid adding a constructor dependency.
   */
  async compactSession(
    senderId: string | undefined,
    brain: Brain
  ): Promise<{ savedTokens: number; originalTokens: number; compactedMessages: number }> {
    const history = await this.getHistory(senderId);

    // Nothing to compact if <= 10 messages
    if (history.length <= 10) {
      const allText = history.map((m) => m.content).join('\n');
      return {
        savedTokens: 0,
        originalTokens: this.estimateTokenCount(allText),
        compactedMessages: 0,
      };
    }

    // Split into preserved (last 10) and older messages
    const preservedMessages = history.slice(-10);
    const olderMessages = history.slice(0, -10);

    // Extract critical facts from ALL messages
    const criticalFacts = this.extractCriticalFacts(history);

    // Calculate original token count
    const allText = history.map((m) => m.content).join('\n');
    const originalTokens = this.estimateTokenCount(allText);

    // Build summarization prompt from older messages
    const formattedOlder = olderMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const summarizationPrompt =
      'Summarize the following conversation history concisely, preserving key decisions, outcomes, and context. ' +
      'Focus on WHAT was discussed and decided, not the back-and-forth.\n\n' +
      formattedOlder;

    // Use Brain haiku tier for cost-efficient summarization
    const summary = await brain.think({
      prompt: summarizationPrompt,
      systemPrompt:
        'You are a conversation summarizer. Return a concise summary preserving key facts, decisions, and outcomes. Keep it under 500 words.',
      tier: 'haiku',
      maxTokens: 1000,
    });

    // Build the compacted summary message
    const factsBlock = criticalFacts.length > 0 ? '\n\n[CRITICAL FACTS]\n' + criticalFacts.join('\n') : '';
    const compactedEntry = {
      role: 'user' as const,
      content: `[COMPACTED SUMMARY]\n${summary}${factsBlock}`,
      timestamp: Date.now(),
    };

    // Write compacted history to Redis (replaces full history)
    const sessionId = this.getSessionId(senderId);
    const historyKey = `${REDIS_HISTORY_PREFIX}${sessionId}`;

    try {
      // Clear existing history
      await this.redis.del(historyKey);

      // Write new compacted history in reverse order (Redis list stores newest first via LPUSH)
      const compactedHistory = [compactedEntry, ...preservedMessages];
      for (let i = compactedHistory.length - 1; i >= 0; i--) {
        await this.redis.lpush(historyKey, JSON.stringify(compactedHistory[i]));
      }
      await this.redis.expire(historyKey, this.idleMinutes * 60 * 2);
    } catch (err: any) {
      logger.error('SessionManager: failed to write compacted history', { error: err.message });
      throw err;
    }

    // Calculate savings
    const newText = [compactedEntry, ...preservedMessages].map((m) => m.content).join('\n');
    const newTokens = this.estimateTokenCount(newText);
    const savedTokens = Math.max(0, originalTokens - newTokens);

    // Update session metadata with compaction info
    const session = await this.getSession(senderId);
    const prevCount = (session.context?.compactionCount as number) || 0;
    session.context = {
      ...session.context,
      lastCompactedAt: Date.now(),
      compactionCount: prevCount + 1,
      savedTokens,
    };
    session.compactedSummary = summary;
    await this.saveSession(session);

    logger.info('SessionManager: session compacted', {
      sessionId,
      compactedMessages: olderMessages.length,
      originalTokens,
      newTokens,
      savedTokens,
      criticalFacts: criticalFacts.length,
    });

    return {
      savedTokens,
      originalTokens,
      compactedMessages: olderMessages.length,
    };
  }

  /**
   * Get estimated token count for the entire session history.
   * Used by auto-compact threshold check.
   */
  async getSessionTokenCount(senderId: string | undefined): Promise<number> {
    const history = await this.getHistory(senderId);
    const allText = history.map((m) => m.content).join('\n');
    return this.estimateTokenCount(allText);
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    activeSessions: number;
    totalMessages: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  }> {
    let totalMessages = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const session of this.sessions.values()) {
      totalMessages += session.messageCount;
      totalInputTokens += session.inputTokens;
      totalOutputTokens += session.outputTokens;
    }

    return {
      activeSessions: this.sessions.size,
      totalMessages,
      totalInputTokens,
      totalOutputTokens,
    };
  }

  /**
   * Cleanup expired sessions
   */
  async cleanup(): Promise<number> {
    let cleaned = 0;

    for (const [id, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        this.sessions.delete(id);
        await this.redis.del(`${REDIS_SESSIONS_PREFIX}${id}`);
        await this.redis.del(`${REDIS_HISTORY_PREFIX}${id}`);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('SessionManager: cleaned up expired sessions', { count: cleaned });
    }

    return cleaned;
  }
}

export default SessionManager;
