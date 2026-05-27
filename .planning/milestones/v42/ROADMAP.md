# v42 ROADMAP — Liv Assistant migration (12 phases)

Each phase = atomic GSD commit. Wave/parallel notes per row.

| # | Phase | What ships | Risk | Effort | Gate |
|---|---|---|---|---|---|
| 222 | **Spike: AionUi feasibility** | `222-SPIKE.md` PASS/FAIL on (a) iframe embed, (b) Claude CLI subscription, (c) Mini PC docker build, (d) license posture | LOW (read-only research) | 4–6h | ✅ PASS gates 223+ |
| 223 | **Fork + rebrand to Liv** | `utopusc/liv-assistant` repo lives; search-replaced "AionUi" → "Liv", logo + manifest swapped, Apache NOTICE preserved | LOW | 4h | — |
| 224 | **App Store: hide Skills/MCP/AI tabs** | `feature_flags.liv_v42_migration = true` → tabs hidden, banner shown ("AI integrations temporarily disabled during Liv Assistant migration") | LOW (UI-only, no data delete) | 2h | — |
| 225 | **Liv Assistant systemd service** | `liv-assistant.service` (port 3020) deploys via update.sh; healthcheck `/api/health` 200 | MEDIUM (new service) | 3h | systemctl is-active |
| 226 | **Caddy routing + iframe headers** | `bruce.livinity.io/liv` → 3020 reverse proxy; `frame-ancestors 'self'` allows LivOS shell; X-Frame-Options stripped | MEDIUM | 2h | curl + browser iframe load |
| 227 | **LivOS shell integration** | `LivAssistantWindow` component replaces `OpenClawWindow`; dock icon → opens Liv Assistant iframe | MEDIUM (UI swap) | 3h | dock click opens chat |
| 228 | **Claude auth bridge** | Phase 221 `auth.claude.*` still works; Liv Assistant reads `~/.claude/.credentials.json`; first chat turn uses subscription | HIGH (auth-critical) | 2h | model picker shows Sonnet+Opus+Haiku |
| 229 | **Single-user posture** | PROJECT.md + STATE.md updated; multi-user explicitly deferred to v43; per-user data isolation discussion documented | LOW (doc-only) | 1h | doc commit |
| 230 | **Backup + cutover checkpoint** | `redis-cli SAVE`, `tar -czf /opt/livos/backups/pre-v42-cutover-$(date +%F).tgz /opt/livos/data /home/bruce/.claude /home/bruce/livinity` | LOW | 1h | tarball on disk |
| 231 | **OpenClawOS retirement** | `systemctl disable --now liv-claw-gateway && systemctl mask liv-claw-gateway`; Caddy handles removed; `liv-claw-os/` → `attic/liv-claw-os/`; `openclaw.*` + `openclawos.*` tRPC routes excised | HIGH (point of no return) | 3h | UAT 233 GREEN required first |
| 232 | **Livinity Design System polish** | Space Grotesk font + `#1d1d1f` mono accent injected into Liv fork's CSS; logo + favicon Livinity; theme_color in manifest | MEDIUM | 3h | visual check |
| 233 | **E2E UAT + SUMMARY-v42** | operator-walked: open Liv, ask question, switch model, check apps still work, check public subdomain still works | OPERATOR | walk | every box checked |

## Wave parallelisation

- **Wave A (sequential, blocking):** 222 (spike) → 223 (fork)
- **Wave B (parallel after 223):** 224 (App Store hide) | 225 (service deploy) | 232 (design polish on fork branch)
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
