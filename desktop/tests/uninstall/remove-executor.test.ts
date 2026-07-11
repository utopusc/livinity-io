import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * remove-executor.test.ts mocks every IO collaborator remove-executor.ts imports
 * directly (engine/cf-client/secrets-vault/state-store/login-item/install-invoke/
 * platform/auth-client/log/electron) -- mirrors engine.test.ts's mocking discipline.
 * cf-http is left REAL so `CfApiError` is the same class on both sides of the
 * boundary (cf-provision.test.ts precedent). Every test also passes a FULL fake
 * `RemoveExecutorDeps` object into executeRemove/finishRemove, so none of these
 * modules' real default implementations are ever exercised here -- they only need
 * to import cleanly.
 */

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:/FAKE/Livinity Desktop.exe'), quit: vi.fn() },
}));

vi.mock('../../src/main/supervision/engine', () => ({
  stopEngine: vi.fn(),
}));

vi.mock('../../src/main/cloudflare/cf-client', () => ({
  listDnsByName: vi.fn(),
  deleteDnsRecord: vi.fn(),
  deleteTunnelConnections: vi.fn(),
  deleteTunnel: vi.fn(),
}));

vi.mock('../../src/main/storage/secrets-vault', () => ({
  vaultGet: vi.fn(),
  vaultDelete: vi.fn(),
}));

vi.mock('../../src/main/storage/state-store', () => ({
  readState: vi.fn(),
  writeState: vi.fn(),
  DEFAULT_STATE: { version: 1, currentStep: 'start' },
}));

vi.mock('../../src/main/supervision/login-item', () => ({
  setStartAtLogin: vi.fn(),
}));

vi.mock('../../src/main/wsl/install-invoke', () => ({
  isInstallInFlight: vi.fn(),
}));

vi.mock('../../src/main/platform/auth-client', () => ({
  getMe: vi.fn(),
}));

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { CfApiError } from '../../src/main/cloudflare/cf-http';
import { executeRemove, finishRemove, type RemoveExecutorDeps } from '../../src/main/uninstall/remove-executor';
import type { RemoveChoices, State } from '../../shared/ipc-contract';

/** A terminal CfApiError at a given status (404 = success everywhere in this module). */
function cfErr(status: number): CfApiError {
  return new CfApiError({ message: `boom ${status}`, status, cfErrorCode: -1, cfMessage: '', endpoint: 'DELETE /x' });
}

function choices(partial: Partial<RemoveChoices> = {}): RemoveChoices {
  return { cf: false, distro: false, clear: false, ...partial };
}

/** The full CF receipts + a running engine -- the default "everything is eligible" state. */
const RECEIPTS_STATE: State = {
  version: 1,
  currentStep: 'done',
  engineDesiredState: 'running',
  tunnelId: 'tun-1',
  accountId: 'acct-1',
  zoneId: 'zone-1',
  zoneName: 'example.com',
  subLabel: 'bruce',
};

/** A full fake RemoveExecutorDeps -- an "everything succeeds, everything is eligible"
 * baseline that individual tests override piecemeal. */
function baseDeps(overrides: Partial<RemoveExecutorDeps> = {}): Partial<RemoveExecutorDeps> {
  return {
    stopEngine: vi.fn().mockResolvedValue(undefined),
    listDnsByName: vi.fn().mockResolvedValue([]),
    deleteDnsRecord: vi.fn().mockResolvedValue(undefined),
    deleteTunnelConnections: vi.fn().mockResolvedValue(undefined),
    deleteTunnel: vi.fn().mockResolvedValue(undefined),
    unregisterDistro: vi.fn().mockResolvedValue(undefined),
    vaultDelete: vi.fn().mockResolvedValue(undefined),
    resetState: vi.fn().mockResolvedValue(undefined),
    readState: vi.fn().mockResolvedValue(RECEIPTS_STATE),
    vaultGet: vi.fn().mockResolvedValue('fake-cf-token'),
    getTier: vi.fn().mockResolvedValue('free_byod'),
    isInstallInFlight: vi.fn().mockReturnValue(false),
    setStartAtLogin: vi.fn().mockResolvedValue(undefined),
    onProgress: vi.fn(),
    launchUninstaller: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeRemove', () => {
  it('cf:true engine running: runs stop-engine -> cf-teardown; a 404 on delete calls is SUCCESS; resolves {blockedByInstall:false, steps:[...]}', async () => {
    const stopEngine = vi.fn().mockResolvedValue(undefined);
    const listDnsByName = vi
      .fn()
      .mockResolvedValue([{ id: 'r1', name: 'bruce.example.com', type: 'CNAME', content: 'tun-1.cfargotunnel.com' }]);
    const deleteDnsRecord = vi.fn().mockRejectedValue(cfErr(404));
    const deleteTunnel = vi.fn().mockRejectedValue(cfErr(404));

    const result = await executeRemove(
      choices({ cf: true }),
      baseDeps({ stopEngine, listDnsByName, deleteDnsRecord, deleteTunnel })
    );

    expect(stopEngine).toHaveBeenCalledOnce();
    expect(deleteTunnel).toHaveBeenCalledTimes(1); // 404 = success, no retry needed
    expect(result).toEqual({ blockedByInstall: false, steps: ['stop-engine', 'cf-teardown'] });
  });

  it('W3: isInstallInFlight()=>true returns {blockedByInstall:true, steps:[]} immediately, calling no teardown dep', async () => {
    const stopEngine = vi.fn();
    const unregisterDistro = vi.fn();
    const deleteTunnel = vi.fn();
    const vaultDelete = vi.fn();

    const result = await executeRemove(
      choices({ cf: true, distro: true, clear: true }),
      baseDeps({
        stopEngine,
        unregisterDistro,
        deleteTunnel,
        vaultDelete,
        isInstallInFlight: vi.fn().mockReturnValue(true),
      })
    );

    expect(result).toEqual({ blockedByInstall: true, steps: [] });
    expect(stopEngine).not.toHaveBeenCalled();
    expect(unregisterDistro).not.toHaveBeenCalled();
    expect(deleteTunnel).not.toHaveBeenCalled();
    expect(vaultDelete).not.toHaveBeenCalled();
  });

  it('a NON-404 CfApiError on deleteTunnel marks cf-teardown "failed" but the flow still reaches the next step', async () => {
    const deleteTunnel = vi.fn().mockRejectedValue(cfErr(500));
    const unregisterDistro = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();

    const result = await executeRemove(
      choices({ cf: true, distro: true }),
      baseDeps({
        deleteTunnel,
        unregisterDistro,
        onProgress,
        readState: vi.fn().mockResolvedValue({ ...RECEIPTS_STATE, engineDesiredState: 'stopped' }),
      })
    );

    expect(deleteTunnel).toHaveBeenCalledTimes(2); // one retry after connections-delete (Q3)
    expect(unregisterDistro).toHaveBeenCalledOnce(); // best-effort continue, D-13
    expect(result.steps).toEqual(['cf-teardown', 'distro-remove']);
    expect(onProgress).toHaveBeenCalledWith({ stepId: 'cf-teardown', status: 'failed' });
    expect(onProgress).toHaveBeenCalledWith({ stepId: 'distro-remove', status: 'ok' });
  });

  it('Pitfall 10: DNS deletion targets ONLY records whose content === `${tunnelId}.cfargotunnel.com` -- a foreign record survives', async () => {
    const listDnsByName = vi.fn().mockResolvedValue([
      { id: 'ours', name: 'bruce.example.com', type: 'CNAME', content: 'tun-1.cfargotunnel.com' },
      { id: 'foreign', name: 'bruce.example.com', type: 'A', content: '203.0.113.9' },
    ]);
    const deleteDnsRecord = vi.fn().mockResolvedValue(undefined);

    await executeRemove(choices({ cf: true }), baseDeps({ listDnsByName, deleteDnsRecord }));

    expect(deleteDnsRecord).toHaveBeenCalledTimes(1);
    expect(deleteDnsRecord).toHaveBeenCalledWith('fake-cf-token', 'zone-1', 'ours');
  });

  it('W7: a non-free_byod getTier() => cf-teardown "skipped", no CF verb attempted (renderer choice alone cannot force it)', async () => {
    const listDnsByName = vi.fn();
    const deleteTunnel = vi.fn();
    const onProgress = vi.fn();

    const result = await executeRemove(
      choices({ cf: true }),
      baseDeps({ getTier: vi.fn().mockResolvedValue('other'), listDnsByName, deleteTunnel, onProgress })
    );

    expect(listDnsByName).not.toHaveBeenCalled();
    expect(deleteTunnel).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith({ stepId: 'cf-teardown', status: 'skipped' });
    expect(result.steps).toContain('cf-teardown'); // MAIN still walked the planned step; it just skipped the action
  });

  it('W7: no vaulted cfToken => cf-teardown "skipped", no CF verb attempted', async () => {
    const listDnsByName = vi.fn();
    const onProgress = vi.fn();

    await executeRemove(
      choices({ cf: true }),
      baseDeps({ vaultGet: vi.fn().mockResolvedValue(null), listDnsByName, onProgress })
    );

    expect(listDnsByName).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith({ stepId: 'cf-teardown', status: 'skipped' });
  });

  it('W7: missing CF receipts in state => cf-teardown "skipped", no CF verb attempted', async () => {
    const listDnsByName = vi.fn();
    const onProgress = vi.fn();

    await executeRemove(
      choices({ cf: true }),
      baseDeps({
        readState: vi.fn().mockResolvedValue({ version: 1, currentStep: 'x', engineDesiredState: 'stopped' }),
        listDnsByName,
        onProgress,
      })
    );

    expect(listDnsByName).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith({ stepId: 'cf-teardown', status: 'skipped' });
  });

  it('distro-remove calls unregisterDistro exactly once, with the literal distro name', async () => {
    const unregisterDistro = vi.fn().mockResolvedValue(undefined);

    await executeRemove(
      choices({ distro: true }),
      baseDeps({
        unregisterDistro,
        readState: vi.fn().mockResolvedValue({ ...RECEIPTS_STATE, engineDesiredState: 'stopped' }),
      })
    );

    expect(unregisterDistro).toHaveBeenCalledOnce();
    expect(unregisterDistro).toHaveBeenCalledWith('livinity');
  });

  it('credential-clear calls vaultDelete for every vault key + resetState', async () => {
    const vaultDelete = vi.fn().mockResolvedValue(undefined);
    const resetState = vi.fn().mockResolvedValue(undefined);

    await executeRemove(choices({ clear: true }), baseDeps({ vaultDelete, resetState }));

    expect(vaultDelete).toHaveBeenCalledTimes(4);
    expect(vaultDelete.mock.calls.map((c) => c[0]).sort()).toEqual(['apiKey', 'cfToken', 'session', 'tunnelToken']);
    expect(resetState).toHaveBeenCalledOnce();
  });

  it('onProgress pushes {stepId,status:"active"} then the terminal status, per step', async () => {
    const onProgress = vi.fn();

    await executeRemove(choices({ clear: true }), baseDeps({ onProgress }));

    expect(onProgress).toHaveBeenNthCalledWith(1, { stepId: 'credential-clear', status: 'active' });
    expect(onProgress).toHaveBeenNthCalledWith(2, { stepId: 'credential-clear', status: 'ok' });
  });

  it('zero-opt removal resolves {blockedByInstall:false, steps:[]}, calling no teardown dep', async () => {
    const stopEngine = vi.fn();

    const result = await executeRemove(choices({}), baseDeps({ stopEngine }));

    expect(result).toEqual({ blockedByInstall: false, steps: [] });
    expect(stopEngine).not.toHaveBeenCalled();
  });

  it('R-3: {distro:true} while the engine is running still stops the engine first (removePlan\'s own gate, walked verbatim)', async () => {
    const stopEngine = vi.fn().mockResolvedValue(undefined);
    const unregisterDistro = vi.fn().mockResolvedValue(undefined);

    const result = await executeRemove(choices({ distro: true }), baseDeps({ stopEngine, unregisterDistro }));

    expect(result.steps).toEqual(['stop-engine', 'distro-remove']);
    expect(stopEngine).toHaveBeenCalledOnce();
  });
});

describe('finishRemove', () => {
  it('calls setStartAtLogin(false) -> launchUninstaller -> quit, in that order', async () => {
    const order: string[] = [];
    const setStartAtLogin = vi.fn().mockImplementation(async (enabled: boolean) => {
      expect(enabled).toBe(false);
      order.push('setStartAtLogin');
    });
    const launchUninstaller = vi.fn().mockImplementation(async () => {
      order.push('launchUninstaller');
    });
    const quit = vi.fn().mockImplementation(() => {
      order.push('quit');
    });

    await finishRemove({ setStartAtLogin, launchUninstaller, quit });

    expect(order).toEqual(['setStartAtLogin', 'launchUninstaller', 'quit']);
  });
});

describe('source-scan (T-07-12)', () => {
  it('"--unregister" appears in remove-executor.ts exactly once, inside defaultUnregisterDistro', () => {
    const source = readFileSync(join(__dirname, '../../src/main/uninstall/remove-executor.ts'), 'utf8');
    const occurrences = source.split('--unregister').length - 1;
    expect(occurrences).toBe(1);

    const fnStart = source.indexOf('function defaultUnregisterDistro');
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = source.indexOf('\n}', fnStart);
    const fnBody = source.slice(fnStart, fnEnd);
    expect(fnBody).toContain('--unregister');
  });

  it('"--unregister" appears NOWHERE else in src/main (repo-wide scan)', () => {
    const mainDir = join(__dirname, '../../src/main');
    const removeExecutorPath = join(mainDir, 'uninstall', 'remove-executor.ts');
    const offenders: string[] = [];

    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && entry.name.endsWith('.ts') && full !== removeExecutorPath) {
          const text = readFileSync(full, 'utf8');
          if (text.includes('--unregister')) offenders.push(full);
        }
      }
    }
    walk(mainDir);

    expect(offenders).toEqual([]);
  });

  it('zero imports from ipc/ or tray/', () => {
    const source = readFileSync(join(__dirname, '../../src/main/uninstall/remove-executor.ts'), 'utf8');
    expect(source).not.toMatch(/from ['"].*\/(ipc|tray)\//);
  });
});
