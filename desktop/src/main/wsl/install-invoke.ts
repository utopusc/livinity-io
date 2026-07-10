/**
 * src/main/wsl/install-invoke.ts
 *
 * The WSL-04 orchestrator — the security-critical heart of the phase.
 * `runInstall` reads the install secrets from the DPAPI vault, forwards them
 * into the distro's `install.sh` via `WSLENV` (Microsoft's first-class
 * Windows<->WSL env-sharing mechanism, Pattern 4), runs the installer as root
 * hidden, captures stdout/exit code, and maps the exit to an actionable
 * verdict (`mapInstallExit`, 04-03). Tier-agnostic: Free (domain + CF token +
 * tunnel token + API key) and Pro (API key only) flow through the SAME
 * engine (D-13).
 *
 * SECRET DISCIPLINE (T-04-03/T-04-04, mirrors cf-provision.ts's header):
 * secrets flow vault -> WSLENV env only; they NEVER appear in argv (invisible
 * to ps/tasklist inside the distro too), NEVER logged, NEVER cross IPC. This
 * is the WSL-04 / success-criterion-4 guarantee. Every logSafe call below
 * carries scalars only; a `generic-failure` reason is run through
 * `redactSecretLike` before it can ever become the one red technical line on
 * Screen 6.
 *
 * Job-Object survival (Pitfall 4 / Open Question 1): the multi-minute install
 * child is spawned `detached: true` + `stdio: ['ignore','pipe','pipe']` +
 * `unref()` — the spike's Candidate-A shape adapted to keep stdout/stderr
 * piped for exit-verdict capture while still surviving an app quit. This
 * detached+piped-stdio combination is flagged for the operator smoke test at
 * 04-10 (Open Question 1) — automated tests prove the spawn SHAPE, not a real
 * multi-minute Windows/WSL run.
 *
 * Zero imports from ipc/ or tray/ — a main-process orchestration primitive,
 * same isolation rule as cf-provision.ts/distro-install.ts. `vaultGet` reads
 * plaintext secrets main-side ONLY — this module must never be imported from
 * ipc/ directly for its vault access to leak across the IPC boundary.
 */

import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { vaultGet } from '../storage/secrets-vault';
import { readState } from '../storage/state-store';
import { mapInstallExit } from './map-install-exit';
import { logSafe, redactSecretLike } from '../log';
import type { WslInstallInvokeResult, WslInstallUpdate } from '../../../shared/ipc-contract';

/** Injectable IO collaborator — production default is node:child_process's spawn. */
export interface RunInstallDeps {
  spawn: typeof nodeSpawn;
  /** Reserved for a future retry/backoff addition; unused by the current happy-path flow. */
  sleep?: (ms: number) => Promise<void>;
}

/** Only the LAST 300 sanitized characters of stdout/stderr ever become `reason`. */
const REASON_TAIL_CHARS = 300;

// Module-level in-flight guard (device-client.ts/distro-install.ts pattern):
// only one install run may be active at a time — a double-click or a D-04
// resume-after-reboot re-entry must never spawn a second concurrent
// install.sh run against the same distro (idempotency, D-11).
let inFlight = false;

function drainInstallChild(
  child: ChildProcess
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      resolve({ code: null, stdout, stderr: String(err) });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * The idempotent install.sh invocation orchestrator (WSL-04). Reads secrets
 * main-side from the DPAPI vault, forwards them into the distro ONLY via
 * WSLENV (never argv), spawns the installer hidden/detached as root, and
 * resolves an actionable verdict via `mapInstallExit`. Never throws — every
 * exit (including a vault miss or a thrown spawn error) degrades to a safe
 * union member.
 */
export async function runInstall(
  input: { tier: 'free' | 'pro' },
  onUpdate?: (u: WslInstallUpdate) => void,
  deps: Partial<RunInstallDeps> = {}
): Promise<WslInstallInvokeResult> {
  if (inFlight) {
    // Already running — a double-click or resume-after-reboot re-entry must
    // never spawn a second concurrent install.sh run (D-11). No dedicated
    // "already running" kind exists in WslInstallInvokeResult, so this
    // degrades to the same safe-union 'generic-failure' shape every other
    // unexpected-state exit below uses; the FIRST call's onUpdate stream
    // remains the UI's source of truth.
    return { kind: 'generic-failure' };
  }
  inFlight = true;

  const spawnFn = deps.spawn ?? nodeSpawn;

  try {
    onUpdate?.({ phase: 'preparing' });

    // Secrets are read MAIN-SIDE only, at invocation time — the renderer
    // never supplies them and they never cross IPC (shared/ipc-contract.ts
    // Wsl2 section header comment).
    const apiKey = await vaultGet('apiKey');
    if (!apiKey) {
      // A vault miss must never throw or hang — a missing API key is our own
      // bug (the wizard should not have reached this screen without one),
      // never a user-actionable install failure.
      logSafe('wsl.installInvoke', { ok: false, missingApiKey: true });
      return { kind: 'our-bug' };
    }

    const envValues: Record<string, string> = { LIVOS_API_KEY: apiKey };

    if (input.tier === 'free') {
      const [cfToken, tunnelToken, st] = await Promise.all([
        vaultGet('cfToken'),
        vaultGet('tunnelToken'),
        readState(),
      ]);
      const domain = st?.subLabel && st?.zoneName ? `${st.subLabel}.${st.zoneName}` : undefined;
      if (domain) envValues.LIVOS_DOMAIN = domain;
      if (cfToken) envValues.LIVOS_CF_TOKEN = cfToken;
      if (tunnelToken) envValues.LIVOS_CF_TUNNEL_TOKEN = tunnelToken;
    }

    // WSLENV forwards ONLY the names actually present in envValues — never a
    // wider set (minimizes the secret surface reaching the distro process
    // environment, RESEARCH.md Code Examples).
    const WSLENV = Object.keys(envValues)
      .filter((k) => envValues[k])
      .join(':');
    const env: NodeJS.ProcessEnv = { ...process.env, WSL_UTF8: '1', WSLENV, ...envValues };

    onUpdate?.({ phase: 'installing' });

    // Fixed literals ONLY in argv — install.sh self-bootstraps its 8 helper
    // scripts (Pitfall 5); every secret flows through `env` above, never a
    // `--flag value` arg (D-12, T-04-03). detached+unref (Job-Object
    // survival, Pitfall 4) + windowsHide (D-05, no visible terminal) +
    // piped stdio (kept for exit-verdict capture, adapted from the spike's
    // Candidate-A shape — flagged for the 04-10 operator smoke test).
    const child = spawnFn(
      'wsl.exe',
      [
        '-d',
        'livinity',
        '-u',
        'root',
        '--',
        'bash',
        '-lc',
        // `bash < file` (stdin), NOT `bash file`: with a real script path in
        // BASH_SOURCE, install.sh's helper resolution false-positives into its
        // cloned-repo mode and dies with exit 2 looking for /tmp/install/*
        // (live-diagnosed 2026-07-10). Stdin keeps BASH_SOURCE empty so the
        // self-bootstrap mode downloads the helpers, while download-to-file
        // first (curl -f && ...) still guards against running a partial script.
        'curl -fsSL https://livinity.io/install.sh -o /tmp/livinity-install.sh && bash < /tmp/livinity-install.sh',
      ],
      {
        windowsHide: true,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      }
    );
    child.unref();

    const result = await drainInstallChild(child);

    onUpdate?.({ phase: 'starting' });

    const verdict = mapInstallExit(result.code);
    if (verdict.kind === 'generic-failure') {
      const tail = (result.stderr || result.stdout).trim().slice(-REASON_TAIL_CHARS);
      const reason = tail ? redactSecretLike(tail) : undefined;
      logSafe('wsl.installInvoke', { ok: false, code: result.code ?? -1 });
      return reason ? { kind: 'generic-failure', reason } : { kind: 'generic-failure' };
    }

    logSafe('wsl.installInvoke', { ok: verdict.kind === 'ok', code: result.code ?? -1 });
    return verdict;
  } catch {
    // A thrown vault/state/spawn error must not escape as a rejected promise
    // — the renderer shows the generic-failure screen instead.
    logSafe('wsl.installInvoke', { exception: true });
    return { kind: 'generic-failure' };
  } finally {
    inFlight = false;
  }
}
