/**
 * is-visual-tool.ts — Phase 82 (V32-PANEL-01)
 *
 * Pure helper that decides whether a tool call's result benefits from visual
 * rendering in the side panel, as opposed to a plain text dump.
 *
 * Called by ToolCallPanel to determine auto-open behaviour: the panel slides
 * open automatically only when the latest tool is visual. Non-visual tools
 * (e.g. pure computation, config reads) do not force the panel open.
 *
 * Usage:
 *   import { isVisualTool, shouldAutoOpen } from './lib/is-visual-tool';
 *   isVisualTool('browser_navigate_to') // true
 *   isVisualTool('list_agents')         // false
 */

// P81 has shipped types.ts — we only need the `name` field here so we use
// a local minimal interface to avoid a circular-ish dependency on the full shape.
// If needed, swap to: import type { ToolCallSnapshot } from '../types';
interface MinimalToolCallSnapshot {
  name: string;
}

/**
 * Regex patterns that classify a tool name as "visual" — meaning its result
 * is best rendered with a specialized view (screenshot, diff, terminal output,
 * search results) rather than raw JSON text.
 */
const VISUAL_TOOL_PATTERNS: RegExp[] = [
  /^browser_/,           // browser tools: screenshots, DOM interaction, navigation
  /^web_/,               // web search, web scrape, web crawl
  /^mcp_bytebot_/,       // bytebot computer-use: screenshots, clicks, keyboard
  /^(read|edit|write)_file/, // file operations with diff/content view
  /^(execute|run)_/,     // terminal/command execution with stdout/stderr output
];

/**
 * Returns true if the tool name matches any visual tool pattern.
 *
 * @param name - the raw tool call name from ToolCallSnapshot (e.g. "browser_screenshot")
 */
export function isVisualTool(name: string): boolean {
  if (!name) return false;
  return VISUAL_TOOL_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Memoization hint for parent components: returns true when the LATEST tool
 * call in the list is visual. This is the auto-open trigger — parent's
 * useEffect watches toolCalls and calls shouldAutoOpen() to decide whether to
 * set isOpen=true on the panel.
 *
 * Returns false when toolCalls is empty.
 *
 * @param toolCalls - the current list of ToolCallSnapshot objects
 */
export function shouldAutoOpen(toolCalls: MinimalToolCallSnapshot[]): boolean {
  if (toolCalls.length === 0) return false;
  const latest = toolCalls[toolCalls.length - 1];
  return isVisualTool(latest.name);
}
