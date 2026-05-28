---
milestone: v43.0
name: Liv AI Deeper Integration + UI Polish
opened: 2026-05-27
closed: 2026-05-28
status: closed (artifact-complete, operator UAT walks pending)
phases_shipped: 17
phases_obsoleted: 1
git_tag: v43.0
---

# v43.0 Milestone Archive — Liv AI Deeper Integration + UI Polish

## Headline Accomplishments

1. **AionUi → Liv Assistant complete rebrand** — 10 phases (P238 + P238.1 through P238.9) shipped a full visual + textual transformation: footer URL redirect, built-in skill SKILL.md rebrand, default agent persistence, brand layer CSS injection, dock tile icon, V-mountain → Livinity 'L' sed pass, real donut logo, adaptive CSS bg-image, light/dark favicon SVGs.
2. **Onboarding CLI Tools section live** (P239) — 5 install cards (Claude Code / OpenCode / Gemini / OpenClaw / Aion CLI), RCE boundary enforced server-side (D-239-07), feature-flag gated, 43 vitest tests GREEN.
3. **Local Agents install-from-UI** (P240) — AionUi vendor-patch wires "Available to Install" subsection that calls livinityd `cliInstaller.install` + `cliInstaller.auth` tRPC (extended from P239). Idempotent install-script injection (Phase 235 pattern).
4. **MCP auto-add Liv tools** (P241) — livinityd registers Luse / docker / shell into AionUi's MCP config on liv-assistant first boot, idempotently. Sentinel-based short-circuit; operator customizations preserved.
5. **Luse skill set (universal)** (P242) — Single canonical source at `docs/luse/` → 9 generated agent shims via idempotent `scripts/sync-luse-skills.sh` (POSIX bash, sha256-marked). NO agent privileged.
6. **Persistent UI terminal MVP** (P243) — xterm.js + node-pty + WebSocket protocol at `/livos/terminal/ws`. Feature-flag gated. PTY spawned as `bruce` (NEVER root). Caddy `@livos_terminal_ws` matcher (RFC 6455 unconditional). Multi-session/attach-detach deferred to v44+.

## Phase Inventory

| Phase | Title | Status | Plans | Mini PC |
|-------|-------|--------|-------|---------|
| 238 | AionUi complete rebrand | ✅ SHIPPED | 3/3 | yes |
| 238.1 | Footer URL redirect | ✅ SHIPPED | 1/1 | yes |
| 238.2 | Built-in skill SKILL.md rebrand | ✅ SHIPPED | 1/1 | yes |
| 238.3 | Default agent persistence | ✅ SHIPPED | 1/1 | yes |
| 238.4 | Brand layer LIVE in iframe | ✅ SHIPPED | 1/1 | yes |
| 238.5 | Liv AI dock tile icon | ✅ SHIPPED | 1/1 | yes |
| 238.6 | Inline brand-mark sed (V-mountain → L) | ✅ SHIPPED | 1/1 | yes |
| 238.7 | Real Livinity donut logo | ✅ SHIPPED | 1/1 | yes |
| 238.8 | Adaptive donut via CSS bg-image | ✅ SHIPPED | 1/1 | yes |
| 238.9 | Light/dark favicon SVGs | ✅ SHIPPED | 1/1 | yes |
| 239 | Onboarding CLI Tools section | ✅ SHIPPED | 3/3 | yes |
| 240 | Local Agents install-from-UI | ✅ SHIPPED | 3/3 | yes |
| 241 | MCP auto-add Liv tools | ✅ SHIPPED | 4/4 | yes |
| 242 | Luse skill set (universal) | ✅ SHIPPED | 1/1 | n/a |
| 243 | Persistent UI terminal MVP | ✅ SHIPPED | 4/4 | yes |
| 244 | MD docs Aion → Liv sed | ⏭️ OBSOLETED | — | (superseded by 238.2) |
| 245 | v43 E2E UAT + milestone close | ✅ SHIPPED | 1/1 | n/a |

**Total:** 17 SHIPPED + 1 OBSOLETED.

## Locked Invariants — All Honored

- **D-V43-SACRED:** `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — UNCHANGED across every v43 commit (pre-commit hook PASS on every commit).
- **D-V43-MINI-PC-ONLY:** Zero v43 commits touched Server4/Server5. Mini PC `bruce@10.69.31.68` exclusively.
- **D-V43-CADDY-REUSE-226-04:** All Caddy edits via `caddy.ts` pattern.
- **D-V43-SED-EXTEND-234-03:** New sed passes follow Phase 234-03 idempotency pattern.
- **D-V43-AUTH-BYPASS-PRESERVE:** Phase 234-04 `/liv-login` continues to work every deploy.

## Operator UAT — Pending (Deferred Acceptance)

Walked via `.planning/milestones/v43/v43-UAT-CHECKLIST.md` (41 actionable items across 11 sections). Auto-approved during autonomous chain per standing "soru sorma" + `_auto_chain_active=true` preference. Operator may PASS/FAIL each item at leisure post-archive; failures route to v43.x gap-closure micro-phases.

## Deferred to v44+

Aggregated in `.planning/milestones/v43/v43-SHIP-NOTES.md`:
- P240: uninstall button, per-CLI version pinning UI, websocket auth-status realtime
- P243: multi-session UI, attach/detach across reload, TTL GC, admin "kill session by id", cwd/env preservation, copy-paste / drag-drop file paths
- P239: update.sh rsync gap for `scripts/install/cli/` (D-DEFERRED-239-A), missing root LICENSE/NOTICE on Mini PC
- P242: Aion/OpenCode/OpenClaw agent-specific shim format pinning
- P239 code-review advisories (4 warnings, 6 info)

## Cross-Phase Integration Verified

- P239 cliInstaller.* tRPC → P240 extended with `.auth`
- P241 MCP registrar → P242 Luse docs reference back
- P237 Caddy `@liv_ws` → P243 cloned to `@livos_terminal_ws`
- P234-04 auth bypass → preserved across every deploy
- P226-04 Caddy `/liv` proxy → reused by P240 vendor-patch + P243 terminal

## Git Tag

`git tag -a v43.0` on commit at archive time. See `git log --oneline v43.0~1..v43.0` for ship range.

## Related Artifacts

- `.planning/v43-MILESTONE-AUDIT.md` — pre-archive audit (verdict: tech_debt)
- `.planning/milestones/v43/v43-UAT-CHECKLIST.md` — 41-item operator walk
- `.planning/milestones/v43/v43-SHIP-NOTES.md` — what landed / what's deferred
- `.planning/milestones/v43/PROJECT.md` — milestone PROJECT.md snapshot
- `.planning/milestones/v43/ROADMAP.md` — milestone ROADMAP.md snapshot
- `.planning/phases/{238..245}-*/` — per-phase PLAN.md / SUMMARY.md / CONTEXT.md (preserved in-tree)

## Next Milestone

v44 unblocked. To open: `/gsd-new-milestone` (gathers fresh requirements + roadmap). Likely scope candidates (from v43 deferred list):
- Multi-session terminal + attach-detach (extend P243)
- Local Agents uninstall + per-CLI version UI (extend P240)
- update.sh rsync gap fix (close D-DEFERRED-239-A)
- Polish operator UAT walks from v43-UAT-CHECKLIST.md
