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

// Pattern-based scrubber for untrusted free-text strings (e.g. renderer
// console messages) before they reach `logSafe`/disk. `logSafe`'s scalar-only
// signature stops callers from passing a raw secret VALUE, but it does
// nothing to scrutinize the CONTENT of a plain string parameter -- a renderer
// `console.error(token)` would otherwise pass straight through as an
// arbitrary `message: string`. This redacts any substring that LOOKS like a
// token/credential (a long run of base64/hex/opaque characters) and caps the
// overall length, rather than trusting the caller never to log one (WR-03).
const SECRET_LIKE_RUN = /[A-Za-z0-9+/_-]{24,}={0,2}/g;
const MAX_REDACTED_LENGTH = 500;

/**
 * Redacts secret-shaped substrings from untrusted free text and caps its
 * length. Use this on any renderer/dependency-supplied string (e.g.
 * `webContents.on('console-message', ...)`'s `details.message`) BEFORE
 * passing it to `logSafe` — never log that kind of string verbatim.
 */
export function redactSecretLike(text: string): string {
  const scrubbed = text.replace(SECRET_LIKE_RUN, '[redacted]');
  return scrubbed.length > MAX_REDACTED_LENGTH
    ? scrubbed.slice(0, MAX_REDACTED_LENGTH) + '…[truncated]'
    : scrubbed;
}

/**
 * Raw electron-log instance for non-secret-adjacent lifecycle logging (app
 * start/stop, window lifecycle, IPC channel names). Vault/state call sites MUST
 * use `logSafe` above instead of calling `log.info`/`log.debug` directly with
 * anything that could carry a secret value.
 */
export { log };
