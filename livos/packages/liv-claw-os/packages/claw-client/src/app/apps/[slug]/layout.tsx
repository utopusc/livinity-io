/**
 * Phase 203-11 — Standalone OpenUI app layout.
 *
 * Minimal pass-through wrapper for `/apps/[slug]` — NO chat shell, NO
 * sidebar, NO composer, NO command palette. The page renders ONLY the
 * OpenUI app content via the in-repo `@openuidev/react-lang` Renderer.
 *
 * The LivOS desktop window (Phase 203-10) mounts this via
 * `<iframe src="/liv-ai-app/apps/{slug}">`; the chat surface lives at
 * the iframe served by `/liv-ai-app/openclawos/*`. Standalone here means
 * "renders the OpenUI app the way the dock window expects to see it" —
 * no chat scaffolding leaks into the iframe body.
 */

export default function OpenUiAppsLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-screen w-full flex-col">{children}</div>;
}
