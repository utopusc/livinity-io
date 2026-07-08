import { describe, it, expect, vi } from 'vitest';

// tray-controller.ts imports Tray/Menu/nativeImage from 'electron' at module
// load time; mock them so the pure statusToColor()/createTrayIcon() functions
// are importable outside a running Electron app.
vi.mock('electron', () => ({
  Tray: class {},
  Menu: { buildFromTemplate: () => ({}) },
  nativeImage: {
    createFromBuffer: () => ({}),
    createFromBitmap: () => ({ toPNG: () => Buffer.from([1, 2, 3]) }),
  },
}));

import { statusToColor } from '../src/main/tray/tray-controller';
import type { Status } from '../shared/ipc-contract';

const STATUSES: Status[] = ['installing', 'running', 'stopped', 'error'];

describe('statusToColor', () => {
  it('returns 4 distinct colors for the 4 Phase-1 states', () => {
    const colors = STATUSES.map((s) => statusToColor(s));
    expect(new Set(colors).size).toBe(4);
  });

  it('returns pairwise-distinct colors for every state', () => {
    expect(statusToColor('running')).not.toBe(statusToColor('error'));
    expect(statusToColor('installing')).not.toBe(statusToColor('stopped'));
    expect(statusToColor('running')).not.toBe(statusToColor('installing'));
    expect(statusToColor('stopped')).not.toBe(statusToColor('error'));
    expect(statusToColor('installing')).not.toBe(statusToColor('error'));
    expect(statusToColor('running')).not.toBe(statusToColor('stopped'));
  });

  it('is exhaustive: every Status literal returns a defined non-empty string', () => {
    for (const s of STATUSES) {
      const color = statusToColor(s);
      expect(typeof color).toBe('string');
      expect(color.length).toBeGreaterThan(0);
    }
  });
});
