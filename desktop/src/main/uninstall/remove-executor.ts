/**
 * src/main/uninstall/remove-executor.ts
 *
 * The impure, best-effort SUP-02 teardown executor: walks the pure `removePlan`
 * (07-03) in D-13 order (stop-engine -> cf-teardown -> distro-remove ->
 * credential-clear), treating a Cloudflare `CfApiError` 404 as success at every
 * delete call, aggregating failures WITHOUT ever short-circuiting (a CF failure
 * never blocks the rest of the teardown, D-13/T-07-11), deleting only DNS
 * records whose content points at THIS app's tunnel (Pitfall 10), and confining
 * the app's ONLY distro-unregister call to the gated distro-remove step
 * (T-07-12, source-scanned).
 *
 * W3/D-06/T-07-12b: `executeRemove` refuses to run ANY step when
 * `isInstallInFlight()` -- a teardown requested while install.sh is mid-run
 * must never unregister a half-provisioned distro (the WR-05 destruction
 * class). W4: MAIN owns the step set -- `executeRemove` always returns the
 * exact `removePlan(choices, engineRunning)` output it walked (or `[]` when
 * blocked), so the renderer's working list can never disagree with what
 * actually ran. W7: the CF-teardown eligibility is RE-VERIFIED main-side right
 * before the step runs (tier + receipts + vaulted token) -- a renderer choice
 * of `cf:true` alone can never force a teardown call.
 *
 * Filename note: this is `remove-executor.ts`, not the PATTERNS-suggested
 * `remove-flow.ts` -- that basename is already the renderer's pure display
 * core (`src/renderer/screens/remove-flow.ts`, 07-03); this main-side impure
 * executor needed a distinct name to avoid a basename collision (07-03
 * SUMMARY / this plan's own decision).
 *
 * Zero imports from ipc/ or tray/ -- every collaborator is injected via
 * `Partial<RemoveExecutorDeps>` (mirrors engine.ts's `EngineDeps` discipline).
 */

import { app } from 'electron';
import { spawn as nodeSpawn } from 'node:child_process';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { stopEngine as realStopEngine } from '../supervision/engine';
import {
  listDnsByName as realListDnsByName,
  deleteDnsRecord as realDeleteDnsRecord,
  deleteTunnelConnections as realDeleteTunnelConnections,
  deleteTunnel as realDeleteTunnel,
} from '../cloudflare/cf-client';
import { CfApiError } from '../cloudflare/cf-http';
import { vaultGet as realVaultGet, vaultDelete as realVaultDelete } from '../storage/secrets-vault';
import { readState as realReadState, writeState as realWriteState, DEFAULT_STATE } from '../storage/state-store';
import { setStartAtLogin as realSetStartAtLogin } from '../supervision/login-item';
import { isInstallInFlight as realIsInstallInFlight } from '../wsl/install-invoke';
import { execWsl as realExecWsl } from '../wsl/wsl-exec';
import { getMe as realGetMe } from '../platform/auth-client';
import { removePlan } from './remove-plan';
import { logSafe } from '../log';
import type {
  RemoveChoices,
  RemoveStepId,
  RemoveProgress,
  RemoveExecuteAck,
  State,
  VaultKey,
} from '../../../shared/ipc-contract';
import type { DnsRecordList } from '../cloudflare/cf-schemas';

/** The name of the ONE distro this app ever installs/removes. */
const DISTRO_NAME = 'livinity';

/** Every DPAPI-vaulted key credential-clear wipes (VaultKeySchema, ipc-contract.ts). */
const ALL_VAULT_KEYS: VaultKey[] = ['session', 'apiKey', 'cfToken', 'tunnelToken'];

export interface RemoveExecutorDeps {
  stopEngine: () => Promise<void>;
  listDnsByName: (token: string, zoneId: string, name: string) => Promise<DnsRecordList>;
  deleteDnsRecord: (token: string, zoneId: string, id: string) => Promise<void>;
  deleteTunnelConnections: (token: string, acctId: string, tunnelId: string) => Promise<void>;
  deleteTunnel: (token: string, acctId: string, tunnelId: string) => Promise<void>;
  unregisterDistro: (name: string) => Promise<void>;
  vaultDelete: (key: VaultKey) => Promise<void>;
  resetState: () => Promise<void>;
  readState: () => Promise<State | null>;
  vaultGet: (key: VaultKey) => Promise<string | null>;
  /** W7: resolves 'free_byod' | any other tier string, main-side (vaultGet('session') ->
   * getMe(session)) -- the cf-teardown re-verify compares this to the 'free_byod' literal. */
  getTier: () => Promise<string>;
  isInstallInFlight: () => boolean;
  setStartAtLogin: (enabled: boolean) => Promise<void>;
  onProgress: (p: RemoveProgress) => void;
  launchUninstaller: () => Promise<void>;
  quit: () => void;
}

/**
 * THE ONLY distro-unregister call site in `src/main` (source-scanned by
 * remove-executor.test.ts, T-07-12). Routes through the sanctioned execWsl
 * wrapper (windowsHide, never a bare child_process.spawn).
 */
async function defaultUnregisterDistro(name: string): Promise<void> {
  await realExecWsl(['--unregister', name]);
}

/**
 * W7 default: resolves the account tier main-side via the vaulted session,
 * never trusting a renderer-supplied claim. Returns 'unknown' when no session
 * is vaulted or the platform call fails -- comparing against the literal
 * 'free_byod' then safely excludes every non-free_byod/unknown case.
 */
async function defaultGetTier(): Promise<string> {
  const session = await realVaultGet('session');
  if (!session) return 'unknown';
  const result = await realGetMe(session);
  if (result.ok && result.user.free_byod) return 'free_byod';
  return 'other';
}

const UNINSTALLER_FILE_NAME = 'Uninstall Livinity Desktop.exe';

/**
 * Best-effort resolution of the per-user NSIS uninstaller: primary is beside
 * the running exe (electron-builder's perMachine:false layout, A6); fallback
 * is the HKCU UninstallString the NSIS installer registers (Q7). Neither path
 * is secret -- nothing here is ever logged beyond a found/not-found flag.
 */
async function resolveUninstallerPath(): Promise<string | null> {
  const primary = path.join(path.dirname(app.getPath('exe')), UNINSTALLER_FILE_NAME);
  try {
    await fsPromises.access(primary);
    return primary;
  } catch {
    // fall through to the registry fallback
  }
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = nodeSpawn(
        'reg',
        [
          'query',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\io.livinity.desktop',
          '/v',
          'UninstallString',
        ],
        { windowsHide: true }
      );
      let out = '';
      child.stdout?.on('data', (d: Buffer) => (out += d.toString('utf8')));
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`reg query exit ${code}`))));
    });
    const match = /UninstallString\s+REG_SZ\s+(.+)/i.exec(stdout);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Detached+unref launch (mirrors install-invoke.ts's Job-Object-survival
 * shape) so the NSIS uninstaller outlives this process's own quit() call. A
 * missing/unresolvable target is a safe no-op (logged) -- finishRemove still
 * proceeds to quit().
 */
async function defaultLaunchUninstaller(): Promise<void> {
  const target = await resolveUninstallerPath();
  if (!target) {
    logSafe('remove.launchUninstaller', { found: false });
    return;
  }
  const child = nodeSpawn(target, [], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  logSafe('remove.launchUninstaller', { found: true });
}

const NOOP_PROGRESS = (): void => {};

const defaultDeps: RemoveExecutorDeps = {
  stopEngine: () => realStopEngine(),
  listDnsByName: realListDnsByName,
  deleteDnsRecord: realDeleteDnsRecord,
  deleteTunnelConnections: realDeleteTunnelConnections,
  deleteTunnel: realDeleteTunnel,
  unregisterDistro: defaultUnregisterDistro,
  vaultDelete: realVaultDelete,
  resetState: () => realWriteState(DEFAULT_STATE),
  readState: realReadState,
  vaultGet: realVaultGet,
  getTier: defaultGetTier,
  isInstallInFlight: realIsInstallInFlight,
  setStartAtLogin: realSetStartAtLogin,
  onProgress: NOOP_PROGRESS,
  launchUninstaller: defaultLaunchUninstaller,
  quit: () => app.quit(),
};

function resolveDeps(deps: Partial<RemoveExecutorDeps>): RemoveExecutorDeps {
  return { ...defaultDeps, ...deps };
}

/**
 * 404 (CF's not-found terminal status) is treated as SUCCESS at every CF
 * delete call (Q3) -- the resource is already gone, which is exactly the
 * caller's goal.
 */
function isNotFound(err: unknown): boolean {
  return err instanceof CfApiError && err.status === 404;
}

interface CfReceipts {
  tunnelId: string;
  accountId: string;
  zoneId: string;
  zoneName: string;
  subLabel: string;
}

/** The CF facts a completed provision persisted (07-01 StateSchema) -- ALL FIVE must be
 * present for the cf-teardown step to have anything to act on. */
function readReceipts(st: State | null): CfReceipts | null {
  if (!st?.tunnelId || !st.accountId || !st.zoneId || !st.zoneName || !st.subLabel) return null;
  return {
    tunnelId: st.tunnelId,
    accountId: st.accountId,
    zoneId: st.zoneId,
    zoneName: st.zoneName,
    subLabel: st.subLabel,
  };
}

/**
 * The cf-teardown step body. Re-verifies eligibility (W7) immediately before
 * acting -- a miss on ANY of tier/receipts/token marks the step 'skipped',
 * never attempted. Otherwise best-effort in Q3 order: content-filtered DNS
 * delete(s) -> connections (best-effort, ANY failure tolerated) -> tunnel
 * delete (one retry after the connections delete). 404 = success at every
 * delete; any other failure marks the step 'failed' but never throws past
 * this function (D-13 -- the caller never short-circuits on it).
 */
async function runCfTeardown(deps: RemoveExecutorDeps): Promise<'ok' | 'skipped' | 'failed'> {
  const tier = await deps.getTier();
  if (tier !== 'free_byod') return 'skipped';

  const receipts = readReceipts(await deps.readState());
  if (!receipts) return 'skipped';

  const token = await deps.vaultGet('cfToken');
  if (!token) return 'skipped';

  const { tunnelId, accountId, zoneId, zoneName, subLabel } = receipts;
  const apexHost = `${subLabel}.${zoneName}`;
  const target = `${tunnelId}.cfargotunnel.com`;
  let failed = false;

  try {
    const records = await deps.listDnsByName(token, zoneId, apexHost);
    for (const record of records) {
      if (record.content !== target) continue; // Pitfall 10: a foreign record is left untouched
      try {
        await deps.deleteDnsRecord(token, zoneId, record.id);
      } catch (err) {
        if (!isNotFound(err)) failed = true;
      }
    }
  } catch (err) {
    if (!isNotFound(err)) failed = true;
  }

  // Best-effort connector cleanup -- ANY failure here is tolerated silently (Q3 step 3).
  try {
    await deps.deleteTunnelConnections(token, accountId, tunnelId);
  } catch {
    // intentionally swallowed
  }

  try {
    await deps.deleteTunnel(token, accountId, tunnelId);
  } catch (err) {
    if (!isNotFound(err)) {
      // Q3 step 4: one short retry after the connections delete, then continue regardless.
      try {
        await deps.deleteTunnel(token, accountId, tunnelId);
      } catch (err2) {
        if (!isNotFound(err2)) failed = true;
      }
    }
  }

  return failed ? 'failed' : 'ok';
}

/** Runs one plan step, pushing an 'active' progress event then the terminal one. Never
 * throws past this function -- an unexpected collaborator exception marks the step
 * 'failed' (D-13 best-effort, the caller's loop never short-circuits). */
async function runStep(stepId: RemoveStepId, deps: RemoveExecutorDeps): Promise<void> {
  deps.onProgress({ stepId, status: 'active' });
  try {
    if (stepId === 'stop-engine') {
      await deps.stopEngine();
      deps.onProgress({ stepId, status: 'ok' });
      return;
    }
    if (stepId === 'cf-teardown') {
      const status = await runCfTeardown(deps);
      deps.onProgress({ stepId, status });
      return;
    }
    if (stepId === 'distro-remove') {
      await deps.unregisterDistro(DISTRO_NAME);
      deps.onProgress({ stepId, status: 'ok' });
      return;
    }
    // credential-clear
    for (const key of ALL_VAULT_KEYS) await deps.vaultDelete(key);
    await deps.resetState();
    deps.onProgress({ stepId, status: 'ok' });
  } catch {
    deps.onProgress({ stepId, status: 'failed' });
  }
}

/**
 * Walks `removePlan(choices, engineRunning)` in order (D-13), pushing an
 * 'active' then a terminal `RemoveProgress` per step, NEVER short-circuiting
 * on a step failure. Refuses to run ANY step when `isInstallInFlight()`
 * (W3/T-07-12b) -- returns `{blockedByInstall:true, steps:[]}` immediately,
 * calling no teardown collaborator at all. Otherwise resolves with
 * `{blockedByInstall:false, steps}`, where `steps` is the EXACT plan just
 * walked (W4 -- MAIN owns the step set).
 */
export async function executeRemove(
  choices: RemoveChoices,
  depsIn: Partial<RemoveExecutorDeps> = {}
): Promise<RemoveExecuteAck> {
  const deps = resolveDeps(depsIn);

  const st = await deps.readState();
  const engineRunning = st?.engineDesiredState === 'running';
  const steps = removePlan(choices, engineRunning);

  if (deps.isInstallInFlight()) {
    logSafe('remove.execute', { blockedByInstall: true });
    return { blockedByInstall: true, steps: [] };
  }

  for (const stepId of steps) {
    await runStep(stepId, deps);
  }

  logSafe('remove.execute', { blockedByInstall: false, stepCount: steps.length });
  return { blockedByInstall: false, steps };
}

/**
 * Disarms the login item (W1: `setStartAtLogin(false)`, NEVER the zero-arg
 * `syncLoginItem` -- it has no `false` form), launches the per-user NSIS
 * uninstaller detached, then quits. The app's ONLY self-quit call site.
 */
export async function finishRemove(depsIn: Partial<RemoveExecutorDeps> = {}): Promise<void> {
  const deps = resolveDeps(depsIn);
  await deps.setStartAtLogin(false);
  await deps.launchUninstaller();
  deps.quit();
}
