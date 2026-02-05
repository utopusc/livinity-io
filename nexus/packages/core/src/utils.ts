/**
 * Utility functions for Nexus core.
 */

const WA_CHUNK_SIZE = 3800;

/**
 * Split long text into WhatsApp-friendly chunks (~3800 chars each).
 * Breaks on newline boundaries to avoid splitting mid-sentence.
 */
export function chunkForWhatsApp(text: string): string[] {
  if (text.length <= WA_CHUNK_SIZE) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= WA_CHUNK_SIZE) {
      chunks.push(remaining);
      break;
    }

    // Find the last newline within the chunk size limit
    let breakPoint = remaining.lastIndexOf('\n', WA_CHUNK_SIZE);

    // If no newline found, try breaking at a space
    if (breakPoint <= 0) {
      breakPoint = remaining.lastIndexOf(' ', WA_CHUNK_SIZE);
    }

    // If still no good break point, hard cut at chunk size
    if (breakPoint <= 0) {
      breakPoint = WA_CHUNK_SIZE;
    }

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return chunks;
}

/**
 * Format a date for memory entries (ISO date without time).
 */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Build a "LEARNED" memory entry for successful task completion.
 */
export function buildLearnedEntry(task: string, approach: string, tools: string[], skillName: string): string {
  return `LEARNED: ${task}
APPROACH: ${approach}
TOOLS: ${tools.join(', ')}
SKILL: ${skillName}
DATE: ${todayISO()}`;
}

/**
 * Build a "FAILED" memory entry for task failures.
 */
export function buildFailedEntry(task: string, approach: string, reason: string, skillName: string): string {
  return `FAILED: ${task}
APPROACH: ${approach}
FAILURE: ${reason}
SKILL: ${skillName}
DATE: ${todayISO()}`;
}
