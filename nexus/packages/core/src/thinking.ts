/**
 * Thinking and verbosity levels for AI responses.
 * Inspired by OpenClaw's thinking system.
 */

export type ThinkLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type VerboseLevel = 'off' | 'on' | 'full';
export type ReasoningLevel = 'off' | 'on' | 'stream';
export type ResponseStyle = 'detailed' | 'concise' | 'direct';

/** Response style configuration */
export interface ResponseConfig {
  style?: ResponseStyle;
  showSteps?: boolean;
  showReasoning?: boolean;
  language?: string;
  maxLength?: number;
}

/**
 * Default thinking level per model tier
 */
export const TIER_THINKING_DEFAULTS: Record<string, ThinkLevel> = {
  flash: 'minimal',
  haiku: 'low',
  sonnet: 'medium',
  opus: 'high',
};

/**
 * Thinking level descriptions for user-facing help
 */
export const THINKING_DESCRIPTIONS: Record<ThinkLevel, string> = {
  off: 'Thinking disabled - fast, short responses',
  minimal: 'Minimal thinking - for simple tasks',
  low: 'Low thinking - standard tasks',
  medium: 'Medium thinking - multi-step tasks',
  high: 'High thinking - complex analysis',
  xhigh: 'Maximum thinking - deep research',
};

/**
 * Verbose level descriptions
 */
export const VERBOSE_DESCRIPTIONS: Record<VerboseLevel, string> = {
  off: 'Silent mode - result only',
  on: 'Normal mode - result + summary',
  full: 'Full detail - all steps + thoughts',
};

/**
 * Normalize user-provided thinking level strings to canonical enum.
 */
export function normalizeThinkLevel(raw?: string | null): ThinkLevel | undefined {
  if (!raw) return undefined;

  const key = raw.toLowerCase().trim();

  // Turkish aliases
  if (['kapat', 'kapali', 'kapalı', 'hayir', 'hayır', 'off'].includes(key)) {
    return 'off';
  }
  if (['ac', 'aç', 'evet', 'on', 'enable', 'enabled'].includes(key)) {
    return 'low';
  }
  if (['min', 'minimal', 'az', 'düşük', 'dusuk'].includes(key)) {
    return 'minimal';
  }
  if (['low', 'düsük', 'basit'].includes(key)) {
    return 'low';
  }
  if (['mid', 'med', 'medium', 'orta', 'normal'].includes(key)) {
    return 'medium';
  }
  if (['high', 'yüksek', 'yuksek', 'derin', 'ultra'].includes(key)) {
    return 'high';
  }
  if (['xhigh', 'x-high', 'max', 'maksimum', 'tam'].includes(key)) {
    return 'xhigh';
  }
  if (['think', 'düşün', 'dusun'].includes(key)) {
    return 'minimal';
  }

  return undefined;
}

/**
 * Normalize verbose level strings to canonical enum.
 */
export function normalizeVerboseLevel(raw?: string | null): VerboseLevel | undefined {
  if (!raw) return undefined;

  const key = raw.toLowerCase().trim();

  if (['off', 'kapat', 'kapali', 'kapalı', 'hayir', 'hayır', 'false', 'no', '0'].includes(key)) {
    return 'off';
  }
  if (['full', 'tam', 'hepsi', 'all', 'everything', 'detay', 'detayli', 'detaylı'].includes(key)) {
    return 'full';
  }
  if (['on', 'ac', 'aç', 'evet', 'true', 'yes', '1', 'minimal'].includes(key)) {
    return 'on';
  }

  return undefined;
}

/**
 * Get thinking level prompt modifier.
 * This gets injected into the system prompt to guide AI behavior.
 */
export function getThinkingPromptModifier(level: ThinkLevel): string {
  switch (level) {
    case 'off':
      return `\n## Response Style: FAST
Thinking disabled. Give short, direct responses. Don't explain, just state the result.`;

    case 'minimal':
      return `\n## Response Style: MINIMAL
Very brief thinking. Explain your reasoning in 1 sentence in the "thought" field.`;

    case 'low':
      return `\n## Response Style: STANDARD
Normal thinking. Briefly explain each step.`;

    case 'medium':
      return `\n## Response Style: MEDIUM
Detailed thinking. Evaluate alternatives, choose the best approach.`;

    case 'high':
      return `\n## Response Style: DEEP
Comprehensive thinking. Evaluate every possibility, analyze trade-offs, determine the best strategy.`;

    case 'xhigh':
      return `\n## Response Style: MAXIMUM
Deepest thinking level. Analyze the problem from multiple angles:
- List alternative approaches
- Evaluate pros/cons of each
- Identify potential risks
- Consider long-term consequences
- Choose the optimal solution with justification`;
  }
}

/**
 * Get verbose level prompt modifier.
 */
export function getVerbosePromptModifier(level: VerboseLevel): string {
  switch (level) {
    case 'off':
      return `\n## Output Detail: SILENT
Only report the result. Don't share your thought process, steps, or explanations.`;

    case 'on':
      return `\n## Output Detail: NORMAL
Share the result and a brief summary. Don't explain intermediate steps in detail.`;

    case 'full':
      return `\n## Output Detail: FULL
Share everything in detail:
- Explain what you're doing at each step
- Show tool outputs
- Share your thought process
- Mention alternatives and why you didn't choose them`;
  }
}

/**
 * List available thinking levels.
 */
export function listThinkingLevels(): ThinkLevel[] {
  return ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
}

/**
 * Format thinking levels for display.
 */
export function formatThinkingLevels(separator = ' | '): string {
  return listThinkingLevels().join(separator);
}

/**
 * Format verbose levels for display.
 */
export function formatVerboseLevels(separator = ' | '): string {
  return ['off', 'on', 'full'].join(separator);
}

/**
 * Get response style prompt modifier.
 * This gets injected into the system prompt to guide output format.
 */
export function getResponseStylePromptModifier(config: ResponseConfig): string {
  if (!config || (!config.style && config.showSteps === undefined && config.showReasoning === undefined && !config.language)) {
    return ''; // No modifications needed
  }

  let modifier = '\n## Response Format Preferences';

  // Style-based instructions
  switch (config.style) {
    case 'direct':
      modifier += `\n- Give ONLY the result. No explanations, no steps, no reasoning. Just the answer.`;
      break;
    case 'concise':
      modifier += `\n- Be brief. Give the result with a short summary. Skip detailed explanations.`;
      break;
    case 'detailed':
    default:
      // Detailed is default, no extra instruction needed unless overridden
      break;
  }

  // Step-by-step control
  if (config.showSteps === false) {
    modifier += `\n- DO NOT show step-by-step breakdowns (Step 1, Step 2, etc.). Give the final result directly.`;
  }

  // Reasoning control
  if (config.showReasoning === false) {
    modifier += `\n- DO NOT explain your reasoning or thought process. Just provide the answer.`;
  }

  // Language preference
  if (config.language && config.language !== 'auto') {
    const languageMap: Record<string, string> = {
      'en': 'English',
      'tr': 'Turkish (Türkçe)',
      'de': 'German (Deutsch)',
      'fr': 'French (Français)',
      'es': 'Spanish (Español)',
    };
    const langName = languageMap[config.language] || config.language;
    modifier += `\n- Respond in ${langName}.`;
  }

  // Max length hint
  if (config.maxLength) {
    modifier += `\n- Keep your response under ${config.maxLength} characters when possible.`;
  }

  return modifier;
}
