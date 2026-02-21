import { readFileSync, existsSync } from 'node:fs';
import { generateApiKey, generateRedisPassword } from './secrets.js';
import type { EnvConfig } from './env-writer.js';

// ── Setup JSON Config ──────────────────────────────────────────

export interface SetupJsonConfig {
  domain: string;
  useHttps?: boolean;

  telegram?: {
    botToken: string;
    dmPolicy?: 'open' | 'pairing';
  };

  discord?: {
    botToken: string;
    applicationId: string;
  };

  voice?: {
    deepgramApiKey: string;
    cartesiaApiKey: string;
  };

  gmail?: {
    clientId: string;
    clientSecret: string;
  };

  paths?: {
    livosBaseDir?: string;
    nexusBaseDir?: string;
  };

  ports?: {
    api?: number;
    mcp?: number;
    memory?: number;
  };
}

// ── Loader ─────────────────────────────────────────────────────

/**
 * Load and validate a setup.json config file.
 * @throws Error if file not found, invalid JSON, or missing required fields.
 */
export function loadConfigFile(filePath: string): SetupJsonConfig {
  if (!existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read config file: ${msg}`);
  }

  let config: SetupJsonConfig;
  try {
    config = JSON.parse(raw) as SetupJsonConfig;
  } catch {
    throw new Error(`Invalid JSON in config file: ${filePath}`);
  }

  // Validate required fields
  if (!config.domain || typeof config.domain !== 'string') {
    throw new Error('Config file must include a "domain" field (string).');
  }

  // Validate optional nested objects
  if (config.telegram) {
    if (!config.telegram.botToken) {
      throw new Error('telegram.botToken is required when telegram is configured.');
    }
  }

  if (config.discord) {
    if (!config.discord.botToken || !config.discord.applicationId) {
      throw new Error('discord.botToken and discord.applicationId are required when discord is configured.');
    }
  }

  if (config.voice) {
    if (!config.voice.deepgramApiKey || !config.voice.cartesiaApiKey) {
      throw new Error('voice.deepgramApiKey and voice.cartesiaApiKey are required when voice is configured.');
    }
  }

  if (config.gmail) {
    if (!config.gmail.clientId || !config.gmail.clientSecret) {
      throw new Error('gmail.clientId and gmail.clientSecret are required when gmail is configured.');
    }
  }

  return config;
}

// ── Converter ──────────────────────────────────────────────────

/**
 * Convert a SetupJsonConfig into an EnvConfig, auto-generating secrets.
 */
export function configFileToEnvConfig(config: SetupJsonConfig): EnvConfig {
  return {
    // Domain
    domain: config.domain,
    useHttps: config.useHttps ?? false,

    // Auto-generated secrets
    jwtSecret: generateApiKey(),
    apiKey: generateApiKey(),
    redisPassword: generateRedisPassword(),

    // Channels
    telegramBotToken: config.telegram?.botToken,
    telegramDmPolicy: config.telegram?.dmPolicy ?? 'pairing',
    discordBotToken: config.discord?.botToken,
    discordApplicationId: config.discord?.applicationId,

    // Voice
    deepgramApiKey: config.voice?.deepgramApiKey,
    cartesiaApiKey: config.voice?.cartesiaApiKey,

    // Gmail
    gmailClientId: config.gmail?.clientId,
    gmailClientSecret: config.gmail?.clientSecret,

    // Paths
    livosBaseDir: config.paths?.livosBaseDir ?? '/opt/livos',
    nexusBaseDir: config.paths?.nexusBaseDir ?? '/opt/nexus',

    // Ports
    apiPort: config.ports?.api ?? 3200,
    mcpPort: config.ports?.mcp ?? 3100,
    memoryPort: config.ports?.memory ?? 3300,
  };
}
