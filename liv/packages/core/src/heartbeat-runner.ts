/**
 * Heartbeat Runner
 * Periodic system health monitoring with direct metrics collection.
 * Sends health reports via configured channels (Telegram, Discord, etc.)
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type Redis from 'ioredis';
import { logger } from './logger.js';
import type { Brain } from './brain.js';
import type { ToolRegistry } from './tool-registry.js';
import type { NexusConfig } from './config/schema.js';

const execAsync = promisify(exec);

export const HEARTBEAT_TOKEN = 'HEARTBEAT_OK';
export const DEFAULT_HEARTBEAT_INTERVAL_MINUTES = 30;
export const DEFAULT_HEARTBEAT_ACK_MAX_CHARS = 300;

export const DEFAULT_HEARTBEAT_PROMPT = `Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK.`;

export interface HeartbeatConfig {
  enabled: boolean;
  intervalMinutes: number;
  prompt: string;
  target: 'last' | 'none' | string;
  to?: string;
  activeHours?: {
    start: string;
    end: string;
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

interface SystemMetrics {
  pm2: { name: string; status: string; restarts: number; uptime: string }[];
  disk: { used: string; total: string; percent: string };
  memory: { used: string; total: string; percent: string };
  load: string;
  redis: boolean;
  uptime: string;
}

const REDIS_HEARTBEAT_STATE = 'liv:heartbeat_state';
const REDIS_HEARTBEAT_LAST_RECIPIENT = 'liv:heartbeat_last_recipient';

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

    this.config = {
      enabled: false,
      intervalMinutes: DEFAULT_HEARTBEAT_INTERVAL_MINUTES,
      prompt: DEFAULT_HEARTBEAT_PROMPT,
      target: 'last',
      ackMaxChars: DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
    };
  }

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

    if (this.running) {
      this.stop();
      if (this.config.enabled) {
        this.start();
      }
    }
  }

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

    this.timer = setInterval(async () => {
      if (this.running) {
        await this.runOnce();
      }
    }, intervalMs);

    // First run after 60s delay (gives daemon time to start)
    setTimeout(() => {
      if (this.running) {
        this.runOnce().catch(err => logger.error('HeartbeatRunner: initial run failed', err));
      }
    }, 60_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    logger.info('HeartbeatRunner: stopped');
  }

  async runOnce(): Promise<{ delivered: boolean; response: string }> {
    logger.info('HeartbeatRunner: starting heartbeat cycle');

    try {
      if (!this.isWithinActiveHours()) {
        logger.info('HeartbeatRunner: outside active hours, skipping');
        return { delivered: false, response: '' };
      }

      // Collect real system metrics (no LLM needed)
      const metrics = await this.collectMetrics();
      const alerts = this.checkAlerts(metrics);
      const report = this.formatReport(metrics, alerts);

      logger.info('HeartbeatRunner: report generated', {
        alerts: alerts.length,
        reportLength: report.length,
      });

      // Deliver the report
      if (this.onDeliver) {
        const target = await this.resolveDeliveryTarget();
        if (target && target !== 'none') {
          await this.onDeliver(report, target);
          logger.info('HeartbeatRunner: delivered', { target, alerts: alerts.length });
          await this.saveState(report, true);
          return { delivered: true, response: report };
        } else {
          logger.warn('HeartbeatRunner: no delivery target');
        }
      }

      await this.saveState(report, false);
      return { delivered: false, response: report };

    } catch (err: any) {
      logger.error('HeartbeatRunner: cycle failed', { error: err.message });
      return { delivered: false, response: '' };
    }
  }

  // ── Metrics Collection ──────────────────────────────────────────────

  private async collectMetrics(): Promise<SystemMetrics> {
    const metrics: SystemMetrics = {
      pm2: [],
      disk: { used: '?', total: '?', percent: '?' },
      memory: { used: '?', total: '?', percent: '?' },
      load: '?',
      redis: false,
      uptime: '?',
    };

    const run = async (cmd: string): Promise<string> => {
      try {
        const { stdout } = await execAsync(cmd, { timeout: 10_000 });
        return stdout.trim();
      } catch {
        return '';
      }
    };

    // Run all commands in parallel
    const [pm2Raw, diskRaw, memRaw, uptimeRaw, redisRaw] = await Promise.all([
      run('pm2 jlist 2>/dev/null'),
      run('df / --output=used,size,pcent | tail -1'),
      run('free -m | grep Mem'),
      run('uptime'),
      run('redis-cli -a "LivRedis2024!" ping 2>/dev/null'),
    ]);

    // Parse PM2
    if (pm2Raw) {
      try {
        const procs = JSON.parse(pm2Raw);
        metrics.pm2 = procs.map((p: any) => ({
          name: p.name,
          status: p.pm2_env?.status || 'unknown',
          restarts: p.pm2_env?.restart_time || 0,
          uptime: this.formatUptime(Date.now() - (p.pm2_env?.pm_uptime || Date.now())),
        }));
      } catch { /* ignore parse errors */ }
    }

    // Parse disk
    if (diskRaw) {
      const parts = diskRaw.trim().split(/\s+/);
      if (parts.length >= 3) {
        const usedKb = parseInt(parts[0]) || 0;
        const totalKb = parseInt(parts[1]) || 0;
        metrics.disk = {
          used: this.formatBytes(usedKb * 1024),
          total: this.formatBytes(totalKb * 1024),
          percent: parts[2]?.trim() || '?',
        };
      }
    }

    // Parse memory
    if (memRaw) {
      const parts = memRaw.split(/\s+/);
      if (parts.length >= 3) {
        const totalMb = parseInt(parts[1]) || 0;
        const usedMb = parseInt(parts[2]) || 0;
        const pct = totalMb > 0 ? Math.round((usedMb / totalMb) * 100) : 0;
        metrics.memory = {
          used: `${usedMb}MB`,
          total: `${totalMb}MB`,
          percent: `${pct}%`,
        };
      }
    }

    // Parse uptime/load
    if (uptimeRaw) {
      const loadMatch = uptimeRaw.match(/load average:\s*(.+)/);
      metrics.load = loadMatch ? loadMatch[1].trim() : '?';
      const upMatch = uptimeRaw.match(/up\s+(.+?),\s+\d+\s+user/);
      metrics.uptime = upMatch ? upMatch[1].trim() : '?';
    }

    // Redis
    metrics.redis = redisRaw === 'PONG';

    return metrics;
  }

  private checkAlerts(m: SystemMetrics): string[] {
    const alerts: string[] = [];

    // PM2 process alerts
    for (const p of m.pm2) {
      if (p.status !== 'online') {
        alerts.push(`⚠️ PM2 "${p.name}" is ${p.status}`);
      }
      if (p.restarts > 100) {
        alerts.push(`⚠️ PM2 "${p.name}" has ${p.restarts} restarts`);
      }
    }

    // Disk alert
    const diskPct = parseInt(m.disk.percent) || 0;
    if (diskPct >= 90) {
      alerts.push(`🔴 Disk at ${m.disk.percent} (CRITICAL)`);
    } else if (diskPct >= 80) {
      alerts.push(`⚠️ Disk at ${m.disk.percent}`);
    }

    // Memory alert
    const memPct = parseInt(m.memory.percent) || 0;
    if (memPct >= 95) {
      alerts.push(`🔴 Memory at ${m.memory.percent} (CRITICAL)`);
    } else if (memPct >= 90) {
      alerts.push(`⚠️ Memory at ${m.memory.percent}`);
    }

    // Redis alert
    if (!m.redis) {
      alerts.push('🔴 Redis not responding');
    }

    return alerts;
  }

  private formatReport(m: SystemMetrics, alerts: string[]): string {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const statusIcon = alerts.length > 0
      ? (alerts.some(a => a.includes('🔴')) ? '🔴' : '⚠️')
      : '✅';

    const onlineCount = m.pm2.filter(p => p.status === 'online').length;
    const errorCount = m.pm2.filter(p => p.status !== 'online').length;

    let report = `${statusIcon} Server Health — ${now} UTC\n`;
    report += `\n`;
    report += `CPU: ${m.load} | Mem: ${m.memory.used}/${m.memory.total} (${m.memory.percent}) | Disk: ${m.disk.percent}\n`;
    report += `PM2: ${onlineCount} online${errorCount > 0 ? `, ${errorCount} down` : ''} | Redis: ${m.redis ? 'OK' : 'DOWN'} | Up: ${m.uptime}\n`;

    if (alerts.length > 0) {
      report += `\nAlerts:\n${alerts.join('\n')}\n`;
    }

    // PM2 process details
    if (m.pm2.length > 0) {
      report += `\nProcesses:\n`;
      for (const p of m.pm2) {
        const icon = p.status === 'online' ? '●' : '○';
        report += `${icon} ${p.name} (${p.uptime}, ${p.restarts}↻)\n`;
      }
    }

    return report.trim();
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private formatUptime(ms: number): string {
    const min = Math.floor(ms / 60000);
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h${min % 60}m`;
    const d = Math.floor(h / 24);
    return `${d}d${h % 24}h`;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  private async readHeartbeatFile(): Promise<string | null> {
    const heartbeatPath = path.join(this.workspaceDir, 'HEARTBEAT.md');
    try {
      const content = await fs.readFile(heartbeatPath, 'utf-8');
      if (this.isContentEffectivelyEmpty(content)) return null;
      return content.trim();
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      logger.error('HeartbeatRunner: failed to read HEARTBEAT.md', { error: err.message });
      return null;
    }
  }

  private isContentEffectivelyEmpty(content: string): boolean {
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^#+(\s|$)/.test(trimmed)) continue;
      if (/^[-*+]\s*(\[[\sXx]?\]\s*)?$/.test(trimmed)) continue;
      return false;
    }
    return true;
  }

  private async resolveDeliveryTarget(): Promise<string | null> {
    const target = this.config.target;
    if (target === 'none') return null;
    if (target === 'last') {
      return await this.redis.get(REDIS_HEARTBEAT_LAST_RECIPIENT) || null;
    }
    return target;
  }

  async setLastRecipient(jid: string): Promise<void> {
    await this.redis.set(REDIS_HEARTBEAT_LAST_RECIPIENT, jid);
  }

  private isWithinActiveHours(): boolean {
    if (!this.config.activeHours) return true;
    const { start, end } = this.config.activeHours;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

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

  async getState(): Promise<HeartbeatState | null> {
    try {
      const data = await this.redis.get(REDIS_HEARTBEAT_STATE);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  getNextRunTime(): Date | null {
    if (!this.running || !this.config.enabled) return null;
    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    return new Date(Date.now() + intervalMs);
  }

  isRunning(): boolean {
    return this.running && this.config.enabled;
  }
}

export default HeartbeatRunner;
