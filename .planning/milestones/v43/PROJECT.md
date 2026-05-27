# v43 — Liv AI Deeper Integration + UI Polish

**Status:** OPEN (2026-05-27)
**Trigger:** Operator post-v42 live testing 2026-05-27 evening. After v42 Phase 237 shipped real-time WS streaming, operator surfaced a coherent next-wave of integration + UX gaps: residual AionUi branding visible (logo + lowercase variants), onboarding lacks discoverability for the CLI agents AionUi already supports, Liv's own tools (Luse / docker / shell) are not auto-registered in the MCP config, Local Agents tab cannot install missing agents, no persistent in-shell terminal, missing Luse skill set for Claude Code, and downloaded markdown docs still say "Aion".
**Estimated effort:** 8–11 days wall-clock (8 phases, autonomous-friendly).
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (`liv/packages/core/src/sdk-agent-runner.ts`) — UNCHANGED throughout v43. Pre-commit hook gates every commit.

## Goal

Take the v42 AionUi-based Liv Assistant from "live and working" to "feels like a Livinity-native product end-to-end" — every visible Aion string + asset replaced with Liv equivalents, onboarding teaches the operator about the CLI agents Liv ships with, Liv's tools register into the MCP layer automatically, the Local Agents tab can install missing agents from the UI, a persistent xterm-backed terminal lives inside the LivOS shell, and a Luse skill set is available to Claude Code agents running inside Liv AI.

## Why this milestone exists

v42 closed with the chat + auth + WS streaming surfaces working end-to-end. The remaining gaps are integration polish that the operator surfaced via live testing — none of them are bugs in v42's scope, but together they block "feels native to Livinity" perception:

1. Visible Aion branding remains in logo asset(s) + lowercase + uppercase variants the case-sensitive Phase 234-03 sed pass missed
2. Onboarding wizard has an outdated "AI" section that doesn't tell the operator about Claude Code / OpenCode / Gemini / OpenClaw / Aion CLI all working out of the box
3. AionUi's default MCP config is empty — Liv's signature tools (Luse computer-use, docker, shell) require manual operator config; should auto-register on liv-assistant first boot
4. Local Agents tab only shows agents that are already detected on disk; if a CLI isn't installed, the operator has no UI path to install it
5. No persistent terminal in the LivOS shell — operator currently SSH's in for routine ops; an xterm panel that survives page reload would close that loop
6. No Luse skill set for Claude Code → operator can't use natural-language click/type/screenshot from inside Liv AI's Claude Code agent
7. Downloaded help .md docs inside `/opt/liv-assistant/current/` still reference "Aion" — they bypass Phase 234-03's HTML/JS/CSS sed scope

## Requirements

### Validated (carried forward from v42)

- ✓ AionUi-based Liv Assistant LIVE on Mini PC port 3020 (Phase 223)
- ✓ Caddy `/liv` reverse proxy + iframe headers (Phase 226-04)
- ✓ Auth bypass via `/liv-login` (Phase 234-04)
- ✓ Vendored-binary AionUi → Liv AI text rebrand (Phase 234-03, HTML/JS/CSS in static/, case-sensitive)
- ✓ Path rewrite `/api/` → `/liv/api/` (Phase 235)
- ✓ Caddy referer-gated `/api/*` + unconditional `/ws` (Phase 237 RFC 6455 fix)
- ✓ Real-time chat streaming working end-to-end (Phase 237 verdict)

### Target (v43 to validate)

| Req | Description | Phase |
|-----|-------------|-------|
| FR-V43-REBRAND-LOGO-01 | Livinity logo SVG overwrites AionUi logo asset(s) in `/opt/liv-assistant/current/static/` during install-script run | 238 |
| FR-V43-REBRAND-TEXT-01 | Case-insensitive `Aion` / `AION` / `aion` (word-boundary matched) sed pass extends Phase 234-03 to leave zero `Aion*` brand strings in served HTML/JS | 238 |
| FR-V43-REBRAND-IDEMPOTENT-01 | Logo overwrite + extended sed pass are idempotent — re-running install-liv-assistant.sh = no-op | 238 |
| FR-V43-ONBOARD-CLI-01 | Onboarding wizard has a new "CLI Tools" section listing supported CLIs (Claude Code, OpenCode, Gemini, OpenClaw, Aion CLI) with one-click install via livinityd | 239 |
| FR-V43-ONBOARD-AI-REMOVE-01 | Existing "AI" onboarding section removed (replaced by CLI Tools) | 239 |
| FR-V43-AGENTS-INSTALL-UI-01 | Local Agents tab inside Liv AI shows "Available to Install" section for undetected CLIs + one-click install + auth flow | 240 |
| FR-V43-MCP-AUTO-01 | livinityd registers Liv's MCP tools (Luse, docker, shell) into AionUi's MCP config on liv-assistant first boot, idempotently | 241 |
| FR-V43-LUSE-SKILL-01 | `.claude/skills/luse/` directory with SKILL.md + click/type/screenshot/key/scroll sub-skills, usable by Claude Code agent inside Liv AI | 242 |
| FR-V43-TERMINAL-01 | xterm.js terminal panel in LivOS shell, PTY backend in livinityd, multi-session, named, attachable/detachable, survives page reload, only dies on explicit close | 243 |
| FR-V43-MDDOCS-01 | sed-replace "Aion" → "Liv" in all .md files in `/opt/liv-assistant/current/` (idempotent install-script extension) | 244 |
| FR-V43-UAT-01 | Operator E2E walk every Phase 238-244 deliverable; UAT-CHECKLIST.md sections per phase; close milestone on all green | 245 |

## Deferred (not in v43)

- Per-user Liv Assistant instances (multi-user) — same constraint as v42, requires the v7.0 multi-user activation work
- AionUi upstream version bump (currently pinned to vendored 2.1.4 tarball) — separate maintenance milestone
- Replacing AionUi entirely with a Livinity-native chat shell — v44+ design space
- Operator-signed plugin marketplace inside Liv AI (deferred from v42)
- Telegram / Lark / WeChat integration (AionUi features we don't surface)
- Office doc generation surfacing in LivOS file system (AionUi feature we don't surface)
- Bytebot-style per-session containerized computer use (v31 P71 territory, already deferred there)
- Multi-user Liv Assistant data isolation (v43 ships single-user same as v42)

## Locked invariants

- **D-V43-SACRED:** `liv/packages/core/src/sdk-agent-runner.ts` blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED across every commit. Pre-commit hook verifies.
- **D-V43-MINI-PC-ONLY:** Per the 2026-04-27 hard rule, Server4 + Server5 receive ZERO v43 commits. Mini PC `bruce@10.69.31.68` is the sole deploy target. Phase 245 UAT runs against Mini PC only.
- **D-V43-CADDY-REUSE-226-04:** Any Caddy edit reuses the `caddy.ts` pattern established in Phase 226-04 + extended through Phases 235/236/237. New matchers go into `livos/packages/livinityd/source/modules/domain/caddy.ts`. No ad-hoc Caddyfile edits on the Mini PC.
- **D-V43-SED-EXTEND-234-03:** Any new sed pass added to `scripts/install-liv-assistant.sh` follows the Phase 234-03 idempotency pattern (grep-pre-check → conditional sed → post-grep verify). Path scope stays inside `${CURRENT_LINK}/static/` (HTML/JS/CSS) UNLESS the phase explicitly targets .md files (Phase 244) — in which case path scope is `${CURRENT_LINK}/` with `.md` include.
- **D-V43-AUTH-BYPASS-PRESERVE:** Phase 234-04 `/liv-login` auth bypass continues to work across every v43 deploy. Each phase's deploy log MUST verify a `curl /liv-login` 302 + `Set-Cookie: aionui-session` non-regression check.
- **D-V43-APACHE-NOTICE:** Apache-2.0 LICENSE + NOTICE files at `/opt/liv-assistant/{LICENSE,NOTICE}` are UNTOUCHED across v43. sha256 PRE/POST gates every deploy log.
- **D-V43-REVERSIBLE:** Every user-visible change ships behind a Redis feature flag (e.g. `livos:v43:onboarding_cli_section`, `livos:v43:terminal_panel`) so the operator can roll back without code edits. Logo overlay + sed passes are reversible by re-extracting the tarball (Phase 234-03 rollback path documented + still applies).
- **D-V43-NO-UPSTREAM-FORK:** v43 does NOT fork AionUi. All changes live in the install script (asset overlay + sed pass), livinityd (MCP registrar + PTY backend), LivOS UI (onboarding section + terminal panel + Local Agents UI), or the `.claude/skills/` directory.

## Phase outline (see ROADMAP.md for full sequence)

```
238 — Complete AionUi visual + textual rebrand (logo + case-insensitive text)  [LOW, 4h]
239 — Onboarding "CLI Tools" section + remove "AI" section                       [MEDIUM, 1d]
240 — Local Agents — install-from-UI                                            [MEDIUM-HIGH, 1-2d]
241 — MCP auto-add Liv tools (Luse / docker / shell)                            [MEDIUM, 1d]
242 — Luse skill set for Claude Code (.claude/skills/luse/)                     [LOW, 4h]
243 — Persistent UI terminal (xterm.js + PTY backend)                           [HIGH, 2-3d]
244 — MD docs Aion → Liv text sed pass                                          [LOW, 2h]
245 — v43 E2E UAT + milestone close                                             [LOW, operator walk]
```

## Wave parallelization

- **Wave A:** 238 (rebrand) — fastest start, lowest risk, sets the visual baseline
- **Wave B (parallel after 238):** 239 (onboarding) | 244 (MD docs) | 242 (Luse skill)
- **Wave C:** 241 (MCP auto-add) — preceded by an investigation step
- **Wave D:** 240 (Local Agents UI) — depends on 241
- **Wave E:** 243 (terminal) — independent, biggest investment, can start any time after Wave A
- **Wave F:** 245 (UAT close) — gates milestone close

## Risk register

| Risk | Mitigation |
|---|---|
| Case-insensitive sed catches false positives (`fashion`, `champion`, `companion`) | Word-boundary regex (`\bAion\b`, `\baion\b`, `\bAION\b`) via `sed -E`. Phase 238-02 investigation pre-grep enumerates exact occurrences before the sed pattern is finalized |
| Logo asset paths inside AionUi bundle not at predictable locations | Phase 238-02 investigation SSH-walks `/opt/liv-assistant/current/static/` for all `*.svg`/`*.png` matching `logo|favicon|brand|aion` before Phase 238-01 author |
| MCP auto-add overwrites operator-customized MCP config | Phase 241 uses an idempotency sentinel + per-tool EXISTS gate; never overwrites operator-set entries |
| Local Agents install via UI bypasses operator audit trail | Phase 240 reuses `device_audit_log` table (v29.4 pattern); each install logs operator id + agent id + timestamp |
| Persistent terminal opens a privileged shell surface to the browser | Phase 243 reuses livinityd JWT auth (Phase 234-04 cookie pattern); PTY spawned as `bruce` not root; per-user PTY isolation when v43 multi-user re-activates |
| Terminal sessions accumulate without GC | Phase 243 includes a TTL (default 24h since last attach) + admin-visible Terminal session list with kill-by-id |
| MD docs sed pass over-rewrites attribution-required `Aion` mentions | Phase 244 excludes any path containing `LICENSE`, `NOTICE`, `UPSTREAM` and any markdown file that explicitly declares "upstream" or "attribution" in the first 10 lines |

## Success criteria

- Operator opens https://bruce.livinity.io/ → Liv AI iframe loads with Livinity logo (no AionUi logo)
- Operator inspects HTML/JS in DevTools → zero `Aion*` text (Phase 238 post-deploy probe)
- Operator runs onboarding wizard → "CLI Tools" section lists Claude Code / OpenCode / Gemini / OpenClaw / Aion CLI with install buttons (Phase 239)
- Operator opens Liv AI MCP config → Luse / docker / shell tools auto-registered (Phase 241)
- Operator opens Local Agents tab inside Liv AI → undetected CLIs show "Install" button + auth flow works end-to-end (Phase 240)
- Operator uses Claude Code agent in Liv AI → `.claude/skills/luse/` available, can issue natural-language commands like "click button at (x,y)" (Phase 242)
- Operator opens Terminal panel in LivOS shell → xterm session starts → operator types commands → reloads page → terminal still attached + history preserved (Phase 243)
- Operator reads downloaded help docs inside Liv AI → zero `Aion` references in user-facing copy (Phase 244)
- Phase 245 UAT walk every box checked → milestone archived

## Source artifacts

- Operator request: 2026-05-27 night chat, post-Phase 237 ship
- v42 closing position: `.planning/milestones/v42/PROJECT.md` + `.planning/milestones/v42/ROADMAP.md`
- v42 ship summary: `.planning/phases/237-aionui-ws-handshake-fix/237-SUMMARY.md`
- Pattern to extend (sed pass): `scripts/install-liv-assistant.sh` lines 181-298 (Phase 234-03 + 235)
- Pattern to extend (Caddy edits): `livos/packages/livinityd/source/modules/domain/caddy.ts` (Phase 226-04 / 235 / 236 / 237)
- Pattern to extend (auth bypass): `/liv-login` 302 + `Set-Cookie: aionui-session` (Phase 234-04)
- Livinity DS brand assets: `caddy/branding/{favicon.svg,livinity-overlay.css,manifest.json}` (Phase 232)

## Next step

`/gsd-execute-phase 238` (3 plans already authored: investigation + repo-side + deploy).
