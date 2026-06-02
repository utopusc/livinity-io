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
 *   xfwm4 (compositor off) + xfsettingsd + xfce4-panel + xfdesktop
 * all under a private dbus session. This gives a genuinely usable Ubuntu desktop
 * that the popover renders correctly at 1280x720.
 *
 * The panel is configured as a single LivOS-dark bottom DOCK (whisker menu +
 * Chrome/Files/Terminal launchers + window list + systray + clock) and the LivOS
 * wallpaper is applied. Both come from perchannel xfconf XML written to
 * `~/.config/xfce4/xfconf/xfce-perchannel-xml/` BEFORE the components start — so
 * xfconfd loads them at first access (writing them after xfdesktop starts only
 * updates the file, it does NOT repaint the running desktop: that was the
 * wallpaper-stayed-default bug). The monitor name on this Xvfb is `screen`, so
 * the backdrop path is `…/monitorscreen/workspace0/last-image`.
 *
 * Modeled on webapps/fluxbox-wm.ts: injected spawnFn, env {...process.env,
 * DISPLAY} (subprocess-scoped — NEVER mutate the server-global process.env.
 * DISPLAY), and an early-exit health check that throws on fast failure so the
 * boot call site (index.ts) can degrade to the legacy fluxbox + branded shell.
 *
 * The desktop is launched by a generated launcher script run as `bash <launcher>`;
 * the script `exec`s `dbus-run-session` (a private bus) and backgrounds the XFCE
 * components, then `wait`s — so the spawned child stays alive for the desktop's
 * lifetime and stop() tears the bus + components down by killing the whole
 * detached process group.
 */
import {spawn as nodeSpawn, type ChildProcess} from 'node:child_process'
import {writeFileSync, mkdirSync, copyFileSync, chmodSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import type {EventEmitter} from 'node:events'

/** Absolute deployed path of the LivOS wallpaper (shared with branded-shell.ts).
 * Ships via the wholesale livinityd `source/` rsync. NOT a UI URL — xfdesktop
 * inside Xvfb cannot read browser wallpapers. */
export const DEFAULT_WALLPAPER_PATH =
	'/opt/livos/packages/livinityd/source/modules/shell/assets/livos-wallpaper.png'

/** Dock launchers — each references a system .desktop seeded into a per-launcher
 * dir. `id` is the xfce4-panel plugin id; `desktop` is the basename under
 * /usr/share/applications. */
const DOCK_LAUNCHERS: ReadonlyArray<{id: number; desktop: string}> = [
	{id: 2, desktop: 'google-chrome.desktop'},
	{id: 3, desktop: 'thunar.desktop'},
	{id: 4, desktop: 'xfce4-terminal.desktop'},
]

export interface StartXfceShellOpts {
	display?: string // default ':1'
	wallpaperPath?: string // default the deployed LivOS wallpaper abs path
	launcherPath?: string // default '/tmp/livos-xfce-shell.sh'
	homeDir?: string // default os.homedir() — where ~/.config/xfce4 lives
	healthCheckMs?: number // default 800 — early-exit window
	spawnFn?: typeof nodeSpawn
	writeFileFn?: (path: string, data: string) => void
	mkdirFn?: (path: string) => void
	copyFileFn?: (src: string, dest: string) => void
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

/** LivOS dark palette (tokens.css) for the dock background. */
const DOCK_BG_RGBA = {r: 0.0863, g: 0.0863, b: 0.102, a: 0.92} // #16161a @ 92%

/**
 * The xfce4-desktop perchannel xfconf XML — applies the LivOS wallpaper (zoomed)
 * on the Xvfb monitor named `screen`. Written BEFORE xfdesktop starts so it
 * paints the right backdrop from the first frame.
 */
export function buildDesktopXml(wallpaperPath: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-desktop" version="1.0">
  <property name="backdrop" type="empty">
    <property name="screen0" type="empty">
      <property name="monitorscreen" type="empty">
        <property name="workspace0" type="empty">
          <property name="color-style" type="int" value="0"/>
          <property name="image-style" type="int" value="5"/>
          <property name="last-image" type="string" value="${wallpaperPath}"/>
        </property>
      </property>
    </property>
  </property>
</channel>
`
}

/**
 * The xfce4-panel perchannel xfconf XML — one LivOS-dark bottom dock:
 * whisker menu · Chrome · Files · Terminal · (expanding gap) · window list ·
 * systray · clock · show-desktop. Written BEFORE xfce4-panel starts.
 */
export function buildPanelXml(): string {
	const launcherProps = DOCK_LAUNCHERS.map(
		(l) => `    <property name="plugin-${l.id}" type="string" value="launcher">
      <property name="items" type="array">
        <value type="string" value="${l.desktop}"/>
      </property>
    </property>`,
	).join('\n')
	const launcherIds = DOCK_LAUNCHERS.map((l) => `        <value type="int" value="${l.id}"/>`).join(
		'\n',
	)
	return `<?xml version="1.0" encoding="UTF-8"?>
<channel name="xfce4-panel" version="1.0">
  <property name="configver" type="int" value="2"/>
  <property name="dark-mode" type="bool" value="true"/>
  <property name="panels" type="array">
    <value type="int" value="1"/>
    <property name="panel-1" type="empty">
      <property name="position" type="string" value="p=10;x=640;y=720"/>
      <property name="length" type="uint" value="100"/>
      <property name="length-adjust" type="bool" value="true"/>
      <property name="position-locked" type="bool" value="true"/>
      <property name="autohide-behavior" type="uint" value="0"/>
      <property name="size" type="uint" value="44"/>
      <property name="icon-size" type="uint" value="28"/>
      <property name="nrows" type="uint" value="1"/>
      <property name="background-style" type="uint" value="1"/>
      <property name="background-rgba" type="array">
        <value type="double" value="${DOCK_BG_RGBA.r}"/>
        <value type="double" value="${DOCK_BG_RGBA.g}"/>
        <value type="double" value="${DOCK_BG_RGBA.b}"/>
        <value type="double" value="${DOCK_BG_RGBA.a}"/>
      </property>
      <property name="plugin-ids" type="array">
        <value type="int" value="1"/>
${launcherIds}
        <value type="int" value="5"/>
        <value type="int" value="6"/>
        <value type="int" value="7"/>
        <value type="int" value="8"/>
        <value type="int" value="9"/>
      </property>
    </property>
  </property>
  <property name="plugins" type="empty">
    <property name="plugin-1" type="string" value="whiskermenu">
      <property name="button-icon" type="string" value="applications-system"/>
      <property name="show-button-title" type="bool" value="false"/>
    </property>
${launcherProps}
    <property name="plugin-5" type="string" value="separator">
      <property name="expand" type="bool" value="true"/>
      <property name="style" type="uint" value="0"/>
    </property>
    <property name="plugin-6" type="string" value="tasklist">
      <property name="grouping" type="uint" value="1"/>
      <property name="show-labels" type="bool" value="false"/>
    </property>
    <property name="plugin-7" type="string" value="systray">
      <property name="square-icons" type="bool" value="true"/>
    </property>
    <property name="plugin-8" type="string" value="clock">
      <property name="mode" type="uint" value="2"/>
      <property name="digital-time-format" type="string" value="%H:%M"/>
    </property>
    <property name="plugin-9" type="string" value="showdesktop"/>
  </property>
</channel>
`
}

/** The launcher script: a private dbus session + the XFCE components, compositor
 * OFF, then `wait`. Config (panel dock + wallpaper) is pre-written to xfconf by
 * writeXfceConfig() before this runs, so nothing here touches xfconf. */
export function buildXfceLauncher(display: string): string {
	return `#!/bin/bash
# livinityd-managed XFCE host shell launcher (Phase 256). Compositor OFF so the
# non-compositing x11vnc/maim capture path renders it (NOT GNOME GL-composited).
export DISPLAY=${display}
export XDG_RUNTIME_DIR=/run/user/$(id -u)
exec dbus-run-session -- bash -c '
  xfsettingsd &
  xfwm4 --compositor=off &
  xfce4-panel &
  xfdesktop &
  wait
'
`
}

/**
 * Pre-write the dock + wallpaper perchannel xfconf XML and seed the dock launcher
 * .desktop files, all UNDER homeDir/.config/xfce4. Must run BEFORE the components
 * start so xfconfd loads the config on first access. Best-effort + never throws.
 */
export function writeXfceConfig(
	homeDir: string,
	wallpaperPath: string,
	fns: {
		writeFile: (path: string, data: string) => void
		mkdir: (path: string) => void
		copyFile: (src: string, dest: string) => void
	},
	logger?: StartXfceShellOpts['logger'],
): void {
	const xfconfDir = join(homeDir, '.config', 'xfce4', 'xfconf', 'xfce-perchannel-xml')
	try {
		fns.mkdir(xfconfDir)
		fns.writeFile(join(xfconfDir, 'xfce4-panel.xml'), buildPanelXml())
		fns.writeFile(join(xfconfDir, 'xfce4-desktop.xml'), buildDesktopXml(wallpaperPath))
	} catch (err) {
		logger?.warn?.('xfce-shell: failed to write perchannel xfconf (dock/wallpaper)', err)
	}
	// Seed dock launcher .desktop files from the system applications dir.
	for (const l of DOCK_LAUNCHERS) {
		const dir = join(homeDir, '.config', 'xfce4', 'panel', `launcher-${l.id}`)
		try {
			fns.mkdir(dir)
			fns.copyFile(join('/usr/share/applications', l.desktop), join(dir, l.desktop))
		} catch (err) {
			logger?.warn?.(`xfce-shell: failed to seed launcher ${l.desktop} (dock icon may be empty)`, err)
		}
	}
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
	const homeDir = opts.homeDir ?? homedir()
	const healthCheckMs = opts.healthCheckMs ?? 800
	const spawnFn = opts.spawnFn ?? nodeSpawn
	const writeFile =
		opts.writeFileFn ?? ((path: string, data: string) => writeFileSync(path, data, {encoding: 'utf8'}))
	const mkdir = opts.mkdirFn ?? ((path: string) => mkdirSync(path, {recursive: true}))
	const copyFile = opts.copyFileFn ?? ((src: string, dest: string) => copyFileSync(src, dest))
	const chmod = opts.chmodFn ?? ((path: string, mode: number) => chmodSync(path, mode))
	const logger = opts.logger

	// 1. Pre-write the dock + wallpaper xfconf and seed launchers (before any
	// component starts, so xfconfd loads them at first access).
	writeXfceConfig(homeDir, wallpaperPath, {writeFile, mkdir, copyFile}, logger)

	// 2. Write the launcher script (idempotent — overwrite each boot is fine).
	try {
		writeFile(launcherPath, buildXfceLauncher(display))
		try {
			chmod(launcherPath, 0o755)
		} catch {
			/* +x is best-effort; we spawn via `bash <path>` anyway */
		}
	} catch (err) {
		logger?.warn?.(`xfce-shell: failed to write launcher to ${launcherPath}`, err)
	}

	// 3. Spawn `bash <launcher>` detached. DISPLAY is scoped to the subprocess env
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
	logger?.info?.(`xfce-shell spawned pid=${pid} display=${display} (compositor OFF, LivOS dock)`)
	return {pid, display, exited, stop}
}
