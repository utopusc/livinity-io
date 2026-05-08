// Phase 95-08 carry-fix (2026-05-08) — useLaunchWebApp wires WebApp click
// → window manager spawn flow that mounts WebAppStreamWindow.
//
// Usage from a desktop icon:
//
//   const launch = useLaunchWebApp()
//   const onClick = launch({id, url, title, iconUrl})
//
// Window-manager appId is `WEBAPP_<webappId>`. WindowContent registry routes
// that prefix to the lazy WebAppStreamWindow component (P95-02). The actual
// stream spawn (Chrome --new-window + x11vnc + websockify) happens server-
// side via tRPC `webapp.window.spawn` triggered by useWebAppVNC inside the
// stream window component.
//
// Falls back to a console.warn if no WindowManagerProvider is mounted (e.g.
// /login screen) — same defensive pattern as apple-spotlight.

import {useWindowManagerOptional} from '@/providers/window-manager'

export interface LaunchWebAppArgs {
	id: string
	url: string
	title: string
	iconUrl: string
}

export function useLaunchWebApp(): (args: LaunchWebAppArgs) => () => void {
	const windowManager = useWindowManagerOptional()
	return ({id, url, title, iconUrl}) => () => {
		const appId = `WEBAPP_${id}`
		if (windowManager) {
			windowManager.openWindow(appId, url, title, iconUrl)
		} else {
			// eslint-disable-next-line no-console
			console.warn(
				`[useLaunchWebApp] WindowManager unavailable — cannot launch ${title} (${id})`,
			)
		}
	}
}
