import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * updater.test.ts mocks every IO collaborator updater.ts imports directly
 * (electron `app`, state-store, install-invoke, log) AND the 'electron-updater'
 * package itself -- the real `autoUpdater` singleton is NEVER loaded here.
 * Every test drives updater.ts through an injected `MinimalUpdater` fake
 * emitter (deps.updater), mirroring engine.test.ts's full-IO-mock discipline.
 */

const isInstallInFlightMock = vi.hoisted(() => vi.fn());
const logSafeMock = vi.hoisted(() => vi.fn());
const appIsPackagedMock = vi.hoisted(() => ({ value: false }));
const appGetVersionMock = vi.hoisted(() => vi.fn(() => '0.1.0'));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return appIsPackagedMock.value;
    },
    getVersion: appGetVersionMock,
  },
}));

vi.mock('electron-updater', () => ({
  // Never used directly -- every test injects its own fake via deps.updater;
  // this stands in only so the real package is never loaded.
  autoUpdater: {},
}));

vi.mock('../../src/main/wsl/install-invoke', () => ({
  isInstallInFlight: isInstallInFlightMock,
}));

vi.mock('../../src/main/log', () => ({
  logSafe: logSafeMock,
  log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import {
  initUpdater,
  getUpdateState,
  checkForUpdates,
  restartToUpdate,
  __resetUpdaterForTests,
} from '../../src/main/update/updater';
import type { MinimalUpdater } from '../../src/main/update/updater';

/** A minimal, stateful fake emitter -- `on` records listeners, `emit` awaits
 * every registered listener's return value (updater.ts's 'update-downloaded'
 * handler is async, so tests must await its settlement before asserting). */
class FakeUpdater implements MinimalUpdater {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  allowDowngrade = true;
  logger: unknown = 'not-null';
  listeners: Record<string, Array<(...args: unknown[]) => unknown>> = {};
  onSpy = vi.fn();
  checkForUpdatesSpy = vi.fn();
  quitAndInstallSpy = vi.fn();

  on(event: string, listener: (...args: unknown[]) => unknown): void {
    this.onSpy(event, listener);
    (this.listeners[event] ??= []).push(listener);
  }

  checkForUpdates(): unknown {
    return this.checkForUpdatesSpy();
  }

  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void {
    this.quitAndInstallSpy(isSilent, isForceRunAfter);
  }

  async emit(event: string, payload?: unknown): Promise<void> {
    for (const cb of this.listeners[event] ?? []) {
      await cb(payload);
    }
  }
}

/** In-memory readState/patchState fake mirroring state-store.ts's real
 * read-modify-write contract, so a SECOND 'update-downloaded' for the same
 * version genuinely observes the first call's persisted notify-once memory. */
function makeFakeStateStore() {
  let fakeState: { lastUpdateNotifiedVersion?: string } = {};
  const readState = vi.fn(async () => ({ ...fakeState }) as never);
  const patchState = vi.fn(async (patch: Record<string, unknown>) => {
    fakeState = { ...fakeState, ...patch };
    return { ...fakeState } as never;
  });
  return { readState, patchState };
}

beforeEach(() => {
  __resetUpdaterForTests();
  isInstallInFlightMock.mockReset().mockReturnValue(false);
  logSafeMock.mockClear();
  appIsPackagedMock.value = false;
  appGetVersionMock.mockClear();
});

describe('initUpdater', () => {
  it('isPackaged()=>false sets state "dev" and NEVER touches the injected updater (no on/config calls)', () => {
    const fake = new FakeUpdater();
    initUpdater({ isPackaged: () => false, updater: fake, getVersion: () => '0.1.0' });

    expect(getUpdateState().state).toBe('dev');
    expect(fake.onSpy).not.toHaveBeenCalled();
    expect(fake.autoDownload).toBe(false); // untouched -- still the fake's initial value
  });

  it('isPackaged()=>true configures autoDownload/autoInstallOnAppQuit/allowDowngrade and registers event listeners', () => {
    const fake = new FakeUpdater();
    initUpdater({ isPackaged: () => true, updater: fake, getVersion: () => '0.1.0' });

    expect(fake.autoDownload).toBe(true);
    expect(fake.autoInstallOnAppQuit).toBe(true);
    expect(fake.allowDowngrade).toBe(false);
    expect(fake.logger).toBeNull();
    for (const event of [
      'checking-for-update',
      'update-available',
      'download-progress',
      'update-not-available',
      'error',
      'update-downloaded',
    ]) {
      expect(fake.listeners[event]).toBeDefined();
    }
  });

  it('registers a scheduleChecks callback that triggers checkForUpdates, and an onSessionEnd disarm callback', () => {
    const fake = new FakeUpdater();
    const scheduleChecks = vi.fn();
    const onSessionEnd = vi.fn();
    initUpdater({ isPackaged: () => true, updater: fake, scheduleChecks, onSessionEnd, getVersion: () => '0.1.0' });

    expect(scheduleChecks).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
  });
});

describe('update-downloaded -> notify-once + patchState + state "ready"', () => {
  it("emitting 'update-downloaded'{version:'0.2.1'} with no prior notify ⇒ notify called once + patchState writes '0.2.1' + state 'ready'; a SECOND identical event ⇒ notify NOT called again", async () => {
    const fake = new FakeUpdater();
    const { readState, patchState } = makeFakeStateStore();
    const notify = vi.fn();
    const pushStatus = vi.fn();
    const refreshTray = vi.fn();

    initUpdater({
      isPackaged: () => true,
      updater: fake,
      readState,
      patchState,
      notify,
      pushStatus,
      refreshTray,
      getVersion: () => '0.1.0',
    });

    await fake.emit('update-downloaded', { version: '0.2.1' });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('0.2.1');
    expect(patchState).toHaveBeenCalledWith({ lastUpdateNotifiedVersion: '0.2.1' });
    expect(getUpdateState().state).toBe('ready');
    expect(getUpdateState().readyVersion).toBe('0.2.1');
    expect(refreshTray).toHaveBeenCalled();

    notify.mockClear();
    await fake.emit('update-downloaded', { version: '0.2.1' });

    expect(notify).not.toHaveBeenCalled();
  });

  it('a DIFFERENT version after the first notifies again (once-PER-VERSION, not once-ever)', async () => {
    const fake = new FakeUpdater();
    const { readState, patchState } = makeFakeStateStore();
    const notify = vi.fn();

    initUpdater({
      isPackaged: () => true,
      updater: fake,
      readState,
      patchState,
      notify,
      getVersion: () => '0.1.0',
    });

    await fake.emit('update-downloaded', { version: '0.2.1' });
    notify.mockClear();
    await fake.emit('update-downloaded', { version: '0.3.0' });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('0.3.0');
  });
});

describe('restartToUpdate', () => {
  it('calls the injected updater.quitAndInstall with EXACTLY (true, true)', () => {
    const fake = new FakeUpdater();
    initUpdater({ isPackaged: () => true, updater: fake, getVersion: () => '0.1.0' });

    restartToUpdate();

    expect(fake.quitAndInstallSpy).toHaveBeenCalledWith(true, true);
  });

  it('no-ops when never initialized / while unpackaged (activeUpdater unset)', () => {
    const fake = new FakeUpdater();
    initUpdater({ isPackaged: () => false, updater: fake, getVersion: () => '0.1.0' });

    expect(() => restartToUpdate()).not.toThrow();
    expect(fake.quitAndInstallSpy).not.toHaveBeenCalled();
  });
});

describe("onSessionEnd's disarm callback (Pitfall 3)", () => {
  it('sets autoInstallOnAppQuit=false on the injected updater when invoked', () => {
    const fake = new FakeUpdater();
    let disarm: (() => void) | undefined;
    initUpdater({
      isPackaged: () => true,
      updater: fake,
      onSessionEnd: (cb) => {
        disarm = cb;
      },
      getVersion: () => '0.1.0',
    });

    expect(fake.autoInstallOnAppQuit).toBe(true);
    disarm?.();
    expect(fake.autoInstallOnAppQuit).toBe(false);
  });
});

describe('getUpdateState (W2 -- installBlocked always live)', () => {
  it('isInstallInFlight()=>true returns installBlocked:true', () => {
    const fake = new FakeUpdater();
    initUpdater({
      isPackaged: () => true,
      updater: fake,
      isInstallInFlight: () => true,
      getVersion: () => '0.1.0',
    });

    expect(getUpdateState().installBlocked).toBe(true);
  });

  it('isInstallInFlight()=>false returns installBlocked:false', () => {
    const fake = new FakeUpdater();
    initUpdater({
      isPackaged: () => true,
      updater: fake,
      isInstallInFlight: () => false,
      getVersion: () => '0.1.0',
    });

    expect(getUpdateState().installBlocked).toBe(false);
  });

  it('currentVersion reflects deps.getVersion() at init time', () => {
    const fake = new FakeUpdater();
    initUpdater({ isPackaged: () => true, updater: fake, getVersion: () => '9.9.9' });

    expect(getUpdateState().currentVersion).toBe('9.9.9');
  });
});

describe('checkForUpdates', () => {
  it('delegates to the injected updater.checkForUpdates() once packaged', () => {
    const fake = new FakeUpdater();
    initUpdater({ isPackaged: () => true, updater: fake, getVersion: () => '0.1.0' });

    checkForUpdates();

    expect(fake.checkForUpdatesSpy).toHaveBeenCalledTimes(1);
  });

  it('no-ops while in "dev" state (unpackaged)', () => {
    const fake = new FakeUpdater();
    initUpdater({ isPackaged: () => false, updater: fake, getVersion: () => '0.1.0' });

    expect(() => checkForUpdates()).not.toThrow();
    expect(fake.checkForUpdatesSpy).not.toHaveBeenCalled();
  });

  it("WR-01: a REJECTED checkForUpdates() promise is consumed — no unhandledRejection reaches the process (electron-updater 6.8.9 emits 'error' AND rethrows)", async () => {
    const fake = new FakeUpdater();
    fake.checkForUpdatesSpy.mockImplementation(() => Promise.reject(new Error('offline')));
    initUpdater({ isPackaged: () => true, updater: fake, getVersion: () => '0.1.0' });

    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    try {
      expect(() => checkForUpdates()).not.toThrow();
      // Two macrotask turns: Node emits 'unhandledRejection' at the end of the
      // turn in which a rejection is left handler-less — pre-fix this fires.
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
      expect(onUnhandled).not.toHaveBeenCalled();
      expect(logSafeMock).toHaveBeenCalledWith('update.check', { rejected: true });
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('WR-01: a SYNCHRONOUSLY-throwing checkForUpdates() is still caught (exception breadcrumb path intact)', () => {
    const fake = new FakeUpdater();
    fake.checkForUpdatesSpy.mockImplementation(() => {
      throw new Error('sync boom');
    });
    initUpdater({ isPackaged: () => true, updater: fake, getVersion: () => '0.1.0' });

    expect(() => checkForUpdates()).not.toThrow();
    expect(logSafeMock).toHaveBeenCalledWith('update.check', { exception: true });
  });
});

describe('other events reduce through nextStatus + pushStatus', () => {
  it("'checking-for-update' -> state 'checking', pushStatus called", async () => {
    const fake = new FakeUpdater();
    const pushStatus = vi.fn();
    initUpdater({ isPackaged: () => true, updater: fake, pushStatus, getVersion: () => '0.1.0' });

    await fake.emit('checking-for-update');

    expect(getUpdateState().state).toBe('checking');
    expect(pushStatus).toHaveBeenCalled();
  });

  it("'error' -> state 'failed'", async () => {
    const fake = new FakeUpdater();
    initUpdater({ isPackaged: () => true, updater: fake, getVersion: () => '0.1.0' });

    await fake.emit('error', new Error('boom'));

    expect(getUpdateState().state).toBe('failed');
  });

  it("'update-not-available' -> state 'up-to-date'", async () => {
    const fake = new FakeUpdater();
    initUpdater({ isPackaged: () => true, updater: fake, getVersion: () => '0.1.0' });

    await fake.emit('update-not-available');

    expect(getUpdateState().state).toBe('up-to-date');
  });
});

describe('source-scan: quitAndInstall(true, true), never the bare defaults (Q1.3)', () => {
  it('updater.ts contains the literal quitAndInstall(true, true) and no bare quitAndInstall()', () => {
    const source = readFileSync(join(__dirname, '../../src/main/update/updater.ts'), 'utf8');
    expect(source).toContain('quitAndInstall(true, true)');
    expect(source).not.toMatch(/quitAndInstall\(\)/);
  });

  it('updater.ts never sets publisherName or verifyUpdateCodeSignature (Q1.4)', () => {
    const source = readFileSync(join(__dirname, '../../src/main/update/updater.ts'), 'utf8');
    expect(source).not.toContain('publisherName');
    expect(source).not.toContain('verifyUpdateCodeSignature');
  });
});
