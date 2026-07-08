/**
 * src/main/platform/device-client.ts
 *
 * The AUTH-02 replacement for the empirically-BLOCKED embedded Google OAuth
 * window (device-flow pivot, D-16/D-18; 02-RESEARCH.md ADDENDUM). Drives the
 * whole register -> open the system browser -> poll -> exchange -> vault ->
 * wrong-account guard state machine and reports progress via `onUpdate`
 * (pushed to the renderer by auth.ipc.ts's device handlers).
 *
 * Zero imports from ipc/ or tray/ — pure, unit-testable main-process
 * primitive (ARCHITECTURE.md hard isolation rule).
 *
 * NEVER log the device access token or the minted session value. Every
 * logSafe call below passes a phase or ok boolean only — the userCode is the
 * only device-flow-adjacent value ever surfaced, and even that never reaches
 * a log line.
 */

import { shell, app } from 'electron';
import { PLATFORM_URL, safeFetch } from './http-client';
import { getMe } from './auth-client';
import { validateSession } from './session-manager';
import { vaultSet } from '../storage/secrets-vault';
import {
  DeviceRegisterResponseSchema,
  DeviceTokenResponseSchema,
  DeviceExchangeResponseSchema,
} from './schemas';
import { logSafe } from '../log';
import type { DeviceLoginUpdate, AuthStartDeviceLoginResult } from '../../../shared/ipc-contract';

/** The three platform-accepted values for the register call's `platform` field. */
type DevicePlatform = 'win32' | 'darwin' | 'linux';

function resolvePlatform(): DevicePlatform {
  if (process.platform === 'darwin' || process.platform === 'linux') return process.platform;
  return 'win32';
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Module state: only one device-login flow may run at a time — a duplicate
// click must never fire a second concurrent /register call.
let inFlight = false;
let cancelled = false;

/**
 * Starts the device-flow login: registers a grant, opens the system default
 * browser at a fixed livinity.io deep link, and kicks off the background
 * poll-and-exchange loop. Resolves as soon as registration completes — it
 * does NOT wait for the user to approve in the browser; every subsequent
 * step is reported exclusively through `onUpdate`.
 */
export async function startDeviceLogin(
  onUpdate: (update: DeviceLoginUpdate) => void,
  deps: { sleep?: (ms: number) => Promise<void> } = {}
): Promise<AuthStartDeviceLoginResult> {
  if (inFlight) {
    return { ok: false, reason: 'already_running' };
  }
  inFlight = true;
  cancelled = false;

  const sleep = deps.sleep ?? defaultSleep;

  const outcome = await safeFetch(() =>
    fetch(`${PLATFORM_URL}/api/device/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceName: 'Livinity Desktop',
        platform: resolvePlatform(),
        agentVersion: app.getVersion(),
      }),
    })
  );

  if (!outcome.ok) {
    inFlight = false;
    logSafe('device.register', { ok: false });
    return { ok: false, reason: 'network' };
  }

  const { res } = outcome;
  const body: unknown = await res.json();

  if (!res.ok) {
    inFlight = false;
    logSafe('device.register', { ok: false });
    return { ok: false, reason: 'network' };
  }

  const parsed = DeviceRegisterResponseSchema.safeParse(body);
  if (!parsed.success) {
    inFlight = false;
    logSafe('device.register', { ok: false });
    return { ok: false, reason: 'network' };
  }

  logSafe('device.register', { ok: true });

  const { device_code: deviceCode, user_code: userCode, expires_in: expiresIn, interval } = parsed.data;
  const deadline = Date.now() + expiresIn * 1000;
  const intervalMs = (interval || 5) * 1000;

  // Fixed origin literal, url-encoded userCode only — never a
  // renderer-supplied or dynamic-origin URL (T-02-12).
  void shell.openExternal('https://livinity.io/device?code=' + encodeURIComponent(userCode));

  // Fire-and-forget: the poll loop reports its own progress via onUpdate.
  // Returning here — before the loop settles — is deliberate: the caller
  // only needs the code to display immediately.
  void pollAndExchange(deviceCode, deadline, intervalMs, onUpdate, sleep);

  return { ok: true, userCode, expiresInMs: expiresIn * 1000 };
}

/** Observed by the poll loop each iteration; a Cancel click sets this flag. */
export function cancelDeviceLogin(): void {
  cancelled = true;
}

async function pollAndExchange(
  deviceCode: string,
  deadline: number,
  intervalMs: number,
  onUpdate: (update: DeviceLoginUpdate) => void,
  sleep: (ms: number) => Promise<void>
): Promise<void> {
  try {
    while (Date.now() < deadline && !cancelled) {
      await sleep(intervalMs);
      if (cancelled) break;

      const outcome = await safeFetch(() =>
        fetch(`${PLATFORM_URL}/api/device/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code: deviceCode }),
        })
      );

      if (!outcome.ok) {
        logSafe('device.login', { phase: 'error' });
        onUpdate({ phase: 'error', reason: 'network' });
        return;
      }

      const { res } = outcome;
      const body: unknown = await res.json();

      if (res.ok) {
        const parsed = DeviceTokenResponseSchema.safeParse(body);
        if (!parsed.success) {
          logSafe('device.login', { phase: 'error' });
          onUpdate({ phase: 'error', reason: 'unknown' });
          return;
        }
        await exchange(parsed.data.access_token, onUpdate);
        return;
      }

      const errorBody = body as { error?: string };
      if (errorBody.error === 'authorization_pending') {
        logSafe('device.login', { phase: 'waiting' });
        onUpdate({ phase: 'waiting' });
        continue;
      }
      if (errorBody.error === 'expired_token' || errorBody.error === 'invalid_grant') {
        logSafe('device.login', { phase: 'expired' });
        onUpdate({ phase: 'expired' });
        return;
      }
      // Unrecognized error shape — a retryable state, never a silent hang.
      logSafe('device.login', { phase: 'error' });
      onUpdate({ phase: 'error', reason: 'unknown' });
      return;
    }

    if (cancelled) {
      logSafe('device.login', { phase: 'cancelled' });
      onUpdate({ phase: 'cancelled' });
      return;
    }
    // Deadline reached (15 min) without a token, and not cancelled.
    logSafe('device.login', { phase: 'expired' });
    onUpdate({ phase: 'expired' });
  } finally {
    inFlight = false;
  }
}

/**
 * Exchanges a device access token for a fresh liv_session (Plan 02-08's new
 * endpoint). Reached at most once per pollAndExchange run, immediately after
 * the poll loop observes a 200 from /api/device/token.
 */
async function exchange(
  accessToken: string,
  onUpdate: (update: DeviceLoginUpdate) => void
): Promise<void> {
  const outcome = await safeFetch(() =>
    fetch(`${PLATFORM_URL}/api/device/exchange`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
  );

  if (!outcome.ok) {
    logSafe('device.login', { phase: 'error' });
    onUpdate({ phase: 'error', reason: 'network' });
    return;
  }

  const { res } = outcome;
  const body: unknown = await res.json();

  if (res.status === 409) {
    logSafe('device.login', { phase: 'error' });
    onUpdate({ phase: 'error', reason: 'already_exchanged' });
    return;
  }
  if (res.status === 401) {
    const errorBody = body as { error?: string };
    const reason = errorBody.error === 'session_revoked' ? ('session_revoked' as const) : ('exchange_failed' as const);
    logSafe('device.login', { phase: 'error' });
    onUpdate({ phase: 'error', reason });
    return;
  }
  if (!res.ok) {
    logSafe('device.login', { phase: 'error' });
    onUpdate({ phase: 'error', reason: 'exchange_failed' });
    return;
  }

  const parsed = DeviceExchangeResponseSchema.safeParse(body);
  if (!parsed.success) {
    logSafe('device.login', { phase: 'error' });
    onUpdate({ phase: 'error', reason: 'exchange_failed' });
    return;
  }

  // Reached ONLY on this 200 branch — never on 401/409/network.
  await vaultSet('session', parsed.data.session_token);

  const me = await getMe(parsed.data.session_token);
  if (!me.ok) {
    // Exchange succeeded but the fresh session can't be confirmed yet —
    // surface a retryable state rather than guessing an account (Pitfall 3).
    logSafe('device.login', { phase: 'error' });
    onUpdate({ phase: 'error', reason: 'unknown' });
    return;
  }

  const route = await validateSession();
  logSafe('device.login', { phase: 'approved' });
  onUpdate({
    phase: 'approved',
    route,
    account: { email: me.user.email, username: me.user.username },
  });
}
