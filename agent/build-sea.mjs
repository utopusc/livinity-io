#!/usr/bin/env node
/**
 * build-sea.mjs — Complete SEA (Single Executable Application) build pipeline
 *
 * Produces a standalone livinity-agent binary with all native dependencies:
 *   1. esbuild bundle → dist/agent.js
 *   2. SEA blob generation → dist/sea-prep.blob
 *   3. Copy Node.js binary → dist/livinity-agent[.exe]
 *   4. Remove code signature (Windows/macOS)
 *   5. Inject SEA blob via postject
 *   6. Copy native dependencies (systray2, node-screenshots)
 *   7. Copy setup-ui assets
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const binaryName = isWindows ? 'livinity-agent.exe' : 'livinity-agent';
const distDir = join(__dirname, 'dist');
const nodeModules = join(__dirname, 'node_modules');

const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function run(cmd, label) {
  console.log(`[build-sea] ${label}...`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error(`[build-sea] FAILED: ${label}`);
    process.exit(1);
  }
}

function copyDir(src, dest, label) {
  if (!existsSync(src)) {
    console.warn(`[build-sea] SKIP (not found): ${label} — ${src}`);
    return false;
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[build-sea] Copied: ${label}`);
  return true;
}

function copyFile(src, dest, label) {
  if (!existsSync(src)) {
    console.warn(`[build-sea] SKIP (not found): ${label} — ${src}`);
    return false;
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  console.log(`[build-sea] Copied: ${label}`);
  return true;
}

// ── Step 0: Clean dist ──────────────────────────────────────────────────
console.log('[build-sea] Cleaning dist/...');
if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}
mkdirSync(distDir, { recursive: true });

// ── Step 1: esbuild bundle ──────────────────────────────────────────────
run('node esbuild.config.mjs', 'esbuild bundle');

// ── Step 2: Generate SEA blob ───────────────────────────────────────────
run('node --experimental-sea-config sea-config.json', 'Generate SEA blob');

if (!existsSync(join(distDir, 'sea-prep.blob'))) {
  console.error('[build-sea] FAILED: sea-prep.blob not created');
  process.exit(1);
}

// ── Step 3: Copy Node.js binary ─────────────────────────────────────────
const destBinary = join(distDir, binaryName);
console.log(`[build-sea] Copying Node.js binary → ${binaryName}...`);
cpSync(process.execPath, destBinary);

// ── Step 4: Remove code signature ───────────────────────────────────────
if (isWindows) {
  // On Windows, use signtool or just skip — postject handles unsigned binaries
  // The --overwrite flag on postject handles this for us
  console.log('[build-sea] Windows: signature will be overwritten by postject');
} else if (isMac) {
  try {
    run(`codesign --remove-signature "${destBinary}"`, 'Remove macOS code signature');
  } catch {
    console.warn('[build-sea] codesign not available, continuing...');
  }
}

// ── Step 5: Inject SEA blob via postject ────────────────────────────────
const blobPath = join(distDir, 'sea-prep.blob');
const postjectCmd = [
  'npx postject@latest',
  `"${destBinary}"`,
  'NODE_SEA_BLOB',
  `"${blobPath}"`,
  `--sentinel-fuse ${FUSE}`,
  '--overwrite',
].join(' ');
run(postjectCmd, 'Inject SEA blob via postject');

// ── Step 6: Copy native dependencies ────────────────────────────────────
console.log('[build-sea] Copying native dependencies...');

// 6a. systray2 — bundled by esbuild, but traybin/ Go binary must be alongside the SEA binary.
// systray2 resolves its binary via: path.join(__dirname, 'traybin', binName)
// In SEA mode, __dirname = directory containing the .exe, so we need dist/traybin/
copyDir(
  join(nodeModules, 'systray2', 'traybin'),
  join(distDir, 'traybin'),
  'traybin/ (systray2 Go binaries)',
);
// Also keep the node_modules structure for non-SEA runs
const systrayDest = join(distDir, 'node_modules', 'systray2');
copyDir(
  join(nodeModules, 'systray2', 'traybin'),
  join(systrayDest, 'traybin'),
  'node_modules/systray2/traybin/',
);
copyFile(
  join(nodeModules, 'systray2', 'index.js'),
  join(systrayDest, 'index.js'),
  'systray2/index.js',
);
copyFile(
  join(nodeModules, 'systray2', 'package.json'),
  join(systrayDest, 'package.json'),
  'systray2/package.json',
);

// 6b. node-screenshots — needs index.js, package.json
const screenshotsDest = join(distDir, 'node_modules', 'node-screenshots');
copyFile(
  join(nodeModules, 'node-screenshots', 'index.js'),
  join(screenshotsDest, 'index.js'),
  'node-screenshots/index.js',
);
copyFile(
  join(nodeModules, 'node-screenshots', 'index.d.ts'),
  join(screenshotsDest, 'index.d.ts'),
  'node-screenshots/index.d.ts',
);
copyFile(
  join(nodeModules, 'node-screenshots', 'package.json'),
  join(screenshotsDest, 'package.json'),
  'node-screenshots/package.json',
);

// 6c. Platform-specific native .node file for node-screenshots
// On Windows: node-screenshots-win32-x64-msvc
// On macOS: node-screenshots-darwin-universal or node-screenshots-darwin-x64/arm64
// On Linux: node-screenshots-linux-x64-gnu (or musl variant)
const nativePkgs = [
  'node-screenshots-win32-x64-msvc',
  'node-screenshots-darwin-universal',
  'node-screenshots-darwin-x64',
  'node-screenshots-darwin-arm64',
  'node-screenshots-linux-x64-gnu',
  'node-screenshots-linux-x64-musl',
  'node-screenshots-linux-arm64-gnu',
  'node-screenshots-linux-arm64-musl',
];

let nativeCopied = false;
for (const pkg of nativePkgs) {
  const src = join(nodeModules, pkg);
  if (existsSync(src)) {
    copyDir(src, join(distDir, 'node_modules', pkg), pkg);
    nativeCopied = true;
  }
}

if (!nativeCopied) {
  console.warn('[build-sea] WARNING: No platform-specific node-screenshots native package found');
}

// ── Step 7: Copy setup-ui assets ────────────────────────────────────────
// Already copied by esbuild.config.mjs, but verify
if (existsSync(join(distDir, 'setup-ui', 'index.html'))) {
  console.log('[build-sea] setup-ui/ already present (copied by esbuild)');
} else {
  copyDir(
    join(__dirname, 'setup-ui', 'dist'),
    join(distDir, 'setup-ui'),
    'setup-ui/',
  );
}

// ── Done ────────────────────────────────────────────────────────────────
console.log('');
console.log(`[build-sea] SUCCESS: ${destBinary}`);
console.log('[build-sea] Contents:');
console.log(`  - ${binaryName} (standalone SEA binary)`);
console.log('  - node_modules/systray2/ (tray binary + JS)');
console.log('  - node_modules/node-screenshots/ (native addon)');
console.log('  - setup-ui/ (web setup wizard assets)');
