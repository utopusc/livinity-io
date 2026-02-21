import { execSync } from 'node:child_process';
import type { Command } from 'commander';
import pc from 'picocolors';
import { checkPrerequisites } from '../lib/checks.js';
import {
  banner,
  printCheckResults,
  padRight,
  formatUptime,
  formatMemory,
  success,
  warning,
  error,
  dim,
} from '../lib/ui.js';

// ── PM2 process type (subset of pm2 jlist output) ───────────────

interface PM2Process {
  name: string;
  pm2_env: {
    status: string;
    pm_uptime: number;
    restart_time: number;
  };
  monit: {
    memory: number;
    cpu: number;
  };
}

// ── Expected services ────────────────────────────────────────────

const EXPECTED_SERVICES = [
  'livos',
  'nexus-core',
  'nexus-mcp',
  'nexus-memory',
  'nexus-worker',
];

// ── Status helpers ───────────────────────────────────────────────

function colorStatus(status: string): string {
  switch (status) {
    case 'online':
      return success(status);
    case 'launching':
      return warning(status);
    case 'errored':
    case 'stopped':
      return error(status);
    default:
      return dim(status);
  }
}

function getPM2Processes(): PM2Process[] | null {
  try {
    const raw = execSync('pm2 jlist', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 10_000,
    });
    return JSON.parse(raw) as PM2Process[];
  } catch {
    return null;
  }
}

function printServiceTable(processes: PM2Process[]): void {
  // Column widths
  const COL_NAME = 16;
  const COL_STATUS = 18; // extra for ANSI codes
  const COL_UPTIME = 10;
  const COL_MEM = 10;
  const COL_RESTARTS = 10;

  // Header
  console.log(pc.bold('  PM2 Services'));
  console.log(dim('  ' + '─'.repeat(58)));

  const header =
    '  ' +
    padRight(pc.bold('Name'), COL_NAME) +
    padRight(pc.bold('Status'), COL_STATUS) +
    padRight(pc.bold('Uptime'), COL_UPTIME) +
    padRight(pc.bold('Memory'), COL_MEM) +
    padRight(pc.bold('Restarts'), COL_RESTARTS);
  console.log(header);
  console.log(dim('  ' + '─'.repeat(58)));

  // Build lookup from PM2 processes
  const processMap = new Map<string, PM2Process>();
  for (const p of processes) {
    processMap.set(p.name, p);
  }

  let running = 0;
  const total = EXPECTED_SERVICES.length;

  for (const name of EXPECTED_SERVICES) {
    const proc = processMap.get(name);

    if (proc) {
      const status = proc.pm2_env.status;
      if (status === 'online') running++;

      const row =
        '  ' +
        padRight(name, COL_NAME) +
        padRight(colorStatus(status), COL_STATUS) +
        padRight(status === 'online' ? formatUptime(proc.pm2_env.pm_uptime) : '—', COL_UPTIME) +
        padRight(formatMemory(proc.monit.memory), COL_MEM) +
        padRight(String(proc.pm2_env.restart_time), COL_RESTARTS);
      console.log(row);
    } else {
      const row =
        '  ' +
        padRight(name, COL_NAME) +
        padRight(dim('not found'), COL_STATUS) +
        padRight('—', COL_UPTIME) +
        padRight('—', COL_MEM) +
        padRight('—', COL_RESTARTS);
      console.log(row);
    }
  }

  // Also show any extra PM2 processes not in expected list
  for (const proc of processes) {
    if (!EXPECTED_SERVICES.includes(proc.name)) {
      const status = proc.pm2_env.status;
      if (status === 'online') running++;

      const row =
        '  ' +
        padRight(proc.name, COL_NAME) +
        padRight(colorStatus(status), COL_STATUS) +
        padRight(status === 'online' ? formatUptime(proc.pm2_env.pm_uptime) : '—', COL_UPTIME) +
        padRight(formatMemory(proc.monit.memory), COL_MEM) +
        padRight(String(proc.pm2_env.restart_time), COL_RESTARTS);
      console.log(row);
    }
  }

  console.log('');
  const totalShown = Math.max(total, processes.length);
  if (running === totalShown) {
    console.log(success(`  ${running}/${totalShown} services running`));
  } else {
    console.log(warning(`  ${running}/${totalShown} services running`));
  }
  console.log('');
}

// ── Command registration ─────────────────────────────────────────

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show system health and PM2 service status')
    .action(async () => {
      banner();

      // Run prerequisite checks
      const results = await checkPrerequisites();
      printCheckResults(results);

      // Check PM2 services
      const processes = getPM2Processes();

      if (processes === null) {
        console.log(warning('  PM2 is not available or pm2 jlist failed.'));
        console.log(dim('  Install PM2 with: npm i -g pm2'));
        console.log('');
        return;
      }

      if (processes.length === 0) {
        console.log(dim('  No PM2 processes running.'));
        console.log(dim('  Start services with: pm2 start ecosystem.config.cjs'));
        console.log('');
        return;
      }

      printServiceTable(processes);
    });
}
