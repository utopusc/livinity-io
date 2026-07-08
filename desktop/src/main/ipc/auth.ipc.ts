/**
 * src/main/ipc/auth.ipc.ts
 *
 * Zod-validated IPC handlers wiring the renderer to Plan 01/03/04's platform
 * services (auth-client.ts, session-manager.ts, decide-key-action.ts,
 * backoff.ts, secrets-vault.ts). Every renderer-supplied payload is
 * safeParse'd before it touches a service — a malformed payload is rejected,
 * never passed through (mirrors src/main/ipc/shell.ipc.ts verbatim).
 *
 * SAFETY-CRITICAL (AUTH-06, T-02-04): `authGetKeyAction` gates every mint on
 * `decideKeyAction` BEFORE calling `mintKey`, and only ever sends the
 * invisible-mint action string. The corresponding DESTRUCTIVE replace-action
 * is sent from EXACTLY ONE place in this file — `authRegenerateKey` —
 * reachable only from the KeyChoice screen's explicit confirmed path.
 *
 * POST-PIVOT (D-16/D-18): the embedded-Google-window sign-in channel from an
 * earlier plan has been removed from shared/ipc-contract.ts entirely, so no
 * handler for it is (or can be) registered here. The device-flow channels
 * that replace embedded sign-in are registered below — startDeviceLogin's
 * onUpdate callback forwards to deps.getMainWindow(), the one thing this
 * file's AuthIpcDeps was retained for since Plan 02-04.
 */

import { ipcMain, shell, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { CHANNELS } from '../../../shared/ipc-contract';
import { validateSession, signOut } from '../platform/session-manager';
import { login, getMe, getDashboard, chooseFree, mintKey, probeKey } from '../platform/auth-client';
import { decideKeyAction } from '../platform/decide-key-action';
import { nextBackoffMs } from '../platform/backoff';
import { startDeviceLogin, cancelDeviceLogin } from '../platform/device-client';
import { vaultGet, vaultSet, vaultHas, vaultDelete } from '../storage/secrets-vault';
import { logSafe } from '../log';

const LoginPayloadSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });
const ProbeKeyPayloadSchema = z.object({ key: z.string().min(1) });
const OpenExternalPayloadSchema = z.object({ target: z.enum(['reset-password', 'pricing']) });
// Every no-argument handler still safeParse's its raw invocation payload
// (expected to be `undefined`) — defense in depth so a malformed/unexpected
// payload from a compromised renderer is rejected the same way an
// argument-bearing handler rejects one, never silently ignored or thrown.
const NoPayloadSchema = z.undefined();

const RESET_PASSWORD_URL = 'https://livinity.io/reset-password';
const PRICING_URL = 'https://livinity.io/pricing';

export interface AuthIpcDeps {
  /** Used by the device-flow handlers below to push update events to the renderer. */
  getMainWindow: () => BrowserWindow | null;
}

export function registerAuthIpc(deps: AuthIpcDeps): void {
  // D-08: client-side login throttle. Module-level state — the platform's
  // login endpoint has no server-side rate limiting today, so this is the
  // only thing standing between a scripted renderer and a hammered endpoint.
  let loginFailures = 0;
  let throttleUntil = 0;

  ipcMain.handle(CHANNELS.authLogin, async (_event, raw: unknown) => {
    if (Date.now() < throttleUntil) {
      const retryAfterMs = throttleUntil - Date.now();
      logSafe('auth.login', { throttled: true });
      return { ok: false, status: 429, error: 'throttled', retryAfterMs };
    }

    const parsed = LoginPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, status: 400, error: 'Invalid request' };
    }

    try {
      // NEVER log parsed.data.email / parsed.data.password.
      const result = await login(parsed.data.email, parsed.data.password);

      if (result.ok) {
        loginFailures = 0;
        if (result.sessionValue) {
          await vaultSet('session', result.sessionValue);
        }
        logSafe('auth.login', { ok: true });
        return { ok: true, route: await validateSession() };
      }

      loginFailures++;
      const retryMs = nextBackoffMs(loginFailures);
      if (retryMs > 0) {
        throttleUntil = Date.now() + retryMs;
      }
      logSafe('auth.login', { ok: false });

      if ('networkError' in result) {
        return {
          ok: false,
          status: 0,
          error: 'network',
          retryAfterMs: retryMs || undefined,
        };
      }
      return {
        ok: false,
        status: result.status,
        error: result.error,
        retryAfterMs: retryMs || undefined,
      };
    } catch {
      // Never let an exception (e.g. VAULT_UNAVAILABLE from vaultSet) cross
      // the IPC boundary as an unhandled rejection (T-02-09).
      logSafe('auth.login', { exception: true });
      return { ok: false, status: 500, error: 'internal_error' };
    }
  });

  ipcMain.handle(CHANNELS.authSignOut, async (_event, raw: unknown) => {
    NoPayloadSchema.safeParse(raw);
    try {
      await signOut();
    } catch {
      logSafe('auth.signOut', { exception: true });
    }
    // AuthApi.authSignOut's return type is `{ ok: true }` only — best-effort
    // sign-out is still reported ok so the renderer always returns to login.
    return { ok: true };
  });

  ipcMain.handle(CHANNELS.authGetRoute, async (_event, raw: unknown) => {
    NoPayloadSchema.safeParse(raw);
    try {
      return await validateSession();
    } catch {
      logSafe('auth.getRoute', { exception: true });
      return { kind: 'error' as const, reason: 'network' as const };
    }
  });

  ipcMain.handle(CHANNELS.authChooseFree, async (_event, raw: unknown) => {
    NoPayloadSchema.safeParse(raw);
    try {
      const sessionValue = await vaultGet('session');
      if (!sessionValue) {
        return { ok: false, reason: 'not_signed_in' as const };
      }

      const result = await chooseFree(sessionValue);
      if (result.ok) {
        return { ok: true, route: await validateSession() };
      }
      if ('networkError' in result) {
        return { ok: false, reason: 'unavailable' as const };
      }
      return { ok: false, reason: result.reason };
    } catch {
      logSafe('auth.chooseFree', { exception: true });
      return { ok: false, reason: 'unavailable' as const };
    }
  });

  // AUTH-06 safety: decideKeyAction MUST run before any mintKey call. The
  // ONLY action string sent from this handler is the invisible-mint one —
  // never the destructive replace-action (that is authRegenerateKey's job,
  // below).
  ipcMain.handle(CHANNELS.authGetKeyAction, async (_event, raw: unknown) => {
    NoPayloadSchema.safeParse(raw);
    try {
      const sessionValue = await vaultGet('session');
      if (!sessionValue) {
        return { action: 'choice-screen' as const };
      }

      const vaultHasKey = await vaultHas('apiKey');
      const dash = await getDashboard(sessionValue);

      // Dashboard-failure guard FIRST — before any property access on dash
      // and before decideKeyAction/mintKey are ever reached. A network/5xx
      // failure must not be treated as "no key" or trigger an invisible mint.
      if (!dash.ok) {
        logSafe('auth.getKeyAction', { dashboardFailed: true });
        return { action: 'choice-screen' as const };
      }

      const action = decideKeyAction(vaultHasKey, dash.apiKey.hasKey);

      if (action === 'mint') {
        const mintResult = await mintKey(sessionValue, 'generate-key');
        if (!mintResult.ok) {
          logSafe('auth.getKeyAction', { mintFailed: true });
          return { action: 'choice-screen' as const };
        }
        await vaultSet('apiKey', mintResult.apiKey);
        logSafe('auth.getKeyAction', { action: 'mint' });
        return { action: 'use-cached' as const, prefix: mintResult.prefix };
      }

      if (action === 'stale-reprompt') {
        await vaultDelete('apiKey');
        logSafe('auth.getKeyAction', { action: 'stale-reprompt' });
        return { action: 'choice-screen' as const };
      }

      logSafe('auth.getKeyAction', { action });
      return { action };
    } catch {
      logSafe('auth.getKeyAction', { exception: true });
      return { action: 'choice-screen' as const };
    }
  });

  ipcMain.handle(CHANNELS.authProbeKey, async (_event, raw: unknown) => {
    const parsed = ProbeKeyPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, reason: 'invalid' as const };
    }

    try {
      const result = await probeKey(parsed.data.key);
      if (result.ok) {
        await vaultSet('apiKey', parsed.data.key);
        logSafe('auth.probeKey', { ok: true });
        return { ok: true };
      }
      logSafe('auth.probeKey', { ok: false });
      return { ok: false, reason: result.reason };
    } catch {
      logSafe('auth.probeKey', { exception: true });
      return { ok: false, reason: 'network' as const };
    }
  });

  // The ONLY place in this file that sends the destructive replace-action —
  // reachable only from the KeyChoice screen's explicit confirmed path.
  ipcMain.handle(CHANNELS.authRegenerateKey, async (_event, raw: unknown) => {
    NoPayloadSchema.safeParse(raw);
    try {
      const sessionValue = await vaultGet('session');
      if (!sessionValue) {
        return { ok: false, reason: 'failed' as const };
      }

      const result = await mintKey(sessionValue, 'regenerate-key');
      if (result.ok) {
        await vaultSet('apiKey', result.apiKey);
        logSafe('auth.regenerateKey', { ok: true });
        return { ok: true, prefix: result.prefix };
      }

      logSafe('auth.regenerateKey', { ok: false });
      if ('networkError' in result) {
        return { ok: false, reason: 'network' as const };
      }
      if (result.reason === 'email_unverified' || result.reason === 'subscription_required') {
        return { ok: false, reason: result.reason };
      }
      return { ok: false, reason: 'failed' as const };
    } catch {
      logSafe('auth.regenerateKey', { exception: true });
      return { ok: false, reason: 'failed' as const };
    }
  });

  ipcMain.handle(CHANNELS.authGetAccount, async (_event, raw: unknown) => {
    NoPayloadSchema.safeParse(raw);
    try {
      const sessionValue = await vaultGet('session');
      if (!sessionValue) return null;

      const me = await getMe(sessionValue);
      if (!me.ok) return null;
      return { email: me.user.email, username: me.user.username };
    } catch {
      logSafe('auth.getAccount', { exception: true });
      return null;
    }
  });

  ipcMain.handle(CHANNELS.authOpenExternal, async (_event, raw: unknown) => {
    const parsed = OpenExternalPayloadSchema.safeParse(raw);
    if (!parsed.success) return;

    const url = parsed.data.target === 'reset-password' ? RESET_PASSWORD_URL : PRICING_URL;
    logSafe('auth.openExternal', { target: parsed.data.target });
    try {
      await shell.openExternal(url);
    } catch {
      logSafe('auth.openExternal', { exception: true });
    }
  });

  // Device-flow login (device-flow pivot, D-16/D-18) — no renderer payload
  // to parse; a stray payload is simply ignored.
  ipcMain.handle(CHANNELS.authStartDeviceLogin, async () => {
    try {
      const win = deps.getMainWindow();
      const result = await startDeviceLogin((update) => {
        win?.webContents.send(CHANNELS.authDeviceLoginUpdate, update);
      });
      logSafe('device.start', { ok: result.ok });
      return result;
    } catch {
      logSafe('device.start', { exception: true });
      return { ok: false as const, reason: 'network' as const };
    }
  });

  ipcMain.handle(CHANNELS.authCancelDeviceLogin, async () => {
    try {
      cancelDeviceLogin();
    } catch {
      logSafe('device.cancel', { exception: true });
    }
    logSafe('device.cancel', {});
    return { ok: true as const };
  });
}
