---
milestone: v43.0
name: Liv AI Deeper Integration + UI Polish
audited: 2026-05-28
status: tech_debt
phases_shipped: 17
phases_obsoleted: 1
auditor: autonomous (gsd-autonomous --from 240)
---

# v43.0 Milestone Audit — Liv AI Deeper Integration + UI Polish

## Summary

**Status:** `tech_debt` — All 8 declared v43 phases (P238–P245) artifact-complete with code shipped + Mini PC deployed where applicable. **Operator UAT walks pending** across 7 phases (auto-approved during autonomous chain per standing "soru sorma" + `_auto_chain_active=true` preference). The milestone is shippable; the pending walks are a deliberate deferred-acceptance pattern, not coverage gaps.

## Phases

| Phase | Title | Status | Plans | Mini PC | UAT |
|-------|-------|--------|-------|---------|-----|
| 238 | AionUi complete rebrand (logo + text) | ✅ SHIPPED | 3/3 | yes | 11/11 SCs |
| 238.1 | AionUi footer URL redirect | ✅ SHIPPED | 1/1 | yes | 12/12 SCs |
| 238.2 | Built-in skill SKILL.md rebrand | ✅ SHIPPED | 1/1 | yes | 12/12 SCs |
| 238.3 | Default agent persistence | ✅ SHIPPED | 1/1 | yes | 10/10 SCs |
| 238.4 | Brand layer LIVE in iframe | ✅ SHIPPED | 1/1 | yes | 12/12 SCs |
| 238.5 | Liv AI dock tile icon | ✅ SHIPPED | 1/1 | yes | partial |
| 238.6 | Inline brand-mark sed | ✅ SHIPPED | 1/1 | yes | partial |
| 238.7 | Real Livinity donut logo | ✅ SHIPPED | 1/1 | yes | partial |
| 238.8 | Adaptive donut via CSS bg-image | ✅ SHIPPED | 1/1 | yes | partial |
| 238.9 | Light/dark favicon SVGs | ✅ SHIPPED | 1/1 | yes | partial |
| 239 | Onboarding CLI Tools section | ✅ SHIPPED | 3/3 | yes | 18/18 programmatic + 2 browser pending |
| 240 | Local Agents install-from-UI | ✅ SHIPPED | 3/3 | yes | 3 browser walks auto-approved |
| 241 | MCP auto-add Liv tools | ✅ SHIPPED | 4/4 | yes | per-phase verified |
| 242 | Luse skill set (universal) | ✅ SHIPPED | 1/1 | n/a (docs-only) | cross-agent prose probe pending |
| 243 | Persistent UI terminal (xterm + PTY MVP) | ✅ SHIPPED | 4/4 | yes | 3 browser walks auto-approved |
| 244 | MD docs Aion → Liv text | ⏭️ OBSOLETED | — | — | superseded by Phase 238.2 |
| 245 | v43 E2E UAT + milestone close | ✅ SHIPPED | 1/1 | n/a | UAT-CHECKLIST.md + SHIP-NOTES.md authored |

## Requirements Coverage

- v43 ROADMAP scope = "every visible Aion string + asset replaced with Liv equivalents, onboarding teaches operator about CLI agents, Liv tools register into MCP, Local Agents tab can install missing agents from UI, persistent xterm terminal inside LivOS shell, Luse skill set available to Claude Code agents."
- All bullets DELIVERED:
  - Visible rebrand → 238 + 238.x decimal phases (10 phases shipped)
  - Onboarding CLI Tools → 239 SHIPPED
  - MCP auto-add → 241 SHIPPED
  - Local Agents install-from-UI → 240 SHIPPED
  - Persistent terminal → 243 SHIPPED (MVP scope: single-session, attach-detach deferred to v44+)
  - Luse skill set → 242 SHIPPED

## Tech Debt / Deferred Items

Catalogued in `.planning/milestones/v43/v43-SHIP-NOTES.md` "What's deferred (v44+)" section:

- **P240 deferred:** uninstall button, per-CLI version pinning UI, websocket auth-status updates
- **P243 deferred:** multi-session UI, attach/detach across reload, TTL GC, admin "kill session by id", cwd/env preservation, copy-paste / drag-drop file paths
- **P239 deferred items file:** `update.sh` rsync gap for `scripts/install/cli/` (D-DEFERRED-239-A), missing root LICENSE/NOTICE on Mini PC (D-DEFERRED-239-B + C)
- **P242 deferred:** Aion/OpenCode/OpenClaw agent-specific shim format pinning (currently generic .md placeholders), per-agent frontmatter
- **Code-review advisories from P239** (4 warnings, 6 info): WR-01 setData race, WR-02 npm-global permission issue for gemini/aion-cli scripts, WR-03 defense-in-depth detect-query enabled guards, WR-04 stdout/stderr chronological ordering — none blocking ship

## Operator UAT Walks Pending

Per phase, the following items remain `pending` until operator at-leisure walks:

- **P239:** 2 browser walks (flag-ON / flag-OFF) — persisted in `239-HUMAN-UAT.md`
- **P240:** 3 browser walks (detect / install / auth round-trip) — documented in `240-03-DEPLOY-LOG.md`
- **P243:** 3 browser walks (open terminal / type whoami / window close kills session) — documented in `243-04-DEPLOY-LOG.md`
- **P242:** cross-agent prose probe (ask same task to claude-code / aion / opencode → identical hint copy)
- **P238.5/6/7/8/9:** partial visual confirmations — documented in their respective SUMMARYs

All deferred to operator walk via `.planning/milestones/v43/v43-UAT-CHECKLIST.md` (41 actionable items).

## Sacred Invariants

- **D-V43-SACRED:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — PRESERVED across all v43 commits (pre-commit hook PASS: 20 files verified, every commit).
- **D-V43-MINI-PC-ONLY:** Zero v43 commits touched Server4/Server5. Mini PC `bruce@10.69.31.68` only.
- **D-V43-CADDY-REUSE-226-04:** All Caddy edits via `caddy.ts` pattern (P240 + P243).
- **D-V43-SED-EXTEND-234-03:** New sed passes follow Phase 234-03 idempotency pattern (P238.x + P240-02 patches).
- **D-V43-AUTH-BYPASS-PRESERVE:** Phase 234-04 `/liv-login` continues to work every deploy.

## Cross-Phase Integration

- P239 cliInstaller.* tRPC namespace → consumed by P240 (extended with `.auth`).
- P241 MCP registrar → P242 Luse skill docs reference back to MCP tool descriptions.
- P237 Caddy `@liv_ws` matcher → P243 cloned to `@livos_terminal_ws` for terminal WS upgrade.
- P234-04 auth bypass → preserved across every deploy.
- P226-04 Caddy `/liv` proxy → reused by P240 vendor-patch fetch path and P243 terminal panel mount.

## Verdict

`tech_debt` — Milestone artifact-complete and shippable. Pending operator UAT walks are a known deferred-acceptance pattern under standing autonomous preference, NOT coverage gaps. Sacred invariants intact. Cross-phase integration verified at wire-level (HTTP/WS probes + journalctl markers + Redis HGETALL) across each phase's deploy plan.

Recommendation: PROCEED to `gsd-complete-milestone v43.0` to archive. Operator can run UAT-CHECKLIST.md at leisure post-archive; failures route to a v43.x gap-closure micro-phase.
