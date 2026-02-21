import pc from 'picocolors';
import type { CheckResult } from './checks.js';

// ── Color helpers ────────────────────────────────────────────────

export const success = (text: string): string => pc.green(text);
export const warning = (text: string): string => pc.yellow(text);
export const error = (text: string): string => pc.red(text);
export const info = (text: string): string => pc.cyan(text);
export const dim = (text: string): string => pc.dim(text);

// ── Banner ───────────────────────────────────────────────────────

export function banner(): void {
  console.log('');
  console.log(pc.bold(pc.cyan('  _     _____     _____ _   _ _____ _______   __')));
  console.log(pc.bold(pc.cyan(' | |   |_ _\\ \\   / /_ _| \\ | |_ _|_   _\\ \\ / /')));
  console.log(pc.bold(pc.cyan(' | |    | | \\ \\ / / | ||  \\| || |  | |  \\ V / ')));
  console.log(pc.bold(pc.cyan(' | |___ | |  \\ V /  | || |\\  || |  | |   | |  ')));
  console.log(pc.bold(pc.cyan(' |_____|___|  \\_/  |___|_| \\_|___| |_|   |_|  ')));
  console.log('');
  console.log(dim('  AI-Powered Home Server OS'));
  console.log('');
}

// ── Prerequisite check display ───────────────────────────────────

export function printCheckResults(results: CheckResult[]): void {
  const passed = results.filter(r => r.ok).length;
  const total = results.length;

  console.log(pc.bold('  System Prerequisites'));
  console.log(dim('  ' + '─'.repeat(40)));

  for (const r of results) {
    const icon = r.ok ? success('  ✓') : error('  ✗');
    const name = r.ok ? r.name : pc.bold(r.name);
    const msg = r.ok ? dim(r.message) : warning(r.message);
    console.log(`${icon}  ${name}  ${msg}`);
  }

  console.log('');
  if (passed === total) {
    console.log(success(`  All ${total} checks passed`));
  } else {
    console.log(warning(`  ${passed}/${total} checks passed`));
  }
  console.log('');
}

// ── Table formatting ─────────────────────────────────────────────

export function padRight(str: string, len: number): string {
  // Strip ANSI codes for length calculation
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, len - stripped.length);
  return str + ' '.repeat(padding);
}

export function formatUptime(uptimeMs: number): string {
  const now = Date.now();
  const elapsed = now - uptimeMs;
  if (elapsed < 0) return '—';

  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

export function formatMemory(bytes: number): string {
  const mb = Math.round(bytes / 1024 / 1024);
  return `${mb} MB`;
}
