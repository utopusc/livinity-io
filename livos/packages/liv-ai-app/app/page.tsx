import { redirect } from "next/navigation";

/**
 * Phase 203-09 — the chat surface that used to live at `/` was removed
 * with the @assistant-ui purge. In production the openclaw claw-gateway
 * owns `/liv-ai-app/*` via Caddy reverse_proxy to :18789 (D-203-05), and
 * the Phase 202 agents dashboard owns `/agents`.
 *
 * This stub handles the dev-only case where an operator hits the subapp
 * directly on `:3010/` (port-direct, no Caddy in front) — redirect to
 * `/agents` so they land on the Phase 202 dashboard instead of a 404.
 */
export default function Home() {
  redirect("/agents");
}
