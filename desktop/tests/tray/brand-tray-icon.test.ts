import { describe, it, expect, vi } from 'vitest';

// tray-controller imports Tray/Menu/nativeImage from 'electron' at module
// load; the pure functions under test here never touch them, so the minimal
// module mock from tray-controller.test.ts is enough.
vi.mock('electron', () => ({
  Tray: class {},
  Menu: { buildFromTemplate: (template: unknown) => template },
  nativeImage: {
    createFromBuffer: (buf: unknown) => ({ toPNG: () => buf }),
    createFromBitmap: () => ({ toPNG: () => Buffer.from([1, 2, 3]) }),
  },
}));

import { overlayStatusDot } from '../../src/main/tray/tray-controller';
import { TRAY_LOGO_PNG_B64 } from '../../src/main/tray/tray-logo';

const SIZE = 32;

function blank(): Buffer {
  return Buffer.alloc(SIZE * SIZE * 4, 0);
}

function px(buf: Buffer, x: number, y: number): [number, number, number, number] {
  const i = (y * SIZE + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]; // BGRA
}

describe('overlayStatusDot (pure BGRA compositor)', () => {
  it('paints the status color at the dot center (bottom-right corner)', () => {
    // running green #22c55e -> B=0x5e G=0xc5 R=0x22
    const out = overlayStatusDot(blank(), SIZE, '#22c55e');
    expect(px(out, 25, 25)).toEqual([0x5e, 0xc5, 0x22, 255]);
  });

  it('paints a dark separating ring between dot and logo', () => {
    // cx=cy=24.96, dotR=5.44, ringR=7.52; (31,25) is dist~6.04 -> ring zone
    const out = overlayStatusDot(blank(), SIZE, '#22c55e');
    expect(px(out, 31, 25)).toEqual([7, 5, 5, 255]);
  });

  it('leaves pixels outside the dot region untouched', () => {
    const input = blank();
    input.fill(0xab, 0, 4); // sentinel at (0,0)
    const out = overlayStatusDot(input, SIZE, '#ef4444');
    expect(px(out, 0, 0)).toEqual([0xab, 0xab, 0xab, 0xab]);
    expect(px(out, 3, 3)).toEqual([0, 0, 0, 0]);
  });

  it('never mutates its input buffer', () => {
    const input = blank();
    const before = Buffer.from(input);
    overlayStatusDot(input, SIZE, '#eab308');
    expect(input.equals(before)).toBe(true);
  });

  it('each status color produces a distinct dot center', () => {
    const centers = ['#eab308', '#22c55e', '#94a3b8', '#ef4444'].map((c) =>
      px(overlayStatusDot(blank(), SIZE, c), 25, 25).join(',')
    );
    expect(new Set(centers).size).toBe(4);
  });
});

describe('TRAY_LOGO_PNG_B64 (embedded brand mark)', () => {
  it('decodes to a real PNG (magic bytes) small enough to embed', () => {
    const buf = Buffer.from(TRAY_LOGO_PNG_B64, 'base64');
    expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.length).toBeLessThan(10_000);
  });
});
