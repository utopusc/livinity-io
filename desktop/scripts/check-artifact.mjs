#!/usr/bin/env node
/**
 * scripts/check-artifact.mjs
 *
 * D-16 build-artifact gate for the packaged Livinity Desktop app. Run AFTER
 * `electron-builder --win` (never before -- it inspects real build output).
 *
 * Asserts:
 *   (a) electron-updater is packed inside app.asar's node_modules (Pitfall 4
 *       -- a devDependency would silently vanish from the packaged app and
 *       only crash at runtime, never at build time)
 *   (b) app.asar's top-level entries are limited to the expected
 *       dist/ + node_modules/ + package.json -- no spike/, src/ (raw TS),
 *       tests/, .planning/, scripts/, build/ dev trees leaked in (defense
 *       in depth over the electron-builder.yml `files` prune)
 *   (c) no HIGH-SIGNAL secret literals anywhere in the unpacked text
 *       content -- the literal oracles `liv_k_` (Livinity API key prefix)
 *       and `eyJ` (JWT / CF connector-token JSON prefix) ONLY. Deliberately
 *       NOT the generic 24+ char "looks like a secret" run regex
 *       (SECRET_LIKE_RUN in src/main/log.ts) -- that regex false-positives
 *       constantly on ordinary minified-JS identifiers/hashes (W5) and is
 *       non-exported besides. These two fixed prefixes ARE the whole oracle
 *       here, by design.
 *   (d) the built .exe artifact filename has no spaces (Pitfall 6 -- GitHub
 *       silently rewrites spaces to dots in uploaded release-asset names,
 *       which breaks the generic-provider feed's exact filename match)
 *
 * Usage: node scripts/check-artifact.mjs <win-unpacked-dir>
 *   e.g.: node scripts/check-artifact.mjs release/win-unpacked
 *
 * Plain Node, no new dependency: `@electron/asar` is already present in
 * node_modules transitively (electron-builder's own asar packer) -- this
 * script only reads from node_modules, it never touches package.json.
 *
 * Exits 0 with "check-artifact: PASS" on success, non-zero with a listed
 * "check-artifact: FAIL" reason set on any failure.
 */

import asarPkg from '@electron/asar';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';

const { listPackage, extractAll } = asarPkg;

const ALLOWED_TOP_LEVEL = new Set(['dist', 'node_modules', 'package.json']);
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.icns', '.bmp',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.node', '.exe', '.dll', '.so', '.dylib', '.map',
]);
const SECRET_ORACLES = [
  { name: 'liv_k_ (Livinity API key prefix)', re: /liv_k_/ },
  { name: 'eyJ (JWT / CF connector-token JSON prefix)', re: /eyJ/ },
];

const failures = [];
const fail = (msg) => failures.push(msg);

function normalize(entryPath) {
  return entryPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

function walk(dir, onFile) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

function main() {
  const unpackedDirArg = process.argv[2] ?? 'release/win-unpacked';
  const unpackedDir = resolve(unpackedDirArg);
  const releaseDir = dirname(unpackedDir);

  try {
    statSync(unpackedDir);
  } catch {
    fail(`unpacked dir not found: ${unpackedDir} (did electron-builder --win run?)`);
    report(failures, { unpackedDir, releaseDir });
    process.exit(1);
  }

  const asarPath = join(unpackedDir, 'resources', 'app.asar');
  try {
    statSync(asarPath);
  } catch {
    fail(`app.asar not found: ${asarPath}`);
    report(failures, { unpackedDir, releaseDir });
    process.exit(1);
  }

  // --- (a) + (b): list entries once, check both ---
  const rawEntries = listPackage(asarPath, { isPack: false });
  const entries = rawEntries.map(normalize).filter((p) => p.length > 0);

  const hasElectronUpdater = entries.some(
    (p) => p === 'node_modules/electron-updater' || p.startsWith('node_modules/electron-updater/')
  );
  if (!hasElectronUpdater) {
    fail('electron-updater NOT found inside app.asar node_modules (Pitfall 4 -- must be in "dependencies", not "devDependencies")');
  }

  const topLevelSegments = new Set(entries.map((p) => p.split('/')[0]));
  const unexpectedTopLevel = [...topLevelSegments].filter((seg) => !ALLOWED_TOP_LEVEL.has(seg));
  if (unexpectedTopLevel.length > 0) {
    fail(`unexpected top-level entries in app.asar (dev-file leakage): ${unexpectedTopLevel.join(', ')}`);
  }

  // --- (c) high-signal secret literal scan over unpacked file contents ---
  const scratch = mkdtempSync(join(tmpdir(), 'livinity-check-artifact-'));
  try {
    extractAll(asarPath, scratch);
    walk(scratch, (filePath) => {
      if (BINARY_EXTENSIONS.has(extname(filePath).toLowerCase())) return;
      let text;
      try {
        text = readFileSync(filePath, 'utf8');
      } catch {
        return; // unreadable / not actually text despite extension -- skip
      }
      for (const oracle of SECRET_ORACLES) {
        if (oracle.re.test(text)) {
          fail(`possible secret literal (${oracle.name}) found in ${filePath.slice(scratch.length + 1).replace(/\\/g, '/')}`);
        }
      }
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  // --- (d) no spaces in the built .exe artifact filename ---
  let exeFiles = [];
  try {
    exeFiles = readdirSync(releaseDir).filter((f) => f.endsWith('.exe'));
  } catch {
    fail(`release dir not found: ${releaseDir}`);
  }
  if (exeFiles.length === 0) {
    fail(`no .exe artifact found in ${releaseDir}`);
  } else {
    for (const f of exeFiles) {
      if (/\s/.test(f)) {
        fail(`artifact filename contains a space: "${f}" (Pitfall 6 -- GitHub rewrites spaces to dots in uploaded assets, breaking the generic-feed URL match)`);
      }
    }
  }

  report(failures, { unpackedDir, releaseDir, asarPath, hasElectronUpdater, exeFiles });
  process.exit(failures.length > 0 ? 1 : 0);
}

function report(fails, ctx) {
  if (fails.length === 0) {
    console.log('check-artifact: PASS');
    console.log(`  unpacked dir: ${ctx.unpackedDir}`);
    console.log(`  asar: ${ctx.asarPath}`);
    console.log('  electron-updater present: yes');
    console.log('  dev-file leakage: none');
    console.log('  secret literals: none');
    console.log(`  exe artifact(s): ${(ctx.exeFiles ?? []).join(', ')}`);
  } else {
    console.error('check-artifact: FAIL');
    for (const f of fails) console.error(`  - ${f}`);
  }
}

main();
