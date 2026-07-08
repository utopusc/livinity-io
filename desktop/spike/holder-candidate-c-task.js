/**
 * spike/holder-candidate-c-task.js
 *
 * The Scheduled Task action for Candidate C (see holder-candidate-c-register.ps1).
 * A self-PID-writing placeholder: identical long-running behavior to Candidate
 * A's placeholder (setInterval keep-alive), but launched BY THE TASK SCHEDULER
 * SERVICE — structurally outside Electron's Job Object from the moment of
 * creation (RESEARCH.md Assumption A1; must be OBSERVED via watcher.js, not
 * assumed).
 *
 * This is a separate file (rather than an inline `node -e "..."` in the
 * schtasks /TR argument) because schtasks /TR mangles nested quotes and caps
 * the command line at 261 chars — an inline script with escaped paths is
 * unreliable to register.
 */

const fs = require('node:fs');
const path = require('node:path');

fs.writeFileSync(path.join(__dirname, 'candidate-c.pid'), String(process.pid));

setInterval(() => {}, 1000);
