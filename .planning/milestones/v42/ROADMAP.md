# v42 ROADMAP — Liv Assistant migration (12 phases)

Each phase = atomic GSD commit. Wave/parallel notes per row.

| # | Phase | What ships | Risk | Effort | Gate |
|---|---|---|---|---|---|
| 222 | **Spike: AionUi feasibility** ✅ DONE | `222-SPIKE.md` verdict PROCEED — all 4 PASS (build, iframe, Claude CLI subscription, Apache-2.0) | LOW (read-only research) | 4–6h done | ✅ PASSED `b2be397f` |
| 223 | **Vendor AionUi tarball + Liv-side integration scaffold** (revised post-spike: NO FORK) | `scripts/install-liv-assistant.sh` downloads + verifies + extracts `aionui-web-2.1.4-linux-x86_64.tar.gz` to `/opt/liv-assistant/`, installs `bun` if missing, captures first-boot admin password to `/etc/livos/liv-assistant-credentials` (0600 bruce). Apache `LICENSE` + `NOTICE` preserved. No source-level rebrand yet (deferred to Phase 232 if needed). | LOW (vendor + install script) | 3h | install.sh idempotent + binary boots |
| 224 | **App Store: hide Skills/MCP/AI tabs** | `feature_flags.liv_v42_migration = true` → tabs hidden, banner shown ("AI integrations temporarily disabled during Liv Assistant migration") | LOW (UI-only, no data delete) | 2h | — |
| 225 | **Liv Assistant systemd service** | `liv-assistant.service` (port 3020) deploys via update.sh; healthcheck `/api/health` 200 | MEDIUM (new service) | 3h | systemctl is-active |
| 226 | **Caddy routing + iframe headers** | `bruce.livinity.io/liv` → 3020 reverse proxy; `frame-ancestors 'self'` allows LivOS shell; X-Frame-Options stripped | MEDIUM | 2h | curl + browser iframe load |
| 227 | **LivOS shell integration** | `LivAssistantWindow` component replaces `OpenClawWindow`; dock icon → opens Liv Assistant iframe | MEDIUM (UI swap) | 3h | dock click opens chat |
| 228 | **Claude auth bridge** | Phase 221 `auth.claude.*` still works; Liv Assistant reads `~/.claude/.credentials.json`; first chat turn uses subscription | HIGH (auth-critical) | 2h | model picker shows Sonnet+Opus+Haiku |
| 229 | **Single-user posture** | PROJECT.md + STATE.md updated; multi-user explicitly deferred to v43; per-user data isolation discussion documented | LOW (doc-only) | 1h | doc commit |
| 230 | **Backup + cutover checkpoint** | `redis-cli SAVE`, `tar -czf /opt/livos/backups/pre-v42-cutover-$(date +%F).tgz /opt/livos/data /home/bruce/.claude /home/bruce/livinity` | LOW | 1h | tarball on disk |
| 231 | **OpenClawOS retirement** | `systemctl disable --now liv-claw-gateway && systemctl mask liv-claw-gateway`; Caddy handles removed; `liv-claw-os/` → `attic/liv-claw-os/`; `openclaw.*` + `openclawos.*` tRPC routes excised | HIGH (point of no return) | 3h | UAT 233 GREEN required first |
| 232 | **Livinity brand overlay** (revised: no source fork) | Brand applied via (a) Caddy `sub` directive injecting CSS override link tag into served `index.html`, (b) `/etc/liv-assistant/branding/` static dir served as `/branding/*` — Space Grotesk font + `#1d1d1f` accent + Livinity favicon + manifest theme_color override. Reversible by removing Caddy block. | MEDIUM (HTML rewrite via Caddy `sub`) | 3h | visual check |
| 233 | **E2E UAT + SUMMARY-v42** | operator-walked: open Liv, ask question, switch model, check apps still work, check public subdomain still works | OPERATOR | walk | every box checked |

## Wave parallelisation

- **Wave A (sequential, blocking):** 222 (spike) ✅ → 223 (vendor + install script)
- **Wave B (parallel after 223):** 224 (App Store hide) | 225 (service deploy) | 232 (Caddy brand overlay)
- **Wave C (sequential after 225+226):** 226 → 227 → 228
- **Wave D (sequential after Wave C):** 229 → 230 → 233 (UAT walk)
- **Wave E (final, gated by 233):** 231 (cleanup, only after UAT green)

## Acceptance per phase

Each phase's PLAN.md (under `.planning/phases/<N>-<slug>/<N>-PLAN.md`) defines:
- Tasks (T1..Tn) with falsifiable acceptance
- Sacred SHA verification (pre-commit hook)
- Rollback path (what to revert if it breaks)
- One atomic commit per task

## When does v42 ship?

After 233 UAT GREEN + 231 cleanup landed. Estimated 3–4 days of autonomous execution with operator UAT walks between Phase 228 (auth-critical) and Phase 233.
