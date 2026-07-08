import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * shell-preload.ts must run inside Electron's sandboxed preload context,
 * which cannot require() any local project file (confirmed by testing —
 * see shell-preload.ts's header comment). Its CHANNELS object is therefore a
 * hand-duplicated literal, NOT imported from shared/ipc-contract.ts. This
 * test is the drift guard: every method on the exposed `api` is invoked and
 * asserted against the CANONICAL CHANNELS export from shared/ipc-contract.ts
 * so a future edit that lets the two fall out of sync fails here instead of
 * silently breaking IPC at runtime.
 */

// vi.hoisted runs before vi.mock's factory (and before the side-effecting
// import of shell-preload below) — a plain `let` here would throw a TDZ
// ReferenceError because ES module imports execute before any of THIS
// module's own top-level statements, regardless of source order.
const { invokeMock, onMock, getExposedApi, setExposedApi } = vi.hoisted(() => {
  let exposedApi: Record<string, (...args: unknown[]) => unknown> | undefined;
  return {
    invokeMock: vi.fn().mockResolvedValue(undefined),
    onMock: vi.fn(),
    getExposedApi: () => exposedApi,
    setExposedApi: (api: Record<string, (...args: unknown[]) => unknown>) => {
      exposedApi = api;
    },
  };
});

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_key: string, api: Record<string, (...args: unknown[]) => unknown>) => {
      setExposedApi(api);
    },
  },
  ipcRenderer: {
    invoke: (...args: unknown[]) => invokeMock(...args),
    on: (...args: unknown[]) => onMock(...args),
  },
}));

import { CHANNELS } from '../shared/ipc-contract';
import '../src/preload/shell-preload';

describe('shell-preload channel wiring (drift guard vs. shared/ipc-contract.ts)', () => {
  beforeEach(() => {
    invokeMock.mockClear();
    onMock.mockClear();
  });

  it('exposes an api object on the main world via contextBridge', () => {
    expect(getExposedApi()).toBeDefined();
  });

  it('vaultSet invokes the canonical vault:set channel with { key, value }', async () => {
    await getExposedApi()!.vaultSet('session', 'a-value');
    expect(invokeMock).toHaveBeenCalledWith(CHANNELS.vaultSet, { key: 'session', value: 'a-value' });
  });

  it('vaultHas invokes the canonical vault:has channel with { key }', async () => {
    await getExposedApi()!.vaultHas('session');
    expect(invokeMock).toHaveBeenCalledWith(CHANNELS.vaultHas, { key: 'session' });
  });

  it('getState invokes the canonical state:get channel', async () => {
    await getExposedApi()!.getState();
    expect(invokeMock).toHaveBeenCalledWith(CHANNELS.stateGet);
  });

  it('setState invokes the canonical state:set channel with the patch', async () => {
    await getExposedApi()!.setState({ currentStep: 'x' });
    expect(invokeMock).toHaveBeenCalledWith(CHANNELS.stateSet, { currentStep: 'x' });
  });

  it('simulateStatus invokes the canonical status:simulate channel', async () => {
    await getExposedApi()!.simulateStatus('running');
    expect(invokeMock).toHaveBeenCalledWith(CHANNELS.statusSimulate, 'running');
  });

  it('onStatusChanged subscribes on the canonical status:changed channel', () => {
    const cb = vi.fn();
    getExposedApi()!.onStatusChanged(cb);
    expect(onMock).toHaveBeenCalledWith(CHANNELS.statusChanged, expect.any(Function));
  });

  it('minimize invokes the canonical window:minimize channel', () => {
    getExposedApi()!.minimize();
    expect(invokeMock).toHaveBeenCalledWith(CHANNELS.windowMinimize);
  });

  it('hide invokes the canonical window:hide channel', () => {
    getExposedApi()!.hide();
    expect(invokeMock).toHaveBeenCalledWith(CHANNELS.windowHide);
  });

  it('quit invokes the canonical app:quit channel', () => {
    getExposedApi()!.quit();
    expect(invokeMock).toHaveBeenCalledWith(CHANNELS.appQuit);
  });
});

describe('shell-preload DEV-ONLY spike channels (Plan 04 drift guard vs. shell.ipc.ts)', () => {
  // The dev spike channels are deliberately NOT part of the production
  // CHANNELS object (Plan 03 decision), so the canonical source to guard
  // against is the main-process registration itself: shell.ipc.ts must
  // register a handler for the EXACT literal the preload invokes.
  const shellIpcSource = readFileSync(
    join(__dirname, '../src/main/ipc/shell.ipc.ts'),
    'utf8'
  );

  beforeEach(() => {
    invokeMock.mockClear();
  });

  it('devSpawnHolderA invokes dev:spawnHolderA, and shell.ipc.ts registers that exact handler', async () => {
    await getExposedApi()!.devSpawnHolderA();
    expect(invokeMock).toHaveBeenCalledWith('dev:spawnHolderA');
    expect(shellIpcSource).toContain("ipcMain.handle('dev:spawnHolderA'");
  });

  it('devUpdateSim invokes dev:updateSim, and shell.ipc.ts registers that exact handler', async () => {
    await getExposedApi()!.devUpdateSim();
    expect(invokeMock).toHaveBeenCalledWith('dev:updateSim');
    expect(shellIpcSource).toContain("ipcMain.handle('dev:updateSim'");
  });

  it('both dev handlers are gated behind !app.isPackaged in shell.ipc.ts', () => {
    // Both registrations must appear AFTER the isPackaged gate opens.
    const gateIndex = shellIpcSource.indexOf('if (!app.isPackaged)');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(shellIpcSource.indexOf("ipcMain.handle('dev:spawnHolderA'")).toBeGreaterThan(gateIndex);
    expect(shellIpcSource.indexOf("ipcMain.handle('dev:updateSim'")).toBeGreaterThan(gateIndex);
  });
});
