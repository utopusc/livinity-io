import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { AGENT_VERSION } from './config.js';
import { PLATFORM_URL } from './auth.js';
import { readCredentials, writeCredentials, type CredentialsData } from './state.js';

// ---- Types ----

type SetupStatus = 'awaiting_setup' | 'connecting' | 'polling' | 'success' | 'error';

interface SetupState {
  status: SetupStatus;
  userCode: string | null;
  verificationUri: string | null;
  deviceName: string;
  errorMessage: string | null;
}

interface DeviceRegisterResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface DeviceTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  relay_url: string;
}

interface DeviceTokenError {
  error: string;
}

// ---- Module State ----

let setupState: SetupState = {
  status: 'awaiting_setup',
  userCode: null,
  verificationUri: null,
  deviceName: os.hostname(),
  errorMessage: null,
};

let connectedDeviceName: string | null = null;
let setupPromiseResolve: ((creds: CredentialsData) => void) | null = null;

/**
 * Update the internal setup state. Called by the OAuth flow integration.
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

/**
 * Reset all state to initial values (for retry).
 */
function resetState(): void {
  setupState = {
    status: 'awaiting_setup',
    userCode: null,
    verificationUri: null,
    deviceName: os.hostname(),
    errorMessage: null,
  };
  connectedDeviceName = null;
}

// ---- JWT Decode (same pattern as auth.ts) ----

function decodeJwtPayload(token: string): Record<string, unknown> {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new Error('Invalid JWT format');
  }

  let base64 = segments[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const remainder = base64.length % 4;
  if (remainder === 2) base64 += '==';
  else if (remainder === 3) base64 += '=';

  const json = Buffer.from(base64, 'base64').toString('utf-8');
  return JSON.parse(json) as Record<string, unknown>;
}

// ---- OAuth Device Flow (non-blocking) ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the OAuth device flow asynchronously. Updates module-level state
 * so the SPA can poll for progress via GET /api/poll-status.
 */
async function runDeviceFlow(deviceName: string): Promise<void> {
  const platform = process.platform as 'win32' | 'darwin' | 'linux';

  try {
    // Step 1: Register device
    const registerRes = await fetch(`${PLATFORM_URL}/api/device/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName, platform, agentVersion: AGENT_VERSION }),
    });

    if (!registerRes.ok) {
      const body = await registerRes.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Device registration failed: ${(body as { error: string }).error}`);
    }

    const grant = (await registerRes.json()) as DeviceRegisterResponse;
    const { device_code, user_code, verification_uri, expires_in, interval } = grant;

    // Step 2: Update state so SPA shows the user code
    setupState.userCode = user_code;
    setupState.verificationUri = verification_uri;
    setupState.status = 'polling';

    // Step 3: Poll for token
    const pollInterval = (interval || 5) * 1000;
    const deadline = Date.now() + expires_in * 1000;

    while (Date.now() < deadline) {
      await sleep(pollInterval);

      const tokenRes = await fetch(`${PLATFORM_URL}/api/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code }),
      });

      if (tokenRes.ok) {
        // Approved!
        const tokenData = (await tokenRes.json()) as DeviceTokenResponse;
        const { access_token, relay_url } = tokenData;

        // Decode JWT payload to extract deviceId
        const deviceId = decodeJwtPayload(access_token).deviceId as string;

        // Store credentials
        const credentials: CredentialsData = {
          deviceToken: access_token,
          deviceId,
          deviceName,
          relayUrl: relay_url,
          platform,
        };
        writeCredentials(credentials);

        // Update state for SPA
        connectedDeviceName = deviceName;
        setupState.status = 'success';
        setupState.deviceName = deviceName;

        // Resolve the waitForSetup promise
        if (setupPromiseResolve) {
          setupPromiseResolve(credentials);
          setupPromiseResolve = null;
        }

        return;
      }

      // Not approved yet -- check error
      const errorBody = (await tokenRes.json()) as DeviceTokenError;

      if (errorBody.error === 'authorization_pending') {
        continue;
      }

      if (errorBody.error === 'expired_token') {
        throw new Error('Device code expired. Please try again.');
      }

      if (errorBody.error === 'invalid_grant') {
        throw new Error('Invalid device code.');
      }

      throw new Error(`Unexpected error during polling: ${errorBody.error}`);
    }

    throw new Error('Device code expired (timeout). Please try again.');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setupState.errorMessage = message;
    setupState.status = 'error';
  }
}

// ---- Dist Path Resolution ----

function resolveDistPath(): string {
  // Resolve "this directory" in both ESM and CJS/SEA contexts
  let thisDir: string;
  try {
    // ESM context: import.meta.url is available
    thisDir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    // CJS/SEA context: use __dirname or process.argv[0] directory
    thisDir = typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(process.execPath);
  }

  // In dev: agent/src/setup-server.ts -> agent/setup-ui/dist
  // In built: agent/dist/agent.js -> agent/dist/setup-ui (copied by esbuild config)
  // In built (alt): agent/dist/agent.js -> agent/setup-ui/dist
  // SEA binary directory: setup-ui is alongside the .exe
  const exeDir = path.dirname(process.execPath);

  const candidates = [
    path.join(thisDir, 'setup-ui'),             // dist/setup-ui (built mode, copied)
    path.join(thisDir, '..', 'setup-ui', 'dist'), // dev mode
    path.join(thisDir, '..', '..', 'setup-ui', 'dist'),
    // For SEA/bundled mode: relative to binary location or cwd
    path.join(exeDir, 'setup-ui'),
    path.join(process.cwd(), 'setup-ui', 'dist'),
    path.join(process.cwd(), 'setup-ui'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  // Fallback to first candidate -- Express will show 404 if missing
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
      reject(err);
    });
  });
}

/**
 * Start the local HTTP setup server.
 *
 * Serves the React SPA from setup-ui/dist/ and provides API endpoints
 * for the OAuth device flow UI. Auto-opens the browser.
 *
 * @returns The bound port, a close function, and waitForSetup() which resolves on successful OAuth.
 */
export async function startSetupServer(): Promise<{
  port: number;
  close: () => void;
  waitForSetup: () => Promise<CredentialsData>;
}> {
  const app = express();
  app.use(express.json());

  const distPath = resolveDistPath();

  // Serve static SPA files
  app.use(express.static(distPath));

  // ---- API Endpoints ----

  /**
   * GET /api/status -- Returns current setup state and device info.
   */
  app.get('/api/status', (_req, res) => {
    res.json({
      deviceName: setupState.deviceName,
      status: setupState.status,
      agentVersion: AGENT_VERSION,
    });
  });

  /**
   * POST /api/start-setup -- Triggers the OAuth device flow.
   * Kicks off the async flow without waiting for completion.
   */
  app.post('/api/start-setup', (req, res) => {
    const body = req.body as { deviceName?: string } | undefined;
    const deviceName = body?.deviceName || os.hostname();

    setupState.status = 'connecting';
    setupState.deviceName = deviceName;

    // Kick off the async OAuth flow (do NOT await)
    runDeviceFlow(deviceName);

    res.json({ started: true });
  });

  /**
   * GET /api/poll-status -- Returns full setup state for the SPA to poll.
   */
  app.get('/api/poll-status', (_req, res) => {
    res.json({
      status: setupState.status,
      userCode: setupState.userCode,
      verificationUri: setupState.verificationUri,
      deviceName: connectedDeviceName ?? setupState.deviceName,
      errorMessage: setupState.errorMessage,
    });
  });

  /**
   * POST /api/retry -- Reset state for a fresh attempt.
   */
  app.post('/api/retry', (_req, res) => {
    resetState();
    res.json({ reset: true });
  });

  // SPA fallback -- serve index.html for client-side routing
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

  // Create the waitForSetup promise
  const waitForSetup = (): Promise<CredentialsData> => {
    return new Promise<CredentialsData>((resolve) => {
      // If already resolved (race condition), check state
      if (setupState.status === 'success' && connectedDeviceName) {
        const creds = readCredentials();
        if (creds) {
          resolve(creds);
          return;
        }
      }
      setupPromiseResolve = resolve;
    });
  };

  return {
    port: boundPort,
    close: () => {
      server?.close();
    },
    waitForSetup,
  };
}
