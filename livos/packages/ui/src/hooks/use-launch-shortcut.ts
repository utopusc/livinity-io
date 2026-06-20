// Phase 290 — useLaunchShortcut.
//
// Wires the open-mode engine (modules/shortcuts/open-mode-engine.ts) to the
// live window manager + terminal-command-queue. Returns a per-shortcut click
// handler factory (mirrors useLaunchWebApp's shape).
//
//   const launch = useLaunchShortcut()
//   const onClick = launch(shortcut)   // () => void
//
// Terminal shortcuts open the Terminal window + run the command in a fresh tab.
// L6 — the Terminal kind is only useful when the v43 terminal panel flag is on;
// the dialog gates CREATION of terminal shortcuts on the flag, so by the time a
// terminal tile exists the consumer (the queue) is available. Launching still
// opens the Terminal window which renders the flag-aware shell.

import {systemAppsKeyed} from '@/providers/apps'
import {useWindowManagerOptional} from '@/providers/window-manager'
import {
	requestTerminalCommandInNewTab,
} from '@/features/v43-terminal/terminal-command-queue'
import {openShortcut, type OpenableShortcut} from '@/modules/shortcuts/open-mode-engine'

export function useLaunchShortcut(): (shortcut: OpenableShortcut) => () => void {
	const windowManager = useWindowManagerOptional()
	return (shortcut) => () => {
		openShortcut(shortcut, {
			openWindow: windowManager
				? (appId, route, title, icon) => windowManager.openWindow(appId, route, title, icon)
				: null,
			openTerminalWindow: () => {
				windowManager?.openWindow(
					'LIVINITY_terminal',
					'/terminal',
					'Terminal',
					systemAppsKeyed['LIVINITY_terminal'].icon,
				)
			},
			runInNewTerminalTab: (command: string, cwd?: string) =>
				requestTerminalCommandInNewTab(command, cwd),
		})
	}
}
