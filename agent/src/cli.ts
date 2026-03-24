import { createInterface } from 'node:readline';
import { hostname, userInfo } from 'node:os';
import { readCredentials, readState, readPid, writePid, removePid } from './state.js';
import { ConnectionManager } from './connection-manager.js';
import { deviceFlowSetup, isTokenExpired } from './auth.js';
import { startTray, updateTrayStatus, killTray } from './tray.js';

// ---- setup ----

export async function setupCommand(options: { cli?: boolean } = {}): Promise<void> {
  // Web mode (default): open browser-based setup wizard
  if (!options.cli) {
    const { startSetupServer } = await import('./setup-server.js');
    const server = await startSetupServer();

    console.log(`Setup wizard opened in your browser at http://localhost:${server.port}`);
    console.log('Complete the setup in your browser, or use --cli for terminal setup.');

    const creds = await server.waitForSetup();
    server.close();

    console.log(`Setup complete! Device: ${creds.deviceName}`);
    return;
  }

  // CLI mode: terminal-based setup (existing behavior)
  const defaultName = hostname();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) =>
    rl.question(`Device name [${defaultName}]: `, resolve),
  );
  rl.close();
  const deviceName = answer.trim() || defaultName;

  // Check for existing credentials
  const existing = readCredentials();
  if (existing) {
    console.log(
      `This device is already authenticated as '${existing.deviceName}'. Re-running setup will replace the existing credentials.`,
    );
    const rl2 = createInterface({ input: process.stdin, output: process.stdout });
    const confirm = await new Promise<string>((resolve) =>
      rl2.question('Continue? [y/N]: ', resolve),
    );
    rl2.close();
    if (confirm.trim().toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      return;
    }
  }

  // Run OAuth device flow
  try {
    await deviceFlowSetup(deviceName);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Setup failed: ${message}`);
    process.exit(1);
  }
}

// ---- start ----

export async function startCommand(): Promise<void> {
  let credentials = readCredentials();

  // If no credentials, auto-open web setup wizard
  if (!credentials) {
    console.log('No credentials found. Opening setup wizard...');

    const { startSetupServer } = await import('./setup-server.js');
    const server = await startSetupServer();

    console.log(`Setup wizard opened in your browser at http://localhost:${server.port}`);
    console.log('Complete the setup in your browser to continue.');

    await server.waitForSetup();
    server.close();

    // Re-read credentials after setup completes
    credentials = readCredentials();
    if (!credentials) {
      console.log('Setup did not complete. Exiting.');
      process.exit(1);
    }
    console.log(`Setup complete! Device: ${credentials.deviceName}`);
    console.log('Connecting to relay...');
  }

  // Check token expiry before connecting
  if (isTokenExpired(credentials.deviceToken)) {
    console.log('Device token has expired. Run `livinity-agent setup` to re-authenticate.');
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
      // Process not running, stale PID file -- continue
    }
  }

  // Write PID file
  writePid(process.pid);

  // Create connection manager and connect
  const manager = new ConnectionManager({
    credentials,
    onStatusChange: (status) => updateTrayStatus(status),
  });

  // Initialize system tray (non-blocking -- continues even if tray fails)
  try {
    await startTray({
      onDisconnect: () => {
        console.log('[agent] Disconnect requested from tray');
        manager.disconnect();
      },
      onQuit: () => {
        console.log('[agent] Quit requested from tray');
        manager.disconnect();
        killTray();
        process.exit(0);
      },
      onOpenSetup: async () => {
        console.log('[agent] Opening setup wizard from tray');
        try {
          const { startSetupServer } = await import('./setup-server.js');
          const server = await startSetupServer();
          console.log(`Setup wizard opened at http://localhost:${server.port}`);
          // Don't await waitForSetup -- let it run in background
        } catch (err) {
          console.error('[agent] Failed to open setup:', err);
        }
      },
    });
  } catch (err) {
    // Tray failure is non-fatal -- agent works without tray (headless servers, SSH)
    console.warn('[agent] System tray not available:', (err as Error).message);
  }

  manager.connect();

  // Register signal handlers for graceful shutdown
  const shutdown = () => {
    console.log('\n[agent] Shutting down...');
    manager.disconnect();
    killTray();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`Agent started (PID ${process.pid}). Press Ctrl+C to stop.`);
  try {
    const user = userInfo();
    console.log(`[agent] Running as OS user: ${user.username}`);
  } catch {
    // userInfo() can throw on some platforms
  }
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

  // Format status display
  let statusDisplay = state.status;
  if (state.status === 'token_expired') {
    statusDisplay = 'Token expired -- run `livinity-agent setup` to re-authenticate';
  }

  console.log('');
  console.log('Livinity Agent Status');
  console.log('---------------------');
  console.log(`Status:      ${statusDisplay}${pid !== null ? ` (PID ${pid} ${processAlive ? 'running' : 'not running'})` : ''}`);
  console.log(`Device:      ${credentials?.deviceName ?? 'unknown'}`);
  console.log(`Relay:       ${credentials?.relayUrl ?? 'unknown'}`);
  console.log(`Connected:   ${state.connectedAt ?? 'never'}`);
  // Show current OS user for security transparency
  try {
    const user = userInfo();
    console.log(`Running as: ${user.username}`);
  } catch {
    console.log(`Running as: unknown`);
  }
  console.log('');
}
