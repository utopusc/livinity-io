import { readCredentials, readState, readPid, writePid, removePid } from './state.js';
import { ConnectionManager } from './connection-manager.js';

// ---- setup ----

export async function setupCommand(): Promise<void> {
  console.log('Run `livinity-agent setup` to authenticate. (Implemented in Plan 02)');
}

// ---- start ----

export async function startCommand(): Promise<void> {
  const credentials = readCredentials();
  if (!credentials) {
    console.log('No credentials found. Run `livinity-agent setup` first.');
    process.exit(1);
  }

  // Check if already running
  const existingPid = readPid();
  if (existingPid !== null) {
    try {
      process.kill(existingPid, 0);
      console.log(`Agent already running (PID ${existingPid})`);
      process.exit(0);
    } catch {
      // Process not running, stale PID file — continue
    }
  }

  // Write PID file
  writePid(process.pid);

  // Create connection manager and connect
  const manager = new ConnectionManager({ credentials });
  manager.connect();

  // Register signal handlers for graceful shutdown
  const shutdown = () => {
    console.log('\n[agent] Shutting down...');
    manager.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`Agent started (PID ${process.pid}). Press Ctrl+C to stop.`);
}

// ---- stop ----

export async function stopCommand(): Promise<void> {
  const pid = readPid();
  if (pid === null) {
    console.log('Agent is not running.');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Sent stop signal to agent (PID ${pid})`);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ESRCH') {
      console.log('Agent process not found (stale PID file), cleaning up');
      removePid();
    } else {
      throw err;
    }
  }
}

// ---- status ----

export async function statusCommand(): Promise<void> {
  const state = readState();
  if (!state) {
    console.log('Agent has not been configured. Run `livinity-agent setup` first.');
    return;
  }

  const pid = readPid();
  let processAlive = false;
  if (pid !== null) {
    try {
      process.kill(pid, 0);
      processAlive = true;
    } catch {
      processAlive = false;
    }
  }

  const credentials = readCredentials();

  console.log('');
  console.log('Livinity Agent Status');
  console.log('---------------------');
  console.log(`Status:      ${state.status}${pid !== null ? ` (PID ${pid} ${processAlive ? 'running' : 'not running'})` : ''}`);
  console.log(`Device:      ${credentials?.deviceName ?? 'unknown'}`);
  console.log(`Relay:       ${credentials?.relayUrl ?? 'unknown'}`);
  console.log(`Connected:   ${state.connectedAt ?? 'never'}`);
  console.log('');
}
