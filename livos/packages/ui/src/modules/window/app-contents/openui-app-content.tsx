/**
 * Phase 203-10 Task 3 — OpenUI app window body.
 *
 * Renders an OpenUI app generated via the openclaw `app_create` tool as a
 * same-origin iframe pointing at `/liv-ai-app/apps/<slug>` (Plan 203-11
 * ships the gateway route that serves the standalone OpenUI app page).
 *
 * Mount path:
 *   1. openclawos.apps.create succeeds (livinityd) → registers
 *      NativeAppConfig with wmClassHint='liv-openui-<slug>'
 *   2. Dock re-fetches apps.native.list (existing liv:config:updated
 *      pub/sub), renders <NativeAppIcon> tile.
 *   3. Operator clicks → useLaunchNativeApp opens a `NATIVE_<id>` window.
 *   4. window-content.tsx sees `NATIVE_` prefix + `liv-openui-` wmClassHint
 *      via apps.native.list and mounts THIS component instead of the
 *      x11vnc-backed NativeAppStreamWindowContent.
 *
 * T-203-06 trust chain: parent LivOS UI → Caddy `/liv-ai-app/*` →
 * openclaw gateway. All same-origin (bruce.livinity.io), CSP +
 * X-Frame-Options SAMEORIGIN, LIVINITY_SESSION cookie SameSite=Lax.
 * Mirrors the Phase 201 liv-ai-content.tsx pattern (which also
 * iframes /liv-ai-app/ for the chat surface).
 */
export interface OpenUiAppContentProps {
	/**
	 * OpenUI app slug — matches the URL segment
	 * `/liv-ai-app/openclawos/apps/<slug>`. (Phase 203-10 originally
	 * specified `/liv-ai-app/apps/<slug>` but operator UAT 2026-05-24 hit
	 * a 404 on that path: Caddy's `@livai` catch-all routes
	 * `/liv-ai-app/*` to the Next.js dashboard (:3010), which has no
	 * `/apps/[slug]` route. The openclaw gateway serves the claw-client's
	 * OpenUiAppView at `/plugins/openclawos/apps/<slug>` and Caddy has a
	 * pre-existing rewrite `/liv-ai-app/openclawos/* → /plugins/openclawos*`
	 * (verified curl 200 OK 2026-05-24), so we point the iframe at the
	 * rewriting prefix.)
	 */
	slug: string
	/** Display name — used as the iframe title (a11y + DevTools). */
	name: string
}

export default function OpenUiAppContent({slug, name}: OpenUiAppContentProps) {
	return (
		<iframe
			src={`/liv-ai-app/openclawos/apps/${encodeURIComponent(slug)}`}
			title={name}
			className='h-full w-full border-0 bg-background'
			allow='clipboard-read; clipboard-write'
		/>
	)
}
