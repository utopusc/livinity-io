import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import path from 'node:path';
import { exportDiagnostics } from '../../src/main/support/diagnostics-bundle';
import type { State } from '../../shared/ipc-contract';

/**
 * diagnostics-bundle.test.ts injects EVERY IO collaborator (readState/
 * execWsl/getEngineStatus/getHolderRecord/zip/showSaveDialog/copyFile/
 * readInstallTail/mkdir/writeFile/readFile) directly via `exportDiagnostics`'s
 * `deps` seam (holder.test.ts/install-invoke.test.ts precedent) -- no real
 * disk write, no real powershell.exe/wsl.exe, no real dialog ever runs.
 *
 * `writeFile` is captured into a `writes` map keyed by basename so the D-08
 * hostile-seed test can assemble "all 5 staged files concatenated" and
 * assert zero secret-shaped content survives.
 */

function makeDeps(overrides: Record<string, unknown> = {}) {
  const writes: Record<string, string> = {};
  const writeFileMock = vi.fn(async (p: string, data: string) => {
    writes[path.basename(p)] = data;
  });

  return {
    writes,
    readState: vi.fn().mockResolvedValue({ version: 1, currentStep: 'start' } as State),
    getLogsPath: vi.fn(() => 'C:\\fake\\logs'),
    getUserDataPath: vi.fn(() => 'C:\\fake\\userData'),
    getDownloadsPath: vi.fn(() => 'C:\\fake\\Downloads'),
    getAppInfo: vi.fn(() => ({
      appVersion: '1.0.0',
      electronVersion: '38.0.0',
      nodeVersion: '22.0.0',
      windowsBuild: '10.0.26200',
      locale: 'en-US',
      tier: 'unknown',
      updateState: 'idle',
    })),
    execWsl: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
    getEngineStatus: vi
      .fn()
      .mockResolvedValue({ state: 'stopped', address: null, lastCheckedAt: null, desiredState: 'stopped' }),
    getHolderRecord: vi.fn().mockResolvedValue(null),
    zip: vi.fn().mockResolvedValue({ ok: true }),
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: false, filePath: 'C:\\Downloads\\out.zip' }),
    copyFile: vi.fn().mockResolvedValue(undefined),
    readInstallTail: vi.fn().mockResolvedValue(null),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: writeFileMock,
    readFile: vi.fn().mockResolvedValue(''),
    ...overrides,
  };
}

describe('diagnostics-bundle', () => {
  describe('exportDiagnostics happy path', () => {
    it('stages the 5 D-08 named files, zips, and returns {outcome:"saved"}', async () => {
      const deps = makeDeps();

      const result = await exportDiagnostics(deps as never);

      expect(result).toEqual({ outcome: 'saved' });
      expect(Object.keys(deps.writes).sort()).toEqual(
        ['install-tail.txt', 'main.log', 'meta.txt', 'state-redacted.json', 'wsl-status.txt'].sort()
      );
      expect(deps.zip).toHaveBeenCalledTimes(1);
      expect(deps.showSaveDialog).toHaveBeenCalledTimes(1);
      expect(deps.copyFile).toHaveBeenCalledWith(expect.stringContaining('.zip'), 'C:\\Downloads\\out.zip');
    });

    it('meta.txt carries app/Electron/Node versions, locale, tier, update state, and engineDesiredState', async () => {
      const deps = makeDeps({
        readState: vi.fn().mockResolvedValue({ version: 1, currentStep: 'start', engineDesiredState: 'running' } as State),
      });

      await exportDiagnostics(deps as never);

      const meta = deps.writes['meta.txt'];
      expect(meta).toContain('appVersion: 1.0.0');
      expect(meta).toContain('electronVersion: 38.0.0');
      expect(meta).toContain('nodeVersion: 22.0.0');
      expect(meta).toContain('locale: en-US');
      expect(meta).toContain('tier: unknown');
      expect(meta).toContain('updateState: idle');
      expect(meta).toContain('engineDesiredState: running');
    });
  });

  describe('outcome mapping', () => {
    it('zip failure => {outcome:"folder-fallback"}, never reaches the save dialog', async () => {
      const deps = makeDeps({ zip: vi.fn().mockResolvedValue({ ok: false, folderOpened: true }) });

      const result = await exportDiagnostics(deps as never);

      expect(result).toEqual({ outcome: 'folder-fallback' });
      expect(deps.showSaveDialog).not.toHaveBeenCalled();
    });

    it('dialog cancel => {outcome:"cancelled"}, never copies the zip', async () => {
      const deps = makeDeps({ showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }) });

      const result = await exportDiagnostics(deps as never);

      expect(result).toEqual({ outcome: 'cancelled' });
      expect(deps.copyFile).not.toHaveBeenCalled();
    });

    it('a thrown collaborator degrades to {outcome:"failed"} rather than rejecting', async () => {
      const deps = makeDeps({ readState: vi.fn().mockRejectedValue(new Error('disk error')) });

      await expect(exportDiagnostics(deps as never)).resolves.toEqual({ outcome: 'failed' });
    });
  });

  describe('W6 — in-distro systemctl capture gated on engine-running', () => {
    it('engine NOT running: systemctl is SKIPPED (writes the skip message), never invokes wsl -d livinity', async () => {
      const deps = makeDeps({
        getEngineStatus: vi
          .fn()
          .mockResolvedValue({ state: 'stopped', address: null, lastCheckedAt: null, desiredState: 'stopped' }),
      });

      await exportDiagnostics(deps as never);

      const distroCalls = (deps.execWsl.mock.calls as [string[]][]).filter(([args]) => args.includes('-d'));
      expect(distroCalls).toHaveLength(0);
      expect(deps.writes['wsl-status.txt']).toContain('engine stopped — in-distro status skipped');
    });

    it('engine running: systemctl RUNS via wsl -d livinity', async () => {
      const deps = makeDeps({
        getEngineStatus: vi
          .fn()
          .mockResolvedValue({ state: 'running', address: 'user.livinity.io', lastCheckedAt: 1, desiredState: 'running' }),
      });

      await exportDiagnostics(deps as never);

      const distroCalls = (deps.execWsl.mock.calls as [string[]][]).filter(
        ([args]) => args.includes('-d') && args.includes('systemctl')
      );
      expect(distroCalls).toHaveLength(1);
      expect(deps.writes['wsl-status.txt']).not.toContain('engine stopped — in-distro status skipped');
    });

    it('host-side wsl --status/--version/-l -v always run, regardless of engine state', async () => {
      const deps = makeDeps({
        getEngineStatus: vi
          .fn()
          .mockResolvedValue({ state: 'stopped', address: null, lastCheckedAt: null, desiredState: 'stopped' }),
      });

      await exportDiagnostics(deps as never);

      const argvs = (deps.execWsl.mock.calls as [string[]][]).map(([args]) => args);
      expect(argvs).toContainEqual(['--status']);
      expect(argvs).toContainEqual(['--version']);
      expect(argvs).toContainEqual(['-l', '-v']);
    });
  });

  describe('state-redacted.json whitelist serializer', () => {
    it('only StateSchema keys appear; an injected non-schema field never appears; a secret-shaped known field is redacted', async () => {
      const hostileState = {
        version: 1,
        currentStep: 'start',
        domainLabel: 'liv_k_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        hackerField: 'not-in-schema-should-never-appear',
      } as unknown as State;
      const deps = makeDeps({ readState: vi.fn().mockResolvedValue(hostileState) });

      await exportDiagnostics(deps as never);

      const stateJson = deps.writes['state-redacted.json'];
      expect(stateJson).not.toContain('hackerField');
      expect(stateJson).not.toContain('not-in-schema-should-never-appear');
      expect(stateJson).not.toContain('liv_k_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
      expect(stateJson).toContain('[redacted]');
    });

    it('includes the non-secret holder.json record as-is', async () => {
      const deps = makeDeps({
        getHolderRecord: vi.fn().mockResolvedValue({ pid: 4242, spawnedAt: '2026-07-11T00:00:00.000Z' }),
      });

      await exportDiagnostics(deps as never);

      const stateJson = deps.writes['state-redacted.json'];
      expect(stateJson).toContain('4242');
      expect(stateJson).toContain('2026-07-11T00:00:00.000Z');
    });
  });

  describe('source-scan (D-08/T-07-09 static proofs)', () => {
    it('diagnostics-bundle.ts does NOT import secrets-vault (the vault is never read)', () => {
      const source = readFileSync(join(__dirname, '../../src/main/support/diagnostics-bundle.ts'), 'utf8');
      expect(source).not.toContain('secrets-vault');
    });

    it('the log redaction is a per-line split/map, never a whole-file redactSecretLike pass', () => {
      const source = readFileSync(join(__dirname, '../../src/main/support/diagnostics-bundle.ts'), 'utf8');
      expect(source).toMatch(/split\('\\n'\)\.map\(redactSecretLike\)/);
    });

    it('has zero imports from ipc/ or tray/', () => {
      const source = readFileSync(join(__dirname, '../../src/main/support/diagnostics-bundle.ts'), 'utf8');
      expect(source).not.toMatch(/from ['"][^'"]*\/ipc\//);
      expect(source).not.toMatch(/from ['"][^'"]*\/tray\//);
    });
  });

  describe('hostile-seed (D-08 mandated — zero secrets across the assembled bundle)', () => {
    // Re-declared LOCALLY (W5): SECRET_LIKE_RUN is a non-exported const in
    // log.ts and cannot be imported.
    const SECRET_LIKE_RUN = /[A-Za-z0-9+/_-]{24,}={0,2}/g;

    it('liv_k_ keys, CF tokens, JWTs, and a base64 tunnel-token blob appear NOWHERE in the assembled bundle; real non-secret text on a >500-char line SURVIVES (per-line redaction, not the 500-char whole-file cap)', async () => {
      const livKey = 'liv_k_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0';
      const cfToken = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCD';
      const jwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const tunnelTokenBlob =
        'eyJhIjoiMTIzNDU2Nzg5MGFiY2RlZiIsInQiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eiIsInMiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eiJ9';

      // Real, human-readable narration text separated by spaces (survives
      // redaction on its own) surrounding a secret, on a SINGLE line whose
      // TOTAL length exceeds redactSecretLike's 500-char whole-file cap.
      const survivorMarker = 'REAL DIAGNOSTIC TEXT SURVIVES PER LINE REDACTION';
      const padding = 'x'.repeat(150);
      const longLine = `INFO ${padding} apiKeyValue=${livKey} ${padding} ${survivorMarker} ${padding} tail`;
      expect(longLine.length).toBeGreaterThan(500);

      const hostileLog = [
        `INFO app boot cfToken=${cfToken}`,
        `INFO jwt session=${jwt}`,
        `INFO tunnel token blob=${tunnelTokenBlob}`,
        longLine,
      ].join('\n');

      const deps = makeDeps({
        readFile: vi.fn(async (p: string) => (p.includes('main.log') ? hostileLog : '')),
        readState: vi.fn().mockResolvedValue({
          version: 1,
          currentStep: 'start',
          domainLabel: livKey,
        } as unknown as State),
        readInstallTail: vi.fn().mockResolvedValue(hostileLog),
        getHolderRecord: vi.fn().mockResolvedValue({ pid: 4242, spawnedAt: new Date(0).toISOString() }),
      });

      await exportDiagnostics(deps as never);

      const bundleText = Object.values(deps.writes).join('\n---\n');

      // Literal-prefix oracles.
      expect(bundleText).not.toContain('liv_k_');
      expect(bundleText).not.toContain('eyJ');
      expect(bundleText).not.toContain(cfToken);
      expect(bundleText).not.toContain(tunnelTokenBlob);

      // No 24+-char secret-shaped run survives anywhere in the bundle.
      expect(bundleText.match(SECRET_LIKE_RUN)).toBeNull();

      // Per-line survival proof.
      expect(bundleText).toContain(survivorMarker);
    });
  });
});
