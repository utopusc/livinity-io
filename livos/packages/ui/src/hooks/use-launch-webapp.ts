// Phase 94-04 — useLaunchWebApp hook (stub).
//
// Hook signature is locked here so P95 (window manager spawn flow) can fill
// in the body without retrofitting every desktop touchpoint that calls it:
//
//   const launch = useLaunchWebApp()
//   launch(webappId)()  // returns a stable click handler
//
// P94 ships only the stub: clicking emits a console.warn pointing at P95.
// The icon component is the only call site today.

const WARNED = new Set<string>()

export function useLaunchWebApp(): (webappId: string) => () => void {
	return (webappId: string) => () => {
		// eslint-disable-next-line no-console
		console.log(`[P94] launch intent webappId=${webappId}`)
		// Warn once per session per webappId so a panel of pinned WebApps
		// doesn't spam the dev console on each click.
		if (!WARNED.has(webappId)) {
			WARNED.add(webappId)
			// eslint-disable-next-line no-console
			console.warn('P95 not yet shipped — full launch dispatch lands in Phase 95.')
		}
	}
}
