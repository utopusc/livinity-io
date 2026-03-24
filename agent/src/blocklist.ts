import fs from 'node:fs';
import path from 'node:path';
import { getCredentialsDir } from './state.js';
import { CONFIG_FILE } from './config.js';

// ---- Types ----

export interface BlocklistEntry {
  pattern: string;
  description: string;
}

export interface BlocklistConfig {
  blocklist: BlocklistEntry[];
}

export interface BlockCheckResult {
  blocked: boolean;
  pattern?: string;
  description?: string;
}

interface CompiledRule {
  pattern: string;
  description: string;
  regex: RegExp;
}

// ---- Default Blocklist ----

export const DEFAULT_BLOCKLIST: BlocklistEntry[] = [
  // Unix dangerous commands
  { pattern: 'rm\\s+-[^\\s]*r[^\\s]*f[^\\s]*\\s+/', description: 'Recursive force delete from root' },
  { pattern: 'rm\\s+-[^\\s]*f[^\\s]*r[^\\s]*\\s+/', description: 'Recursive force delete from root' },
  { pattern: 'mkfs\\.', description: 'Format filesystem' },
  { pattern: 'dd\\s+if=', description: 'Raw disk write' },
  { pattern: ':\\(\\)\\{\\s*:\\|:\\&\\s*\\};:', description: 'Fork bomb' },
  { pattern: '>(\\s*)/dev/sda', description: 'Write to raw disk device' },
  { pattern: 'chmod\\s+-R\\s+777\\s+/', description: 'Recursive chmod 777 on root' },
  { pattern: 'chown\\s+-R\\s+.*\\s+/', description: 'Recursive chown on root' },
  // Shutdown/reboot (standalone commands, not substrings)
  { pattern: '(?:^|[;&|]\\s*)shutdown(?:\\s|$)', description: 'System shutdown' },
  { pattern: '(?:^|[;&|]\\s*)reboot(?:\\s|$)', description: 'System reboot' },
  { pattern: '(?:^|[;&|]\\s*)halt(?:\\s|$)', description: 'System halt' },
  { pattern: '(?:^|[;&|]\\s*)poweroff(?:\\s|$)', description: 'System poweroff' },
  { pattern: '(?:^|[;&|]\\s*)init\\s+0', description: 'Init runlevel 0 (shutdown)' },
  // Windows dangerous commands
  { pattern: 'format\\s+[a-zA-Z]:', description: 'Format drive' },
  { pattern: 'del\\s+/[sS]\\s+/[qQ]\\s+[cC]:\\\\', description: 'Recursive silent delete C drive' },
  { pattern: 'reg\\s+delete\\s+.*HKLM', description: 'Registry delete HKLM' },
  { pattern: 'reg\\s+delete\\s+.*HKEY_LOCAL_MACHINE', description: 'Registry delete HKEY_LOCAL_MACHINE' },
  { pattern: 'Remove-Item\\s+-Recurse\\s+-Force\\s+[Cc]:\\\\', description: 'PowerShell recursive force delete C drive' },
  { pattern: 'Stop-Computer', description: 'PowerShell shutdown' },
  { pattern: 'Restart-Computer', description: 'PowerShell restart' },
];

// ---- Cache ----

let cachedRules: CompiledRule[] | null = null;
let cachedMtime: number = 0;

// ---- Load Blocklist ----

function compileRules(entries: BlocklistEntry[]): CompiledRule[] {
  return entries.map((entry) => ({
    pattern: entry.pattern,
    description: entry.description,
    regex: new RegExp(entry.pattern, 'i'),
  }));
}

export function loadBlocklist(): CompiledRule[] {
  const configPath = path.join(getCredentialsDir(), CONFIG_FILE);

  // Check if config file exists
  let currentMtime = 0;
  try {
    const stat = fs.statSync(configPath);
    currentMtime = stat.mtimeMs;
  } catch {
    // Config file does not exist — use defaults
    if (!cachedRules || cachedMtime !== 0) {
      cachedRules = compileRules(DEFAULT_BLOCKLIST);
      cachedMtime = 0;
    }
    return cachedRules;
  }

  // Return cache if mtime unchanged
  if (cachedRules && cachedMtime === currentMtime) {
    return cachedRules;
  }

  // Read and parse config file
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as Partial<BlocklistConfig>;

    if (Array.isArray(config.blocklist) && config.blocklist.length > 0) {
      cachedRules = compileRules(config.blocklist);
      cachedMtime = currentMtime;
      return cachedRules;
    }
  } catch {
    console.warn('[blocklist] Failed to parse config file, using default blocklist');
  }

  // Fallback to defaults
  cachedRules = compileRules(DEFAULT_BLOCKLIST);
  cachedMtime = currentMtime;
  return cachedRules;
}

// ---- Check Command ----

export function isCommandBlocked(command: string): BlockCheckResult {
  const rules = loadBlocklist();

  for (const rule of rules) {
    if (rule.regex.test(command)) {
      return { blocked: true, pattern: rule.pattern, description: rule.description };
    }
  }

  return { blocked: false };
}
