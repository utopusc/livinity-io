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

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = String(process.env.PORT || process.env.OPENCLAW_PORT || 18789);
const BIND = process.env.OPENCLAW_BIND || 'loopback';
const AUTH = process.env.OPENCLAW_GATEWAY_AUTH || 'none';

// Resolve the openclaw CLI bin via node's module resolution so this works in
// both pnpm-workspace (symlinked node_modules) and npm-flat node_modules
// layouts.
function resolveOpenclawBin() {
    // openclaw's package.json exposes `bin: { openclaw: "./bin/openclaw.mjs" }`.
    // Use require.resolve on the package.json to find the package root, then
    // join the bin path.
    const pkgPath = require.resolve('openclaw/package.json');
    const pkgRoot = path.dirname(pkgPath);
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    let binRel;
    if (typeof pkgJson.bin === 'string') {
        binRel = pkgJson.bin;
    } else if (pkgJson.bin && typeof pkgJson.bin === 'object') {
        binRel = pkgJson.bin.openclaw || Object.values(pkgJson.bin)[0];
    } else {
        throw new Error('openclaw package.json has no `bin` field');
    }
    return path.join(pkgRoot, binRel);
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

// Build the openclaw gateway argv. Per 203-01 spike: `openclaw gateway run
// --port <PORT> --bind <BIND> --auth <AUTH>` is the canonical foreground
// invocation. `--plugin <path>` registers an out-of-tree plugin without
// requiring `openclaw plugins install` first (Plan 203-04 will do the
// permanent install).
const args = [
    openclawBin,
    'gateway',
    'run',
    '--port',
    PORT,
    '--bind',
    BIND,
    '--auth',
    AUTH,
    '--plugin',
    pluginBundle,
];

if (AUTH === 'none') {
    args.push('--allow-unconfigured');
}

console.log('[liv-claw-gateway] booting openclaw');
console.log('[liv-claw-gateway]   bin:    ' + openclawBin);
console.log('[liv-claw-gateway]   plugin: ' + pluginBundle);
console.log('[liv-claw-gateway]   port:   ' + PORT + ' (bind=' + BIND + ' auth=' + AUTH + ')');

const child = spawn(process.execPath, args, {
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
