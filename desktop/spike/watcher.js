/**
 * spike/watcher.js
 *
 * Independent observer for the holder-process survival spike.
 *
 * Run this MANUALLY from a separate terminal — it must NOT be a child of the
 * Electron app, or it would share the Job Object under test and the
 * observation would be invalid (RESEARCH.md Spike Design step 3).
 *
 * Usage:
 *   node spike/watcher.js                       # start polling loop
 *   node spike/watcher.js --mark "TEST_A_TASKKILL_FIRED"   # append an annotation, then exit
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SPIKE_DIR = __dirname;
const LOG_PATH = path.join(SPIKE_DIR, 'spike-log.jsonl');
const POLL_INTERVAL_MS = 2000;

function appendLog(entry) {
  fs.appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

function readPidFile(name) {
  const p = path.join(SPIKE_DIR, name);
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, 'utf8').trim();
  const pid = Number(raw);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
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
  appendLog({ candidate: null, pid: null, alive: null, note: `MARK:${label}` });
  console.log(`Marker appended: ${label}`);
  return true;
}

function pollOnce() {
  const candidates = [
    { name: 'a', pid: readPidFile('candidate-a.pid') },
    { name: 'c', pid: readPidFile('candidate-c.pid') },
  ];

  for (const { name, pid } of candidates) {
    if (pid === null) continue; // skip a candidate whose pid file is absent
    const alive = isAlive(pid);
    appendLog({ candidate: name, pid, alive, note: '' });
    console.log(`[${new Date().toISOString()}] candidate-${name} (pid ${pid}): ${alive ? 'ALIVE' : 'DEAD'}`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (handleMarkArg(argv)) return;

  console.log(`Watching candidates. Logging to ${LOG_PATH}. Poll interval: ${POLL_INTERVAL_MS}ms. Ctrl+C to stop.`);
  pollOnce();
  setInterval(pollOnce, POLL_INTERVAL_MS);
}

main();
