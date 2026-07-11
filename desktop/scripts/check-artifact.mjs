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
 *   (c) no HIGH-SIGNAL secret literals in OUR shipped output (dist/ only,
 *       deliberately -- node_modules is third-party code we do not write,
 *       and scanning it is pure noise: e.g. zod's own test suite bundles a
 *       well-known PUBLIC example JWT fixture, which is not a secret. The
 *       actual risk this gate mitigates is OUR compiled/bundled code
 *       accidentally baking in a real credential). The oracles require a
 *       plausible token BODY after the prefix, not the bare prefix string
 *       -- our own source legitimately contains the literal 'liv_k_' for
 *       format validation (e.g. `key.startsWith('liv_k_')` in
 *       KeyChoice.tsx), which is not a leaked secret. Deliberately NOT the
 *       generic 24+ char "looks like a secret" run regex (SECRET_LIKE_RUN
 *       in src/main/log.ts) -- that regex false-positives constantly on
 *       ordinary minified-JS identifiers/hashes (W5) and is non-exported
 *       besides.
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
import { readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const { listPackage, extractFile } = asarPkg;

const ALLOWED_TOP_LEVEL = new Set(['dist', 'node_modules', 'package.json']);
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.icns', '.bmp',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.node', '.exe', '.dll', '.so', '.dylib', '.map',
]);
// Prefix + a plausible real token body (real liv_k_ keys are
// `liv_k_` + a 20-char nanoid; real JWTs are dot-separated base64url
// segments) -- NOT the bare prefix, which our own validation code
// legitimately contains as a string literal.
const SECRET_ORACLES = [
  { name: 'liv_k_ install-key value (prefix + real token body)', re: /liv_k_[A-Za-z0-9_-]{16,}/ },
  { name: 'eyJ JWT-shaped value (base64url header.payload)', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

const failures = [];
const fail = (msg) => failures.push(msg);

function normalize(entryPath) {
  return entryPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

// @electron/asar's extractFile/getNode expects a path with NO leading
// separator (it splits on path.sep starting from the archive root; a
// leading separator produces a spurious empty first segment that breaks
// the internal tree lookup). listPackage's own paths always have a
// leading separator (built via path.join('/', ...)), so every entry must
// be stripped before being fed back into extractFile.
function stripLeadingSep(entryPath) {
  return entryPath.replace(/^[\\/]+/, '');
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

  // --- (c) high-signal secret literal scan, scoped to OUR dist/ output ---
  const distEntries = rawEntries.filter((raw) => {
    const norm = normalize(raw);
    return norm === 'dist' || norm.startsWith('dist/');
  });
  for (const raw of distEntries) {
    const norm = normalize(raw);
    if (BINARY_EXTENSIONS.has(extname(norm).toLowerCase())) continue;
    let buf;
    try {
      buf = extractFile(asarPath, stripLeadingSep(raw));
    } catch {
      continue; // directory or symlink entry -- nothing to extract
    }
    let text;
    try {
      text = buf.toString('utf8');
    } catch {
      continue;
    }
    for (const oracle of SECRET_ORACLES) {
      if (oracle.re.test(text)) {
        fail(`possible secret literal (${oracle.name}) found in ${norm}`);
      }
    }
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
    console.log('  secret literals: none (dist/ scanned)');
    console.log(`  exe artifact(s): ${(ctx.exeFiles ?? []).join(', ')}`);
  } else {
    console.error('check-artifact: FAIL');
    for (const f of fails) console.error(`  - ${f}`);
  }
}

main();
