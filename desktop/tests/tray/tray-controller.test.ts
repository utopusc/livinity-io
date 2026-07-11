import { describe, it, expect, vi } from 'vitest';

// tray-controller.ts imports Tray/Menu/nativeImage from 'electron' at module
// load time; mock a minimal stateful Tray so the menu-builder view-model can
// be inspected without a running Electron app (mirrors tests/tray-icon.test.ts's
// module-mock, extended with state capture for setImage/setToolTip/setContextMenu/on).
// vi.mock factories are hoisted above imports/top-level declarations, so the
// mock class must be created via vi.hoisted() rather than referenced as a
// plain top-level const (Vitest TDZ restriction).
const { MockTray } = vi.hoisted(() => {
  class MockTray {
    image: unknown;
    tooltip: string | undefined;
    contextMenu: unknown;
    listeners: Record<string, () => void> = {};

    constructor(image: unknown) {
      this.image = image;
    }

    setImage(image: unknown) {
      this.image = image;
    }

    setToolTip(tooltip: string) {
      this.tooltip = tooltip;
    }

    setContextMenu(menu: unknown) {
      this.contextMenu = menu;
    }

    on(event: string, cb: () => void) {
      this.listeners[event] = cb;
    }
  }
  return { MockTray };
});

vi.mock('electron', () => ({
  Tray: MockTray,
  // Returns the raw template array itself so tests can inspect rows directly.
  Menu: { buildFromTemplate: (template: unknown) => template },
  nativeImage: {
    createFromBuffer: (buf: unknown) => ({ toPNG: () => buf }),
    createFromBitmap: () => ({ toPNG: () => Buffer.from([1, 2, 3]) }),
  },
}));

import {
  createTray,
  updateTray,
  updateTrayStatus,
  statusToColor,
  statusToLabel,
  createTrayIcon,
} from '../../src/main/tray/tray-controller';
import type { TrayCallbacks, TrayViewState } from '../../src/main/tray/tray-controller';

function makeCallbacks(): TrayCallbacks {
  return {
    onOpen: vi.fn(),
    onOpenDashboard: vi.fn(),
    onOpenInBrowser: vi.fn(),
    onToggleEngine: vi.fn(),
    onRestart: vi.fn(),
    onToggleStartAtLogin: vi.fn(),
    onOpenSettings: vi.fn(),
    onQuit: vi.fn(),
  };
}

function baseView(overrides: Partial<TrayViewState> = {}): TrayViewState {
  return {
    status: 'stopped',
    statusText: 'Stopped',
    engineRunning: false,
    startAtLoginChecked: false,
    actionsDisabled: false,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MenuRow = any;

function templateOf(tray: MockTray): MenuRow[] {
  return tray.contextMenu as MenuRow[];
}

function rowByLabel(template: MenuRow[], label: string): MenuRow | undefined {
  return template.find((r) => r && r.label === label);
}

describe('tray-controller buildContextMenu (via createTray/updateTray)', () => {
  it('labels the toggle row "Start engine" and enabled when engineRunning:false, actionsDisabled:false', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ engineRunning: false, actionsDisabled: false }), cbs);
    const row = rowByLabel(templateOf(tray), 'Start engine');
    expect(row).toBeDefined();
    expect(row!.enabled).not.toBe(false);
    expect(rowByLabel(templateOf(tray), 'Stop engine')).toBeUndefined();
  });

  it('labels the toggle row "Stop engine" when engineRunning:true', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ engineRunning: true }), cbs);
    const row = rowByLabel(templateOf(tray), 'Stop engine');
    expect(row).toBeDefined();
    expect(rowByLabel(templateOf(tray), 'Start engine')).toBeUndefined();
  });

  it('disables the Start/Stop row AND the Restart row when actionsDisabled:true', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ engineRunning: false, actionsDisabled: true }), cbs);
    const template = templateOf(tray);
    const toggleRow = rowByLabel(template, 'Start engine');
    const restartRow = rowByLabel(template, 'Restart engine');
    expect(toggleRow!.enabled).toBe(false);
    expect(restartRow!.enabled).toBe(false);
  });

  it('leaves the Start/Stop and Restart rows enabled when actionsDisabled:false', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ actionsDisabled: false }), cbs);
    const template = templateOf(tray);
    expect(rowByLabel(template, 'Start engine')!.enabled).not.toBe(false);
    expect(rowByLabel(template, 'Restart engine')!.enabled).not.toBe(false);
  });

  it('renders "Start at login" as a native checked checkbox when startAtLoginChecked:true', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ startAtLoginChecked: true }), cbs);
    const row = rowByLabel(templateOf(tray), 'Start at login');
    expect(row!.type).toBe('checkbox');
    expect(row!.checked).toBe(true);
  });

  it('renders "Start at login" unchecked when startAtLoginChecked:false', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ startAtLoginChecked: false }), cbs);
    const row = rowByLabel(templateOf(tray), 'Start at login');
    expect(row!.type).toBe('checkbox');
    expect(row!.checked).toBe(false);
  });

  it('renders the Status row disabled and reflecting view.statusText', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ statusText: 'Starting…' }), cbs);
    const row = rowByLabel(templateOf(tray), 'Status: Starting…');
    expect(row).toBeDefined();
    expect(row!.enabled).toBe(false);
  });

  it('renders the 5 fixed-label rows with the exact UI-SPEC copy', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    const template = templateOf(tray);
    for (const label of ['Open Livinity', 'Open dashboard', 'Open in browser', 'Settings', 'Quit']) {
      expect(rowByLabel(template, label)).toBeDefined();
    }
  });

  it('builds exactly 13 template entries (9 rows + 4 separators, D-07)', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    const template = templateOf(tray);
    expect(template.length).toBe(13);
    expect(template.filter((r) => r.type === 'separator').length).toBe(4);
  });

  it('wires each callback to its row click handler', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView(), cbs);
    const template = templateOf(tray);
    rowByLabel(template, 'Open Livinity')!.click();
    rowByLabel(template, 'Open dashboard')!.click();
    rowByLabel(template, 'Open in browser')!.click();
    rowByLabel(template, 'Start engine')!.click();
    rowByLabel(template, 'Restart engine')!.click();
    rowByLabel(template, 'Start at login')!.click();
    rowByLabel(template, 'Settings')!.click();
    rowByLabel(template, 'Quit')!.click();
    expect(cbs.onOpen).toHaveBeenCalledTimes(1);
    expect(cbs.onOpenDashboard).toHaveBeenCalledTimes(1);
    expect(cbs.onOpenInBrowser).toHaveBeenCalledTimes(1);
    expect(cbs.onToggleEngine).toHaveBeenCalledTimes(1);
    expect(cbs.onRestart).toHaveBeenCalledTimes(1);
    expect(cbs.onToggleStartAtLogin).toHaveBeenCalledTimes(1);
    expect(cbs.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(cbs.onQuit).toHaveBeenCalledTimes(1);
  });
});

describe('buildContextMenu conditional "Restart to update" row (UPD-01, 07-04)', () => {
  it('absent by default (updateReadyVersion undefined) -- existing 9-row/13-entry menu unchanged', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView(), cbs);
    const template = templateOf(tray);
    expect(template.find((r) => typeof r.label === 'string' && r.label.startsWith('Restart to update'))).toBeUndefined();
    expect(template.length).toBe(13);
  });

  it('absent when updateReadyVersion is explicitly null', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ updateReadyVersion: null }), cbs);
    expect(rowByLabel(templateOf(tray), 'Restart to update (v0.2.1)')).toBeUndefined();
  });

  it('present + enabled when updateReadyVersion is set and updateBlocked is false', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ updateReadyVersion: '0.2.1', updateBlocked: false }), cbs);
    const row = rowByLabel(templateOf(tray), 'Restart to update (v0.2.1)');
    expect(row).toBeDefined();
    expect(row!.enabled).not.toBe(false);
  });

  it('present + disabled when updateBlocked is true (D-06 install-gate)', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ updateReadyVersion: '0.2.1', updateBlocked: true }), cbs);
    const row = rowByLabel(templateOf(tray), 'Restart to update (v0.2.1)');
    expect(row).toBeDefined();
    expect(row!.enabled).toBe(false);
  });

  it('positioned immediately above Quit -- the FINAL group, reusing the existing separator (14 entries when present)', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ updateReadyVersion: '0.2.1' }), cbs);
    const template = templateOf(tray);
    expect(template.length).toBe(14); // 13 + 1 new row, no new separator
    expect(template.filter((r) => r.type === 'separator').length).toBe(4); // unchanged
    const quitIdx = template.findIndex((r) => r.label === 'Quit');
    const restartIdx = template.findIndex(
      (r) => typeof r.label === 'string' && r.label.startsWith('Restart to update')
    );
    expect(restartIdx).toBe(quitIdx - 1);
  });

  it('wires onRestartToUpdate to the row click handler', () => {
    const cbs = makeCallbacks();
    const onRestartToUpdate = vi.fn();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ updateReadyVersion: '0.2.1' }), { ...cbs, onRestartToUpdate });
    rowByLabel(templateOf(tray), 'Restart to update (v0.2.1)')!.click();
    expect(onRestartToUpdate).toHaveBeenCalledTimes(1);
  });

  it('missing onRestartToUpdate callback -> click is a safe no-op (?? NOOP discipline)', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    updateTray(tray as never, baseView({ updateReadyVersion: '0.2.1' }), cbs);
    expect(() => rowByLabel(templateOf(tray), 'Restart to update (v0.2.1)')!.click()).not.toThrow();
  });

  it('the deprecated updateTrayStatus shim still compiles/works untouched (optional new fields keep it green)', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    expect(() => updateTrayStatus(tray as never, 'running', cbs.onOpen, cbs.onQuit)).not.toThrow();
    expect(rowByLabel(templateOf(tray), 'Restart to update (v0.2.1)')).toBeUndefined();
  });
});

describe('createTray', () => {
  it('builds with the extended TrayCallbacks and wires double-click to onOpen', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    expect(tray).toBeInstanceOf(MockTray);
    tray.listeners['double-click']();
    expect(cbs.onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders an initial stopped-state menu (Start engine row present)', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    expect(rowByLabel(templateOf(tray), 'Start engine')).toBeDefined();
  });
});

describe('updateTrayStatus (legacy shim, Phase-1 callers)', () => {
  it('still updates the tray via the new view-model without throwing', () => {
    const cbs = makeCallbacks();
    const tray = createTray(cbs) as unknown as MockTray;
    expect(() => updateTrayStatus(tray as never, 'running', cbs.onOpen, cbs.onQuit)).not.toThrow();
    const row = rowByLabel(templateOf(tray), 'Status: Running');
    expect(row).toBeDefined();
  });
});

describe('regression: existing pure exports unchanged', () => {
  it('statusToColor returns the exact 4 original hex values', () => {
    expect(statusToColor('installing')).toBe('#eab308');
    expect(statusToColor('running')).toBe('#22c55e');
    expect(statusToColor('stopped')).toBe('#94a3b8');
    expect(statusToColor('error')).toBe('#ef4444');
  });

  it('statusToLabel returns the exact 4 original labels', () => {
    expect(statusToLabel('installing')).toBe('Installing');
    expect(statusToLabel('running')).toBe('Running');
    expect(statusToLabel('stopped')).toBe('Stopped');
    expect(statusToLabel('error')).toBe('Error');
  });

  it('createTrayIcon(\'#22c55e\') still builds without throwing (unchanged pixel-generator plumbing)', () => {
    const buf = createTrayIcon('#22c55e');
    expect(buf).toBeInstanceOf(Buffer);
  });
});
