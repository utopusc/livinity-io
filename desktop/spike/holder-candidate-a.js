/**
 * spike/holder-candidate-a.js
 *
 * Candidate A: Node-documented detached+unref() holder strategy.
 *
 * IMPORTANT — how this script MUST be invoked for the test to be valid:
 * This script is spawned FROM the running Electron main process via Plan 03's
 * dev-only `dev:spawnHolderA` IPC handler (gated !app.isPackaged), so the
 * detached child it creates here lands INSIDE Electron's Job Object tree —
 * that is the exact condition under test (does a detached+unref() child of a
 * process that is itself a member of Electron's Job Object survive Electron's
 * Job Object being torn down?). Do NOT run this script from a standalone
 * terminal: doing so would put its child outside Electron's Job Object entirely
 * and invalidate Test A (it would trivially "survive" for the wrong reason).
 *
 * The placeholder holder is a pure-Windows long-running process
 * (`node -e "setInterval(()=>{},1000)"`) per RESEARCH.md Open Question 1 — a
 * WSL distro is NOT required for a decisive verdict, since the Windows Job
 * Object mechanism under test is process-generic, not specific to wsl.exe.
 * OPTIONAL BONUS (not required): if a WSL distro is available on the test
 * machine, a secondary confirmation run substituting
 * `wsl -d <distro> --exec sleep infinity` as the spawned command adds extra
 * confidence but is not required to reach a decisive verdict.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const child = spawn(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});

child.unref();

fs.writeFileSync(path.join(__dirname, 'candidate-a.pid'), String(child.pid));

console.log('candidate-a holder PID:', child.pid);
