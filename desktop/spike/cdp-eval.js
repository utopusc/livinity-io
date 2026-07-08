/**
 * spike/cdp-eval.js
 *
 * Evaluates a JS expression in the running app's renderer (main world) via
 * the Chrome DevTools Protocol — the reproducible, no-GUI way to invoke the
 * contextBridge-exposed spike triggers (window.api.devSpawnHolderA() /
 * window.api.devUpdateSim()) when the app was launched with
 * `--remote-debugging-port=9222`.
 *
 * Why this exists: the BrowserWindow runs sandbox:true + contextIsolation,
 * so the DevTools console has NO `require` — raw
 * `require('electron').ipcRenderer.invoke(...)` is impossible. The only
 * renderer-reachable path to the dev spike handlers is the contextBridge
 * `window.api` surface, which CDP's Runtime.evaluate can call in the page's
 * main world exactly like a human typing in the console.
 *
 * Usage:
 *   node spike/cdp-eval.js "window.api.devSpawnHolderA()"
 *   node spike/cdp-eval.js "window.api.devUpdateSim()"
 *
 * Requires Node >= 22 (built-in global WebSocket; this machine runs v24).
 * If the expression terminates the app (devUpdateSim), the socket closing
 * before a reply is EXPECTED and reported as such (exit 0).
 */

const DEBUG_HOST = '127.0.0.1';
const DEBUG_PORT = 9222;
const EVAL_TIMEOUT_MS = 10000;

async function main() {
  const expression = process.argv[2];
  if (!expression) {
    console.error('Usage: node spike/cdp-eval.js "<expression>"');
    process.exit(1);
  }

  const listRes = await fetch(`http://${DEBUG_HOST}:${DEBUG_PORT}/json`);
  const targets = await listRes.json();
  const page = targets.find((t) => t.type === 'page');
  if (!page) {
    console.error('No page target found at the debug port. Targets:', JSON.stringify(targets, null, 2));
    process.exit(1);
  }

  console.log(`Target: ${page.title || '(untitled)'} — ${page.url}`);

  const ws = new WebSocket(page.webSocketDebuggerUrl);

  const done = new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ kind: 'timeout' });
    }, EVAL_TIMEOUT_MS);

    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        })
      );
    });

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === 1) {
        clearTimeout(timer);
        resolve({ kind: 'result', msg });
      }
    });

    ws.addEventListener('close', () => {
      clearTimeout(timer);
      resolve({ kind: 'closed' });
    });

    ws.addEventListener('error', () => {
      clearTimeout(timer);
      resolve({ kind: 'error' });
    });
  });

  const outcome = await done;
  try { ws.close(); } catch { /* already closed */ }

  if (outcome.kind === 'result') {
    const { result, exceptionDetails } = outcome.msg.result ?? {};
    if (exceptionDetails) {
      console.error('Evaluation threw:', JSON.stringify(exceptionDetails, null, 2));
      process.exit(1);
    }
    console.log('Result:', JSON.stringify(result?.value ?? result, null, 2));
  } else if (outcome.kind === 'closed' || outcome.kind === 'error') {
    console.log('Socket closed before a reply — EXPECTED if the expression terminates the app (e.g. devUpdateSim).');
  } else {
    console.log('No reply within timeout — the app may have exited (expected for devUpdateSim) or is unresponsive.');
  }
}

main().catch((e) => {
  console.error('cdp-eval failed:', e.message);
  process.exit(1);
});
