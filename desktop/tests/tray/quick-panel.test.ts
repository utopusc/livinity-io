import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * quick-panel.test.ts mocks Electron's BrowserWindow/app/screen at module
 * load time (mirrors tests/dashboard/dashboard-window.test.ts's discipline)
 * so this file never instantiates a real Electron BrowserWindow. Every test
 * injects its own fake `createWindow` via `Partial<QuickPanelDeps>`.
 */
vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getAppPath: () => 'FAKE_APP_PATH' },
  screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) },
}));

import {
  toggleQuickPanel,
  getQuickPanelWindow,
  computePanelPosition,
  __resetQuickPanelForTests,
  PANEL_WIDTH,
  PANEL_HEIGHT,
  type QuickPanelWinLike,
  type QuickPanelDeps,
} from '../../src/main/tray/quick-panel';

/** A fake QuickPanelWinLike that tracks visibility/destroyed state and records blur/closed handlers. */
function createFakeWin() {
  let visible = false;
  let destroyed = false;
  const blurHandlers: (() => void)[] = [];
  const closedHandlers: (() => void)[] = [];

  const win: QuickPanelWinLike = {
    loadURL: vi.fn().mockResolvedValue(undefined),
    loadFile: vi.fn().mockResolvedValue(undefined),
    isDestroyed: () => destroyed,
    isVisible: () => visible,
    show: vi.fn(() => {
      visible = true;
    }),
    hide: vi.fn(() => {
      visible = false;
    }),
    focus: vi.fn(),
    close: vi.fn(() => {
      destroyed = true;
      visible = false;
      for (const cb of closedHandlers) cb();
    }),
    setPosition: vi.fn(),
    on: ((event: string, cb: () => void) => {
      if (event === 'blur') blurHandlers.push(cb);
      if (event === 'closed') closedHandlers.push(cb);
    }) as QuickPanelWinLike['on'],
  };

  return {
    win,
    fireBlur: () => {
      for (const cb of blurHandlers) cb();
    },
  };
}

function baseDeps(overrides: Partial<QuickPanelDeps> = {}): Partial<QuickPanelDeps> {
  return {
    createWindow: vi.fn(() => createFakeWin().win),
    isDev: false,
    devUrl: 'http://localhost:5173',
    indexPath: 'FAKE_INDEX_PATH',
    preloadPath: 'FAKE_PRELOAD_PATH',
    getWorkArea: () => ({ x: 0, y: 0, width: 1920, height: 1040 }),
    ...overrides,
  };
}

beforeEach(() => {
  __resetQuickPanelForTests();
  vi.clearAllMocks();
});

describe('computePanelPosition -- bottom-right of the work area, 12px margins (NOT tray.getBounds())', () => {
  it('positions at workArea.width/height minus panel size minus 12px margin', () => {
    const pos = computePanelPosition({ x: 0, y: 0, width: 1920, height: 1040 });
    expect(pos).toEqual({ x: 1920 - PANEL_WIDTH - 12, y: 1040 - PANEL_HEIGHT - 12 });
  });

  it('offsets by the work area origin (secondary/multi-monitor display not at 0,0)', () => {
    const pos = computePanelPosition({ x: 1920, y: 40, width: 1920, height: 1040 });
    expect(pos).toEqual({
      x: 1920 + 1920 - PANEL_WIDTH - 12,
      y: 40 + 1040 - PANEL_HEIGHT - 12,
    });
  });
});

describe('toggleQuickPanel -- webPreferences (IDENTICAL to the main window)', () => {
  it('preload/contextIsolation/sandbox/nodeIntegration match the main window exactly', async () => {
    const createWindow = vi.fn(() => createFakeWin().win);
    await toggleQuickPanel(baseDeps({ createWindow, preloadPath: 'FAKE_PRELOAD_PATH' }));
    const options = createWindow.mock.calls[0][0];
    expect(options.webPreferences).toEqual({
      preload: 'FAKE_PRELOAD_PATH',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    });
  });

  it('window options: resizable:false, alwaysOnTop:true, skipTaskbar:true, show:false, frame:false, ~340x420', async () => {
    const createWindow = vi.fn(() => createFakeWin().win);
    await toggleQuickPanel(baseDeps({ createWindow }));
    const options = createWindow.mock.calls[0][0];
    expect(options).toMatchObject({
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      frame: false,
    });
    expect(PANEL_WIDTH).toBe(340);
    expect(PANEL_HEIGHT).toBe(420);
  });

  it('creates the window pre-positioned bottom-right (x/y match computePanelPosition)', async () => {
    const createWindow = vi.fn(() => createFakeWin().win);
    await toggleQuickPanel(baseDeps({ createWindow, getWorkArea: () => ({ x: 0, y: 0, width: 1920, height: 1040 }) }));
    const options = createWindow.mock.calls[0][0];
    expect(options.x).toBe(1920 - PANEL_WIDTH - 12);
    expect(options.y).toBe(1040 - PANEL_HEIGHT - 12);
  });
});

describe('toggleQuickPanel -- dev/prod load target (#quick-panel hash)', () => {
  it('dev: loadURL is called with `${devUrl}/#quick-panel`, loadFile NOT called', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await toggleQuickPanel(baseDeps({ createWindow, isDev: true, devUrl: 'http://localhost:5173' }));
    expect(fake.win.loadURL).toHaveBeenCalledWith('http://localhost:5173/#quick-panel');
    expect(fake.win.loadFile).not.toHaveBeenCalled();
  });

  it('prod: loadFile is called with (indexPath, { hash: "quick-panel" }), loadURL NOT called', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await toggleQuickPanel(baseDeps({ createWindow, isDev: false, indexPath: 'FAKE_INDEX_PATH' }));
    expect(fake.win.loadFile).toHaveBeenCalledWith('FAKE_INDEX_PATH', { hash: 'quick-panel' });
    expect(fake.win.loadURL).not.toHaveBeenCalled();
  });
});

describe('toggleQuickPanel -- singleton toggle behavior', () => {
  it('first call creates exactly one window, shows it, and focuses it', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await toggleQuickPanel(baseDeps({ createWindow }));
    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(fake.win.show).toHaveBeenCalledTimes(1);
    expect(fake.win.focus).toHaveBeenCalledTimes(1);
    expect(getQuickPanelWindow()).toBe(fake.win);
  });

  it('second call while visible HIDES the window (no second window created)', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await toggleQuickPanel(baseDeps({ createWindow }));
    await toggleQuickPanel(baseDeps({ createWindow }));
    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(fake.win.hide).toHaveBeenCalledTimes(1);
  });

  it('third call while hidden re-shows + re-focuses + repositions the SAME window (no second window created)', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await toggleQuickPanel(baseDeps({ createWindow })); // create + show
    await toggleQuickPanel(baseDeps({ createWindow })); // hide
    await toggleQuickPanel(baseDeps({ createWindow })); // show again
    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(fake.win.setPosition).toHaveBeenCalledTimes(1);
    expect(fake.win.show).toHaveBeenCalledTimes(2);
    expect(fake.win.focus).toHaveBeenCalledTimes(2);
  });
});

describe('toggleQuickPanel -- hide-on-blur (never close)', () => {
  it("firing the window's blur event hides it; close is never called", async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await toggleQuickPanel(baseDeps({ createWindow }));
    fake.fireBlur();
    expect(fake.win.hide).toHaveBeenCalled();
    expect(fake.win.close).not.toHaveBeenCalled();
  });

  it('blur while already hidden is a safe no-op (does not throw)', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await toggleQuickPanel(baseDeps({ createWindow }));
    await toggleQuickPanel(baseDeps({ createWindow })); // now hidden
    expect(() => fake.fireBlur()).not.toThrow();
  });
});

describe('getQuickPanelWindow / __resetQuickPanelForTests', () => {
  it('returns null when no window has ever been created', () => {
    expect(getQuickPanelWindow()).toBeNull();
  });

  it('returns the live window after toggleQuickPanel creates one', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await toggleQuickPanel(baseDeps({ createWindow }));
    expect(getQuickPanelWindow()).toBe(fake.win);
  });

  it('returns null again after the window is closed (closed handler clears the module reference)', async () => {
    const fake = createFakeWin();
    const createWindow = vi.fn(() => fake.win);
    await toggleQuickPanel(baseDeps({ createWindow }));
    fake.win.close();
    expect(getQuickPanelWindow()).toBeNull();
  });
});
