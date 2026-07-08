/**
 * src/main/log.ts
 *
 * Central electron-log wrapper. NEVER pass a secret value to any log function.
 * `logSafe` accepts an event name + scalar metadata only — log keys/names, never
 * secret values (RESEARCH.md Pitfall 3). Vault/state call sites MUST use
 * `logSafe`; the raw `log` export is for non-secret-adjacent lifecycle logging
 * only (app start/stop, window lifecycle, etc.).
 */

import { app } from 'electron';
import path from 'node:path';
import log from 'electron-log/main';

// File transport writes under userData; resolvePathFn is a lazy closure — it is
// only invoked when a log write actually occurs, so importing this module never
// eagerly requires a ready Electron `app` (safe to import in tests/tooling too).
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath('userData'), 'logs', 'main.log');

/**
 * The redaction-safe logging entry point. The signature ITSELF is the guard:
 * there is no parameter shape that accepts a raw secret value. Callers log
 * `logSafe('vault.set', { key })`, never `logSafe('vault.set', value)`.
 */
export function logSafe(
  event: string,
  meta: Record<string, string | number | boolean> = {}
): void {
  log.info(event, meta);
}

/**
 * Raw electron-log instance for non-secret-adjacent lifecycle logging (app
 * start/stop, window lifecycle, IPC channel names). Vault/state call sites MUST
 * use `logSafe` above instead of calling `log.info`/`log.debug` directly with
 * anything that could carry a secret value.
 */
export { log };
