/**
 * Phase 201 — Liv AI window content.
 *
 * The Liv AI surface is a standalone Next.js App Router app running on
 * the Mini PC at 127.0.0.1:3010, proxied via Caddy at /liv-ai-app/*.
 * Same-origin means the LIVINITY_SESSION JWT cookie auto-flows into
 * the iframe → fetch("/chat/livAi", credentials:"include") authenticates
 * against the parent livinityd Express route unchanged.
 *
 * The previous Vite-embedded <Assistant /> (livos/packages/ui features/
 * liv-ai/*) is left on disk for one release as a fallback — the
 * iframe wrap supersedes it from the window-content mount-point on.
 */
export default function LivAiContent() {
	return (
		<iframe
			src="/liv-ai-app"
			title="Liv AI"
			className="h-full w-full border-0 bg-background"
			allow="clipboard-read; clipboard-write"
		/>
	)
}
