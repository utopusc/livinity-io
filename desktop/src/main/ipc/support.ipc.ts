/**
 * src/main/ipc/support.ipc.ts
 *
 * The renderer<->main IPC boundary for diagnostics export (SUP-01) and the
 * two-layer clean uninstall (SUP-02) — support:exportDiagnostics plus the
 * remove:getOffer/execute/finish/openCfDashboard quartet, and the
 * remove:progress main -> renderer push. Mirrors src/main/ipc/engine.ipc.ts
 * VERBATIM: every renderer-supplied payload is safeParse'd before it touches
 * an orchestrator, every handler body is wrapped in try/catch so no exception
 * ever crosses the boundary as a rejected IPC promise (a safe result union is
 * returned instead), and every logSafe carries scalar metadata only — never
 * a secret.
 *
 * D-12 (remove:getOffer, secret-free view-model): eligibility is computed
 * ENTIRELY main-side — free_byod tier (via the vaulted session + getMe),
 * ALL FIVE CF-provisioning receipts present on state.json, and a vaulted
 * cfToken present. The handler returns ONLY {offerCfTeardown, apexHost} —
 * NEVER the token or any receipt content. This duplicates (rather than
 * imports) the identical three-part check remove-executor.ts's runCfTeardown
 * already re-verifies before acting (07-06) — the two call sites live in
 * different modules by design (IPC-handler code vs. the teardown executor),
 * but implement the SAME shape, proven once at 07-06 and reused here.
 *
 * W3 (defense in depth) + W4 (MAIN owns the step set): remove:execute checks
 * `isInstallInFlight()` ITSELF, in addition to executeRemove's own identical
 * internal check (remove-executor.ts, 07-06) — a renderer can never trigger a
 * teardown while install.sh is mid-run, even if one of the two gates were
 * ever bypassed. The handler always returns executeRemove's own
 * {blockedByInstall, steps} ack verbatim (W4 — MAIN, never the renderer,
 * decides the step set).
 *
 * B2 (enum-allowlisted, no renderer URL): remove:openCfDashboard maps
 * NoPayload to the FIXED `https://dash.cloudflare.com` literal — mirrors
 * cf:openExternal/wsl:openExternal's enum-allowlist; no URL ever crosses this
 * channel in either direction.
 *
 * `registerSupportIpc` RETURNS `{ pushRemoveProgress }` (mirrors
 * `registerUpdateIpc`'s I5 `pushUpdateStatus`) — the ONE `remove:progress`
 * sender, wired directly into `executeRemove`'s `onProgress` dep below.
 *
 * Zero imports from tray/ or index.ts. `registerSupportIpc` has no call site
 * yet — inert until 07-11 wires it into `app.whenReady`.
 */

import { ipcMain, shell, type BrowserWindow } from 'electron';
import { z } from 'zod';
import {
  CHANNELS,
  RemoveChoicesSchema,
  type DiagnosticsExportResult,
  type RemoveOffer,
  type RemoveProgress,
  type RemoveExecuteAck,
  type VaultKey,
  type State,
} from '../../../shared/ipc-contract';
import { exportDiagnostics, type DiagnosticsDeps } from '../support/diagnostics-bundle';
import { executeRemove, finishRemove, type RemoveExecutorDeps } from '../uninstall/remove-executor';
import { vaultGet as realVaultGet } from '../storage/secrets-vault';
import { readState as realReadState } from '../storage/state-store';
import { getMe as realGetMe } from '../platform/auth-client';
import { isInstallInFlight as realIsInstallInFlight } from '../wsl/install-invoke';
import { logSafe } from '../log';

// NoPayload = z.undefined() still runs on every no-arg handler as defense in
// depth (mirrors engine.ipc.ts/cf.ipc.ts) — a hostile renderer's stray
// payload is BRANCHED on, never silently discarded.
const NoPayload = z.undefined();

const SAFE_DIAGNOSTICS_DEFAULT: DiagnosticsExportResult = { outcome: 'failed' };
const SAFE_OFFER_DEFAULT: RemoveOffer = { offerCfTeardown: false, apexHost: null };
const SAFE_EXECUTE_DEFAULT: RemoveExecuteAck = { blockedByInstall: false, steps: [] };
const BLOCKED_EXECUTE_ACK: RemoveExecuteAck = { blockedByInstall: true, steps: [] };
const CF_DASHBOARD_URL = 'https://dash.cloudflare.com';

export interface SupportIpcDeps {
  /** remove:progress push target (returned below as pushRemoveProgress). */
  getMainWindow: () => BrowserWindow | null;
  /** Test-injectable override of exportDiagnostics' full collaborator set —
   * production leaves this undefined (diagnostics-bundle.ts's own real
   * defaults apply). */
  diagnosticsDeps?: Partial<DiagnosticsDeps>;
  /** Test-injectable override of executeRemove/finishRemove's collaborator
   * set, ALSO the source for remove:getOffer's D-12 tier/receipts/token
   * check (vaultGet/readState/getTier fields) — production leaves this
   * undefined (remove-executor.ts's own real defaults apply). */
  removeDeps?: Partial<RemoveExecutorDeps>;
}

export interface SupportIpcHandles {
  /** The single `remove:progress` sender — wired directly into
   * executeRemove's onProgress dep inside this file. */
  pushRemoveProgress: (p: RemoveProgress) => void;
}

/** W7's identical getTier resolution (remove-executor.ts, 07-06), duplicated
 * here as this handler's own default so remove:getOffer never depends on a
 * private, unexported symbol from another module. */
async function defaultGetTier(): Promise<string> {
  const session = await realVaultGet('session');
  if (!session) return 'unknown';
  const result = await realGetMe(session);
  if (result.ok && result.user.free_byod) return 'free_byod';
  return 'other';
}

/** D-12: ALL FIVE CF-provisioning receipts must be present on state.json for
 * the offer to have anything to act on (mirrors remove-executor.ts's
 * readReceipts guard verbatim). */
function hasAllReceipts(st: State | null): st is State & {
  tunnelId: string; accountId: string; zoneId: string; zoneName: string; subLabel: string;
} {
  return Boolean(st?.tunnelId && st.accountId && st.zoneId && st.zoneName && st.subLabel);
}

interface OfferDeps {
  vaultGet: (key: VaultKey) => Promise<string | null>;
  readState: () => Promise<State | null>;
  getTier: () => Promise<string>;
}

/** Computes the D-12 secret-free offer. ANY uncertainty (wrong tier, a
 * missing receipt, no vaulted token, or a thrown collaborator) resolves to
 * the same {offerCfTeardown:false, apexHost:null} default — never a token or
 * receipt field crosses this function's return. */
async function computeRemoveOffer(deps: OfferDeps): Promise<RemoveOffer> {
  const tier = await deps.getTier();
  if (tier !== 'free_byod') return SAFE_OFFER_DEFAULT;

  const st = await deps.readState();
  if (!hasAllReceipts(st)) return SAFE_OFFER_DEFAULT;

  const token = await deps.vaultGet('cfToken');
  if (!token) return SAFE_OFFER_DEFAULT;

  return { offerCfTeardown: true, apexHost: `${st.subLabel}.${st.zoneName}` };
}

export function registerSupportIpc(deps: SupportIpcDeps): SupportIpcHandles {
  const pushRemoveProgress = (p: RemoveProgress): void => {
    deps.getMainWindow()?.webContents.send(CHANNELS.removeProgress, p);
  };

  const offerDeps: OfferDeps = {
    vaultGet: deps.removeDeps?.vaultGet ?? realVaultGet,
    readState: deps.removeDeps?.readState ?? realReadState,
    getTier: deps.removeDeps?.getTier ?? defaultGetTier,
  };

  ipcMain.handle(CHANNELS.supportExportDiagnostics, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return SAFE_DIAGNOSTICS_DEFAULT;
    try {
      return await exportDiagnostics(deps.diagnosticsDeps ?? {});
    } catch {
      logSafe('support.exportDiagnostics', { exception: true });
      return SAFE_DIAGNOSTICS_DEFAULT;
    }
  });

  // remove:getOffer — D-12, main-side ONLY. NEVER returns the token or any
  // receipt field; ANY uncertainty resolves to the safe "don't offer" default.
  ipcMain.handle(CHANNELS.removeGetOffer, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return SAFE_OFFER_DEFAULT;
    try {
      return await computeRemoveOffer(offerDeps);
    } catch {
      logSafe('remove.getOffer', { exception: true });
      return SAFE_OFFER_DEFAULT;
    }
  });

  // remove:execute — W3 defense-in-depth: this handler checks
  // isInstallInFlight() ITSELF (in addition to executeRemove's own identical
  // internal check, 07-06) before calling a single teardown collaborator.
  // Always returns executeRemove's own {blockedByInstall, steps} ack verbatim
  // (W4 — MAIN owns the step set).
  ipcMain.handle(CHANNELS.removeExecute, async (_event, raw: unknown) => {
    const parsed = RemoveChoicesSchema.safeParse(raw);
    if (!parsed.success) return SAFE_EXECUTE_DEFAULT;

    const isInstallInFlight = deps.removeDeps?.isInstallInFlight ?? realIsInstallInFlight;
    if (isInstallInFlight()) {
      logSafe('remove.execute', { blockedByInstall: true });
      return BLOCKED_EXECUTE_ACK;
    }

    try {
      return await executeRemove(parsed.data, { ...deps.removeDeps, onProgress: pushRemoveProgress });
    } catch {
      logSafe('remove.execute', { exception: true });
      return SAFE_EXECUTE_DEFAULT;
    }
  });

  ipcMain.handle(CHANNELS.removeFinish, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return;
    try {
      await finishRemove(deps.removeDeps ?? {});
    } catch {
      logSafe('remove.finish', { exception: true });
    }
  });

  // remove:openCfDashboard — enum-allowlisted (B2). NoPayload maps to the
  // FIXED dash.cloudflare.com literal; no renderer URL can ever reach
  // shell.openExternal through this channel.
  ipcMain.handle(CHANNELS.removeOpenCfDashboard, async (_event, raw: unknown) => {
    const parsed = NoPayload.safeParse(raw);
    if (!parsed.success) return;
    logSafe('remove.openCfDashboard', {});
    try {
      await shell.openExternal(CF_DASHBOARD_URL);
    } catch {
      logSafe('remove.openCfDashboard', { exception: true });
    }
  });

  return { pushRemoveProgress };
}
