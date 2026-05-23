/**
 * Phase 198-07 — Dev-only DevTools panel mount.
 *
 * T-198-07-01 mitigation: gated behind `import.meta.env.DEV` so the
 * production Vite build tree-shakes out `@assistant-ui/react-devtools`
 * entirely. The component returns null at the top in production, and
 * the lazy import branch is unreachable from a production module
 * graph — Vite's static analysis + esbuild dead-code elimination
 * guarantee the dynamic `import('@assistant-ui/react-devtools')`
 * specifier never lands in the production bundle.
 *
 * NOTE: As of Phase 198-07, `@assistant-ui/react-devtools` is NOT a
 * separately-installed npm package in livos/packages/ui — the only
 * installed @assistant-ui surfaces are `react`, `react-ai-sdk`, and
 * `react-markdown`. The dev DevTools experience is provided by the
 * assistant-ui browser extension. This component therefore ships as
 * an inert dev-only stub today; future revisions can swap in a real
 * mount when/if the package is added, without changing the call site
 * in assistant.tsx.
 *
 * D-NO-NEW-DEPS preserved — zero new npm packages installed for this
 * file. The optional dynamic `import('@assistant-ui/react-devtools')`
 * is wrapped in try/catch so a missing package degrades to `() => null`
 * silently in dev (operators see nothing, the rest of the app works).
 */

import {lazy, Suspense} from 'react'
import type {ComponentType} from 'react'

/**
 * Lazy wrapper around the optional `@assistant-ui/react-devtools`
 * dynamic import. The `if (!import.meta.env.DEV)` guard short-circuits
 * to a no-op component in production — Vite's static-analysis tree-
 * shaker uses this branch to drop the unreachable
 * `import('@assistant-ui/react-devtools')` specifier entirely.
 *
 * In dev, the dynamic import is attempted; if the package isn't
 * installed (the current state of livos/packages/ui — see top-of-file
 * note), the try/catch swallows the resolution error and falls back
 * to the no-op component so the dev experience isn't broken.
 */
const LazyDevTools = lazy(async () => {
	if (!import.meta.env.DEV) {
		// Production: bail out to a no-op component before the dynamic
		// import specifier is touched. Vite's tree-shaker treats this
		// branch as the only reachable one in prod and drops the dev
		// `await import('@assistant-ui/react-devtools')` below.
		return {default: (() => null) as ComponentType}
	}
	try {
		const mod = (await import(
			/* @vite-ignore */ '@assistant-ui/react-devtools'
		)) as Record<string, unknown>
		// assistant-ui's devtools package may expose the component as
		// AssistantDevTools (named) or default — pick whichever exists.
		const candidate =
			(mod.AssistantDevTools as ComponentType | undefined) ??
			(mod.default as ComponentType | undefined)
		return {default: candidate ?? (() => null)}
	} catch {
		// Package not installed (Phase 198-07 current state) — degrade
		// silently. The browser extension still works.
		return {default: (() => null) as ComponentType}
	}
})

/**
 * DevToolsMount — renders the assistant-ui DevTools panel in dev,
 * renders `null` in production (T-198-07-01).
 *
 * Mounted at the root of <Assistant /> alongside the AssistantRuntime-
 * Provider so the DevTools panel can inspect the runtime tree.
 */
export function DevToolsMount() {
	if (!import.meta.env.DEV) return null
	return (
		<Suspense fallback={null}>
			<LazyDevTools />
		</Suspense>
	)
}

export default DevToolsMount
