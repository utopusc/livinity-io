/**
 * Heartbeat Runner
 * Periodic self-triggering system that checks HEARTBEAT.md and executes tasks.
 * Inspired by OpenClaw's heartbeat mechanism.
 */

import fs from 'fs/promises';
import path from 'path';
import type Redis from 'ioredis';
import { logger } from './logger.js';
import type { Brain } from './brain.js';
import type { ToolRegistry } from './tool-registry.js';
import type { NexusConfig } from './config/schema.js';

export const HEARTBEAT_TOKEN = 'HEARTBEAT_OK';
export const DEFAULT_HEARTBEAT_INTERVAL_MINUTES = 30;
export const DEFAULT_HEARTBEAT_ACK_MAX_CHARS = 300;

export const DEFAULT_HEARTBEAT_PROMPT = `Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.`;

export interface HeartbeatConfig {
  enabled: boolean;
  intervalMinutes: number;
  prompt: string;
  target: 'last' | 'none' | string;
  to?: string; // Override recipient (WhatsApp JID)
  activeHours?: {
    start: string; // "08:00"
    end: string;   // "22:00"
    timezone?: string;
  };
  ackMaxChars: number;
}

export interface HeartbeatRunnerConfig {
  redis: Redis;
  brain: Brain;
  toolRegistry: ToolRegistry;
  workspaceDir: string;
  onDeliver?: (message: string, target: string) => Promise<void>;
}

interface HeartbeatState {
  lastRunMs: number;
  lastResult: string;
  runCount: number;
}

const REDIS_HEARTBEAT_STATE = 'nexus:heartbeat_state';
const REDIS_HEARTBEAT_LAST_RECIPIENT = 'nexus:heartbeat_last_recipient';

export class HeartbeatRunner {
  private redis: Redis;
  private brain: Brain;
  private toolRegistry: ToolRegistry;
  private workspaceDir: string;
  private onDeliver?: (message: string, target: string) => Promise<void>;

  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private config: HeartbeatConfig;

  constructor(runnerConfig: HeartbeatRunnerConfig) {
    this.redis = runnerConfig.redis;
    this.brain = runnerConfig.brain;
    this.toolRegistry = runnerConfig.toolRegistry;
    this.workspaceDir = runnerConfig.workspaceDir;
    this.onDeliver = runnerConfig.onDeliver;

    // Default config
    this.config = {
      enabled: false,
      intervalMinutes: DEFAULT_HEARTBEAT_INTERVAL_MINUTES,
      prompt: DEFAULT_HEARTBEAT_PROMPT,
      target: 'last',
      ackMaxChars: DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
    };
  }

  /**
   * Update configuration from NexusConfig
   */
  updateConfig(nexusConfig: NexusConfig): void {
    const hb = nexusConfig.heartbeat;
    if (hb) {
      this.config = {
        enabled: hb.enabled ?? false,
        intervalMinutes: hb.intervalMinutes ?? DEFAULT_HEARTBEAT_INTERVAL_MINUTES,
        prompt: DEFAULT_HEARTBEAT_PROMPT,
        target: hb.target ?? 'last',
        activeHours: undefined,
        ackMaxChars: DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
      };
    }

    // Restart if running to apply new interval
    if (this.running) {
      this.stop();
      if (this.config.enabled) {
        this.start();
      }
    }
  }

  /**
   * Start the heartbeat runner
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('HeartbeatRunner: disabled, not starting');
      return;
    }

    if (this.running) {
      logger.warn('HeartbeatRunner: already running');
      return;
    }

    this.running = true;
    const intervalMs = this.config.intervalMinutes * 60 * 1000;

    logger.info('HeartbeatRunner: starting', {
      intervalMinutes: this.config.intervalMinutes,
      target: this.config.target,
    });

    // Schedule periodic execution
    this.timer = setInterval(async () => {
      if (this.running) {
        await this.runOnce();
      }
    }, intervalMs);

    // Run immediately on start (optional - can be disabled)
    // await this.runOnce();
  }

  /**
   * Stop the heartbeat runner
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    logger.info('HeartbeatRunner: stopped');
  }

  /**
   * Run a single heartbeat cycle
   */
  async runOnce(): Promise<{ delivered: boolean; response: string }> {
    logger.info('HeartbeatRunner: starting heartbeat cycle');

    try {
      // Check if within active hours
      if (!this.isWithinActiveHours()) {
        logger.info('HeartbeatRunner: outside active hours, skipping');
        return { delivered: false, response: '' };
      }

      // Check if inbox has pending messages (don't interrupt user interaction)
      const queueSize = await this.redis.llen('nexus:inbox');
      if (queueSize > 0) {
        logger.info('HeartbeatRunner: inbox has pending messages, skipping', { queueSize });
        return { delivered: false, response: '' };
      }

      // Read HEARTBEAT.md
      const heartbeatContent = await this.readHeartbeatFile();

      // Build context with heartbeat content
      let contextMessage = this.config.prompt;
      if (heartbeatContent) {
        contextMessage += `\n\n## HEARTBEAT.md Contents:\n${heartbeatContent}`;
      } else {
        contextMessage += `\n\nNote: No HEARTBEAT.md file found or file is empty.`;
      }

      // Run agent with heartbeat prompt
      const response = await this.executeHeartbeat(contextMessage);

      // Check if response is just HEARTBEAT_OK
      const { shouldSkip, cleanedResponse } = this.processHeartbeatResponse(response);

      if (shouldSkip) {
        logger.info('HeartbeatRunner: HEARTBEAT_OK received, nothing to deliver');
        await this.saveState(response, false);
        return { delivered: false, response };
      }

      // Deliver the response
      if (this.onDeliver && cleanedResponse) {
        const target = await this.resolveDeliveryTarget();
        if (target && target !== 'none') {
          await this.onDeliver(cleanedResponse, target);
          logger.info('HeartbeatRunner: delivered response', {
            target,
            responseLength: cleanedResponse.length
          });
          await this.saveState(cleanedResponse, true);
          return { delivered: true, response: cleanedResponse };
        }
      }

      await this.saveState(response, false);
      return { delivered: false, response };

    } catch (err: any) {
      logger.error('HeartbeatRunner: cycle failed', { error: err.message });
      return { delivered: false, response: '' };
    }
  }

  /**
   * Read HEARTBEAT.md file from workspace
   */
  private async readHeartbeatFile(): Promise<string | null> {
    const heartbeatPath = path.join(this.workspaceDir, 'HEARTBEAT.md');

    try {
      const content = await fs.readFile(heartbeatPath, 'utf-8');

      // Check if effectively empty
      if (this.isContentEffectivelyEmpty(content)) {
        return null;
      }

      return content.trim();
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null;
      }
      logger.error('HeartbeatRunner: failed to read HEARTBEAT.md', { error: err.message });
      return null;
    }
  }

  /**
   * Check if content is effectively empty (only comments/whitespace)
   */
  private isContentEffectivelyEmpty(content: string): boolean {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Skip markdown headers
      if (/^#+(\s|$)/.test(trimmed)) continue;
      // Skip empty list items
      if (/^[-*+]\s*(\[[\sXx]?\]\s*)?$/.test(trimmed)) continue;
      // Found actionable content
      return false;
    }
    return true;
  }

  /**
   * Execute heartbeat via Brain
   */
  private async executeHeartbeat(prompt: string): Promise<string> {
    const systemPrompt = `You are Nexus performing a periodic heartbeat check.

## Heartbeat Protocol

1. Check the HEARTBEAT.md contents (if provided)
2. Determine if any tasks need attention
3. If nothing needs attention, reply with exactly: HEARTBEAT_OK
4. If something needs attention, describe what needs to be done

## Rules

- Be concise - heartbeats run frequently
- Only alert for actionable items
- Don't repeat tasks that were already completed
- HEARTBEAT_OK means "all clear, nothing to report"
`;

    const response = await this.brain.chat({
      systemPrompt,
      messages: [{ role: 'user', text: prompt }],
      maxTokens: 2000,
      tier: 'flash', // Use cheap model for heartbeats
    });

    return response.text || '';
  }

  /**
   * Process heartbeat response, check for HEARTBEAT_OK token
   */
  private processHeartbeatResponse(response: string): {
    shouldSkip: boolean;
    cleanedResponse: string;
  } {
    const trimmed = response.trim();

    if (!trimmed) {
      return { shouldSkip: true, cleanedResponse: '' };
    }

    // Check for HEARTBEAT_OK token
    if (!trimmed.includes(HEARTBEAT_TOKEN)) {
      return { shouldSkip: false, cleanedResponse: trimmed };
    }

    // Strip HEARTBEAT_OK from edges
    let cleaned = trimmed;
    let didStrip = false;

    // Remove from start
    if (cleaned.startsWith(HEARTBEAT_TOKEN)) {
      cleaned = cleaned.slice(HEARTBEAT_TOKEN.length).trim();
      didStrip = true;
    }

    // Remove from end
    if (cleaned.endsWith(HEARTBEAT_TOKEN)) {
      cleaned = cleaned.slice(0, -HEARTBEAT_TOKEN.length).trim();
      didStrip = true;
    }

    // If only HEARTBEAT_OK or very short remaining text, skip delivery
    if (!cleaned || cleaned.length <= this.config.ackMaxChars) {
      return { shouldSkip: true, cleanedResponse: '' };
    }

    return { shouldSkip: false, cleanedResponse: cleaned };
  }

  /**
   * Resolve delivery target (WhatsApp JID)
   */
  private async resolveDeliveryTarget(): Promise<string | null> {
    const target = this.config.target;

    if (target === 'none') {
      return null;
    }

    if (target === 'last') {
      // Get last WhatsApp sender
      const lastRecipient = await this.redis.get(REDIS_HEARTBEAT_LAST_RECIPIENT);
      return lastRecipient || null;
    }

    // Specific target (WhatsApp JID or channel ID)
    return target;
  }

  /**
   * Set the last recipient for 'last' target mode
   */
  async setLastRecipient(jid: string): Promise<void> {
    await this.redis.set(REDIS_HEARTBEAT_LAST_RECIPIENT, jid);
  }

  /**
   * Check if current time is within active hours
   */
  private isWithinActiveHours(): boolean {
    if (!this.config.activeHours) {
      return true; // No restriction
    }

    const { start, end } = this.config.activeHours;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Crosses midnight
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  /**
   * Save heartbeat state to Redis
   */
  private async saveState(result: string, delivered: boolean): Promise<void> {
    const state: HeartbeatState = {
      lastRunMs: Date.now(),
      lastResult: result.slice(0, 500),
      runCount: 0,
    };

    try {
      const existing = await this.redis.get(REDIS_HEARTBEAT_STATE);
      if (existing) {
        const prev = JSON.parse(existing) as HeartbeatState;
        state.runCount = prev.runCount + 1;
      }
      await this.redis.set(REDIS_HEARTBEAT_STATE, JSON.stringify(state));
    } catch (err: any) {
      logger.error('HeartbeatRunner: failed to save state', { error: err.message });
    }
  }

  /**
   * Get current heartbeat state
   */
  async getState(): Promise<HeartbeatState | null> {
    try {
      const data = await this.redis.get(REDIS_HEARTBEAT_STATE);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get next scheduled run time
   */
  getNextRunTime(): Date | null {
    if (!this.running || !this.config.enabled) {
      return null;
    }
    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    return new Date(Date.now() + intervalMs);
  }

  /**
   * Check if runner is active
   */
  isRunning(): boolean {
    return this.running && this.config.enabled;
  }
}

export default HeartbeatRunner;
