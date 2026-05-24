/**
 * Phase 203 Hot-fix D 2026-05-24 — Liv AI chat iframe window body.
 *
 * Renders the openclaw claw-client chat surface as a same-origin iframe at
 * /liv-ai-app/liv-ai (Caddy rewrites that path to /plugins/openclawos so the
 * gateway plugin serves it). Distinct from the legacy Phase 201
 * `liv-ai-content.tsx` which iframes the Next.js dashboard subapp at
 * /liv-ai-app — that one opens via the 'LIVINITY_liv-ai' literal appId path
 * and is kept for back-compat. THIS component is the target of the dock
 * shortcut seeded by liv-ai-dock-seed.ts.
 *
 * Same-origin so the LIVINITY_SESSION cookie auto-flows; the claw-client
 * inside the iframe POSTs /openclawos/handshake (Plan 203-05) to mint a
 * short-lived openclaw device token and connects to the gateway WS without
 * showing the operator a setup form (Hot-fix D part 3).
 */
export default function LivAiChatIframeContent() {
	return (
		<iframe
			src='/liv-ai-app/liv-ai'
			title='Liv AI'
			className='h-full w-full border-0 bg-background'
			allow='clipboard-read; clipboard-write'
		/>
	)
}
