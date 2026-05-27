# v43 ROADMAP — Liv AI Deeper Integration + UI Polish (8 phases)

Each phase = atomic GSD commit set. Wave/parallel notes per row.

| # | Phase | What ships | Risk | Effort | Gate |
|---|---|---|---|---|---|
| 238 | **Complete AionUi rebrand (logo + text)** | Livinity logo SVG overlays AionUi logo asset(s) during install-script run. Case-insensitive `Aion` / `AION` / `aion` (word-boundary) sed pass extends Phase 234-03. **HİÇ BİR Aion yazısı kalmaz.** Idempotent. Plan 238-{01,02,03} DETAILED in v43 milestone-open invocation. | LOW | 4h | Plans authored; ready to execute |
| 239 | **Onboarding "CLI Tools" section** | New onboarding wizard step listing supported CLIs (Claude Code, OpenCode, Gemini, OpenClaw, Aion CLI) with one-click install via livinityd. Removes existing "AI" section. UI + livinityd install bridge. | MEDIUM | 1 day | — (plan after 238) |
| 240 | **Local Agents — install-from-UI** | AionUi Local Agents tab: "Available to Install" section for not-detected agents + one-click install + auth flow. Cross-app integration; may require AionUi backend extension OR livinityd-served install scripts injected via MCP. | MEDIUM-HIGH | 1-2 days | — (depends on 241) |
| 241 | **MCP auto-add Liv tools (Luse / docker / shell)** | livinityd registers Liv's MCP tools into AionUi's MCP config on liv-assistant first-boot. Idempotent (per-tool EXISTS gate + sentinel). AionUi MCP config write API. | MEDIUM | 1 day | — (investigation step needed) |
| 242 | **Luse skill set — UNIVERSAL across all Liv AI agents** | Canonical `docs/luse/` (agent-agnostic) + auto-generated agent shims (`.claude/skills/luse/`, `.aion/skills/luse.md`, `.opencode/skills/luse.md`) via `scripts/sync-luse-skills.sh`. NOT Claude-only — every agent AionUi dispatches to discovers Luse with identical hints (via MCP from Phase 241 + skill files for agents that scan local skill dirs). Docs + generator script. | LOW | 4h | depends on 241 for MCP exposure |
| 243 | **Persistent UI terminal** | xterm.js terminal panel in LivOS shell. PTY backend in livinityd. Multi-session, named, attachable/detachable. Survives page reload. Only dies on operator explicit close. PTY state mgmt + WS streaming. | HIGH | 2-3 days | — (biggest v43 phase) |
| 244 | **MD docs Aion → Liv text** | sed-replace "Aion" → "Liv" in all .md files in `/opt/liv-assistant/current/`. Idempotent install-script extension. Excludes LICENSE/NOTICE/UPSTREAM. Mirrors Phase 234-03 but scoped to `*.md`. | LOW | 2h | — (extension of 234-03 sed) |
| 245 | **v43 E2E UAT + milestone close** | Final external smoke + operator UAT walk + milestone close + ROADMAP archive (move to `.planning/milestones/v43/` per v42 precedent). | LOW | operator walk | Gate for v44 |

## Wave parallelization

- **Wave A (sequential, blocking):** 238 (rebrand) — fastest start, lowest risk, sets the visual baseline
- **Wave B (parallel after 238):** 239 (onboarding) | 244 (MD docs) — 242 moved to depend on 241 since universal-skill docs reference the MCP exposure
- **Wave C (sequential after 238):** 241 (MCP auto-add) — preceded by an investigation step similar to 238-02
- **Wave D (sequential after 241):** 240 (Local Agents UI) | 242 (universal Luse skill docs + shim generator) — both depend on the Phase 241 MCP registrar
- **Wave E (independent after Wave A):** 243 (terminal) — can start in parallel to Wave C/D; biggest investment
- **Wave F (final, gated by 238-244):** 245 (UAT close)

## Acceptance per phase

Each phase's PLAN.md (under `.planning/phases/<N>-<slug>/<N>-<NN>-PLAN.md`) defines:
- Tasks (T1..Tn) with falsifiable acceptance via `<verify><automated>` blocks
- Sacred SHA verification (pre-commit hook gates every commit)
- Rollback path (what to revert if the change breaks)
- Reversibility via Redis feature flag for any user-visible change
- One atomic commit per task

## Mini PC deploy invariants (every phase)

- HARD RULE 2026-04-27: Mini PC `bruce@10.69.31.68` is the ONLY deploy target. Server4 + Server5 receive zero v43 commits.
- Single batched SSH session per deploy (fail2ban discipline per `feedback_ssh_rate_limit`)
- PRE/POST verification block in every DEPLOY-LOG.md mirroring the Phase 234-03 template (services / sacred-sha / external curl probes / non-regression of prior phases)
- Phase 234-04 `/liv-login` 302 + `Set-Cookie: aionui-session` non-regression check in every deploy log
- D-V43-APACHE-NOTICE LICENSE + NOTICE sha256 byte-identical PRE/POST in every deploy log

## When does v43 ship?

After Phase 245 UAT GREEN. Estimated 8-11 days of autonomous execution with operator UAT walks gating each phase's status flip to ✅ SHIPPED.

## Phase planning protocol

- Phase 238 — plans 01/02/03 authored in v43 milestone-open invocation (2026-05-27). Ready to execute via `/gsd-execute-phase 238`.
- Phases 239-245 — operator plans + executes one at a time after Phase 238 ships. ROADMAP rows above are orchestration awareness only; detailed PLAN.md authored at the start of each phase.
