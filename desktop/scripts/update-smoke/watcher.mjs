#!/usr/bin/env node
/**
 * scripts/update-smoke/watcher.mjs
 *
 * Step 6 of the D-07 Test-B harness (RESEARCH Q8) -- the Phase-1
 * spike/watcher.js pattern generalized from the spike's plain pidfile
 * (`candidate-a.pid`) to the REAL production holder record shape:
 * `%APPDATA%\livinity-desktop\holder.json` (`{pid, spawnedAt}`,
 * src/main/supervision/holder.ts). This is what makes the harness a
 * re-verification of the ACTUAL shipped holder, not a simulated stand-in.
 *
 * PATH CORRECTION (07-11 execution-time finding, empirically verified):
 * `app.getPath('userData')` resolves from package.json's `"name"` field
 * ("livinity-desktop") -- there is no `productName` field in package.json
 * (only in electron-builder.yml, which Electron's own userData resolution
 * never reads) and no `app.setName()` call anywhere in src/main/. This is
 * NOT `%APPDATA%\Livinity Desktop\` (RESEARCH Q8's assumed literal) --
 * confirmed live by extracting the packaged app.asar's package.json (no
 * productName key) AND by observing holder.json/state.json/vault.bin/
 * lockfile all present under the lowercase path on this machine. It also
 * means dev and packaged/installed builds share the SAME userData dir
 * (Pitfall 9's "shared userData" concern is literal, not just close-enough).
 *
 * Run this MANUALLY from a separate terminal -- it must NOT be a child of
 * the Electron app, or it would share the Job Object under test and the
 * observation would be invalid (same independence requirement as
 * spike/watcher.js's own header comment).
 *
 * A missing or unparsable holder.json degrades to "cannot confirm alive"
 * (logged, never thrown) -- the same degrade-to-dead discipline
 * spike/watcher.js uses for a `tasklist` failure, generalized to cover a
 * holder.json read/parse failure too.
 *
 * Usage:
 *   node scripts/update-smoke/watcher.mjs                  # start polling loop
 *   node scripts/update-smoke/watcher.mjs --mark "TEST_B_QUITANDINSTALL_FIRED"
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LOG_PATH = path.join(import.meta.dirname, 'watcher-log.jsonl');
const POLL_INTERVAL_MS = 2000;

function holderFilePath() {
  // Mirrors app.getPath('userData') -- resolves from package.json's "name"
  // field ("livinity-desktop"), empirically confirmed (see module docstring)
  // -- NOT the electron-builder productName. APPDATA is always set on
  // Windows; the os.homedir() fallback only matters for a --check syntax
  // run on a non-Windows machine.
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'livinity-desktop', 'holder.json');
}

function appendLog(entry) {
  fs.appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

/** Reads+parses holder.json. Returns null on ANY IO/JSON/shape failure --
 * mirrors holder.ts's own readHolderRecord degrade-to-null discipline. */
function readHolderPid() {
  try {
    const raw = fs.readFileSync(holderFilePath(), 'utf8');
    const record = JSON.parse(raw);
    const pid = Number(record.pid);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isAlive(pid) {
  try {
    const out = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8' });
    // "INFO: No tasks are running which match the specified criteria." when dead.
    if (/No tasks/i.test(out)) return false;
    return out.trim().length > 0;
  } catch {
    // tasklist itself failing is treated as "cannot confirm alive" -> dead.
    return false;
  }
}

function handleMarkArg(argv) {
  const markIndex = argv.indexOf('--mark');
  if (markIndex === -1) return false;
  const label = argv[markIndex + 1] || 'UNLABELED_MARK';
  appendLog({ pid: null, alive: null, note: `MARK:${label}` });
  console.log(`Marker appended: ${label}`);
  return true;
}

function pollOnce() {
  const pid = readHolderPid();
  if (pid === null) {
    appendLog({ pid: null, alive: false, note: 'holder.json missing or unparsable' });
    console.log(`[${new Date().toISOString()}] holder: UNKNOWN (holder.json missing or unparsable)`);
    return;
  }
  const alive = isAlive(pid);
  appendLog({ pid, alive, note: '' });
  console.log(`[${new Date().toISOString()}] holder (pid ${pid}): ${alive ? 'ALIVE' : 'DEAD'}`);
}

function main() {
  const argv = process.argv.slice(2);
  if (handleMarkArg(argv)) return;

  console.log(`Watching the real holder PID from ${holderFilePath()}.`);
  console.log(`Logging to ${LOG_PATH}. Poll interval: ${POLL_INTERVAL_MS}ms. Ctrl+C to stop.`);
  pollOnce();
  setInterval(pollOnce, POLL_INTERVAL_MS);
}

main();
