/**
 * Phase 256 (D-256-XFCE-HOST-DESKTOP) — real, usable XFCE desktop on the `:1`
 * host display.
 *
 * Background: the Displays popover shows the `:1` host display. Until now `:1`
 * ran a bare fluxbox + tint2 "branded shell" (Phase 255) — capturable but empty
 * and unsatisfying. The real GNOME `:0` Ubuntu desktop CANNOT be shown: it is a
 * pure-X11 GNOME session but mutter composites via GL, and on this headless /
 * software-GL box the composited framebuffer is NOT readable via XGetImage —
 * x11vnc / maim / ffmpeg-x11grab all capture it solid BLACK (verified 2026-06-02).
 * The only compositing-aware paths (PipeWire/portal screencast,
 * gnome-remote-desktop RDP) need an fd / interactive consent / RDP bridge that
 * don't fit the existing VNC popover pipeline.
 *
 * A NON-compositing real desktop, however, captures perfectly via the existing
 * x11vnc/maim path (proven with fluxbox `:1` and the master-Chrome Xvfb). So `:1`
 * now runs a real XFCE desktop with the xfwm4 compositor explicitly OFF:
 *   xfwm4 (compositor off) + xfsettingsd + xfce4-panel (menu/dock) +
 *   xfdesktop (wallpaper + desktop icons + right-click menu)
 * all under a private dbus session. This gives a genuinely usable Ubuntu desktop
 * (Applications menu, Thunar file manager, terminal, settings) that the popover
 * renders correctly at 1280x720. The LivOS wallpaper is preserved for branding.
 *
 * Modeled on webapps/fluxbox-wm.ts: injected spawnFn, env {...process.env,
 * DISPLAY} (subprocess-scoped — NEVER mutate the server-global process.env.
 * DISPLAY, which would leak the display into concurrent requests), and an
 * early-exit health check that throws on fast failure so the boot call site
 * (index.ts) can degrade to the legacy fluxbox + branded shell.
 *
 * The whole desktop is launched by a single generated launcher script run as
 * `bash <launcher>`; the script `exec`s `dbus-run-session` (a private bus) and
 * backgrounds the XFCE components, then `wait`s — so the spawned child stays
 * alive for the desktop's lifetime and stop() tears the bus + components down by
 * killing the whole detached process group.
 */
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'
import {writeFileSync, chmodSync} from 'node:fs'
import type {EventEmitter} from 'node:events'

/** Absolute deployed path of the LivOS wallpaper (shared with branded-shell.ts).
 * Ships via the wholesale livinityd `source/` rsync. NOT a UI URL — xfdesktop
 * inside Xvfb cannot read browser wallpapers. */
export const DEFAULT_WALLPAPER_PATH =
	'/opt/livos/packages/livinityd/source/modules/shell/assets/livos-wallpaper.png'

export interface StartXfceShellOpts {
	display?: string // default ':1'
	wallpaperPath?: string // default the deployed LivOS wallpaper abs path
	launcherPath?: string // default '/tmp/livos-xfce-shell.sh'
	healthCheckMs?: number // default 800 — early-exit window
	spawnFn?: typeof nodeSpawn
	writeFileFn?: (path: string, data: string) => void
	chmodFn?: (path: string, mode: number) => void
	logger?: {
		info?: (m: string) => void
		warn?: (m: string, e?: unknown) => void
		error?: (m: string, e?: unknown) => void
	}
}

export interface XfceShellHandle {
	pid: number
	display: string
	exited: Promise<{code: number | null; signal: NodeJS.Signals | null}>
	stop(): Promise<void>
}

/**
 * Build the XFCE launcher script. The xfwm4 compositor is explicitly OFF so the
 * desktop paints into the X11 framebuffer (capturable by x11vnc/maim, unlike a
 * GL-compositing session). The wallpaper absolute path is baked in literally so
 * there is no shell-quoting risk. After xfdesktop registers its monitor, the
 * LivOS wallpaper is applied across whatever `last-image` props it created.
 */
export function buildXfceLauncher(display: string, wallpaperPath: string): string {
	return `#!/bin/bash
# livinityd-managed XFCE host shell launcher (Phase 256). Compositor OFF so the
# non-compositing x11vnc/maim capture path renders it (NOT GNOME GL-composited).
export DISPLAY=${display}
export XDG_RUNTIME_DIR=/run/user/$(id -u)
exec dbus-run-session -- bash -c '
  xfwm4 --compositor=off &
  xfsettingsd &
  xfce4-panel &
  xfdesktop &
  sleep 2
  WP="${wallpaperPath}"
  if [ -f "$WP" ]; then
    xfconf-query -c xfce4-desktop -l 2>/dev/null | grep -E "last-image$" | while read -r p; do
      xfconf-query -c xfce4-desktop -p "$p" -s "$WP" 2>/dev/null
    done
    xfconf-query -c xfce4-desktop -l 2>/dev/null | grep -E "image-style$" | while read -r p; do
      xfconf-query -c xfce4-desktop -p "$p" -s 5 2>/dev/null
    done
    xfdesktop --reload 2>/dev/null
  fi
  wait
'
`
}

/**
 * Start the real XFCE desktop on `display` (default `:1`). Returns a handle once
 * the launcher survives the early-exit health check; throws on fast failure so
 * the caller can degrade to fluxbox + the branded shell. NEVER mutates the
 * server-global process.env.DISPLAY.
 */
export async function startXfceShell(opts: StartXfceShellOpts = {}): Promise<XfceShellHandle> {
	const display = opts.display ?? ':1'
	const wallpaperPath = opts.wallpaperPath ?? DEFAULT_WALLPAPER_PATH
	const launcherPath = opts.launcherPath ?? '/tmp/livos-xfce-shell.sh'
	const healthCheckMs = opts.healthCheckMs ?? 800
	const spawnFn = opts.spawnFn ?? nodeSpawn
	const writeFile =
		opts.writeFileFn ?? ((path: string, data: string) => writeFileSync(path, data, {encoding: 'utf8'}))
	const chmod = opts.chmodFn ?? ((path: string, mode: number) => chmodSync(path, mode))
	const logger = opts.logger

	// Write the launcher script (idempotent — overwrite each boot is fine).
	try {
		writeFile(launcherPath, buildXfceLauncher(display, wallpaperPath))
		try {
			chmod(launcherPath, 0o755)
		} catch {
			/* +x is best-effort; we spawn via `bash <path>` anyway */
		}
	} catch (err) {
		logger?.warn?.(`xfce-shell: failed to write launcher to ${launcherPath}`, err)
	}

	// Spawn `bash <launcher>` detached. DISPLAY is scoped to the subprocess env
	// ONLY (Pitfall 1 — never mutate the server-global process.env.DISPLAY, which
	// would leak the display into concurrent requests). `detached: true` puts the
	// child in its own session/process-group so stop() can kill the whole tree.
	const child = spawnFn('bash', [launcherPath], {
		detached: true,
		stdio: ['ignore', 'pipe', 'pipe'],
		env: {...process.env, DISPLAY: display},
	}) as ChildProcess

	const stderrChunks: string[] = []
	child.stderr?.on('data', (chunk: Buffer | string) => {
		const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
		stderrChunks.push(text)
		logger?.warn?.(`xfce-shell stderr: ${text.trim()}`)
	})

	const exited = new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolve) => {
		// Cast to EventEmitter: the monorepo's resolved ChildProcess type (duplicate
		// @types/node) does not surface the inherited .on/.once (same TS2339 the
		// existing webapps/fluxbox-wm + shell/branded-shell carry) — casting keeps
		// this module at ZERO net new tsc errors vs the package baseline.
		;(child as unknown as EventEmitter).on(
			'exit',
			(code: number | null, signal: NodeJS.Signals | null) => {
				logger?.warn?.(`xfce-shell pid=${child.pid} exited (code=${code} signal=${signal})`)
				resolve({code, signal})
			},
		)
	})

	// Early-exit health check: dbus-run-session + the XFCE components keep the
	// launcher alive (the inner `wait`), so a fast exit means a hard failure
	// (dbus-run-session/xfwm4 missing, :1 unreachable, no bus). Throw so the boot
	// call site degrades to the legacy fluxbox + branded shell instead of leaving
	// a "successful" handle pointing at a corpse.
	const earlyExit = await new Promise<{code: number | null; signal: NodeJS.Signals | null} | null>(
		(resolve) => {
			const timer = setTimeout(() => resolve(null), healthCheckMs)
			;(child as unknown as EventEmitter).once(
				'exit',
				(code: number | null, signal: NodeJS.Signals | null) => {
					clearTimeout(timer)
					resolve({code, signal})
				},
			)
		},
	)
	if (earlyExit !== null) {
		const reason = stderrChunks.join('').trim() || 'no stderr output'
		logger?.error?.(
			`xfce-shell FAILED within ${healthCheckMs}ms (code=${earlyExit.code} signal=${earlyExit.signal}). stderr: ${reason}`,
		)
		throw new Error(`xfce shell failed to start on ${display}: ${reason}`)
	}

	try {
		child.unref?.()
	} catch {
		/* noop */
	}

	const stop = async (): Promise<void> => {
		const pid = child.pid
		// Kill the whole detached process group so dbus-run-session AND the XFCE
		// components die, not just the launcher bash. Fall back to a direct kill.
		try {
			if (pid) process.kill(-pid, 'SIGTERM')
			else child.kill('SIGTERM')
		} catch {
			try {
				child.kill('SIGTERM')
			} catch {
				/* noop */
			}
		}
		const timer = setTimeout(() => {
			try {
				if (pid) process.kill(-pid, 'SIGKILL')
				else child.kill('SIGKILL')
			} catch {
				try {
					child.kill('SIGKILL')
				} catch {
					/* noop */
				}
			}
		}, 2000)
		await exited
		clearTimeout(timer)
	}

	const pid = child.pid ?? 0
	logger?.info?.(`xfce-shell spawned pid=${pid} display=${display} (compositor OFF)`)
	return {pid, display, exited, stop}
}
