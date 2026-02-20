/**
 * Chat Command Handler
 * Handles slash commands like /think, /verbose, /model, /help, /reset, /new, /compact, /activation
 * Works identically across Telegram, Discord, and WhatsApp.
 */

import { logger } from './logger.js';
import type { UserSessionManager } from './user-session.js';
import type { SessionManager } from './session-manager.js';
import type Redis from 'ioredis';
import {
  normalizeThinkLevel,
  normalizeVerboseLevel,
  formatThinkingLevels,
  formatVerboseLevels,
  THINKING_DESCRIPTIONS,
  VERBOSE_DESCRIPTIONS,
  type ThinkLevel,
  type VerboseLevel,
} from './thinking.js';
import type { ModelTier } from './brain.js';
import type { UsageTracker } from './usage-tracker.js';

export interface CommandContext {
  jid: string;
  userSession: UserSessionManager;
  currentThink?: ThinkLevel;
  currentVerbose?: VerboseLevel;
  currentModel?: ModelTier;
  /** Session manager for conversation session reset (/new) */
  sessionManager?: SessionManager;
  /** Channel/chat ID for activation mode (/activation) */
  channelId?: string;
  /** Redis instance for reading/writing activation settings */
  redis?: Redis;
  /** Usage tracker for /usage command */
  usageTracker?: UsageTracker;
}

export interface CommandResult {
  handled: boolean;
  response?: string;
  thinkLevel?: ThinkLevel;
  verboseLevel?: VerboseLevel;
  modelTier?: ModelTier;
}

/**
 * Parse and handle slash commands from WhatsApp messages.
 * Returns null if the message is not a command.
 */
export async function handleCommand(
  message: string,
  ctx: CommandContext
): Promise<CommandResult | null> {
  const trimmed = message.trim();

  // Must start with / or !
  if (!trimmed.startsWith('/') && !trimmed.startsWith('!')) {
    return null;
  }

  // Remove prefix and parse command
  const content = trimmed.slice(1);
  const parts = content.split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  logger.info('Command: received', { jid: ctx.jid, command, args });

  switch (command) {
    case 'help':
    case 'yardim':
    case 'yardım':
      return handleHelp(ctx);

    case 'think':
    case 'dusun':
    case 'düşün':
    case 'thinking':
      return handleThink(args, ctx);

    case 'verbose':
    case 'detay':
    case 'detayli':
    case 'detaylı':
      return handleVerbose(args, ctx);

    case 'model':
    case 'tier':
      return handleModel(args, ctx);

    case 'reset':
    case 'sifirla':
    case 'sıfırla':
      return handleReset(ctx);

    case 'new':
    case 'yeni':
      return handleNew(args, ctx);

    case 'compact':
    case 'sikistir':
    case 'sıkıştır':
      return handleCompact();

    case 'activation':
    case 'aktivasyon':
      return handleActivation(args, ctx);

    case 'status':
    case 'durum':
      return handleStatus(ctx);

    case 'stats':
    case 'istatistik':
      return handleStats(ctx);

    default:
      // Not a recognized command, let it pass to the agent
      return null;
  }
}

async function handleHelp(ctx: CommandContext): Promise<CommandResult> {
  const response = `🤖 *Nexus Commands*

*Thinking Level*
\`/think <level>\`
Levels: ${formatThinkingLevels()}
• off - Fast response, no thinking
• minimal - Very brief thinking
• low - Standard thinking
• medium - Detailed thinking
• high - Deep analysis
• xhigh - Maximum thinking

*Verbose Level*
\`/verbose <level>\`
Levels: ${formatVerboseLevels()}
• off - Result only
• on - Result + summary
• full - All details

*Model Selection*
\`/model <tier>\`
Tiers: flash | haiku | sonnet | opus
• flash - Fastest, simple tasks
• haiku - Light tasks
• sonnet - Balanced (default)
• opus - Most powerful, complex tasks

*Session*
\`/new [model]\` - Start a new conversation (optionally switch model)
\`/compact\` - Compact conversation context (coming soon)

*Group Settings*
\`/activation [mention|always]\` - Set group trigger mode

*Other*
\`/status\` - Show current settings
\`/reset\` - Reset all preferences
\`/stats\` - Usage statistics

💡 Examples: \`/think high\`, \`/verbose full\`, \`/new opus\``;

  return { handled: true, response };
}

async function handleThink(args: string[], ctx: CommandContext): Promise<CommandResult> {
  if (args.length === 0) {
    // Show current level
    const current = ctx.currentThink || 'medium';
    const desc = THINKING_DESCRIPTIONS[current];
    const response = `🧠 *Thinking Level*

Current: *${current}* - ${desc}

To change: \`/think <level>\`
Levels: ${formatThinkingLevels()}`;

    return { handled: true, response };
  }

  const level = normalizeThinkLevel(args[0]);
  if (!level) {
    return {
      handled: true,
      response: `❌ Invalid level: "${args[0]}"\n\nValid levels: ${formatThinkingLevels()}`,
    };
  }

  await ctx.userSession.setThinkLevel(ctx.jid, level);
  const desc = THINKING_DESCRIPTIONS[level];

  return {
    handled: true,
    response: `✅ Thinking level: *${level}*\n${desc}`,
    thinkLevel: level,
  };
}

async function handleVerbose(args: string[], ctx: CommandContext): Promise<CommandResult> {
  if (args.length === 0) {
    const current = ctx.currentVerbose || 'on';
    const desc = VERBOSE_DESCRIPTIONS[current];
    const response = `📝 *Verbose Level*

Current: *${current}* - ${desc}

To change: \`/verbose <level>\`
Levels: ${formatVerboseLevels()}`;

    return { handled: true, response };
  }

  const level = normalizeVerboseLevel(args[0]);
  if (!level) {
    return {
      handled: true,
      response: `❌ Invalid level: "${args[0]}"\n\nValid levels: ${formatVerboseLevels()}`,
    };
  }

  await ctx.userSession.setVerboseLevel(ctx.jid, level);
  const desc = VERBOSE_DESCRIPTIONS[level];

  return {
    handled: true,
    response: `✅ Verbose level: *${level}*\n${desc}`,
    verboseLevel: level,
  };
}

async function handleModel(args: string[], ctx: CommandContext): Promise<CommandResult> {
  const validTiers: ModelTier[] = ['flash', 'haiku', 'sonnet', 'opus'];
  const tierDescriptions: Record<ModelTier, string> = {
    none: 'AI disabled',
    flash: 'Fastest - for simple tasks',
    haiku: 'Light - for short responses',
    sonnet: 'Balanced - general use (default)',
    opus: 'Most powerful - for complex analysis',
  };

  if (args.length === 0) {
    const current = ctx.currentModel || 'sonnet';
    const desc = tierDescriptions[current];
    const response = `🎯 *Model Tier*

Current: *${current}* - ${desc}

To change: \`/model <tier>\`
Tiers: flash | haiku | sonnet | opus`;

    return { handled: true, response };
  }

  const tier = args[0].toLowerCase() as ModelTier;
  if (!validTiers.includes(tier)) {
    return {
      handled: true,
      response: `❌ Invalid tier: "${args[0]}"\n\nValid tiers: ${validTiers.join(' | ')}`,
    };
  }

  await ctx.userSession.setModelTier(ctx.jid, tier);
  const desc = tierDescriptions[tier];

  return {
    handled: true,
    response: `✅ Model tier: *${tier}*\n${desc}`,
    modelTier: tier,
  };
}

async function handleNew(args: string[], ctx: CommandContext): Promise<CommandResult> {
  const validTiers: ModelTier[] = ['flash', 'haiku', 'sonnet', 'opus'];
  const tierDescriptions: Record<ModelTier, string> = {
    none: 'AI disabled',
    flash: 'Fastest - for simple tasks',
    haiku: 'Light - for short responses',
    sonnet: 'Balanced - general use (default)',
    opus: 'Most powerful - for complex analysis',
  };

  // Reset conversation session if session manager is available
  if (ctx.sessionManager) {
    await ctx.sessionManager.resetSession(ctx.jid);
  }

  // Reset user preferences to defaults
  await ctx.userSession.reset(ctx.jid);

  // Optionally switch model tier
  let newTier: ModelTier = 'sonnet';
  if (args.length > 0) {
    const requestedTier = args[0].toLowerCase() as ModelTier;
    if (validTiers.includes(requestedTier)) {
      newTier = requestedTier;
      await ctx.userSession.setModelTier(ctx.jid, newTier);
    } else {
      return {
        handled: true,
        response: `❌ Invalid model tier: "${args[0]}"\n\nValid tiers: ${validTiers.join(' | ')}\n\nSession was still reset with default model (sonnet).`,
        modelTier: 'sonnet',
      };
    }
  }

  const desc = tierDescriptions[newTier];
  return {
    handled: true,
    response: `🆕 New conversation started!\n\nModel: *${newTier}* - ${desc}\n\nAll settings reset. Context cleared.`,
    modelTier: newTier,
    thinkLevel: 'medium',
    verboseLevel: 'on',
  };
}

async function handleCompact(): Promise<CommandResult> {
  return {
    handled: true,
    response: `📦 *Compact*\n\nContext compaction will be available in a future update.\n\nFor now, use \`/new\` to start a fresh conversation.`,
  };
}

const ACTIVATION_REDIS_PREFIX = 'nexus:activation:';

async function handleActivation(args: string[], ctx: CommandContext): Promise<CommandResult> {
  if (!ctx.redis) {
    return {
      handled: true,
      response: `❌ Activation mode is not available (no Redis connection).`,
    };
  }

  if (!ctx.channelId) {
    return {
      handled: true,
      response: `❌ Activation mode is only available in group chats.`,
    };
  }

  const redisKey = `${ACTIVATION_REDIS_PREFIX}${ctx.channelId}`;
  const validModes = ['mention', 'always'];

  if (args.length === 0) {
    // Show current mode
    const current = await ctx.redis.get(redisKey) || 'mention';
    return {
      handled: true,
      response: `📡 *Activation Mode*\n\nCurrent: *${current}*\n\n• \`mention\` - Only respond when @mentioned (default)\n• \`always\` - Respond to all messages in group\n\nTo change: \`/activation <mode>\``,
    };
  }

  const mode = args[0].toLowerCase();
  if (!validModes.includes(mode)) {
    return {
      handled: true,
      response: `❌ Invalid mode: "${args[0]}"\n\nValid modes: mention | always`,
    };
  }

  if (mode === 'mention') {
    // Default mode — remove key
    await ctx.redis.del(redisKey);
  } else {
    await ctx.redis.set(redisKey, mode);
  }

  const modeDesc = mode === 'always'
    ? 'Responding to all messages in this group'
    : 'Only responding when @mentioned';

  return {
    handled: true,
    response: `✅ Activation mode: *${mode}*\n${modeDesc}`,
  };
}

async function handleReset(ctx: CommandContext): Promise<CommandResult> {
  await ctx.userSession.reset(ctx.jid);

  return {
    handled: true,
    response: `🔄 Settings reset!

New values:
• Thinking: medium
• Verbose: on
• Model: sonnet

All preferences restored to defaults.`,
    thinkLevel: 'medium',
    verboseLevel: 'on',
    modelTier: 'sonnet',
  };
}

async function handleStatus(ctx: CommandContext): Promise<CommandResult> {
  const session = await ctx.userSession.get(ctx.jid);

  const thinkLevel = session.thinkLevel || 'medium';
  const verboseLevel = session.verboseLevel || 'on';
  const modelTier = session.modelTier || 'sonnet';

  const response = `📊 *Current Settings*

🧠 Thinking: *${thinkLevel}* - ${THINKING_DESCRIPTIONS[thinkLevel]}
📝 Verbose: *${verboseLevel}* - ${VERBOSE_DESCRIPTIONS[verboseLevel]}
🎯 Model: *${modelTier}*

📈 *Usage*
• Message count: ${session.messageCount || 0}
• Total tokens: ${(session.totalTokens || 0).toLocaleString()}
• Last seen: ${session.lastSeen ? new Date(session.lastSeen).toLocaleString('en-US') : 'Unknown'}`;

  return { handled: true, response };
}

async function handleStats(ctx: CommandContext): Promise<CommandResult> {
  const stats = await ctx.userSession.getStats();

  const response = `📊 *Nexus Statistics*

👥 Total users: ${stats.totalUsers}
🟢 Active today: ${stats.activeToday}
💬 Total messages: ${stats.totalMessages.toLocaleString()}
🎫 Total tokens: ${stats.totalTokens.toLocaleString()}`;

  return { handled: true, response };
}

/**
 * Check if a message is a slash command.
 */
export function isCommand(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.startsWith('/') || trimmed.startsWith('!');
}

/**
 * List all available commands.
 */
export function listCommands(): string[] {
  return [
    '/help',
    '/think',
    '/verbose',
    '/model',
    '/new',
    '/compact',
    '/activation',
    '/status',
    '/reset',
    '/stats',
  ];
}
