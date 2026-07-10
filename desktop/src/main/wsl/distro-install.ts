/**
 * src/main/wsl/distro-install.ts
 *
 * The WSL-03 write orchestrator: from "WSL is enabled" to "the slim livinity
 * Ubuntu-24.04 distro is imported and boot-verified," entirely hidden. Guard-
 * before-mutate + outer-try/catch-to-safe-union + onUpdate progress shape,
 * mirroring src/main/cloudflare/cf-provision.ts. Every unexpected throw
 * degrades to `{ kind: 'error' }` — never a rejected promise crossing the IPC
 * boundary (04-09's wsl:distroInstall handler).
 *
 * Hard invariants:
 * - D-10 (EARLY disk gate): the >=15GB free-space check runs BEFORE the
 *   multi-GB download starts — never wasted bandwidth on a doomed install.
 * - T-04-05 (supply-chain guard): the downloaded rootfs sha256 is verified
 *   BEFORE it is ever handed to `--install`/`--import` — a mismatch deletes
 *   the temp file and returns `checksum-failed`, the import step is never
 *   reached.
 * - D-11 (reuse, never destroy): an existing 'livinity' distro is reused —
 *   this module contains NO distro-removal command anywhere (grep-enforced
 *   in the plan's acceptance criteria); a possibly-user-data-bearing distro
 *   is never torn down by this orchestrator.
 * - Pitfall 3 (first-boot capture): immediately after a fresh import, the
 *   distro is booted ONCE (getVmLaunchError, 04-04) to surface a launch-time
 *   `0x80370102` firmware block rather than silently declaring the install
 *   'installed' on a VM that cannot actually start. A genuine block resolves
 *   `{ kind: 'error' }` here; the subsequent wsl:detect/wsl:checkBios (04-09)
 *   reactive probe is what routes the user to the BIOS dead-end screen — the
 *   distro itself stays imported (D-11), so that re-check is cheap.
 * - Pitfall 6 (sparse is an optimization, not a correctness requirement): a
 *   `--set-sparse` failure (older WSL, feature unavailable) never fails the
 *   install — it is logged and ignored.
 *
 * Zero imports from ipc/ or tray/ — a main-process orchestration primitive,
 * same isolation rule as cf-provision.ts.
 */

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import https from 'node:https';
import { randomUUID, createHash } from 'node:crypto';
import { execWsl, type ExecResult } from './wsl-exec';
import { getFreeDiskGb, getVmLaunchError } from './disk-probe';
import { isDistroRegistered, parseWslVersion } from './parse-wsl-list';
import { logSafe } from '../log';
import type { WslDistroInstallResult, WslDownloadUpdate } from '../../../shared/ipc-contract';

const DISTRO_NAME = 'livinity';

// Cross-team CI dependency (D-07/Claude's Discretion): the ACTUAL livinity.wsl
// rootfs artifact + its published sha256 are produced by a SEPARATE release
// pipeline (same GitHub Releases channel the app's own auto-update already
// uses) — building that artifact is explicitly out of THIS phase's scope
// (04-RESEARCH.md Don't-Hand-Roll). This orchestrator's download/verify/
// import machinery is built and unit-tested against these manifest
// constants; they MUST be updated to the real published values before the
// 04-10 operator UAT can succeed end-to-end against a live artifact.
const ROOTFS_RELEASE_URL =
  'https://github.com/livinity-io/livos/releases/latest/download/livinity.wsl';
const ROOTFS_SHA256 = 'PUBLISHED_BY_CI_RELEASE_PIPELINE_PLACEHOLDER_SHA256';

// No arm64 rootfs artifact exists yet (D-09) — an arm64 machine is blocked
// gracefully rather than attempting a corrupt x64-on-arm64 import.
const ARM64_ROOTFS_URL: string | null = null;

/** Injectable IO collaborators — production defaults below, fully fake-able in tests. */
export interface ProvisionDistroDeps {
  execWsl: (args: string[], opts?: { timeoutMs?: number }) => Promise<ExecResult>;
  getFreeDiskGb: (driveLetter: string) => Promise<number>;
  getVmLaunchError: (distroRegistered: boolean) => Promise<string | null>;
  downloadFile: (
    url: string,
    destPath: string,
    onProgress?: (doneBytes: number, totalBytes: number) => void
  ) => Promise<void>;
  sha256File: (filePath: string) => Promise<string>;
  unlinkFile: (filePath: string) => Promise<void>;
}

/**
 * Compares two dotted version strings numerically, segment by segment (never
 * a string/lexicographic compare — "2.10.0" must sort after "2.9.0").
 * Positive when `a` > `b`, negative when `a` < `b`, 0 when equal.
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * Deterministic install target (Open Question 2, RESOLVED): rather than trust
 * `wsl --install`'s undocumented default VHD location, derive both the drive
 * letter the D-10 disk-check targets AND the explicit `--location`/`--import`
 * directory from the app's own userData path (falling back to
 * `%LOCALAPPDATA%`, then `C:\`) — so the disk-free probe always checks the
 * SAME drive the VHD is actually written to.
 */
function resolveInstallTarget(): { driveLetter: string; installDir: string } {
  const base = app.getPath('userData') || process.env.LOCALAPPDATA || 'C:\\';
  const driveLetter = /^[A-Za-z]:/.test(base) ? base[0].toUpperCase() : 'C';
  const installDir = path.join(base, 'wsl', DISTRO_NAME);
  return { driveLetter, installDir };
}

/**
 * Production download implementation — streams the rootfs to `destPath` over
 * plain `node:https` (GitHub Releases CDN), following a handful of redirects
 * (the actual asset URL commonly 302s once to an object-storage host) and
 * reporting byte progress as it arrives. NOT exercised by distro-install's
 * own unit tests (always overridden via `deps.downloadFile` there) — this is
 * the real network path 04-10's operator UAT exercises against a published
 * artifact.
 */
function defaultDownloadFile(
  url: string,
  destPath: string,
  onProgress?: (doneBytes: number, totalBytes: number) => void
): Promise<void> {
  return fs.promises.mkdir(path.dirname(destPath), { recursive: true }).then(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = (targetUrl: string, redirectsLeft: number): void => {
          https
            .get(targetUrl, (res) => {
              const status = res.statusCode ?? 0;
              if ([301, 302, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
                res.resume();
                request(res.headers.location, redirectsLeft - 1);
                return;
              }
              if (status < 200 || status >= 300) {
                res.resume();
                reject(new Error(`rootfs download failed: HTTP ${status}`));
                return;
              }
              const totalBytes = Number(res.headers['content-length'] ?? 0);
              let doneBytes = 0;
              const fileStream = fs.createWriteStream(destPath);
              res.on('data', (chunk: Buffer) => {
                doneBytes += chunk.length;
                onProgress?.(doneBytes, totalBytes);
              });
              res.pipe(fileStream);
              fileStream.on('finish', () => fileStream.close(() => resolve()));
              fileStream.on('error', reject);
              res.on('error', reject);
            })
            .on('error', reject);
        };
        request(url, 5);
      })
  );
}

/** Production checksum implementation (node:crypto, streamed — never a full-buffer read). */
function defaultSha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk as Buffer));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/** Best-effort temp-file cleanup — an already-gone file is not an error. */
function defaultUnlink(filePath: string): Promise<void> {
  return fs.promises.unlink(filePath).catch(() => undefined);
}

// Module-level in-flight guard (device-client.ts pattern, ~line 46): only one
// provision run may be active at a time — a duplicate call (e.g. a double
// click before the UI disables the button) must never start a second
// concurrent download/import.
let inFlight = false;

/**
 * The idempotent distro-install orchestrator (WSL-03). Arch/disk precheck ->
 * download -> checksum -> `.wsl`-or-`--import` -> first-boot verify -> sparse,
 * with `onUpdate` progress pushes at every phase boundary.
 */
export async function provisionDistro(
  onUpdate?: (u: WslDownloadUpdate) => void,
  deps: Partial<ProvisionDistroDeps> = {}
): Promise<WslDistroInstallResult> {
  if (inFlight) {
    // Already running — a second concurrent call never starts a duplicate
    // download/import. No dedicated "already running" kind exists in
    // WslDistroInstallResult, so this degrades to the same safe-union
    // 'error' shape every other unexpected-state exit below uses; the
    // FIRST call's onUpdate stream remains the source of truth for the UI.
    return { kind: 'error' };
  }
  inFlight = true;

  const execWslFn = deps.execWsl ?? execWsl;
  const getFreeDiskGbFn = deps.getFreeDiskGb ?? getFreeDiskGb;
  const getVmLaunchErrorFn = deps.getVmLaunchError ?? getVmLaunchError;
  const downloadFileFn = deps.downloadFile ?? defaultDownloadFile;
  const sha256FileFn = deps.sha256File ?? defaultSha256File;
  const unlinkFileFn = deps.unlinkFile ?? defaultUnlink;

  let tmpFile: string | null = null;

  try {
    // Arch gate: BEFORE anything else — process.arch is checked before any
    // disk probe or network call is ever made.
    if (process.arch === 'arm64' && !ARM64_ROOTFS_URL) {
      return { kind: 'arch-unsupported' };
    }

    // Reuse gate (D-11): an existing 'livinity' distro skips download+import
    // entirely and is reused as-is — never destroyed.
    const list = await execWslFn(['--list', '--quiet']);
    if (isDistroRegistered(list.stdout, DISTRO_NAME)) {
      onUpdate?.({ phase: 'importing' });
      logSafe('wsl.distroInstall', { reused: true });
      return { kind: 'installed' };
    }

    // Disk gate (D-10, EARLY): checked BEFORE the multi-GB download starts.
    const { driveLetter, installDir } = resolveInstallTarget();
    onUpdate?.({ phase: 'disk-check' });
    const freeGb = await getFreeDiskGbFn(driveLetter);
    if (freeGb < 15) {
      return { kind: 'disk-too-small', freeGb, driveLetter };
    }

    // Download (D-09): stream the rootfs to a temp file, reporting progress.
    tmpFile = path.join(installDir, `${DISTRO_NAME}-rootfs-${randomUUID()}.tmp`);
    onUpdate?.({ phase: 'downloading' });
    try {
      await downloadFileFn(ROOTFS_RELEASE_URL, tmpFile, (doneBytes, totalBytes) => {
        onUpdate?.({ phase: 'downloading', doneBytes, totalBytes });
      });
    } catch {
      return { kind: 'download-failed' };
    }

    // Checksum (T-04-05 supply-chain guard): NEVER import an unverified file.
    onUpdate?.({ phase: 'verifying' });
    const actualSha256 = await sha256FileFn(tmpFile);
    if (actualSha256 !== ROOTFS_SHA256) {
      return { kind: 'checksum-failed' };
    }

    // Import: `.wsl`-primary (WSL >=2.4.4) / `--import` fallback (D-08).
    onUpdate?.({ phase: 'importing' });
    const versionResult = await execWslFn(['--version']);
    const version = parseWslVersion(versionResult.stdout);
    if (version && compareVersions(version, '2.4.4') >= 0) {
      await execWslFn([
        '--install',
        '--from-file',
        tmpFile,
        '--name',
        DISTRO_NAME,
        '--no-launch',
        '--location',
        installDir,
      ]);
    } else {
      await execWslFn(['--import', DISTRO_NAME, installDir, tmpFile]);
    }

    // First-boot verify (Pitfall 3): the just-imported distro is booted ONCE
    // to capture a launch-time firmware block rather than silently declaring
    // 'installed' on a VM that cannot actually start. A clean boot (null)
    // proceeds; a captured block never resolves 'installed' — the distro
    // stays imported (D-11) and wsl:detect/wsl:checkBios (04-09) re-runs
    // this same probe to route the BIOS dead-end screen.
    const launchError = await getVmLaunchErrorFn(true);
    if (launchError) {
      logSafe('wsl.firstBoot', { launchBlocked: true });
      return { kind: 'error' };
    }

    // Sparse (Pitfall 6, non-fatal): a disk-economy optimization, not a
    // correctness requirement — an older WSL or a transient failure here
    // must never fail an otherwise-successful install.
    onUpdate?.({ phase: 'sparse' });
    try {
      await execWslFn(['--manage', DISTRO_NAME, '--set-sparse', 'true']);
    } catch {
      logSafe('wsl.sparse', { ok: false });
    }

    logSafe('wsl.distroInstall', { installed: true });
    return { kind: 'installed' };
  } catch {
    // A thrown probe/spawn/IO error must not escape as a rejected promise —
    // the renderer shows a generic error screen instead.
    logSafe('wsl.distroInstall', { exception: true });
    return { kind: 'error' };
  } finally {
    if (tmpFile) await unlinkFileFn(tmpFile);
    inFlight = false;
  }
}
