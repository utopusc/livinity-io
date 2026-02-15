import type Redis from 'ioredis';

// ─────────────────────────────────────────────────────────────────────────────
// Channel Types
// ─────────────────────────────────────────────────────────────────────────────

export type ChannelId = 'telegram' | 'discord' | 'slack' | 'matrix';

export interface ChannelConfig {
  enabled: boolean;
  token?: string;
  /** Slack app-level token for Socket Mode (xapp-...) */
  appToken?: string;
  /** Matrix homeserver URL */
  homeserverUrl?: string;
  /** Matrix room ID */
  roomId?: string;
}

export interface ChannelStatus {
  enabled: boolean;
  connected: boolean;
  error?: string;
  lastConnect?: string;
  lastMessage?: string;
  botName?: string;
  botId?: string;
}

export interface IncomingMessage {
  channel: ChannelId;
  chatId: string;
  userId: string;
  userName?: string;
  text: string;
  timestamp: number;
  replyToMessageId?: string;
  isGroup?: boolean;
  groupName?: string;
}

export interface OutgoingMessage {
  channel: ChannelId;
  chatId: string;
  text: string;
  replyToMessageId?: string;
}

export interface ChannelProvider {
  readonly id: ChannelId;
  readonly name: string;

  /** Initialize the provider with Redis */
  init(redis: Redis): Promise<void>;

  /** Connect to the channel service */
  connect(): Promise<void>;

  /** Disconnect from the channel service */
  disconnect(): Promise<void>;

  /** Get current connection status */
  getStatus(): Promise<ChannelStatus>;

  /** Send a message */
  sendMessage(chatId: string, text: string, replyTo?: string): Promise<boolean>;

  /** Set message handler */
  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void;

  /** Update configuration */
  updateConfig(config: ChannelConfig): Promise<void>;

  /** Test connection with current config */
  testConnection(): Promise<{ ok: boolean; error?: string; botName?: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel Metadata
// ─────────────────────────────────────────────────────────────────────────────

export const CHANNEL_META: Record<ChannelId, { name: string; color: string; textLimit: number }> = {
  telegram: { name: 'Telegram', color: '#0088cc', textLimit: 4096 },
  discord: { name: 'Discord', color: '#5865F2', textLimit: 2000 },
  slack: { name: 'Slack', color: '#4A154B', textLimit: 4000 },
  matrix: { name: 'Matrix', color: '#0DBD8B', textLimit: 65536 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/** Chunk text for channel-specific limits */
export function chunkText(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    // Try to break at newline
    let breakPoint = remaining.lastIndexOf('\n', limit);
    if (breakPoint < limit * 0.5) {
      // Try to break at space
      breakPoint = remaining.lastIndexOf(' ', limit);
    }
    if (breakPoint < limit * 0.3) {
      // Hard break
      breakPoint = limit;
    }

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return chunks;
}

/** Get Redis key prefix for a channel */
export function getRedisPrefix(channel: ChannelId): string {
  return `nexus:${channel}`;
}
