import { describe, it, expect, vi } from 'vitest';

// oauth-window.ts imports BrowserWindow/session from 'electron' at module
// load time; mock them so the pure buildChromeUserAgent()/attachOAuthWatchers()
// functions are importable outside a running Electron app (RESEARCH.md
// Validation Architecture: never a real BrowserWindow in CI).
vi.mock('electron', () => ({
  BrowserWindow: class {},
  session: { fromPartition: vi.fn() },
}));

vi.mock('../../src/main/log', () => ({
  logSafe: vi.fn(),
}));

import {
  buildChromeUserAgent,
  attachOAuthWatchers,
  OAUTH_PARTITION,
  type OAuthWinLike,
  type OAuthSesLike,
} from '../../src/main/platform/oauth-window';

/** A fake OAuthWinLike that records handlers keyed by event name so tests can drive them manually. */
function createFakeWin() {
  const webContentsHandlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  const winHandlers: Record<string, (() => void)[]> = {};
  const close = vi.fn();

  const win: OAuthWinLike = {
    webContents: {
      on: (ev: string, cb: (...a: unknown[]) => void) => {
        (webContentsHandlers[ev] ??= []).push(cb);
      },
    },
    on: (ev: string, cb: () => void) => {
      (winHandlers[ev] ??= []).push(cb);
    },
    close,
  };

  return {
    win,
    close,
    fireWebContents: (ev: string, ...args: unknown[]) => {
      for (const cb of webContentsHandlers[ev] ?? []) cb(...args);
    },
    fireWin: (ev: string) => {
      for (const cb of winHandlers[ev] ?? []) cb();
    },
  };
}

function createFakeSes(cookies: { value: string }[]): OAuthSesLike {
  return { cookies: { get: vi.fn().mockResolvedValue(cookies) } };
}

describe('buildChromeUserAgent', () => {
  it('contains the supplied Chrome version', () => {
    const ua = buildChromeUserAgent('150.0.0.0');
    expect(ua).toContain('Chrome/150.0.0.0');
  });

  it('does NOT contain an Electron token', () => {
    const ua = buildChromeUserAgent('150.0.0.0');
    expect(ua).not.toContain('Electron');
  });

  it('does NOT contain the app name', () => {
    const ua = buildChromeUserAgent('150.0.0.0');
    expect(ua).not.toContain('livinity');
  });
});

describe('OAUTH_PARTITION', () => {
  it('is the persisted oauth-login partition name', () => {
    expect(OAUTH_PARTITION).toBe('persist:oauth-login');
  });
});

describe('attachOAuthWatchers', () => {
  it('Case A: resolves { sessionValue } and closes the window when did-navigate finds the cookie', async () => {
    const { win, close, fireWebContents } = createFakeWin();
    const ses = createFakeSes([{ value: 'sess123' }]);

    const resultPromise = attachOAuthWatchers(win, ses);
    fireWebContents('did-navigate', {}, 'https://livinity.io/dashboard');
    // allow the async checkCookie() microtask to resolve
    await new Promise((r) => setTimeout(r, 0));

    const result = await resultPromise;
    expect(result).toEqual({ sessionValue: 'sess123' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('Case B: resolves { blocked: true } when a navigation URL contains error=disallowed_useragent', async () => {
    const { win, fireWebContents } = createFakeWin();
    const ses = createFakeSes([]);

    const resultPromise = attachOAuthWatchers(win, ses);
    fireWebContents(
      'did-redirect-navigation',
      {},
      'https://accounts.google.com/signin/oauth?error=disallowed_useragent'
    );

    const result = await resultPromise;
    expect(result).toEqual({ blocked: true });
  });

  it('Case C: resolves { cancelled: true } when the window is closed before settling', async () => {
    const { win, fireWin } = createFakeWin();
    const ses = createFakeSes([]);

    const resultPromise = attachOAuthWatchers(win, ses);
    fireWin('closed');

    const result = await resultPromise;
    expect(result).toEqual({ cancelled: true });
  });

  it('guards against double-settle: a closed event after the cookie was already captured does not change the result', async () => {
    const { win, fireWebContents, fireWin } = createFakeWin();
    const ses = createFakeSes([{ value: 'sess123' }]);

    const resultPromise = attachOAuthWatchers(win, ses);
    fireWebContents('did-navigate', {}, 'https://livinity.io/dashboard');
    await new Promise((r) => setTimeout(r, 0));
    fireWin('closed');

    const result = await resultPromise;
    expect(result).toEqual({ sessionValue: 'sess123' });
  });
});
