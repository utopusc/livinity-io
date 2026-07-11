import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * dashboard-window.ts imports BrowserWindow/app/shell from 'electron' at
 * module load time; mock them so this file never instantiates a real
 * Electron BrowserWindow (RESEARCH.md Validation Architecture -- mirrors
 * tests/platform/oauth-window.test.ts's discipline). Every test injects its
 * own fake `createWindow` via `Partial<DashboardDeps>`, so the mocked
 * `BrowserWindow`/`shell.openExternal` here are never actually invoked --
 * they exist purely so the module's default-dependency expressions resolve
 * without throwing at import time.
 */
vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getAppPath: () => 'FAKE_APP_PATH' },
  shell: { openExternal: vi.fn() },
}));

import {
  openDashboardWindow,
  closeDashboardWindow,
  getDashboardWindow,
  wireNavigationGuard,
  __resetDashboardWindowForTests,
  type DashboardWinLike,
  type DashboardDeps,
} from '../../src/main/dashboard/dashboard-window';
import { ALLOWED_ORIGIN } from '../../src/main/dashboard/decide-dashboard-nav';

/** A fake DashboardWinLike that records handlers keyed by event name so tests can drive them manually. */
function createFakeWin() {
  const willNavigateHandlers: ((event: { preventDefault: () => void }, url: string) => void)[] = [];
  let windowOpenHandler: ((details: { url: string }) => { action: 'deny' | 'allow' }) | null = null;
  let destroyed = false;

  const win: DashboardWinLike = {
    webContents: {
      on: (event, cb) => {
        if (event === 'will-navigate') willNavigateHandlers.push(cb);
      },
      setWindowOpenHandler: (handler) => {
        windowOpenHandler = handler;
      },
    },
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
    isDestroyed: () => destroyed,
    close: vi.fn(() => {
      destroyed = true;
    }),
    focus: vi.fn(),
  };

  return {
    win,
    fireWillNavigate: (url: string) => {
      const event = { preventDefault: vi.fn() };
      for (const cb of willNavigateHandlers) cb(event, url);
      return event;
    },
    fireWindowOpen: (url: string) => windowOpenHandler!({ url }),
  };
}

function baseDeps(overrides: Partial<DashboardDeps> = {}): Partial<DashboardDeps> {
  return {
    createWindow: vi.fn(() => createFakeWin().win),
    isInstalledAndHealthy: vi.fn().mockResolvedValue(true),
    openExternal: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    interstitialPath: 'FAKE_INTERSTITIAL_PATH',
    ...overrides,
  };
}

beforeEach(() => {
  __resetDashboardWindowForTests();
  vi.clearAllMocks();
});

describe('openDashboardWindow -- sandbox contract (D-09/T-06-05)', () => {
  it('the webPreferences passed to the window factory has NO preload key', async () => {
    const createWindow = vi.fn(() => createFakeWin().win);
    await openDashboardWindow(baseDeps({ createWindow }));

    const options = createWindow.mock.calls[0][0];
    expect(options.webPreferences).toBeDefined();
    expect('preload' in options.webPreferences!).toBe(false);
  });

  it('sandbox:true, contextIsolation:true, nodeIntegration:false (structural assertion)', async () => {
    const createWindow = vi.fn(() => createFakeWin().win);
    await openDashboardWindow(baseDeps({ createWindow }));

    const options = createWindow.mock.calls[0][0];
    expect(options.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    });
  });
});

describe('openDashboardWindow -- probe-then-open (Pattern 6)', () => {
  it('healthy=true -> loadURL(ALLOWED_ORIGIN + "/") called, loadFile NOT called', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await openDashboardWindow(
      baseDeps({ createWindow, isInstalledAndHealthy: vi.fn().mockResolvedValue(true) })
    );

    expect(fake.win.loadURL).toHaveBeenCalledWith(`${ALLOWED_ORIGIN}/`);
    expect(fake.win.loadFile).not.toHaveBeenCalled();
  });

  it('healthy=false -> loadFile(interstitial) called first; a later probe pass loadURL-swaps (bounded background poll)', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    const isInstalledAndHealthy = vi
      .fn()
      .mockResolvedValueOnce(false) // initial probe (before loadFile)
      .mockResolvedValueOnce(false) // 1st background poll -- still down
      .mockResolvedValueOnce(true); // 2nd background poll -- recovered

    await openDashboardWindow(
      baseDeps({
        createWindow,
        isInstalledAndHealthy,
        sleep: vi.fn().mockResolvedValue(undefined),
        interstitialPath: 'FAKE_INTERSTITIAL_PATH',
      })
    );

    expect(fake.win.loadFile).toHaveBeenCalledWith('FAKE_INTERSTITIAL_PATH');
    expect(fake.win.loadURL).not.toHaveBeenCalled();

    // The poll loop runs in the background (fire-and-forget) -- wait for it
    // to reach its loadURL swap.
    await vi.waitFor(() => {
      expect(fake.win.loadURL).toHaveBeenCalledWith(`${ALLOWED_ORIGIN}/`);
    });
    expect(isInstalledAndHealthy).toHaveBeenCalledTimes(3);
  });

  it('the background poll stops once the window is destroyed (never loadURLs a closed window)', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    const isInstalledAndHealthy = vi.fn().mockResolvedValue(false);
    const sleep = vi.fn().mockImplementation(() => {
      // simulate the window closing mid-poll
      fake.win.close();
      return Promise.resolve();
    });

    await openDashboardWindow(
      baseDeps({ createWindow, isInstalledAndHealthy, sleep, interstitialPath: 'X' })
    );

    await vi.waitFor(() => {
      expect(sleep).toHaveBeenCalled();
    });
    // give the fire-and-forget loop a tick to observe isDestroyed() and bail
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.win.loadURL).not.toHaveBeenCalled();
  });
});

describe('wireNavigationGuard -- allow-list (T-06-06)', () => {
  it('will-navigate to an external origin: preventDefault + openExternal called', () => {
    const fake = createFakeWin();
    const openExternal = vi.fn();
    wireNavigationGuard(fake.win, openExternal);

    const event = fake.fireWillNavigate('https://evil.example/');

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith('https://evil.example/');
  });

  it('will-navigate to ALLOWED_ORIGIN + "/apps": allowed, no preventDefault, no openExternal', () => {
    const fake = createFakeWin();
    const openExternal = vi.fn();
    wireNavigationGuard(fake.win, openExternal);

    const event = fake.fireWillNavigate(`${ALLOWED_ORIGIN}/apps`);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('setWindowOpenHandler ALWAYS returns { action: "deny" }, regardless of origin', () => {
    const fake = createFakeWin();
    const openExternal = vi.fn();
    wireNavigationGuard(fake.win, openExternal);

    expect(fake.fireWindowOpen('https://evil.example/')).toEqual({ action: 'deny' });
    expect(fake.fireWindowOpen(`${ALLOWED_ORIGIN}/apps`)).toEqual({ action: 'deny' });
  });

  it('setWindowOpenHandler calls openExternal only for non-allowed-origin urls', () => {
    const fake = createFakeWin();
    const openExternal = vi.fn();
    wireNavigationGuard(fake.win, openExternal);

    fake.fireWindowOpen(`${ALLOWED_ORIGIN}/apps`);
    expect(openExternal).not.toHaveBeenCalled();

    fake.fireWindowOpen('https://evil.example/');
    expect(openExternal).toHaveBeenCalledWith('https://evil.example/');
  });
});

describe('closeDashboardWindow / getDashboardWindow', () => {
  it('getDashboardWindow() returns null when no window is open', () => {
    expect(getDashboardWindow()).toBeNull();
  });

  it('closeDashboardWindow() is a safe no-op when none is open', () => {
    expect(() => closeDashboardWindow()).not.toThrow();
    expect(getDashboardWindow()).toBeNull();
  });

  it('getDashboardWindow() returns the current instance after opening', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await openDashboardWindow(baseDeps({ createWindow }));

    expect(getDashboardWindow()).toBe(fake.win);
  });

  it('closeDashboardWindow() closes an open window and clears the reference', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await openDashboardWindow(baseDeps({ createWindow }));

    closeDashboardWindow();

    expect(fake.win.close).toHaveBeenCalledOnce();
    expect(getDashboardWindow()).toBeNull();
  });

  it('opening again while a window is already open focuses the existing one instead of spawning a duplicate', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await openDashboardWindow(baseDeps({ createWindow }));
    await openDashboardWindow(baseDeps({ createWindow }));

    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(fake.win.focus).toHaveBeenCalledOnce();
  });
});
