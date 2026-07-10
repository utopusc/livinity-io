/**
 * src/main/wsl/elevate.ts
 *
 * V4 (elevation-injection guard): the elevated PowerShell script body is a
 * FIXED literal — `--install`/`--no-distribution` and the JSON-relay shape
 * never change between runs. The ONLY thing that varies is a `randomUUID()`
 * -generated temp-file path (main-generated, never renderer- or
 * network-derived). Never interpolate any other value into an elevated
 * context (T-04-01, RESEARCH.md Pattern 5 / Security Domain V4).
 *
 * D-02: enablement runs behind a SINGLE UAC prompt (the OUTER `Start-Process
 * -Verb RunAs -Wait` call). stdout can't cross the elevation boundary, so the
 * elevated (INNER) script relays its result by writing `{ exitCode }` JSON to
 * that temp file; this module reads then deletes it — tolerating absence
 * (UAC declined/dismissed) exactly like `spike/watcher.js`'s readPidFile.
 *
 * The exit code returned here is NOT classified into a verdict by this
 * module — the caller (04-09 wsl:enable) routes it through decideWslState
 * (04-02) so exit 14107 becomes 'needs-enable', never 'bios-blocked' (this
 * enable step never boots the VM, so a launch-time 0x80370102 cannot arise
 * here).
 */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';

export interface ElevateDeps {
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The FIXED inner script template — the elevated process runs this exact
 * body. `resultFile` is the ONLY interpolated value (V4/T-04-01); every other
 * line is a literal that never changes between invocations.
 */
export function buildInnerScript(resultFile: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    "  $p = Start-Process -FilePath 'wsl.exe' -ArgumentList '--install','--no-distribution' -WindowStyle Hidden -Wait -PassThru",
    `  @{ exitCode = $p.ExitCode } | ConvertTo-Json | Set-Content -Path '${resultFile}' -Encoding utf8`,
    '} catch {',
    `  @{ exitCode = -1 } | ConvertTo-Json | Set-Content -Path '${resultFile}' -Encoding utf8`,
    '}',
  ].join('\n');
}

/**
 * Builds the OUTER (non-elevated) powershell -Command string. It wraps the
 * fixed inner script in a single `Start-Process -Verb RunAs -Wait` call —
 * this triggers exactly ONE UAC prompt (D-02). The inner script is passed
 * via -EncodedCommand (base64 UTF-16LE) so no manual quote-escaping is
 * needed for a multi-line body — the encoding is a transport detail only,
 * never a place a renderer/network value could sneak in (the input is
 * always buildInnerScript's own fixed-literal-plus-path output).
 */
function buildOuterCommand(innerScript: string): string {
  const encoded = Buffer.from(innerScript, 'utf16le').toString('base64');
  return `Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand','${encoded}' -Verb RunAs -WindowStyle Hidden -Wait`;
}

function spawnOuterElevate(outerCommand: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', outerCommand],
      { windowsHide: true }
    );
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}

/**
 * Polls the result file a few times (Start-Process -Wait should already
 * guarantee the elevated process finished before this runs, but a short
 * retry absorbs any filesystem-write latency). Tolerates permanent absence
 * (UAC declined/dismissed) by returning null after exhausting attempts —
 * mirrors spike/watcher.js's readPidFile degrade-to-null discipline.
 */
async function readResultWithRetry(
  resultFile: string,
  sleep: (ms: number) => Promise<void>,
  attempts = 3
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const raw = await fs.readFile(resultFile, 'utf8').catch(() => null);
    if (raw !== null) return raw;
    if (i < attempts - 1) await sleep(200);
  }
  return null;
}

/**
 * Runs `wsl --install --no-distribution` elevated behind a single UAC
 * prompt, relays its exit code via a randomUUID temp file, and degrades to
 * `{ ok: false, exitCode: -1 }` (never a throw) if the prompt is declined or
 * dismissed.
 */
export function runElevatedWslInstall(
  deps: ElevateDeps = {}
): Promise<{ ok: boolean; exitCode: number }> {
  const sleep = deps.sleep ?? defaultSleep;
  const resultFile = path.join(os.tmpdir(), `livinity-wsl-enable-${randomUUID()}.json`);
  const innerScript = buildInnerScript(resultFile);
  const outerCommand = buildOuterCommand(innerScript);

  return spawnOuterElevate(outerCommand)
    .then(() => readResultWithRetry(resultFile, sleep))
    .then(async (raw) => {
      await fs.unlink(resultFile).catch(() => {});
      if (raw === null) return { ok: false, exitCode: -1 };
      try {
        // The inner script runs under Windows PowerShell 5.1, whose
        // `Set-Content -Encoding utf8` ALWAYS writes a UTF-8 BOM; Node's
        // utf8 readFile preserves it as a leading U+FEFF, which JSON.parse
        // rejects (U+FEFF is not JSON whitespace). Strip it before parsing
        // or every elevated enable — success or failure — is misreported as
        // a declined UAC prompt.
        const parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) as { exitCode: number };
        return { ok: parsed.exitCode === 0, exitCode: parsed.exitCode };
      } catch {
        return { ok: false, exitCode: -1 };
      }
    });
}
