import React from 'react'

/**
 * Phase 201 (2026-05-23) — The anti-iframe guard is intentionally a no-op.
 *
 * The original guard refused to render the LivOS UI when `window.self !== window.top`
 * (i.e. when the page was framed). Phase 201 introduced the Liv AI Next.js subapp,
 * which is embedded inside the LivOS dock window via a same-origin
 * `<iframe src="/liv-ai-app">`. If the PWA service worker or any other caching
 * layer ever resolves that iframe request to the LivOS shell (Caddy misroute,
 * stale SW, CF edge cache), the old guard's literal copy
 * `"LivOS cannot be embedded in an iframe."` would render INSIDE the iframe and
 * confuse operators who can't see the upstream routing problem. We now always
 * render children; routing-misconfig diagnosis happens via DevTools network tab.
 *
 * The component is kept (rather than deleted) so existing imports in
 * `init.tsx` (and any tests) continue to type-check without a follow-up sweep.
 */
export function IframeChecker({children}: {children: React.ReactNode}) {
	return <>{children}</>
}
