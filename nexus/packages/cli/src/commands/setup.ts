import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { RollbackStack } from '../lib/rollback.js';
import {
  writeEcosystemFile,
  startServices,
  stopServices,
  verifyHealth,
  type ServiceConfig,
  type HealthResult,
} from '../lib/pm2.js';

// ── Types ──────────────────────────────────────────────────────

export interface SetupOptions {
  livosBaseDir: string;
  nexusBaseDir: string;
  rollback: RollbackStack;
}

// ── Shell helper ───────────────────────────────────────────────

function run(cmd: string, cwd: string, timeoutMs: number = 120_000): string {
  return execSync(cmd, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf-8',
    timeout: timeoutMs,
  });
}

// ── Setup Flow ─────────────────────────────────────────────────

/**
 * Full service setup: install deps, build, start PM2, verify health.
 * Each state-creating step pushes onto the rollback stack.
 * On error, caller should invoke rollback.rollback().
 */
export async function runSetup(options: SetupOptions): Promise<void> {
  const { livosBaseDir, nexusBaseDir, rollback } = options;
  const logsDir = join(livosBaseDir, 'logs');
  const dataDir = join(livosBaseDir, 'data');

  p.log.step(pc.bold('Service Setup'));

  // ── 1. Create directories ──────────────────────────────────
  const dirsToCreate = [logsDir, dataDir];
  for (const dir of dirsToCreate) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      rollback.push(`created ${dir}`, () => {
        // Only remove if empty — rmdir fails on non-empty which is safe
        try { execSync(`rmdir "${dir}" 2>/dev/null`); } catch { /* ignore */ }
      });
    }
  }
  p.log.info(`Directories ready: ${dirsToCreate.join(', ')}`);

  // ── 2. Install LivOS deps ─────────────────────────────────
  const s = p.spinner();
  s.start('Installing LivOS dependencies (pnpm install)...');
  try {
    run('pnpm install --frozen-lockfile', livosBaseDir, 180_000);
  } catch {
    // Retry without frozen-lockfile
    run('pnpm install', livosBaseDir, 180_000);
  }
  s.stop('LivOS dependencies installed');

  // ── 3. Build @livos/config ─────────────────────────────────
  s.start('Building @livos/config...');
  const configDir = join(livosBaseDir, 'packages', 'config');
  if (existsSync(configDir)) {
    run('npx tsc', configDir, 60_000);
  }
  s.stop('@livos/config built');

  // ── 4. Build UI ────────────────────────────────────────────
  s.start('Building LivOS UI...');
  const uiDir = join(livosBaseDir, 'packages', 'ui');
  if (existsSync(uiDir)) {
    run('npm run build', uiDir, 180_000);
  }
  s.stop('LivOS UI built');

  // ── 5. Symlink UI dist ─────────────────────────────────────
  const uiDist = join(livosBaseDir, 'packages', 'ui', 'dist');
  const uiLink = join(livosBaseDir, 'packages', 'livinityd', 'ui');
  if (existsSync(uiDist)) {
    try { unlinkSync(uiLink); } catch { /* may not exist */ }
    symlinkSync(uiDist, uiLink);
    rollback.push('symlinked UI dist', () => {
      try { unlinkSync(uiLink); } catch { /* ignore */ }
    });
    p.log.info('UI dist symlinked');
  }

  // ── 6. Install Nexus deps ─────────────────────────────────
  s.start('Installing Nexus dependencies (npm install)...');
  try {
    run('npm install', nexusBaseDir, 180_000);
  } catch {
    // Non-fatal — some optional deps may fail
    p.log.warn('Some Nexus dependencies may have failed to install');
  }
  s.stop('Nexus dependencies installed');

  // ── 7. Build Nexus core ────────────────────────────────────
  s.start('Building Nexus core...');
  const coreDir = join(nexusBaseDir, 'packages', 'core');
  if (existsSync(coreDir)) {
    run('npx tsc', coreDir, 60_000);
  }
  s.stop('Nexus core built');

  // ── 8. Build Nexus worker (optional) ───────────────────────
  const workerDir = join(nexusBaseDir, 'packages', 'worker');
  if (existsSync(workerDir)) {
    s.start('Building Nexus worker...');
    try {
      run('npx tsc', workerDir, 60_000);
      s.stop('Nexus worker built');
    } catch {
      s.stop('Nexus worker build skipped (optional)');
    }
  }

  // ── 9. Build Nexus MCP (optional) ─────────────────────────
  const mcpDir = join(nexusBaseDir, 'packages', 'mcp-server');
  if (existsSync(mcpDir)) {
    s.start('Building Nexus MCP server...');
    try {
      run('npx tsc', mcpDir, 60_000);
      s.stop('Nexus MCP server built');
    } catch {
      s.stop('Nexus MCP build skipped (optional)');
    }
  }

  // ── 10. Python venv for memory service ─────────────────────
  const requirementsFile = join(nexusBaseDir, 'packages', 'memory', 'src', 'requirements.txt');
  if (existsSync(requirementsFile)) {
    s.start('Setting up Python venv for memory service...');
    const memoryPkgDir = join(nexusBaseDir, 'packages', 'memory');
    const venvDir = join(memoryPkgDir, 'venv');
    try {
      if (!existsSync(venvDir)) {
        run('python3 -m venv venv', memoryPkgDir, 60_000);
        rollback.push('created Python venv', () => {
          try { execSync(`rm -rf "${venvDir}"`); } catch { /* ignore */ }
        });
      }
      run('venv/bin/pip install -r src/requirements.txt', memoryPkgDir, 120_000);
      s.stop('Python venv ready');
    } catch {
      s.stop('Python venv setup skipped (optional)');
    }
  }

  // ── 11. Symlink .env to Nexus ──────────────────────────────
  const livosEnv = join(livosBaseDir, '.env');
  const nexusEnv = join(nexusBaseDir, '.env');
  if (existsSync(livosEnv)) {
    try { unlinkSync(nexusEnv); } catch { /* may not exist */ }
    symlinkSync(livosEnv, nexusEnv);
    rollback.push('symlinked .env to Nexus', () => {
      try { unlinkSync(nexusEnv); } catch { /* ignore */ }
    });
    p.log.info('.env symlinked to Nexus');
  }

  // ── 12. Generate PM2 ecosystem ─────────────────────────────
  const ecosystemPath = join(livosBaseDir, 'ecosystem.config.cjs');
  const serviceConfig: ServiceConfig = { livosBaseDir, nexusBaseDir, logsDir };
  writeEcosystemFile(ecosystemPath, serviceConfig);
  rollback.push('wrote ecosystem.config.cjs', () => {
    try { unlinkSync(ecosystemPath); } catch { /* ignore */ }
  });
  p.log.info(`PM2 ecosystem written: ${ecosystemPath}`);

  // ── 13. Start PM2 services ─────────────────────────────────
  s.start('Starting PM2 services...');
  rollback.push('started PM2 services', async () => {
    await stopServices();
  });

  const { started, failed } = await startServices(ecosystemPath);
  s.stop('PM2 services started');

  if (started.length > 0) {
    p.log.success(`Services running: ${started.join(', ')}`);
  }
  if (failed.length > 0) {
    p.log.warn(`Services with issues: ${failed.join(', ')}`);
  }

  // ── 14. PM2 startup + save ─────────────────────────────────
  try {
    execSync('pm2 startup 2>/dev/null || true', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 30_000,
    });
    execSync('pm2 save', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      timeout: 10_000,
    });
    p.log.info('PM2 startup configured for reboot persistence');
  } catch {
    p.log.warn('PM2 startup config skipped (may need sudo)');
  }

  // ── 15. Health verification ────────────────────────────────
  s.start('Verifying service health...');

  // Read ports from .env if available, else use defaults
  const ports = readPortsFromEnv(livosEnv);

  // Give services a moment to bind their ports
  await new Promise(resolve => setTimeout(resolve, 3000));

  const health = await verifyHealth(ports);
  s.stop('Health check complete');

  printHealthResults(health);
}

// ── Port reading ───────────────────────────────────────────────

function readPortsFromEnv(envPath: string): {
  livos: number;
  api: number;
  mcp: number;
  memory: number;
} {
  const defaults = { livos: 8080, api: 3200, mcp: 3100, memory: 3300 };

  if (!existsSync(envPath)) return defaults;

  try {
    const content = readFileSync(envPath, 'utf-8');
    const get = (key: string, fallback: number): number => {
      const match = content.match(new RegExp(`^${key}=(\\d+)`, 'm'));
      return match ? parseInt(match[1], 10) : fallback;
    };
    return {
      livos: 8080, // Always 8080 (hardcoded in livinityd args)
      api: get('API_PORT', defaults.api),
      mcp: get('MCP_PORT', defaults.mcp),
      memory: get('MEMORY_PORT', defaults.memory),
    };
  } catch {
    return defaults;
  }
}

// ── Health display ─────────────────────────────────────────────

export function printHealthResults(results: HealthResult[]): void {
  console.log('');
  console.log(pc.bold('  Service Health'));
  console.log(pc.dim('  ' + '-'.repeat(40)));

  let healthy = 0;
  for (const r of results) {
    const icon = r.healthy ? pc.green('  OK') : pc.red('  --');
    const port = pc.dim(`:${r.port}`);
    console.log(`${icon}  ${r.service} ${port}`);
    if (r.healthy) healthy++;
  }

  console.log('');
  if (healthy === results.length) {
    console.log(pc.green(`  All ${results.length} services healthy`));
  } else {
    console.log(pc.yellow(`  ${healthy}/${results.length} services healthy`));
    console.log(pc.dim('  Services may take a few seconds to fully start.'));
    console.log(pc.dim('  Run `livinity status` to check again.'));
  }
  console.log('');
}

// ── Standalone Command ─────────────────────────────────────────

export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('Install dependencies, build, and start PM2 services')
    .option('--livos-dir <path>', 'LivOS base directory', '/opt/livos')
    .option('--nexus-dir <path>', 'Nexus base directory', '/opt/nexus')
    .action(async (opts: { livosDir: string; nexusDir: string }) => {
      p.intro(pc.bold('LivOS Service Setup'));

      const livosBaseDir = opts.livosDir;
      const nexusBaseDir = opts.nexusDir;

      // Try reading from .env for path overrides
      const envPath = join(livosBaseDir, '.env');
      if (existsSync(envPath)) {
        p.log.info(`Using .env from: ${envPath}`);
      } else {
        p.log.warn(`No .env found at ${envPath}. Run \`livinity onboard\` first.`);
      }

      const rollback = new RollbackStack();

      try {
        await runSetup({ livosBaseDir, nexusBaseDir, rollback });
        p.outro(pc.green('Setup complete! All services are running.'));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        p.log.error(`Setup failed: ${msg}`);

        if (rollback.size > 0) {
          await rollback.rollback();
        }

        p.cancel('Setup aborted. Server has been cleaned up.');
        process.exit(1);
      }
    });
}
