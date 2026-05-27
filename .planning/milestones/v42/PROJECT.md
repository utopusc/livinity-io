# v42 — Liv Assistant (AionUi-based replacement of OpenClawOS)

**Status:** PLANNING (2026-05-27)
**Operator decision:** "Sadece Liv olarak asistani degistirelim! Skill eklemesi vs MCP AI bolumunu store dan bir sure kaldiralim. Bunun icin uzunca bir GSD plani yapalim temiz ve duzgunce entegre edelim."
**Estimated effort:** 3–4 days (12 phases, autonomous-friendly).
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (`liv/packages/core/src/sdk-agent-runner.ts`) — UNTOUCHED across every commit. Liv Assistant uses its OWN provider config; the subscription path is bridged at the credentials-file layer, not the runner.

## Goal

Replace the in-LivOS AI chat surface (OpenClawOS — `openclaw` binary + `liv-claw-os/packages/claw-client` + `liv-claw-gateway.service`) with a fork of [iOfficeAI/AionUi](https://github.com/iOfficeAI/AionUi) rebranded to **Liv**. Run it inside the LivOS desktop shell as an iframe-embedded window. Preserve every non-chat surface (App Store, multi-user, public subdomains, Docker app isolation).

## Why AionUi (recap from 2026-05-27 discussion)

- 26.7K stars, Apache-2.0, active community (560 open issues, 2.5K forks)
- Supports 20+ CLI agent backends out of the box (Claude Code, Codex, Gemini CLI, Hermes, OpenClaw, OpenCode, etc.)
- 20+ LLM providers including Claude / OpenAI / Bedrock / Ollama
- Headless WebUI mode → iframe-embeddable in LivOS shell
- Built-in scheduled tasks (24/7 cron), multi-agent Team Mode, office doc generation
- Unified MCP config across agents
- Better chat UX than current OpenClawOS Settings tab work would ever reach

## What we are NOT throwing away

| Surface | Decision |
|---|---|
| App Store (304 apps) | KEEP — unchanged |
| Multi-user JWT + per-user Docker | KEEP — unchanged |
| Public subdomain routing (Server5 relay + Caddy + CF) | KEEP — unchanged |
| File Browser, Linkwarden, native apps | KEEP — unchanged |
| `liv/packages/core` (`sdk-agent-runner.ts` SHA sacred) | KEEP — untouched. Liv Assistant bridges at credentials layer, not runner |
| Phase 221 Claude OAuth tRPC (`auth.claude.*`) | KEEP — bridged into Liv Assistant in Phase 228 |
| `~/.claude/.credentials.json` workflow | KEEP — Liv Assistant reads the same file |

## What we ARE temporarily disabling (per operator request)

| Surface | Reason | Status |
|---|---|---|
| App Store "Skills" tab | Liv Assistant has its own skills system; avoid two parallel skill surfaces during migration | Hidden in Phase 224, re-enabled post-v42 (or replaced by Liv-native equivalent) |
| App Store "MCP Servers" tab | Same as above — Liv Assistant has unified MCP config | Hidden in Phase 224 |
| App Store "AI" category | Confusion during transition; Liv Assistant IS the AI surface | Hidden in Phase 224 |
| Phase 219 T2 catalog (22 MCPs) | Code stays, route stays, just UI hidden | Feature-flag off |

## Architecture cutover

```
BEFORE (current, OpenClawOS):
  LivOS UI shell
    └─ iframe → bruce.livinity.io/liv-ai-app/*
          └─ Caddy → 127.0.0.1:3010 (livos-app-liv-ai.service — Next.js claw-client)
                └─ tRPC → 127.0.0.1:8080 (livinityd) + 127.0.0.1:18789 (liv-claw-gateway)
                      └─ openclaw → spawns /usr/bin/claude -p ... per chat turn

AFTER (target, Liv Assistant):
  LivOS UI shell
    └─ iframe → bruce.livinity.io/liv (or subdomain)
          └─ Caddy → 127.0.0.1:3020 (liv-assistant.service — AionUi-fork headless WebUI)
                └─ Liv Assistant directly spawns /usr/bin/claude -p ... (or other CLI)
                      └─ Reads /home/bruce/.claude/.credentials.json (Phase 221 auth surface)

RETIRED (cleanup in Phase 231):
  - liv-claw-gateway.service (port 18789)
  - openclaw binary + plugin
  - liv-claw-os/packages/claw-client + claw-plugin (kept in attic/ for rollback)
  - openclaw.* + openclawos.* tRPC routes
  - Caddy /plugins/openclawos/* + /openclawos/handshake handles
```

## Phase outline (see ROADMAP.md for the full sequence)

```
222 — Spike: AionUi feasibility on Mini PC  (4–6h, gate)
223 — Fork repo + rebrand to "Liv"          (4h)
224 — App Store: hide Skills/MCP/AI tabs    (2h)
225 — Liv Assistant systemd service         (3h)
226 — Caddy routing + iframe headers        (2h)
227 — LivOS shell integration               (3h)
228 — Claude auth bridge                    (2h)
229 — Single-user posture decision          (1h)
230 — Backup + cutover checkpoint           (1h)
231 — OpenClawOS retirement                 (3h)
232 — Livinity Design System polish         (3h)
233 — E2E UAT + SUMMARY-v42                 (operator-walked)
```

## Risk register

| Risk | Mitigation |
|---|---|
| AionUi iframe-incompatible (X-Frame-Options DENY) | Phase 222 spike gates the entire plan. If FAIL → standalone-window strategy. |
| AionUi upstream drift (active community, 26.7K ⭐) | Fork pin to a specific tag; rebase quarterly via dedicated maintenance phase |
| Claude subscription path breaks | Phase 228 bridges via credentials file; sacred SHA stays |
| Multi-user not supported by AionUi (single Google sign-in) | Phase 229 explicitly scopes to single-user for v42; multi-user is v43 milestone |
| App Store skills/MCP code orphaned | Keep code feature-flagged off; not deleted. Easy rollback. |
| LivOS shell window chrome lost | Phase 227 preserves window title bar + controls; Liv Assistant fills the iframe body only |
| Cleanup destroys rollback path | Phase 231 keeps source in attic/, only disables service + cleans Caddy. Re-enabling is `systemctl unmask + reload`. |

## Out of scope (deferred to v43+)

- Per-user Liv Assistant instances (multi-user)
- Native LivOS App Store integration into Liv Assistant (Liv as a marketplace consumer)
- Skills marketplace replacement (the operator-requested in-product market from Phase 219 T7)
- Office doc generation surfacing in LivOS file system
- Team Mode + scheduled cron UI surfacing
- Telegram / Lark / WeChat integration

## Locked invariants

- **D-V42-SACRED:** `liv/packages/core/src/sdk-agent-runner.ts` blob SHA `f3538e1d...` stays untouched across every commit. Pre-commit hook verifies.
- **D-V42-NO-DATA-LOSS:** No user-created data in `~bruce/livinity/`, `/opt/livos/data/`, or Redis is deleted. Liv Assistant new data goes to its own dir (e.g. `/opt/liv-assistant/data/` or `~bruce/.liv-assistant/`).
- **D-V42-APACHE-NOTICE:** Apache-2.0 NOTICE preserved in the Liv fork. CONTRIBUTING.md + README clearly attribute upstream.
- **D-V42-SINGLE-USER:** v42 ships single-user. Multi-user is a separate milestone.
- **D-V42-ROLLBACK:** Phases 223–230 are reversible without data loss. Phase 231 is the point-of-no-return cleanup; gated behind operator approval after Phase 233.
- **D-V42-NO-PHONE-HOME:** No telemetry from the fork. Audit AionUi for any analytics/phone-home calls and disable in Phase 223.
- **D-V42-LIVINITY-BRAND:** Phase 232 applies Livinity Design System (Space Grotesk + `#1d1d1f` mono accent) consistently. No AionUi visual leftovers.

## Success criteria

- Operator clicks "Liv" in LivOS dock → Liv Assistant chat window opens
- Operator types "what's my disk usage" → claude CLI subprocess runs → response renders
- Operator can switch model (Sonnet / Opus / Haiku) from Liv Assistant model picker
- File Browser, Linkwarden, app store still work — zero regression on non-chat surfaces
- `liv-claw-gateway.service` is `inactive (masked)` — old code gone from runtime
- Browser console: no errors from old openclaw bridge endpoints
- E2E UAT walks every scenario in 233-UAT-CHECKLIST.md → all green

## Next step

`/gsd-plan-phase 222` (or this AI executes Phase 222 spike per the autonomous mode the operator runs in).
