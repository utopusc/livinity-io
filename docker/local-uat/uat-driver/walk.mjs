// docker/local-uat/uat-driver/walk.mjs
// Phase 104 — UAT walk driver. This stub covers AC-104-13 + AC-104-14 only.
// Plan 104-07 extends this with full AC-104-{1,2,4,5,6,7,9,10,11,15} walk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

const CDP_URL = process.env.LIVOS_UAT_CDP_URL ?? 'http://localhost:9223';
const NOVNC_URL = process.env.LIVOS_UAT_NOVNC_URL ?? 'http://localhost:6080/vnc.html';
const READY_TIMEOUT_MS = 60_000;

async function waitForReady(url, label) {
    const start = Date.now();
    while (Date.now() - start < READY_TIMEOUT_MS) {
        try {
            const r = await fetch(url);
            if (r.ok) return r;
        } catch { /* container not up yet */ }
        await sleep(2000);
    }
    throw new Error(`${label} did not become ready within ${READY_TIMEOUT_MS}ms (url=${url})`);
}

test('AC-104-13: Chrome DevTools MCP can reach UAT container CDP on :9223', async () => {
    const r = await waitForReady(`${CDP_URL}/json/version`, 'CDP');
    const body = await r.json();
    assert.match(body.Browser, /^Chrome/, `CDP /json/version Browser=${body.Browser}`);
    assert.ok(body.webSocketDebuggerUrl, 'CDP must expose webSocketDebuggerUrl');
});

test('AC-104-14: noVNC HTML5 client reachable on :6080', async () => {
    const r = await waitForReady(NOVNC_URL, 'noVNC');
    assert.equal(r.status, 200);
    const text = await r.text();
    assert.match(text, /noVNC|<title>/i, 'noVNC index must render');
});
