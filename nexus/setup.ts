#!/usr/bin/env npx tsx
/**
 * Nexus Interactive Setup Wizard
 *
 * Run: npx tsx setup.ts
 *   or: npm run setup
 *
 * Guides the user through:
 *  1. Prerequisites check (Node.js, Redis, Docker)
 *  2. Configuration (API keys, ports, paths)
 *  3. .env file creation
 *  4. Directory creation
 *  5. Dependency installation
 *  6. Build
 *  7. Optional: start services
 */

import * as readline from 'readline/promises';
import { stdin, stdout, exit } from 'process';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// ─── Colors (ANSI escape codes) ─────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function banner() {
  console.log(`
${C.cyan}${C.bold}
  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗
  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝
  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗
  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║
  ██║ ╚████║███████╗██╔╝ ╚██╗╚██████╔╝███████║
  ╚═╝  ╚═══╝╚══════╝╚═╝   ╚═╝ ╚═════╝ ╚══════╝
${C.reset}
  ${C.bold}Autonomous AI Server — Setup Wizard${C.reset}
  ${C.dim}Multi-skill engine | WhatsApp interface | 24/7 operation${C.reset}
`);
}

function log(msg: string) { console.log(`  ${msg}`); }
function ok(msg: string) { log(`${C.green}[OK]${C.reset} ${msg}`); }
function warn(msg: string) { log(`${C.yellow}[!!]${C.reset} ${msg}`); }
function fail(msg: string) { log(`${C.red}[FAIL]${C.reset} ${msg}`); }
function info(msg: string) { log(`${C.blue}[i]${C.reset} ${msg}`); }
function section(title: string) {
  console.log(`\n  ${C.cyan}${C.bold}── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}${C.reset}\n`);
}

function cmd(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

// ─── Main Setup Flow ────────────────────────────────────────────────

async function main() {
  banner();

  const rl = readline.createInterface({ input: stdin, output: stdout });

  async function ask(question: string, defaultVal?: string): Promise<string> {
    const suffix = defaultVal ? ` ${C.dim}(${defaultVal})${C.reset}` : '';
    const answer = await rl.question(`  ${C.bold}>${C.reset} ${question}${suffix}: `);
    return answer.trim() || defaultVal || '';
  }

  async function confirm(question: string, defaultYes = true): Promise<boolean> {
    const hint = defaultYes ? 'Y/n' : 'y/N';
    const answer = await rl.question(`  ${C.bold}>${C.reset} ${question} ${C.dim}(${hint})${C.reset}: `);
    if (!answer.trim()) return defaultYes;
    return /^y(es)?$/i.test(answer.trim());
  }

  // ── Step 1: Prerequisites ─────────────────────────────────────────

  section('Step 1/6: Prerequisites Check');

  let allPrereqs = true;

  // Node.js
  const nodeVersion = cmd('node --version');
  if (nodeVersion) {
    const major = parseInt(nodeVersion.replace('v', ''));
    if (major >= 18) {
      ok(`Node.js ${nodeVersion}`);
    } else {
      warn(`Node.js ${nodeVersion} — v18+ recommended`);
    }
  } else {
    fail('Node.js not found — install from https://nodejs.org');
    allPrereqs = false;
  }

  // npm
  const npmVersion = cmd('npm --version');
  if (npmVersion) {
    ok(`npm ${npmVersion}`);
  } else {
    fail('npm not found');
    allPrereqs = false;
  }

  // Redis
  const redisCheck = cmd('redis-cli ping');
  if (redisCheck === 'PONG') {
    ok('Redis is running');
  } else {
    warn('Redis not reachable — Nexus requires Redis for messaging and state');
    info('Install: sudo apt install redis-server && sudo systemctl start redis');
  }

  // Docker
  const dockerVersion = cmd('docker --version');
  if (dockerVersion) {
    ok(`Docker: ${dockerVersion.split(',')[0]}`);
  } else {
    warn('Docker not found — needed for container management and Firecrawl scraper');
    info('Install: https://docs.docker.com/engine/install/');
  }

  // PM2
  const pm2Version = cmd('pm2 --version');
  if (pm2Version) {
    ok(`PM2 ${pm2Version}`);
  } else {
    warn('PM2 not found — optional, used for Node.js process management');
    info('Install: npm install -g pm2');
  }

  if (!allPrereqs) {
    fail('Missing critical prerequisites. Please install them and re-run setup.');
    rl.close();
    exit(1);
  }

  console.log();
  if (!await confirm('Continue with setup?')) {
    log('Setup cancelled.');
    rl.close();
    return;
  }

  // ── Step 2: Configuration ─────────────────────────────────────────

  section('Step 2/6: Configuration');

  info('Configure your Nexus instance. Press Enter to accept defaults.\n');

  const config: Record<string, string> = {};

  // API Key
  config.GEMINI_API_KEY = await ask('Google Gemini API key', '');
  if (!config.GEMINI_API_KEY) {
    warn('No API key provided — Nexus AI features will not work');
    info('Get a key at: https://aistudio.google.com/apikey');
  }

  // Ports
  config.API_PORT = await ask('API server port', '3200');
  config.MCP_PORT = await ask('MCP server port', '3100');

  // Redis
  config.REDIS_URL = await ask('Redis URL', 'redis://localhost:6379');

  // Paths
  config.SHELL_CWD = await ask('Shell working directory', '/opt/nexus');
  config.SKILLS_DIR = await ask('Skills directory', '/opt/nexus/app/skills');

  // Agent
  config.AGENT_MAX_TURNS = await ask('Agent max turns per task', '30');
  config.AGENT_TIER = await ask('Default agent model tier (flash/sonnet/opus)', 'sonnet');

  // WhatsApp
  const enableWA = await confirm('Enable WhatsApp bot?', true);
  config.WHATSAPP_ENABLED = enableWA ? 'true' : 'false';

  // Logging
  config.LOG_LEVEL = await ask('Log level (debug/info/warn/error)', 'info');

  // ── Step 3: Create .env file ──────────────────────────────────────

  section('Step 3/6: Environment File');

  const envPath = join(process.cwd(), '.env');
  const envExists = existsSync(envPath);

  if (envExists) {
    warn('.env file already exists');
    if (!await confirm('Overwrite existing .env?', false)) {
      info('Keeping existing .env file');
    } else {
      writeEnvFile(envPath, config);
      ok('.env file updated');
    }
  } else {
    writeEnvFile(envPath, config);
    ok('.env file created');
  }

  // ── Step 4: Create directories ────────────────────────────────────

  section('Step 4/6: Directory Structure');

  const dirs = [
    config.SHELL_CWD,
    config.SKILLS_DIR,
    join(config.SHELL_CWD, 'logs'),
    join(config.SHELL_CWD, 'output'),
    join(config.SHELL_CWD, 'whatsapp-auth'),
  ];

  for (const dir of dirs) {
    try {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        ok(`Created: ${dir}`);
      } else {
        ok(`Exists: ${dir}`);
      }
    } catch (err: any) {
      if (err.code === 'EACCES') {
        warn(`Permission denied: ${dir} — run with sudo or create manually`);
      } else {
        warn(`Could not create ${dir}: ${err.message}`);
      }
    }
  }

  // Copy skills to target directory if different from source
  const sourceSkills = join(process.cwd(), 'skills');
  if (sourceSkills !== config.SKILLS_DIR && existsSync(sourceSkills)) {
    info(`Skills source: ${sourceSkills}`);
    info(`Skills target: ${config.SKILLS_DIR}`);
    info('Copy skills after build: cp -r skills/*.js <SKILLS_DIR>/');
  }

  // ── Step 5: Install dependencies ──────────────────────────────────

  section('Step 5/6: Dependencies');

  if (await confirm('Install npm dependencies?')) {
    log(`${C.dim}Running npm install...${C.reset}`);
    try {
      execSync('npm install', { stdio: 'inherit', cwd: process.cwd() });
      ok('Dependencies installed');
    } catch {
      fail('npm install failed — check the output above');
    }
  } else {
    info('Skipping dependency installation');
  }

  // ── Step 6: Build ─────────────────────────────────────────────────

  section('Step 6/6: Build');

  if (await confirm('Build the project?')) {
    log(`${C.dim}Running npm run build...${C.reset}`);
    try {
      execSync('npm run build', { stdio: 'inherit', cwd: process.cwd() });
      ok('Build complete');
    } catch {
      fail('Build failed — check the output above');
      info('You can retry later with: npm run build');
    }
  } else {
    info('Skipping build — run "npm run build" when ready');
  }

  // ── Done ──────────────────────────────────────────────────────────

  section('Setup Complete');

  console.log(`  ${C.green}${C.bold}Nexus is ready!${C.reset}\n`);
  log('Start individual services:');
  log(`  ${C.cyan}npm run dev:core${C.reset}       — Start the core daemon`);
  log(`  ${C.cyan}npm run dev:whatsapp${C.reset}   — Start the WhatsApp bot`);
  log(`  ${C.cyan}npm run dev:mcp${C.reset}        — Start the MCP server`);
  log(`  ${C.cyan}npm run dev:worker${C.reset}     — Start the background worker`);
  log(`  ${C.cyan}npm run dev:memory${C.reset}     — Start the memory service`);
  console.log();
  log('Or start all with PM2:');
  log(`  ${C.cyan}pm2 start ecosystem.config.js${C.reset}`);
  console.log();
  log('WhatsApp setup:');
  log(`  1. Start the WhatsApp bot: ${C.cyan}npm run dev:whatsapp${C.reset}`);
  log(`  2. Scan the QR code with your phone`);
  log(`  3. Send ${C.bold}!health${C.reset} to test`);
  console.log();
  log(`${C.dim}Documentation: https://github.com/nexus-ai/nexus${C.reset}`);
  console.log();

  rl.close();
}

function writeEnvFile(path: string, config: Record<string, string>) {
  const lines = [
    '# ─── Nexus Configuration ───────────────────────────────',
    '# Generated by setup wizard',
    '',
    '# AI Model',
    `GEMINI_API_KEY=${config.GEMINI_API_KEY || ''}`,
    '',
    '# Server Ports',
    `API_PORT=${config.API_PORT}`,
    `MCP_PORT=${config.MCP_PORT}`,
    '',
    '# Redis',
    `REDIS_URL=${config.REDIS_URL}`,
    '',
    '# Paths',
    `SHELL_CWD=${config.SHELL_CWD}`,
    `SKILLS_DIR=${config.SKILLS_DIR}`,
    '',
    '# Agent Settings',
    `AGENT_MAX_TURNS=${config.AGENT_MAX_TURNS}`,
    `AGENT_MAX_TOKENS=200000`,
    `AGENT_TIMEOUT_MS=600000`,
    `AGENT_TIER=${config.AGENT_TIER}`,
    `AGENT_MAX_DEPTH=3`,
    '',
    '# WhatsApp',
    `WHATSAPP_ENABLED=${config.WHATSAPP_ENABLED}`,
    '',
    '# Logging',
    `LOG_LEVEL=${config.LOG_LEVEL}`,
    '',
    '# External Services (defaults — change if hosted elsewhere)',
    '# FIRECRAWL_URL=http://localhost:3002',
    '# MEMORY_URL=http://localhost:3300',
    '',
  ];

  writeFileSync(path, lines.join('\n'), 'utf-8');
}

main().catch((err) => {
  console.error(`\n  ${C.red}Setup error:${C.reset}`, err.message);
  exit(1);
});
