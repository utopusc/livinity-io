/**
 * src/main/ipc/cf.ipc.ts
 *
 * The renderer<->main IPC boundary for the Cloudflare (Free/BYOD) wizard — the
 * six zod-validated cf:* invoke handlers plus the cf:provisionUpdate progress
 * push. Mirrors src/main/ipc/auth.ipc.ts VERBATIM: every renderer-supplied
 * payload is safeParse'd before it touches an orchestrator, every handler body
 * is wrapped in try/catch so no exception ever crosses the boundary as a
 * rejected IPC promise (a safe result union is returned instead), and every
 * logSafe carries scalar metadata only — never a token.
 *
 * SECRET DISCIPLINE (T-03-02): the CF API token crosses IN exactly once on
 * cf:verifyToken (like authProbeKey's key) and is stored to the DPAPI vault
 * MAIN-SIDE by verifyAndProbe on an all-scope pass; it NEVER returns across any
 * of these channels. The connector token is fetched and vaulted inside
 * cf-provision and likewise never returns. The Cf* result schemas are secret-
 * free by construction (03-01) — nothing here can leak a secret back.
 *
 * DEEP-LINK ALLOWLIST (T-03-15): cf:openExternal accepts a two-value enum, not
 * a URL. The handler maps the enum to a FIXED deep-link builder URL, so a raw
 * renderer-supplied URL is structurally impossible to reach shell.openExternal
 * (copied verbatim from auth.ipc.ts's enum-allowlisted openExternal).
 *
 * TAMPERING GUARD (T-03-16): a malformed payload is rejected with a safe union
 * BEFORE any orchestrator is called — never passed through, never thrown.
 *
 * cf:provisionUpdate is a main -> renderer progress push (mirrors
 * authDeviceLoginUpdate) forwarded through deps.getMainWindow() — the one thing
 * this file's CfIpcDeps is retained for. Zero imports from tray/ or renderer/.
 */

import { ipcMain, shell, type BrowserWindow } from 'electron';
import { z } from 'zod';
import { CHANNELS } from '../../../shared/ipc-contract';
import {
  verifyAndProbe,
  getZonesFromVault,
  selectDomainProbe,
  recheckZone,
} from '../cloudflare/cf-verify';
import { provisionTunnelAndDns } from '../cloudflare/cf-provision';
import { buildTokenDeepLink, buildAddSiteDeepLink } from '../cloudflare/deep-link';
import { vaultGet } from '../storage/secrets-vault';
import { getMe } from '../platform/auth-client';
import { logSafe } from '../log';

// Per-handler payload schemas (mirror auth.ipc.ts:35-42). Every argument-bearing
// handler safeParse's its exact shape; NoPayload = z.undefined() still runs on
// no-arg handlers as defense in depth (a hostile renderer's stray payload is
// rejected the same way, never silently trusted).
const VerifyTokenPayload = z.object({ token: z.string().min(1) });
const SelectDomainPayload = z.object({ zoneId: z.string().min(1), subLabel: z.string().min(1) });
const RecheckPayload = z.object({ zoneId: z.string().min(1) });
const ProvisionPayload = z.object({ takeOver: z.boolean().optional() });
const CfOpenExternalPayload = z.object({ target: z.enum(['token-form', 'add-site']) });
const NoPayload = z.undefined();

export interface CfIpcDeps {
  /** Used by cf:provision to push cf:provisionUpdate progress events to the renderer. */
  getMainWindow: () => BrowserWindow | null;
}

export function registerCfIpc(deps: CfIpcDeps): void {
  // cf:verifyToken — the token crosses IN once (like authProbeKey) and is
  // vaulted main-side by verifyAndProbe on an all-scope pass; it NEVER returns.
  // A malformed payload is rejected with a token-invalid-shaped safe default so
  // the renderer shows the "check the token" state — verifyAndProbe is never
  // reached, and the token is never logged.
  ipcMain.handle(CHANNELS.cfVerifyToken, async (_event, raw: unknown) => {
    const parsed = VerifyTokenPayload.safeParse(raw);
    if (!parsed.success) {
      return { kind: 'token-invalid' as const };
    }
    try {
      return await verifyAndProbe(parsed.data.token);
    } catch {
      logSafe('cf.verifyToken', { exception: true });
      return { kind: 'network' as const };
    }
  });

  ipcMain.handle(CHANNELS.cfGetZones, async (_event, raw: unknown) => {
    NoPayload.safeParse(raw);
    try {
      return await getZonesFromVault();
    } catch {
      logSafe('cf.getZones', { exception: true });
      return { ok: false as const, reason: 'network' as const };
    }
  });

  ipcMain.handle(CHANNELS.cfSelectDomain, async (_event, raw: unknown) => {
    const parsed = SelectDomainPayload.safeParse(raw);
    if (!parsed.success) {
      return { kind: 'network' as const };
    }
    try {
      return await selectDomainProbe(parsed.data.zoneId, parsed.data.subLabel);
    } catch {
      logSafe('cf.selectDomain', { exception: true });
      return { kind: 'network' as const };
    }
  });

  ipcMain.handle(CHANNELS.cfRecheckZone, async (_event, raw: unknown) => {
    const parsed = RecheckPayload.safeParse(raw);
    if (!parsed.success) {
      return { kind: 'network' as const };
    }
    try {
      return await recheckZone(parsed.data.zoneId);
    } catch {
      logSafe('cf.recheckZone', { exception: true });
      return { kind: 'network' as const };
    }
  });

  // cf:provision — resolves the username MAIN-SIDE from the vault session
  // (mirrors auth.ipc's getMe(sessionValue) precedent) rather than trusting a
  // renderer-supplied username; a missing/failed session resolves to null, and
  // deriveTunnelName falls back to the subLabel so provisioning still yields a
  // deterministic tunnel name. The onUpdate callback forwards cf:provisionUpdate
  // to the main window (a null window makes it a no-op). takeOver=true is only
  // ever sent from the Collision screen's confirmed path (D-08).
  ipcMain.handle(CHANNELS.cfProvision, async (_event, raw: unknown) => {
    const parsed = ProvisionPayload.safeParse(raw);
    if (!parsed.success) {
      return { kind: 'error' as const, reason: 'internal_error' };
    }
    try {
      const sessionValue = await vaultGet('session');
      const me = sessionValue ? await getMe(sessionValue) : null;
      const username = me?.ok ? me.user.username : null;

      const win = deps.getMainWindow();
      return await provisionTunnelAndDns({ username, takeOver: parsed.data.takeOver }, (u) =>
        win?.webContents.send(CHANNELS.cfProvisionUpdate, u)
      );
    } catch {
      logSafe('cf.provision', { exception: true });
      return { kind: 'error' as const, reason: 'internal_error' };
    }
  });

  // cf:openExternal — enum-allowlisted (T-03-15). The renderer sends one of two
  // fixed enum targets; the handler maps it to a frozen builder URL. A raw
  // renderer-supplied URL can NEVER reach shell.openExternal (the schema admits
  // no URL string at all). Only the scalar target is logged, never a URL.
  ipcMain.handle(CHANNELS.cfOpenExternal, async (_event, raw: unknown) => {
    const parsed = CfOpenExternalPayload.safeParse(raw);
    if (!parsed.success) return;

    const url = parsed.data.target === 'token-form' ? buildTokenDeepLink() : buildAddSiteDeepLink();
    logSafe('cf.openExternal', { target: parsed.data.target });
    try {
      await shell.openExternal(url);
    } catch {
      logSafe('cf.openExternal', { exception: true });
    }
  });
}
