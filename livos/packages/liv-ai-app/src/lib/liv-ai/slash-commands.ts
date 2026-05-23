/**
 * Phase 198-06 — Slash command catalog + parser.
 *
 * Phase 201-04 — Ported 1:1 from livos/packages/ui/src/features/liv-ai/
 *   slash-commands.ts. No path remap (pure module).
 *
 * The 4 locked triggers (per Phase 198-06 must_haves):
 *
 *   /help        — explain the assistant + list available tools
 *   /clear       — start a new thread (UI-handled, no message sent)
 *   /screenshot  — ask the agent to capture the current screen
 *   /search …    — web-search the rest of the input
 */

export interface SlashCommand {
  /** Wire trigger like '/help' — must start with '/'. */
  trigger: string;
  /** Short human-readable label, e.g. shown in slash-popover. */
  label: string;
  /** One-line help string explaining the command. */
  description: string;
  /**
   * Returns the text to insert as a user message, OR `null` to suppress
   * sending (used by /clear which is wired to onSwitchToNewThread by
   * the UI layer).
   */
  transform: (rawInput: string, restArgs: string) => string | null;
}

/**
 * The 4 locked slash commands shipped in Phase 198-06.
 */
export const SLASH_COMMANDS: ReadonlyArray<SlashCommand> = [
  {
    trigger: "/help",
    label: "Help",
    description: "Explain the assistant and list available tools",
    transform: () =>
      "What can you do? List the tools you have access to and give a one-line summary of each.",
  },
  {
    trigger: "/clear",
    label: "New conversation",
    description: "Start a fresh thread",
    // UI handles this — slash parser signals "suppress send" by
    // returning null. The slash adapter calls runtime.threads.switchToNewThread()
    // directly in execute().
    transform: () => null,
  },
  {
    trigger: "/screenshot",
    label: "Take screenshot",
    description: "Capture the current screen via the screenshot tool",
    transform: () => "Take a screenshot of the current screen.",
  },
  {
    trigger: "/search",
    label: "Web search",
    description: "Search the web for the given query",
    transform: (_raw, rest) =>
      rest
        ? `Search the web for: ${rest}`
        : "What would you like to search the web for?",
  },
] as const;

export interface ParsedSlash {
  command: SlashCommand;
  transformedText: string | null;
}

/**
 * Parse a raw composer input string and return the matched
 * SlashCommand + transformed text, or `null` if not recognized.
 */
export function parseSlashCommand(input: string): ParsedSlash | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.split(/\s+/);
  const trigger = parts[0];
  const rest = parts.slice(1);
  const command = SLASH_COMMANDS.find((c) => c.trigger === trigger);
  if (!command) return null;
  const restArgs = rest.join(" ");
  return {
    command,
    transformedText: command.transform(trimmed, restArgs),
  };
}
