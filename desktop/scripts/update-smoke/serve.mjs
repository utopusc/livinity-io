#!/usr/bin/env node
/**
 * scripts/update-smoke/serve.mjs
 *
 * Step 4 of the D-07 Test-B harness (RESEARCH Q8). A plain `node:http`
 * static file server over the version-B build directory (`.smoke/B/` by
 * default), bound to 127.0.0.1 only (never 0.0.0.0 -- this feed must not be
 * reachable off-machine). This IS the "generic provider override seam" the
 * installed app's `resources/app-update.yml` is pointed at (README step 3)
 * -- plain YAML in the install dir, per-user-writable, NOT a code change and
 * NOT `forceDevUpdateConfig` (dev-only).
 *
 * GET-only is sufficient: the harness's `.smoke/B/` directory never contains
 * an N-1 blockmap (only B's own artifacts), so electron-updater's
 * differential path has nothing to diff against and always falls back to a
 * full download (RESEARCH Pitfall 1 -- expected, logged, non-fatal noise).
 * `useMultipleRangeRequest` (Range support) is therefore not needed by this
 * harness; a real GitHub-fed release with an N-1 blockmap present WOULD use
 * Range, but that is exercised by the object store, not this local server.
 *
 * Usage: node scripts/update-smoke/serve.mjs [dir] [port]
 *   dir  default: scripts/update-smoke/.smoke/B
 *   port default: 8817 (RESEARCH Q8's pinned literal)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const DIR = path.resolve(argv[0] ?? path.join(import.meta.dirname, '.smoke', 'B'));
const PORT = Number(argv[1] ?? 8817);
const HOST = '127.0.0.1';

const CONTENT_TYPES = {
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.exe': 'application/octet-stream',
  '.blockmap': 'application/octet-stream',
};

function contentTypeFor(filePath) {
  for (const [ext, type] of Object.entries(CONTENT_TYPES)) {
    if (filePath.endsWith(ext)) return type;
  }
  return 'application/octet-stream';
}

function main() {
  if (!fs.existsSync(DIR)) {
    console.error(`serve: directory not found: ${DIR}`);
    console.error('  (run build-versions.mjs first, or pass an explicit dir argument)');
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405);
      res.end();
      return;
    }
    // The generic provider only ever requests <url>/latest.yml or a bare
    // filename it read out of latest.yml (Q4) -- no subdirectories, no
    // query-string routing needed. Strip any leading slash and reject
    // anything that would escape DIR (defense in depth; this server is
    // 127.0.0.1-only but costs nothing to harden).
    const requested = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
    const filePath = path.join(DIR, requested);
    if (!filePath.startsWith(DIR)) {
      res.writeHead(400);
      res.end();
      return;
    }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': contentTypeFor(filePath),
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`serve: http://${HOST}:${PORT}/ -> ${DIR}`);
    console.log('  Ctrl+C to stop.');
  });
}

main();
