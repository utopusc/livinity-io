#!/usr/bin/env node
/**
 * Liv AI Claw Gateway entrypoint — Phase 203-03.
 *
 * Boots the openclaw gateway (npm: openclaw@^2026.5.20) in foreground with the
 * @livos/liv-claw-os plugin pre-installed. The plugin loads IN-PROCESS via
 * openclaw's plugin loader (jiti/esbuild) — there is NO separate worker
 * process (D-203-04 AMENDED 2026-05-23 post Plan 203-01 spike).
 *
 * Environment contract (systemd unit `liv-claw-gateway.service` provides):
 *   PORT                 — gateway HTTP/WS bind port (default 18789)
 *   OPENCLAW_HOME        — gateway state root (writable dir)
 *   OPENCLAW_STATE_DIR   — same as OPENCLAW_HOME by convention
 *   ANTHROPIC_API_KEY    — primary LLM provider key (per Plan 203-01 spike
 *                          decision; gateway resolves lazily on first request)
 *   OPENCLAW_GATEWAY_AUTH — "none" in dev, "token" in production (Plan 203-05
 *                           wires the LIVINITY_SESSION → device-token bridge)
 *
 * The gateway is invoked via its npm bin (`node_modules/.bin/openclaw`) which
 * resolves to `node_modules/openclaw/bin/openclaw.mjs`. We exec the bin
 * directly with `--port` + `--bind loopback`. The plugin path is resolved via
 * `require.resolve('@livos/liv-claw-os/packages/claw-plugin/dist/index.js')`
 * — the build chain (run by update.sh + the dev `pnpm prepack` flow) MUST
 * produce that file before this script can boot.
 *
 * NOTE: this script intentionally `execFile`s the openclaw bin (rather than
 *       `require`-ing openclaw library entrypoints) because the npm package
 *       exports ONLY `plugin-sdk/*` subpaths publicly — the gateway runtime
 *       is consumed via its CLI surface. See AGENTS.md in @livos/liv-claw-os.
 */
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = String(process.env.PORT || process.env.OPENCLAW_PORT || 18789);
const BIND = process.env.OPENCLAW_BIND || 'loopback';
const AUTH = process.env.OPENCLAW_GATEWAY_AUTH || 'none';

// Resolve the openclaw CLI bin. openclaw's package.json has a restrictive
// `exports` block that does NOT expose `./package.json`, so the natural
// `require.resolve('openclaw/package.json')` path fails with
// ERR_PACKAGE_PATH_NOT_EXPORTED on Node 22+ (Mini PC observed 2026-05-23).
//
// Strategy (most → least preferred):
//   1) Walk a fixed set of candidate paths to `openclaw.mjs` directly.
//      Covers both pnpm-workspace symlinks AND npm-flat layouts AND the
//      pnpm-store deduplicated location at /opt/livos/node_modules/.pnpm/...
//   2) Fall back to the `.bin/openclaw` shim wrapper (always present after
//      `pnpm install`). The shim is a POSIX script — we exec it via /bin/sh
//      rather than via `node` directly.
function resolveOpenclawBin() {
    const candidates = [
        // Plan-canonical: pkg-local node_modules (npm flat / pnpm hoisted)
        path.resolve(__dirname, 'node_modules', 'openclaw', 'openclaw.mjs'),
        // Workspace-root hoisted node_modules (pnpm-workspace default)
        path.resolve(__dirname, '..', '..', 'node_modules', 'openclaw', 'openclaw.mjs'),
        // pnpm-store inner layout (resolved from the .bin shim NODE_PATH)
        path.resolve(
            __dirname,
            '..',
            '..',
            'node_modules',
            '.pnpm',
            'openclaw@2026.5.20',
            'node_modules',
            'openclaw',
            'openclaw.mjs',
        ),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    // Last resort — defer to the `.bin/openclaw` shim if present. The shim is
    // a POSIX script that bakes the correct NODE_PATH; we'll exec it directly.
    const shimCandidates = [
        path.resolve(__dirname, 'node_modules', '.bin', 'openclaw'),
        path.resolve(__dirname, '..', '..', 'node_modules', '.bin', 'openclaw'),
    ];
    for (const shim of shimCandidates) {
        if (fs.existsSync(shim)) return shim;
    }
    throw new Error(
        '[liv-claw-gateway] openclaw bin not found. Run `pnpm --filter @livos/liv-claw-gateway install` first. Looked at:\n  - ' +
            candidates.concat(shimCandidates).join('\n  - '),
    );
}

function resolvePluginBundle() {
    // The plugin is the @openuidev/openclaw-os-plugin package shipped INSIDE
    // @livos/liv-claw-os. Its build output is dist/index.js (esbuild bundle).
    // We resolve via the workspace path rather than the package name to avoid
    // any private/peer-dep resolution quirks.
    const candidates = [
        // Most likely location post `pnpm install` at workspace root.
        path.resolve(__dirname, '..', 'liv-claw-os', 'packages', 'claw-plugin', 'dist', 'index.js'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error(
        '[liv-claw-gateway] plugin bundle not found. Run `pnpm --filter @livos/liv-claw-os build` first. Looked at:\n  - ' +
            candidates.join('\n  - '),
    );
}

const openclawBin = resolveOpenclawBin();
const pluginBundle = resolvePluginBundle();

// Plan 203-01 spike said `--plugin <path>` flag would register an out-of-tree
// plugin at boot. openclaw 2026.5.20 CLI does NOT have that flag — confirmed
// via `openclaw gateway run --help` on Mini PC 2026-05-23. Available commands
// are `openclaw plugins install [--link] <path>` for permanent registration.
//
// Strategy: idempotently install (with --link, so we never copy bytes — the
// gateway re-reads /opt/livos/packages/liv-claw-os/.../dist/index.js on each
// boot) before the gateway starts. The install command is a no-op if the
// plugin is already linked; --force replaces a stale registration.
function ensurePluginInstalled() {
    const installArgs = openclawBin.endsWith('.mjs') || openclawBin.endsWith('.js')
        ? [openclawBin, 'plugins', 'install', '--link', '--force', pluginBundle]
        : ['plugins', 'install', '--link', '--force', pluginBundle];
    const installCmd = openclawBin.endsWith('.mjs') || openclawBin.endsWith('.js')
        ? process.execPath
        : openclawBin;
    console.log('[liv-claw-gateway] installing plugin: ' + pluginBundle);
    const result = spawnSync(installCmd, installArgs, {
        stdio: 'inherit',
        env: process.env,
    });
    if (result.status !== 0) {
        console.error(
            '[liv-claw-gateway] plugin install exited with code ' + result.status + '; continuing anyway',
        );
    }
}

ensurePluginInstalled();

// Build the openclaw gateway argv. Per `openclaw gateway run --help`:
//   --port <port>  Port for the gateway WebSocket
//   --bind <mode>  Bind mode (loopback|lan|tailnet|auto|custom)
//   --auth <mode>  Gateway auth mode (none|token|password|trusted-proxy)
const subArgs = [
    'gateway',
    'run',
    '--port',
    PORT,
    '--bind',
    BIND,
    '--auth',
    AUTH,
];

if (AUTH === 'none') {
    subArgs.push('--allow-unconfigured');
}

// Dispatch based on resolved bin shape:
//   *.mjs  → exec `node <mjs> <args>`  (preferred, lets node honour shebang)
//   <shim> → exec `<shim> <args>`      (POSIX shell that bakes NODE_PATH)
let cmd;
let cmdArgs;
if (openclawBin.endsWith('.mjs') || openclawBin.endsWith('.js')) {
    cmd = process.execPath;
    cmdArgs = [openclawBin, ...subArgs];
} else {
    cmd = openclawBin;
    cmdArgs = subArgs;
}

console.log('[liv-claw-gateway] booting openclaw');
console.log('[liv-claw-gateway]   bin:    ' + openclawBin);
console.log('[liv-claw-gateway]   plugin: ' + pluginBundle);
console.log('[liv-claw-gateway]   port:   ' + PORT + ' (bind=' + BIND + ' auth=' + AUTH + ')');

const child = spawn(cmd, cmdArgs, {
    stdio: 'inherit',
    env: process.env,
});

child.on('exit', (code, signal) => {
    if (signal) {
        console.error('[liv-claw-gateway] openclaw exited via signal ' + signal);
        process.exit(1);
    }
    process.exit(code == null ? 1 : code);
});

child.on('error', (err) => {
    console.error('[liv-claw-gateway] failed to spawn openclaw: ' + err.message);
    process.exit(1);
});

// Forward termination signals so systemd's stop sequence reaches openclaw.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(sig, () => {
        if (!child.killed) child.kill(sig);
    });
}
