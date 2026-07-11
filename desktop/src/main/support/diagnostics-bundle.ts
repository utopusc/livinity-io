/**
 * src/main/support/diagnostics-bundle.ts
 *
 * The SUP-01 diagnostics exporter (D-08/D-09, 07-RESEARCH.md). Stages five
 * TEXT files under a temp folder in `userData`, zips them via `zip.ts`, then
 * asks the user where to save via `dialog.showSaveDialog`. The load-bearing
 * safety property — proven by a dedicated hostile-seed unit test — is that
 * NOTHING secret-shaped ever survives into the assembled bundle:
 *
 *   - The DPAPI vault module is NEVER imported (the vault is never read; the
 *     bundle only ever touches `readState()`'s NON-SECRET StateSchema keys
 *     and the non-secret `holder.json` pid/timestamp record).
 *   - `main.log` (+ its rotated `main.old.log` predecessor) is redacted
 *     PER LINE via `redactSecretLike` (`log.ts`), never as one whole-file
 *     pass — `redactSecretLike`'s 500-char cap would otherwise truncate a
 *     multi-KB log to its first 500 characters (the bundle caveat this
 *     phase's PATTERNS.md calls out explicitly).
 *   - `state-redacted.json` is a WHITELIST serializer over
 *     `Object.keys(StateSchema.shape)` ONLY, every value additionally
 *     scrubbed through `redactSecretLike` (belt-and-braces: StateSchema
 *     itself already carries no secret fields, RESEARCH.md Anti-Pattern).
 *   - `install-tail.txt` reuses the ALREADY-redacted tail shape
 *     `install-invoke.ts` establishes (lines ~257-263) — this module never
 *     re-derives raw installer output itself.
 *
 * W6 (the 06 WR-03 regression class): the in-distro `systemctl is-active`
 * capture inside `wsl-status.txt` is GATED on `getEngineStatus` reporting the
 * engine is actually running — a diagnostics export must NEVER boot a
 * stopped distro just to read its status. The three HOST-side captures
 * (`wsl --status`/`--version`/`-l -v`) always run — they never touch the
 * `livinity` distro itself.
 *
 * Every IO collaborator is injected via `Partial<DiagnosticsDeps>` (mirrors
 * `install-invoke.ts`/`holder.ts`) — including plain fs reads/writes, per
 * this phase's hard rule that tests mock ALL fs/wsl IO, never touching a
 * real disk or a real `powershell.exe`/`wsl.exe`. Zero imports from ipc/ or
 * tray/ — IPC entry is a later plan (07-07).
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fsPromises } from 'node:fs';
import { app, dialog } from 'electron';
import { readState as realReadState } from '../storage/state-store';
import { execWsl as realExecWsl, type ExecResult } from '../wsl/wsl-exec';
import { getEngineStatus as realGetEngineStatus } from '../supervision/engine';
import { readHolderRecord as realReadHolderRecord, type HolderRecord } from '../supervision/holder';
import { getUpdateState as realGetUpdateState } from '../update/updater';
import { redactSecretLike } from '../log';
import { zipStagingFolder as realZip, type ZipResult } from './zip';
import { StateSchema, type DiagnosticsExportResult, type State, type EngineStatusResult } from '../../../shared/ipc-contract';

type ExecWslFn = (args: string[], opts?: { timeoutMs?: number }) => Promise<ExecResult>;

/** Bundled app-context facts for `meta.txt`. `tier` has no persisted main-side
 * source (D-xx no-tier-disclosure — tier is never written to state.json), so
 * the production default degrades to 'unknown' rather than guessing from
 * incidental CF-provisioning fields; a future live account probe can widen
 * this without touching the bundle's shape. */
export interface AppInfo {
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  windowsBuild: string;
  locale: string;
  tier: string;
  updateState: string;
}

export interface DiagnosticsDeps {
  readState: typeof realReadState;
  getLogsPath: () => string;
  getUserDataPath: () => string;
  getDownloadsPath: () => string;
  getAppInfo: () => AppInfo;
  execWsl: ExecWslFn;
  /** W6: the engine-running signal that gates the in-distro `systemctl`
   * capture — never boots a stopped distro. Niladic (no EngineDeps
   * pass-through needed at this seam). */
  getEngineStatus: () => Promise<EngineStatusResult>;
  getHolderRecord: () => Promise<HolderRecord | null>;
  zip: (stagingDir: string, zipPath: string) => Promise<ZipResult>;
  showSaveDialog: (defaultPath: string) => Promise<{ canceled: boolean; filePath?: string }>;
  copyFile: (src: string, dest: string) => Promise<void>;
  /** Last ~200 redacted lines of the in-distro installer log if reachable,
   * else `null` (never boots a stopped distro to fetch it — W6 spirit). */
  readInstallTail: () => Promise<string | null>;
  mkdir: (p: string) => Promise<void>;
  writeFile: (p: string, data: string) => Promise<void>;
  /** Tolerant read — resolves '' for a missing/unreadable file rather than throwing. */
  readFile: (p: string) => Promise<string>;
}

const INSTALL_TAIL_FALLBACK =
  'No install log data available (engine offline or log not reachable; no persisted failure reason on disk).';
const ENGINE_STOPPED_SKIP_MESSAGE = 'engine stopped — in-distro status skipped';
const SYSTEMCTL_ARGS = ['-d', 'livinity', '-u', 'root', '--', 'systemctl', 'is-active', 'livos.service', 'cloudflared'];
const INSTALL_TAIL_ARGS = ['-d', 'livinity', '-u', 'root', '--', 'sh', '-lc', 'tail -n 200 /var/log/livinity-install.log 2>/dev/null || true'];

function defaultGetAppInfo(): AppInfo {
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown',
    nodeVersion: process.versions.node,
    windowsBuild: os.release(),
    locale: app.getLocale(),
    tier: 'unknown',
    updateState: realGetUpdateState().state,
  };
}

/** Never boots a stopped distro (W6): only attempts the in-distro tail when
 * `getEngineStatus` reports the engine is actually running. */
async function defaultReadInstallTail(): Promise<string | null> {
  try {
    const status = await realGetEngineStatus({});
    if (status.state !== 'running') return null;
    const result = await realExecWsl(INSTALL_TAIL_ARGS);
    if (result.code !== 0 || !result.stdout.trim()) return null;
    return result.stdout;
  } catch {
    return null;
  }
}

function tolerantReadFile(p: string): Promise<string> {
  return fsPromises.readFile(p, 'utf8').catch(() => '');
}

const defaultDeps: DiagnosticsDeps = {
  readState: realReadState,
  getLogsPath: () => app.getPath('logs'),
  getUserDataPath: () => app.getPath('userData'),
  getDownloadsPath: () => app.getPath('downloads'),
  getAppInfo: defaultGetAppInfo,
  execWsl: realExecWsl,
  getEngineStatus: () => realGetEngineStatus({}),
  getHolderRecord: () => realReadHolderRecord(),
  zip: realZip,
  showSaveDialog: async (defaultPath: string) => dialog.showSaveDialog({ defaultPath }),
  copyFile: (src, dest) => fsPromises.copyFile(src, dest),
  readInstallTail: defaultReadInstallTail,
  mkdir: (p) => fsPromises.mkdir(p, { recursive: true }).then(() => undefined),
  writeFile: (p, data) => fsPromises.writeFile(p, data, 'utf8'),
  readFile: tolerantReadFile,
};

function resolveDeps(deps: Partial<DiagnosticsDeps>): DiagnosticsDeps {
  return { ...defaultDeps, ...deps };
}

/** PER-LINE redaction (never a whole-file pass — `redactSecretLike`'s 500-char
 * cap would truncate a multi-KB file to its first 500 characters). */
function redactPerLine(content: string): string {
  return content.split('\n').map(redactSecretLike).join('\n');
}

/** Whitelist state serializer — ONLY `StateSchema.shape` keys, every value
 * additionally scrubbed through `redactSecretLike` (belt-and-braces; the
 * vault is never read, so no secret value can reach `st` in the first place). */
function serializeStateRedacted(st: State | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!st) return out;
  for (const key of Object.keys(StateSchema.shape)) {
    const value = (st as unknown as Record<string, unknown>)[key];
    if (value === undefined) continue;
    out[key] = redactSecretLike(String(value));
  }
  return out;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `livinity-diagnostics-<yyyymmdd-hhmm>.zip` (D-09). */
export function formatDiagnosticsFileName(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  return `livinity-diagnostics-${yyyy}${mm}${dd}-${hh}${mi}.zip`;
}

async function buildWslStatusText(d: DiagnosticsDeps, engineStatus: EngineStatusResult): Promise<string> {
  const [statusRes, versionRes, listRes] = await Promise.all([
    d.execWsl(['--status']),
    d.execWsl(['--version']),
    d.execWsl(['-l', '-v']),
  ]);

  // W6: never boot a stopped distro just to read its in-distro status.
  let systemctlSection: string;
  if (engineStatus.state === 'running') {
    const r = await d.execWsl(SYSTEMCTL_ARGS);
    systemctlSection = `systemctl is-active livos.service cloudflared (exit ${r.code}):\n${r.stdout}${r.stderr}`;
  } else {
    systemctlSection = ENGINE_STOPPED_SKIP_MESSAGE;
  }

  const wslconfigRaw = await d.readFile(path.join(os.homedir(), '.wslconfig'));

  return [
    '--- wsl --status ---',
    statusRes.stdout || statusRes.stderr,
    '--- wsl --version ---',
    versionRes.stdout || versionRes.stderr,
    '--- wsl -l -v ---',
    listRes.stdout || listRes.stderr,
    '--- engine status snapshot ---',
    JSON.stringify(engineStatus),
    '--- in-distro systemctl is-active ---',
    systemctlSection,
    '--- .wslconfig ---',
    wslconfigRaw || '(absent)',
  ].join('\n');
}

/**
 * Stages the D-08 5-file bundle, zips it (`zip.ts`), then asks the user where
 * to save via `dialog.showSaveDialog` (defaulting to Downloads). Never
 * throws past this function — every branch (zip failure, dialog cancel, a
 * thrown collaborator) degrades to a `DiagnosticsExportResult` union member.
 */
export async function exportDiagnostics(deps: Partial<DiagnosticsDeps> = {}): Promise<DiagnosticsExportResult> {
  const d = resolveDeps(deps);
  try {
    const now = Date.now();
    const stagingDir = path.join(d.getUserDataPath(), `diagnostics-${now}`);
    await d.mkdir(stagingDir);

    const [appInfo, st, engineStatus, holderRecord, installTail] = await Promise.all([
      Promise.resolve(d.getAppInfo()),
      d.readState(),
      d.getEngineStatus(),
      d.getHolderRecord(),
      d.readInstallTail(),
    ]);

    // 1. meta.txt
    const metaText = [
      `appVersion: ${appInfo.appVersion}`,
      `electronVersion: ${appInfo.electronVersion}`,
      `nodeVersion: ${appInfo.nodeVersion}`,
      `windowsBuild: ${appInfo.windowsBuild}`,
      `locale: ${appInfo.locale}`,
      `tier: ${appInfo.tier}`,
      `updateState: ${appInfo.updateState}`,
      `engineDesiredState: ${st?.engineDesiredState ?? 'stopped'}`,
      `timestamp: ${new Date(now).toISOString()}`,
    ].join('\n');
    await d.writeFile(path.join(stagingDir, 'meta.txt'), metaText);

    // 2. main.log (+ rotated main.old.log predecessor), PER-LINE redacted.
    const logsDir = d.getLogsPath();
    const [oldLog, mainLog] = await Promise.all([
      d.readFile(path.join(logsDir, 'main.old.log')),
      d.readFile(path.join(logsDir, 'main.log')),
    ]);
    const combinedLog = [oldLog, mainLog].filter(Boolean).join('\n');
    await d.writeFile(path.join(stagingDir, 'main.log'), redactPerLine(combinedLog));

    // 3. state-redacted.json — whitelist StateSchema keys + non-secret holder.json.
    const stateRedacted = {
      state: serializeStateRedacted(st),
      holder: holderRecord,
    };
    await d.writeFile(path.join(stagingDir, 'state-redacted.json'), JSON.stringify(stateRedacted, null, 2));

    // 4. wsl-status.txt — host-side captures always run; in-distro systemctl gated on W6.
    const wslStatusText = await buildWslStatusText(d, engineStatus);
    await d.writeFile(path.join(stagingDir, 'wsl-status.txt'), redactPerLine(wslStatusText));

    // 5. install-tail.txt — already-redacted per line; falls back when unreachable.
    const tailContent = installTail ? redactPerLine(installTail) : INSTALL_TAIL_FALLBACK;
    await d.writeFile(path.join(stagingDir, 'install-tail.txt'), tailContent);

    // Zip to a temp target under userData FIRST (Q6 sequencing) — keeps PS
    // quoting confined to app-owned paths and makes a dialog cancel free.
    const zipPath = path.join(d.getUserDataPath(), `livinity-diagnostics-${now}.zip`);
    const zipResult = await d.zip(stagingDir, zipPath);
    if (!zipResult.ok) {
      return { outcome: 'folder-fallback' };
    }

    const defaultPath = path.join(d.getDownloadsPath(), formatDiagnosticsFileName(new Date(now)));
    const dialogResult = await d.showSaveDialog(defaultPath);
    if (dialogResult.canceled || !dialogResult.filePath) {
      return { outcome: 'cancelled' };
    }

    await d.copyFile(zipPath, dialogResult.filePath);
    return { outcome: 'saved' };
  } catch {
    return { outcome: 'failed' };
  }
}
