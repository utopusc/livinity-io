import fs from 'node:fs';
import path from 'node:path';
import { getCredentialsDir } from './state.js';

// ---- Types ----

export interface AuditEntry {
  timestamp: string;
  toolName: string;
  params: Record<string, unknown>;
  success: boolean;
  duration: number;
  error?: string;
  // Computer use detail fields (SEC-03)
  coordinates?: { x: number; y: number };
  text?: string;
  key?: string;
}

// ---- Constants ----

export const AUDIT_LOG_FILE = 'audit.log';

// ---- Functions ----

/**
 * Truncate params for audit logging.
 * - Omits `content` field (file writes can be huge)
 * - Truncates any value whose JSON serialization exceeds 500 chars
 */
export function truncateParams(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (key === 'content') {
      result[key] = '[file content omitted]';
      continue;
    }

    try {
      const serialized = JSON.stringify(value);
      if (serialized.length > 500) {
        result[key] = `[truncated, ${serialized.length} chars]`;
      } else {
        result[key] = value;
      }
    } catch {
      result[key] = '[unserializable]';
    }
  }

  return result;
}

/**
 * Append an audit entry to the local JSON-lines audit log.
 * Never throws -- audit failure must not break tool execution.
 */
export async function appendAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const auditPath = path.join(getCredentialsDir(), AUDIT_LOG_FILE);
    await fs.promises.appendFile(auditPath, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // Silently ignore -- audit failure must not break tool execution
  }
}
