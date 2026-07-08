/**
 * src/main/platform/oauth-window.ts
 *
 * Embedded-browser Google OAuth window (AUTH-02, D-02). This module
 * reimplements NO OAuth logic: it opens the real `livinity.io/login` page in
 * an isolated, sandboxed, UA-spoofed BrowserWindow, lets the existing web
 * flow (Supabase PKCE broker -> /auth/callback -> /api/auth/oauth/bridge) run
 * unmodified, and reads the resulting httpOnly `liv_session` cookie via
 * `session.cookies.get()` once the bridge has set it.
 *
 * NEVER log the cookie value — only the scalar verdict
 * ('captured' | 'blocked' | 'cancelled') via logSafe (src/main/log.ts).
 *
 * Zero imports from ipc/ or tray/ — this module is a main-process primitive,
 * mirroring the src/main/storage/ and src/main/platform/ isolation
 * discipline established in Phase 1 / Plan 02-01.
 */

import { BrowserWindow, session, type BrowserWindow as BrowserWindowType } from 'electron';
import { logSafe } from '../log';

/** Single source of truth for the OAuth window's session partition name. */
export const OAUTH_PARTITION = 'persist:oauth-login';

const LOGIN_URL = 'https://livinity.io/login';
const COOKIE_URL = 'https://livinity.io';
const COOKIE_NAME = 'liv_session';

/** Google's embedded-webview-block error markers (Pitfall 2). */
const BLOCK_MARKERS = ['error=disallowed_useragent', 'disallow_webview'];

export type OAuthResult = { sessionValue: string } | { cancelled: true } | { blocked: true };

/**
 * The minimal BrowserWindow surface attachOAuthWatchers needs — kept as an
 * interface so tests can drive a fake window/webContents without a real
 * Electron BrowserWindow (RESEARCH.md Validation Architecture: never a real
 * BrowserWindow in CI).
 */
export interface OAuthWinLike {
  webContents: { on(ev: string, cb: (...a: unknown[]) => void): void };
  on(ev: string, cb: () => void): void;
  close(): void;
}

/** The minimal Session surface attachOAuthWatchers needs. */
export interface OAuthSesLike {
  cookies: { get(filter: { url: string; name: string }): Promise<{ value: string }[]> };
}

/**
 * Builds a plain desktop-Chrome User-Agent string containing NO `Electron/`
 * or app-name token (the Google-embedded-webview block trigger). The Chrome
 * version is always derived from the caller-supplied version (in practice
 * `process.versions.chrome`) so this can never silently drift from the real
 * bundled engine after an Electron upgrade.
 */
export function buildChromeUserAgent(chromeVersion: string): string {
  return (
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
  );
}

function containsBlockMarker(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  return BLOCK_MARKERS.some((marker) => url.includes(marker));
}

/**
 * Watches a (real or fake) OAuth window/session for one of three terminal
 * outcomes:
 *  - the platform's bridge sets the liv_session cookie -> { sessionValue }
 *  - a navigation/redirect URL carries Google's embedded-webview block
 *    marker -> { blocked: true }
 *  - the window is closed by the user before either of the above -> { cancelled: true }
 *
 * Guarded against double-settle with a `settled` flag — whichever watcher
 * fires first wins, and the rest become no-ops.
 */
export function attachOAuthWatchers(win: OAuthWinLike, ses: OAuthSesLike): Promise<OAuthResult> {
  return new Promise((resolve) => {
    let settled = false;

    const settle = (result: OAuthResult) => {
      if (settled) return;
      settled = true;
      logSafe('oauth.result', {
        result: 'sessionValue' in result ? 'captured' : 'blocked' in result ? 'blocked' : 'cancelled',
      });
      resolve(result);
    };

    const checkCookie = async () => {
      if (settled) return;
      const cookies = await ses.cookies.get({ url: COOKIE_URL, name: COOKIE_NAME });
      if (cookies.length > 0) {
        settle({ sessionValue: cookies[0].value });
        win.close();
      }
    };

    const checkForBlock = (...args: unknown[]) => {
      if (settled) return;
      // did-navigate / did-redirect-navigation both pass the URL as the
      // second callback argument (after the event object Electron's
      // ipcMain-style listeners normally omit here — the real signature is
      // (event, url, ...)). Scan every string arg defensively so this works
      // regardless of exact positional shape in tests/fakes.
      if (args.some((a) => containsBlockMarker(a))) {
        settle({ blocked: true });
      }
    };

    const onNavigate = (...args: unknown[]) => {
      checkForBlock(...args);
      void checkCookie();
    };

    win.webContents.on('did-navigate', onNavigate);
    win.webContents.on('did-redirect-navigation', onNavigate);

    win.on('closed', () => {
      settle({ cancelled: true });
    });
  });
}

/**
 * Opens the real embedded Google-OAuth window against livinity.io/login and
 * resolves once the session cookie is captured, the window is closed by the
 * user, or Google's embedded-webview block is detected.
 *
 * Deliberately registers no TLS-downgrade-bypass handler and adds no
 * request/header rewriting inside this window — this preserves the
 * platform's `Sec-Fetch-Site: same-origin` login-CSRF guard on the OAuth
 * bridge request (RESEARCH.md anti-patterns / Pattern 2).
 */
export async function signInWithGoogle(parent?: BrowserWindowType): Promise<OAuthResult> {
  const ses = session.fromPartition(OAUTH_PARTITION);

  const win = new BrowserWindow({
    width: 480,
    height: 720,
    resizable: false,
    frame: true,
    backgroundColor: '#ffffff',
    modal: !!parent,
    parent,
    title: 'Sign in with Google — Livinity',
    webPreferences: {
      session: ses,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // UI-SPEC locks the native title bar text to "Sign in with Google — Livinity"
  // (Screen 2 notes). Electron's default behavior overwrites the window title
  // with the loaded page's own <title> on every navigation — prevent that so
  // the app-chosen title sticks for the lifetime of this window.
  win.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  // Set the UA override BEFORE loadURL — Google's embedded-webview detection
  // inspects the UA on the very first navigation request.
  win.webContents.userAgent = buildChromeUserAgent(process.versions.chrome);

  const resultPromise = attachOAuthWatchers(win, ses);

  await win.loadURL(LOGIN_URL);

  return resultPromise;
}
