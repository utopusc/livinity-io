import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { AGENT_VERSION } from './config.js';

// ---- Types ----

type SetupStatus = 'awaiting_setup' | 'connecting' | 'polling' | 'success' | 'error';

interface SetupState {
  status: SetupStatus;
  userCode: string | null;
  verificationUri: string | null;
  deviceName: string;
  errorMessage: string | null;
}

// ---- Module State ----

let setupState: SetupState = {
  status: 'awaiting_setup',
  userCode: null,
  verificationUri: null,
  deviceName: os.hostname(),
  errorMessage: null,
};

/**
 * Update the internal setup state. Called by the OAuth flow integration (Plan 02).
 */
export function updateSetupState(partial: Partial<SetupState>): void {
  setupState = { ...setupState, ...partial };
}

/**
 * Get the current setup state (for external consumers).
 */
export function getSetupState(): Readonly<SetupState> {
  return setupState;
}

// ---- Dist Path Resolution ----

function resolveDistPath(): string {
  // Try dev-mode path first: relative to this source file
  const thisDir = path.dirname(fileURLToPath(import.meta.url));

  // In dev: agent/src/setup-server.ts -> agent/setup-ui/dist
  // In built: agent/dist/agent.js -> agent/setup-ui/dist
  const candidates = [
    path.join(thisDir, '..', 'setup-ui', 'dist'),
    path.join(thisDir, '..', '..', 'setup-ui', 'dist'),
    // For SEA/bundled mode: relative to cwd
    path.join(process.cwd(), 'setup-ui', 'dist'),
    path.join(process.cwd(), 'setup-ui'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  // Fallback to first candidate — Express will show 404 if missing
  return candidates[0];
}

// ---- Server ----

const BASE_PORT = 19191;
const MAX_PORT = 19199;

function tryListen(
  app: express.Application,
  port: number,
): Promise<ReturnType<express.Application['listen']>> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(err);
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Start the local HTTP setup server.
 *
 * Serves the React SPA from setup-ui/dist/ and provides API endpoints
 * for the OAuth device flow UI. Auto-opens the browser.
 *
 * @returns The bound port and a close function to shut down the server.
 */
export async function startSetupServer(): Promise<{ port: number; close: () => void }> {
  const app = express();
  app.use(express.json());

  const distPath = resolveDistPath();

  // Serve static SPA files
  app.use(express.static(distPath));

  // ---- API Endpoints ----

  /**
   * GET /api/status — Returns current setup state and device info.
   */
  app.get('/api/status', (_req, res) => {
    res.json({
      deviceName: setupState.deviceName,
      status: setupState.status,
      agentVersion: AGENT_VERSION,
    });
  });

  /**
   * POST /api/start-setup — Triggers the OAuth device flow.
   * Stub in Plan 01; wired to deviceFlowSetup() in Plan 02.
   */
  app.post('/api/start-setup', (_req, res) => {
    setupState.status = 'connecting';
    res.json({ started: true });
  });

  /**
   * GET /api/poll-status — Returns full setup state for the SPA to poll.
   */
  app.get('/api/poll-status', (_req, res) => {
    res.json({
      status: setupState.status,
      userCode: setupState.userCode,
      verificationUri: setupState.verificationUri,
      deviceName: setupState.deviceName,
      errorMessage: setupState.errorMessage,
    });
  });

  // SPA fallback — serve index.html for client-side routing
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });

  // ---- Start Server ----

  let server: ReturnType<express.Application['listen']> | null = null;
  let boundPort = BASE_PORT;

  for (let port = BASE_PORT; port <= MAX_PORT; port++) {
    try {
      server = await tryListen(app, port);
      boundPort = port;
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE' && port < MAX_PORT) {
        continue;
      }
      throw err;
    }
  }

  if (!server) {
    throw new Error(`Could not find an available port between ${BASE_PORT} and ${MAX_PORT}`);
  }

  console.log(`Setup server running at http://localhost:${boundPort}`);

  // Auto-open browser (dynamic import to handle ESM-only package)
  try {
    const openModule = await import('open');
    const openFn = openModule.default;
    await openFn(`http://localhost:${boundPort}`);
  } catch {
    // Silently ignore if browser cannot be opened (headless environments)
    console.log(`Open http://localhost:${boundPort} in your browser to complete setup.`);
  }

  return {
    port: boundPort,
    close: () => {
      server?.close();
    },
  };
}
