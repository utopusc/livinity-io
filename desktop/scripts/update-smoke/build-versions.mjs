#!/usr/bin/env node
/**
 * scripts/update-smoke/build-versions.mjs
 *
 * Step 1 of the D-07 Test-B harness (RESEARCH Q8). Builds TWO real
 * `electron-builder --win` artifacts of the SAME source tree at two
 * different plain-semver package.json versions (no prerelease tags --
 * allowDowngrade=false comparisons stay trivial), and stashes each
 * `release/` output into its own directory:
 *
 *   .smoke/A/  <- version 0.0.1 (install this one, per-user, /S)
 *   .smoke/B/  <- version 0.0.2 (serve this one over the 127.0.0.1 feed)
 *
 * Uses the SAME `npm run package` (build + electron-builder --win) path
 * 07-08 already proved gate-clean, rather than a bespoke build invocation --
 * the harness never invents a second packaging code path. `package.json`'s
 * `version` field is restored to its original value in a `finally`, even if
 * a build fails partway through, so a harness run never leaves the repo's
 * real version bumped.
 *
 * Zero WSL writes, zero installs, zero elevation -- this script ONLY builds
 * artifacts on disk (electron-builder's own local `release/` output
 * directory), exactly the same "build artifact = allowed" envelope 07-08's
 * Task 2 already exercised.
 *
 * Usage: node scripts/update-smoke/build-versions.mjs
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..'); // desktop/
const PKG_PATH = path.join(ROOT, 'package.json');
const RELEASE_DIR = path.join(ROOT, 'release');
const OUT_DIR = path.join(import.meta.dirname, '.smoke');

const VERSION_A = '0.0.1';
const VERSION_B = '0.0.2';

function readPkgVersion() {
  return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).version;
}

/** String-replace-only edit (never a full JSON.stringify rewrite) so
 * package.json's existing formatting/key order is byte-identical apart from
 * the version value itself. */
function writeVersion(version) {
  const raw = fs.readFileSync(PKG_PATH, 'utf8');
  const next = raw.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`);
  fs.writeFileSync(PKG_PATH, next);
}

function runPackage() {
  console.log('  running: npm run package');
  execFileSync('npm', ['run', 'package'], { cwd: ROOT, stdio: 'inherit', shell: true });
}

/** Copies only the top-level release/ FILES (the exe, .blockmap, latest.yml)
 * into .smoke/<label>/ -- never the win-unpacked/ subdirectory, which is not
 * needed by any later harness step and would needlessly duplicate ~100MB+. */
function stashRelease(label) {
  const dest = path.join(OUT_DIR, label);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(RELEASE_DIR);
  let copied = 0;
  for (const name of entries) {
    const src = path.join(RELEASE_DIR, name);
    if (fs.statSync(src).isDirectory()) continue;
    fs.copyFileSync(src, path.join(dest, name));
    copied += 1;
  }
  console.log(`  stashed ${copied} file(s) from release/ -> ${dest}`);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const originalVersion = readPkgVersion();
  console.log(`build-versions: original package.json version = ${originalVersion}`);

  try {
    console.log(`\n[A] building version ${VERSION_A}`);
    writeVersion(VERSION_A);
    runPackage();
    stashRelease('A');

    console.log(`\n[B] building version ${VERSION_B}`);
    writeVersion(VERSION_B);
    runPackage();
    stashRelease('B');
  } finally {
    writeVersion(originalVersion);
    console.log(`\nbuild-versions: restored package.json version -> ${originalVersion}`);
  }

  console.log('\nbuild-versions: DONE');
  console.log(`  A/ (install this, per-user /S): ${path.join(OUT_DIR, 'A')}`);
  console.log(`  B/ (serve this over 127.0.0.1): ${path.join(OUT_DIR, 'B')}`);
}

main();
