/**
 * scripts/oauth-smoke.cjs
 *
 * Standalone Electron harness for the Phase 2 / Plan 02-02 early smoke test
 * (RESEARCH.md Assumption A1 / Open Question 1): opens the real embedded
 * Google-OAuth window against the real livinity.io/login page, in isolation
 * — no full app, no IPC, no renderer.
 *
 * IMPORTANT: run `npm run build` first — this harness requires the
 * compiled `dist/main/src/main/platform/oauth-window.js` (tsc output of
 * src/main/platform/oauth-window.ts), not the TypeScript source.
 *
 * Usage: npm run smoke:oauth
 *
 * Never prints the captured cookie value — only the scalar verdict
 * (CAPTURED / CANCELLED / BLOCKED), matching oauth-window.ts's own
 * logSafe('oauth.result', { result }) discipline.
 */

const { app } = require('electron');

app.whenReady().then(async () => {
  const { signInWithGoogle } = require('../dist/main/src/main/platform/oauth-window.js');
  const r = await signInWithGoogle();
  const verdict = 'sessionValue' in r ? 'CAPTURED' : 'cancelled' in r ? 'CANCELLED' : 'BLOCKED';
  // Never print the cookie value — only the verdict.
  console.log('OAUTH_SMOKE_RESULT', verdict);
  app.exit(0);
});
