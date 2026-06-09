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
    // @livos/liv-claw-os. openclaw `plugins install --link` expects a path
    // pointing at a directory containing `openclaw.plugin.json` (the plugin
    // manifest), NOT the compiled JS bundle.
    //
    // We pass the package ROOT (containing both `openclaw.plugin.json` and
    // `package.json` with `main: "./dist/index.js"`) so openclaw can resolve
    // the manifest AND the entry bundle via standard package conventions.
    //
    // Plan 203-13 inline fix (Plan 203-12 carry-over #1): earlier deploys
    // pointed at `dist/index.js` directly, which made openclaw bail with
    // "plugin manifest not found: openclaw.plugin.json" because the CLI walks
    // siblings of the given path, not parents. Fix is two-pronged:
    //   1) Build script now copies `openclaw.plugin.json` into `dist/` so
    //      sibling-walk also finds it (defence-in-depth);
    //   2) This resolver now points at the package root (containing both the
    //      manifest and `package.json`) — canonical openclaw plugin shape.
    const candidates = [
        path.resolve(__dirname, '..', 'liv-claw-os', 'packages', 'claw-plugin'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, 'openclaw.plugin.json'))) return candidate;
    }
    throw new Error(
        '[liv-claw-gateway] plugin package not found. Run `pnpm --filter @livos/liv-claw-os build` first. Looked at:\n  - ' +
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
    // HOT-FIX 2026-05-24 (Phase 203 § G.2 carry-over): openclaw 2026.5.20's
    // install-time security scanner hard-blocks the Liv AI plugin with
    //   "Plugin "openclaw-os-plugin" installation blocked: code safety scan
    //    failed (Error: manifest dependency scan found node_modules symlink
    //    target outside install root at node_modules/esbuild)"
    // The plugin dir contains pnpm-style devDependency symlinks
    //   claw-plugin/node_modules/esbuild → ../../../../../node_modules/.pnpm/...
    // (esbuild, openclaw, shx, typescript, vitest — all devDeps from the
    // build script). openclaw refuses to register any plugin whose
    // node_modules/* symlinks escape the install root.
    //
    // Fix: strip the plugin's node_modules dir before install — the plugin
    // is pre-built (dist/index.js); runtime needs no devDeps. Idempotent —
    // pnpm install regenerates them on the next workspace install if a
    // builder needs them.
    const pluginNodeModules = path.join(pluginBundle, 'node_modules');
    try {
        fs.rmSync(pluginNodeModules, { recursive: true, force: true });
        console.log('[liv-claw-gateway] stripped ' + pluginNodeModules);
    } catch (e) {
        console.warn(
            '[liv-claw-gateway] could not strip plugin node_modules: ' + e.message,
        );
    }

    // openclaw CLI on 2026.5.20: --force is INCOMPATIBLE with --link (linked
    // plugins point at source path directly; force-replace makes no sense).
    // Run with --link only — second-and-subsequent runs are no-ops if the
    // link already exists.
    const subArgs = ['plugins', 'install', '--link', pluginBundle];
    const useNode = openclawBin.endsWith('.mjs') || openclawBin.endsWith('.js');
    const installCmd = useNode ? process.execPath : openclawBin;
    const installArgs = useNode ? [openclawBin, ...subArgs] : subArgs;
    console.log('[liv-claw-gateway] installing plugin: ' + pluginBundle);
    // Use 'pipe' for stderr so we can inspect it on failure; mirror stdout
    // to parent's inherit channel via stdout: 'inherit' for normal progress.
    const result = spawnSync(installCmd, installArgs, {
        stdio: ['inherit', 'inherit', 'pipe'],
        env: process.env,
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        const stderr = (result.stderr || '').toString();
        // Mirror stderr so operator can see it in the journal.
        if (stderr.trim()) process.stderr.write(stderr);
        // Tolerate genuine already-installed case with a SPECIFIC marker
        // (don't blanket-misclassify scan failures as "already linked").
        if (stderr.includes('already installed') || stderr.includes('already linked')) {
            console.log('[liv-claw-gateway] plugin already installed, continuing');
        } else {
            console.error(
                '[liv-claw-gateway] plugin install FAILED exit=' + result.status,
            );
            console.error('[liv-claw-gateway] stderr (first 1KB): ' + stderr.slice(0, 1024));
            // Do NOT throw — let gateway boot anyway so /health stays up; the
            // gateway runs in degraded mode (only stock plugins) and the next
            // update.sh attempt can pick up a corrected build.
        }
    } else {
        console.log('[liv-claw-gateway] plugin install OK');
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

// First-boot bootstrap: openclaw requires either a setup-completed config
// OR --allow-unconfigured to start. We have no operator-run `openclaw setup`
// step in the deploy flow, so pass --allow-unconfigured unconditionally
// here — the gateway boots in a permissive mode and accepts LLM provider
// keys lazily via /opt/livos/.env (read by livinityd, not the gateway) on
// first tool call. Plan 220+ may add a one-shot `openclaw setup --headless`
// step inside update.sh to flip this to enforced mode.
subArgs.push('--allow-unconfigured');

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
