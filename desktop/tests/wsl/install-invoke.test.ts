import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

/**
 * install-invoke.test.ts mocks secrets-vault/state-store (the fixture-secret
 * sources) and the repo's log module (logSafe/redactSecretLike), then injects
 * a fake `spawn` via the `deps` seam — the same deps-injection style
 * distro-install.test.ts uses for its private download/checksum/unlink
 * helpers, since `spawn` here is called with a `detached`+piped-stdio shape
 * distro-install/wsl-exec's `node:child_process`-module mock does not need to
 * replicate. Because `runInstall` awaits several vault/state reads BEFORE
 * spawning (unlike execWsl's synchronous spawn), every test waits for the
 * spawn call to actually land (`waitForSpawnCall`) before emitting the fake
 * child's `close` event — emitting too early would leave the event
 * listener-less and hang the promise forever (which would also leak the
 * module-level inFlight guard into later tests). The LOAD-BEARING assertion
 * throughout: no fixture secret VALUE ever appears in the captured spawn
 * `args` array — only in `env`.
 */

const vaultGetMock = vi.hoisted(() => vi.fn());
const readStateMock = vi.hoisted(() => vi.fn());
const logSafeMock = vi.hoisted(() => vi.fn());
const redactSecretLikeMock = vi.hoisted(() => vi.fn((s: string) => s));

vi.mock('../../src/main/storage/secrets-vault', () => ({
  vaultGet: vaultGetMock,
}));

vi.mock('../../src/main/storage/state-store', () => ({
  readState: readStateMock,
}));

vi.mock('../../src/main/log', () => ({
  logSafe: logSafeMock,
  redactSecretLike: redactSecretLikeMock,
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { runInstall } from '../../src/main/wsl/install-invoke';
import type { WslInstallUpdate } from '../../shared/ipc-contract';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  unref = vi.fn();
  kill = vi.fn();
}

const FIXTURE_API_KEY = 'liv_k_FAKEAPIKEY0000000000000000';
const FIXTURE_CF_TOKEN = 'FAKECFTOKEN1111111111111111111111';
const FIXTURE_TUNNEL_TOKEN = 'FAKETUNNELTOKEN22222222222222222222';

/** True if any secret VALUE appears anywhere inside the flat args array (T-04-03 scanner). */
function hasSecretValue(args: string[], secrets: string[]): boolean {
  return args.some((a) => secrets.some((s) => s.length > 0 && a.includes(s)));
}

function vaultFixture(overrides: Record<string, string | null> = {}): void {
  const values: Record<string, string | null> = {
    apiKey: FIXTURE_API_KEY,
    cfToken: FIXTURE_CF_TOKEN,
    tunnelToken: FIXTURE_TUNNEL_TOKEN,
    ...overrides,
  };
  vaultGetMock.mockImplementation((key: string) => Promise.resolve(values[key] ?? null));
}

/** Waits until the injected spawn mock has actually been invoked (see file header). */
async function waitForSpawnCall(mock: ReturnType<typeof vi.fn>): Promise<void> {
  await vi.waitFor(() => {
    expect(mock).toHaveBeenCalled();
  });
}

describe('install-invoke / runInstall', () => {
  let fakeChild: FakeChild;
  let spawnMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fakeChild = new FakeChild();
    spawnMock = vi.fn(() => fakeChild);
    vaultGetMock.mockReset();
    readStateMock.mockReset();
    readStateMock.mockResolvedValue(null);
    logSafeMock.mockClear();
    redactSecretLikeMock.mockClear();
  });

  it('free tier: WSLENV + env carry LIVOS_DOMAIN/LIVOS_CF_TOKEN/LIVOS_CF_TUNNEL_TOKEN/LIVOS_API_KEY, no secret in args', async () => {
    vaultFixture();
    readStateMock.mockResolvedValue({
      version: 1,
      currentStep: 'x',
      subLabel: 'liv',
      zoneName: 'example.com',
    });

    const promise = runInstall({ tier: 'free' }, undefined, { spawn: spawnMock as never });
    await waitForSpawnCall(spawnMock);
    fakeChild.emit('close', 0);
    const result = await promise;

    expect(result).toEqual({ kind: 'ok' });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, args, opts] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];

    // LOAD-BEARING: no secret VALUE anywhere in the spawned args array.
    expect(hasSecretValue(args, [FIXTURE_API_KEY, FIXTURE_CF_TOKEN, FIXTURE_TUNNEL_TOKEN])).toBe(
      false
    );

    const env = opts.env as Record<string, string>;
    expect(env.LIVOS_API_KEY).toBe(FIXTURE_API_KEY);
    expect(env.LIVOS_CF_TOKEN).toBe(FIXTURE_CF_TOKEN);
    expect(env.LIVOS_CF_TUNNEL_TOKEN).toBe(FIXTURE_TUNNEL_TOKEN);
    expect(env.LIVOS_DOMAIN).toBe('liv.example.com');
    expect(new Set(env.WSLENV.split(':'))).toEqual(
      new Set(['LIVOS_API_KEY', 'LIVOS_CF_TOKEN', 'LIVOS_CF_TUNNEL_TOKEN', 'LIVOS_DOMAIN'])
    );
  });

  it('pro tier: env carries ONLY LIVOS_API_KEY, WSLENV lists exactly that name, no CF vault reads', async () => {
    vaultFixture();
    const promise = runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
    await waitForSpawnCall(spawnMock);
    fakeChild.emit('close', 0);
    await promise;

    const [, args, opts] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    const env = opts.env as Record<string, string>;
    expect(env.LIVOS_API_KEY).toBe(FIXTURE_API_KEY);
    expect(env.LIVOS_CF_TOKEN).toBeUndefined();
    expect(env.LIVOS_CF_TUNNEL_TOKEN).toBeUndefined();
    expect(env.LIVOS_DOMAIN).toBeUndefined();
    expect(env.WSLENV).toBe('LIVOS_API_KEY');
    expect(readStateMock).not.toHaveBeenCalled();
    expect(hasSecretValue(args, [FIXTURE_API_KEY])).toBe(false);
  });

  it('spawns hidden+detached+unref root wsl invocation reading install.sh via stdin (keeps BASH_SOURCE empty so install.sh self-bootstraps)', async () => {
    vaultFixture();
    const promise = runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
    await waitForSpawnCall(spawnMock);
    fakeChild.emit('close', 0);
    await promise;

    const [cmd, args, opts] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(cmd).toBe('wsl.exe');
    expect(args).toEqual(expect.arrayContaining(['-d', 'livinity', '-u', 'root']));
    expect(args.join(' ')).toContain('bash < /tmp/livinity-install.sh');
    // Regression guard for the exit-2 bootstrap bug: the file-path form makes
    // install.sh resolve helpers next to /tmp and die before doing anything.
    expect(args.join(' ')).not.toMatch(/bash \/tmp\/livinity-install\.sh/);
    expect(opts.windowsHide).toBe(true);
    expect(opts.detached).toBe(true);
    expect(opts.stdio).toEqual(['ignore', 'pipe', 'pipe']);
    expect(fakeChild.unref).toHaveBeenCalled();
  });

  it.each([
    [0, { kind: 'ok' }],
    [65, { kind: 'systemd-retry' }],
    [75, { kind: 'disk-too-small' }],
    [64, { kind: 'our-bug' }],
  ])('exit %i maps to verdict %j', async (code, expected) => {
    vaultFixture();
    const promise = runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
    await waitForSpawnCall(spawnMock);
    fakeChild.emit('close', code);
    const result = await promise;
    // toMatchObject (not toEqual): non-'ok' exits now additionally carry a
    // D-07 `failureVerdict` (05-06) -- `kind`/`reason` stay byte-identical.
    expect(result).toMatchObject(expected);
  });

  it('exit 1 maps to generic-failure with a redacted reason (never raw secret-bearing output)', async () => {
    vaultFixture();
    const promise = runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
    await waitForSpawnCall(spawnMock);
    fakeChild.stderr.emit('data', Buffer.from(`boom ${FIXTURE_API_KEY} failed`));
    fakeChild.emit('close', 1);
    const result = await promise;
    expect(result.kind).toBe('generic-failure');
    expect(redactSecretLikeMock).toHaveBeenCalled();
  });

  it('detached+unref (Job-Object survival) — the child is spawned before app quit could interrupt install.sh', async () => {
    vaultFixture();
    const promise = runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
    await waitForSpawnCall(spawnMock);
    fakeChild.emit('close', 0);
    await promise;
    expect(fakeChild.unref).toHaveBeenCalledTimes(1);
  });

  it('inFlight guard: a second concurrent call returns without spawning a second install (D-11)', async () => {
    vaultFixture();
    const first = runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
    const second = await runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
    expect(second.kind).not.toBe('ok');
    // Let the FIRST (still in-flight) call reach its own spawn call before
    // asserting spawn was invoked exactly once (not twice).
    await waitForSpawnCall(spawnMock);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    fakeChild.emit('close', 0);
    await first;
  });

  it('onUpdate fires preparing -> installing -> starting on the happy path', async () => {
    vaultFixture();
    const phases: string[] = [];
    const promise = runInstall({ tier: 'pro' }, (u) => phases.push(u.phase), {
      spawn: spawnMock as never,
    });
    await waitForSpawnCall(spawnMock);
    fakeChild.emit('close', 0);
    await promise;
    expect(phases).toEqual(['preparing', 'installing', 'starting']);
  });

  it('a vault miss (apiKey null) resolves a safe verdict, never throws, never spawns', async () => {
    vaultFixture({ apiKey: null });
    const result = await runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
    expect(['our-bug', 'generic-failure']).toContain(result.kind);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('logSafe is never called with a secret value or the full env', async () => {
    vaultFixture();
    readStateMock.mockResolvedValue({
      version: 1,
      currentStep: 'x',
      subLabel: 'liv',
      zoneName: 'example.com',
    });
    const promise = runInstall({ tier: 'free' }, undefined, { spawn: spawnMock as never });
    await waitForSpawnCall(spawnMock);
    fakeChild.emit('close', 0);
    await promise;

    expect(logSafeMock).toHaveBeenCalled();
    for (const call of logSafeMock.mock.calls) {
      const meta = call[1] as Record<string, unknown> | undefined;
      expect(meta).not.toHaveProperty('env');
      if (meta) {
        for (const [, v] of Object.entries(meta)) {
          expect(['string', 'number', 'boolean']).toContain(typeof v);
          if (typeof v === 'string') {
            expect(v).not.toContain(FIXTURE_API_KEY);
            expect(v).not.toContain(FIXTURE_CF_TOKEN);
            expect(v).not.toContain(FIXTURE_TUNNEL_TOKEN);
          }
        }
      }
    }
  });

  it('a thrown vault/state error degrades to generic-failure, never a rejected promise', async () => {
    vaultGetMock.mockRejectedValue(new Error('vault read failed'));
    await expect(
      runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never })
    ).resolves.toEqual({ kind: 'generic-failure' });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  describe('streaming line-buffered marker parse (INSTALL-02/D-04)', () => {
    it('pushes a monotonic caption+stepIndex over onUpdate, ignoring an unmatched title and an out-of-order regression', async () => {
      vaultFixture();
      const updates: WslInstallUpdate[] = [];
      const promise = runInstall({ tier: 'pro' }, (u) => updates.push(u), {
        spawn: spawnMock as never,
      });
      await waitForSpawnCall(spawnMock);

      fakeChild.stderr.emit('data', Buffer.from('=== Detecting platform ===\n'));
      fakeChild.stderr.emit('data', Buffer.from('=== PostgreSQL setup ===\n'));
      // Unmatched title -- bucketForTitle returns null, must NOT push.
      fakeChild.stderr.emit('data', Buffer.from('=== Some unmapped umbrella ===\n'));
      // Out-of-order (earlier bucket after a later one) -- must NOT regress.
      fakeChild.stderr.emit('data', Buffer.from('=== Detecting platform ===\n'));

      fakeChild.emit('close', 0);
      await promise;

      const stepUpdates = updates.filter((u) => u.stepIndex !== undefined);
      expect(stepUpdates).toEqual([
        { phase: 'installing', caption: 'Getting your system ready', stepIndex: 1, stepTotal: 6 },
        { phase: 'installing', caption: 'Installing LivOS components', stepIndex: 3, stepTotal: 6 },
      ]);
    });

    it('reassembles a step marker split across two stderr data chunks', async () => {
      vaultFixture();
      const updates: WslInstallUpdate[] = [];
      const promise = runInstall({ tier: 'pro' }, (u) => updates.push(u), {
        spawn: spawnMock as never,
      });
      await waitForSpawnCall(spawnMock);

      fakeChild.stderr.emit('data', Buffer.from('=== Postgre'));
      fakeChild.stderr.emit('data', Buffer.from('SQL setup ===\n'));

      fakeChild.emit('close', 0);
      await promise;

      const stepUpdates = updates.filter((u) => u.stepIndex !== undefined);
      expect(stepUpdates).toEqual([
        { phase: 'installing', caption: 'Installing LivOS components', stepIndex: 3, stepTotal: 6 },
      ]);
    });
  });

  describe('D-07 live path: mapFailure-attached failureVerdict on every non-ok exit', () => {
    it('exit 75 with a Docker-daemon reason -> failureVerdict.screen generic (not disk, Pitfall 2)', async () => {
      vaultFixture();
      const promise = runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
      await waitForSpawnCall(spawnMock);
      fakeChild.stderr.emit('data', Buffer.from('[FAIL] Docker daemon failed to start\n'));
      fakeChild.emit('close', 75);
      const result = await promise;
      expect(result.kind).toBe('disk-too-small');
      expect(result.failureVerdict?.screen).toBe('generic');
    });

    it("exit 75 with an 'Only Ngb free on /' reason -> failureVerdict.screen disk", async () => {
      vaultFixture();
      const promise = runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
      await waitForSpawnCall(spawnMock);
      fakeChild.stderr.emit('data', Buffer.from('[FAIL] Only 5GB free on /\n'));
      fakeChild.emit('close', 75);
      const result = await promise;
      expect(result.kind).toBe('disk-too-small');
      expect(result.failureVerdict?.screen).toBe('disk');
    });

    it("exit 1 with an 'error: 410' reason -> failureVerdict.screen no-tunnel-410 (Pitfall 3 / D-08)", async () => {
      vaultFixture();
      const promise = runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
      await waitForSpawnCall(spawnMock);
      fakeChild.stderr.emit('data', Buffer.from('[FAIL] curl: error: 410 Gone\n'));
      fakeChild.emit('close', 1);
      const result = await promise;
      expect(result.kind).toBe('generic-failure');
      expect(result.failureVerdict?.screen).toBe('no-tunnel-410');
    });

    it('exit 1 with a network reason -> failureVerdict.screen generic', async () => {
      vaultFixture();
      const promise = runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
      await waitForSpawnCall(spawnMock);
      fakeChild.stderr.emit('data', Buffer.from('[FAIL] curl: Could not resolve host\n'));
      fakeChild.emit('close', 1);
      const result = await promise;
      expect(result.kind).toBe('generic-failure');
      expect(result.failureVerdict?.screen).toBe('generic');
    });

    it('the attached failReason feeding mapFailure is the redacted tail, never a raw secret', async () => {
      vaultFixture();
      const promise = runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
      await waitForSpawnCall(spawnMock);
      fakeChild.stderr.emit('data', Buffer.from(`[FAIL] boom ${FIXTURE_API_KEY} failed\n`));
      fakeChild.emit('close', 1);
      const result = await promise;
      expect(redactSecretLikeMock).toHaveBeenCalled();
      expect(result.failureVerdict).toBeDefined();
    });

    it("the 'ok' verdict never carries a failureVerdict", async () => {
      vaultFixture();
      const promise = runInstall({ tier: 'pro' }, undefined, { spawn: spawnMock as never });
      await waitForSpawnCall(spawnMock);
      fakeChild.emit('close', 0);
      const result = await promise;
      expect(result).toEqual({ kind: 'ok' });
      expect('failureVerdict' in result).toBe(false);
    });
  });
});
