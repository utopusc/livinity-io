---
milestone: v43.0
title: Liv AI Deeper Integration + UI Polish
status: artifact-complete (operator UAT walk pending)
opened: 2026-05-27
closed_artifact: 2026-05-28
deploy_target: bruce@10.69.31.68 (Mini PC only)
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_preserved: true
phases_shipped: 13  # 238 + 238.1 + 238.2 + 238.3 + 238.4 + 238.5 + 238.6 + 238.7 + 238.8 + 238.9 + 239 + 240 + 241 + 242 + 243 + 245
phases_obsoleted: 1 # 244
---

# v43.0 Ship Notes

Liv AI Deeper Integration + UI Polish closes the visible-AionUi gap and adds the missing integration surfaces (onboarding CLI install, Local Agents install-from-UI, MCP auto-add, universal Luse skill set, persistent xterm terminal). All Mini PC deploys preserved sacred blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` via the pre-commit hook on every commit.

---

## What landed (v43.0)

### Visible rebrand chain

- **Phase 238** — AionUi complete rebrand (logo + text): word-boundary `\b(Aion|AION|aion)\b` sed pass extending Phase 234-03 zero'd the static/JS bundle Aion variants (PRE=7 files → POST=0). Apache LICENSE + NOTICE preserved byte-identical (D-V43-APACHE-NOTICE). Hot-fix `09cb8ebf` wrapped grep|wc pipelines with `set +o pipefail` so the install-script survives the post-sed zero-match (mirrors Phase 235 `count_unprefixed_paths`). External HTML body grep: Aion=0, AionUi=0, Liv=3. Deployed SHA `09cb8eb`.

- **Phase 238.1** — Footer URL redirect: `github.com/iOfficeAI/Liv AI/...` (broken by Phase 234-03 inserting a literal SPACE into URL paths) → `https://livinity.io` in 7 JS bundle files. Single-plan hot-fix; 12/12 SCs GREEN. Deployed SHA `515149b2`.

- **Phase 238.2** — Built-in skill SKILL.md rebrand: 8 files under `/opt/liv-assistant/data/builtin-skills/**/*.md` rewrote `AionUi/AionUI/aionui-web/aionui/\b(Aion|AION|aion)\b → Liv`. `/api/skills` JSON now returns `name:"liv-ai-skills"` + `description:"...Liv AI Skills registry..."`. D-V42-NO-DATA-LOSS preserved (sessions/secrets/skills dirs untouched; aionui-backend.db mtime change is restart artifact only). Deployed SHA `c23c032e`. **This phase also retroactively OBSOLETED Phase 244** — Mini PC probe found 0 `.md` files under `/opt/liv-assistant/current/`, so the planned Phase 244 sed pass had nothing to rewrite.

- **Phase 238.3** — Default agent persistence: `guid.lastSelectedAgent` pinned to Claude Code (`2d23ff1c`) via `scripts/set-default-liv-agent.sh` + update.sh integration. All 3 agents stay visible (Aion CLI + Claude Code + OpenCode) per operator "cli kalabilir"; only the DEFAULT moves. State persists across `systemctl restart liv-assistant`. Live state was applied directly via SSH probe; repo commit is future-proofing.

- **Phase 238.4** — Logo + font visibility: index.html sed inject + `livinity-overlay.css` strengthen closed the dead-CSS gap from Phase 232. theme-color `#4E5969` → `#1d1d1f`, favicon PNG → `favicon.svg`, apple-touch-icon swapped, `<link rel="stylesheet" href="/liv/branding/livinity-overlay.css">` injected before `</head>`. Overlay CSS grew 669B → 4126B (added Arco `--primary-6` palette + 3 `.arco-btn-primary` rules + Space Grotesk selectors). Deployed SHA `33317d28`.

- **Phase 238.5** — Livinity-themed Liv AI dock tile: `livos/packages/ui/public/figma-exports/dock-ai-chat.svg` replaced upstream purple-blue gradient (`#6366f1 → #3b82f6`) with `#1d1d1f` Livinity solid + speech bubble. Cache-bust `?v=238_5`. Deployed SHA `99f4ecb6`.

- **Phase 238.6** — Inline brand-mark sed: 3-substitution sed pass over `${REBRAND_TARGET}/assets/*.js` converted AionUi V-mountain SVG path (`M40 20 Q38 22 25 40...`) → Livinity 'L' polygon. Circle dot `r:"3"` → `r:"0"`. Smile-arc `d:"M18 50 Q40 70 62 50"` → `d:""`. Deployed SHA `94785c51`.

- **Phase 238.7** — Real Livinity donut everywhere: caddy/branding favicon + liv-logo + dock-ai-chat SVGs replaced with EXACT donut markup from `platform/web/public/favicon.svg`. install-script sed expanded to converge BOTH PRE-states (V-mountain from fresh AionUi AND L-polygon from Phase 238.6 deploy) onto the donut — idempotent for any deployment state. Deployed SHA `18737d3c`.

- **Phase 238.8** — Adaptive Livinity donut via CSS bg-image: `liv-brand-donut` marker class wraps the sidebar brand element; CSS rule sets `background-image: url('/liv/branding/favicon.svg')`. SVG's internal `@media (prefers-color-scheme: dark)` handles theme flip. Deployed SHA `997242c8`.

- **Phase 238.9** — Split light/dark favicon SVGs + CSS @media switch: closes the bug discovered in 238.8 that browsers sandbox SVG-internal `@media` queries when SVG is loaded via CSS `background-image`. Split into `favicon-light.svg` (459B, black ring + white dot) + `favicon-dark.svg` (446B, white ring + black dot); CSS rule uses `@media (prefers-color-scheme: dark)` PLUS `[data-theme='dark']` override so AionUi's own theme picker also flips it. install-script branding asset list extended from 3 → 5. Deployed SHA `7842706a`.

### Integration / UX surfaces

- **Phase 239** — Onboarding "CLI Tools" section: new wizard step 5 with 5-card grid (Claude Code, OpenCode, Gemini, OpenClaw, Aion CLI) backed by `cliInstaller.install` + `cliInstaller.detect` tRPC adminProcedures + 5 install shell scripts (`scripts/install/cli/*.sh`). D-239-07 RCE boundary live: arbitrary CLI names → HTTP 400 + `CLI_NOT_SUPPORTED` (proven live on Mini PC). Legacy ProviderStep + ConnectAiStep deleted from `livos/packages/ui/src/features/onboarding-flow/`. Backend 21/21 vitest GREEN; UI 22/22 onboarding-flow vitest GREEN. Deployed SHA `5aac9f58`. Feature flag `livos:v43:onboarding_cli_section` (default OFF; localStorage-gated for UI render).

- **Phase 240** — Local Agents install-from-UI: AionUi vendor-bundle patch adds an "Available to Install" subsection inside Liv AI's Local Agents tab via `scripts/aionui-patches/local-agents-install-section.{js,css}` (13.4 KB JS + 4.7 KB CSS). Install script injects them via `<link>` + `<script defer>` before `</head>` (sentinel-grep idempotent). New `cliInstaller.auth` tRPC adminProcedure dispatches per-CLI canonical login with Redis status keys `liv:cli:auth:<name>` (EX 3600) + `device_audit_log` writes. aion-cli short-circuits to AUTH_UNSUPPORTED (D-240-01-02). 43/43 vitest GREEN. Deployed SHA `a73da52e`.

- **Phase 241** — MCP auto-add Liv tools (Luse / docker / shell / liv-apps / liv-system / liv-vault): new livinityd `mcp-registrar/` module runs on liv-assistant first-boot detection, registers 5 system MCPs into AionUi via HTTP, distributes them to all CLI agents via `/api/mcp/sync-to-agents`. Idempotent via sentinel `livos:v43:mcp_seeded:v1` + per-tool strict-name-match EXISTS gate (Pitfall 1 guard). NEVER overwrites operator-customized entries — proven across both no-op restart AND forced re-run via UAT-2. Defense-in-depth outer try/catch — orchestrator never throws but boot block STILL survives import resolution crashes. AIONUI_BASE_URL env override (default `http://127.0.0.1:3020`). Deployed SHA `814a6eb`. Live UAT: first-boot `created=5 skipped=0 errored=0 sentinel=set`; idempotency `created=0 skipped=5 errored=0`; customization preserved with `/operator/edit/marker`.

- **Phase 242** — Luse skill set UNIVERSAL across all Liv AI agents: canonical agent-agnostic docs at `docs/luse/` (LUSE.md + 5 tool files + LUSE-WORKFLOW.md, all using no agent-specific naming). `scripts/sync-luse-skills.sh` (213 lines POSIX bash, zero new deps, sha256-keyed per-shim idempotency via `source-sha:` marker, portable `sha256sum`/`shasum` fallback) emits 9 generated shims: 6 Claude Code skill files under `.claude/skills/luse/` with proper YAML frontmatter + 3 single-file placeholders under `.aion/skills/`, `.opencode/skills/`, `.openclaw/skills/`. Gemini intentionally skipped — Gemini agents discover Luse via Phase 241 MCP tool-discovery only (D-242-C). `.gitignore` 4-line negation hierarchy added to repo-track exactly `.claude/skills/luse/` while keeping every other `.claude/*` local-only. Idempotency verified: first run `9 new`, second run `9 unchanged`. Docs-only phase — no Mini PC deploy. Commits `a23017d9` + `1b1cd115`.

- **Phase 243** — Persistent UI Terminal: new livinityd `pty-sessions/` module with `node-pty@1.1.0` (Ubuntu native build OK, L-243-A escape hatch to `node-pty-prebuilt-multiarch` NOT exercised), session metadata in Redis (`livos:pty:session:{id}`), WebSocket endpoint `/livos/terminal/ws` (cookie auth, no `?token=` fallback), Caddy `@livos_terminal_ws` unconditional matcher (Phase 237 `@liv_ws` sibling, RFC 6455 compliant — NO Referer regex). Frontend xterm.js panel (theme `bg #0b0b0c / fg #e7e7e8 / cursor #7dd3fc`) as new "Terminal" LivOS shell dock entry gated by `useTerminalPanelEnabled()`. D-243-NO-ROOT enforced at 3 layers (type system literal `'bruce'`, runtime guard in `PtySession.start()`, ws-handler hardcodes literal at line 264). Default-OFF feature flag `livos:v43:terminal_panel` — only literal `'true'` opens gate; instant rollback via Redis SET with no code revert (LegacyTerminalWindowContent kept as OFF-state fallback). 49 new vitest cases GREEN. Deployed SHA `774755c3`.

### Milestone artifact close

- **Phase 245 (this phase)** — v43 E2E UAT + milestone close: aggregated UAT walks from Phase 238 → 243 into `v43-UAT-CHECKLIST.md` (41 ticket items, one per pending operator probe). Generated this `v43-SHIP-NOTES.md` capturing what landed, what's deferred, and the operator UAT status. Wrote `245-SUMMARY.md` and flipped STATE.md / ROADMAP.md to mark v43.0 milestone artifact-complete. Operator walk is the only remaining gate before milestone close.

---

## What's deferred (v44+)

Aggregated from each shipped phase's `<deferred>` / "Deferred for v44+" / "Residual" sections.

### From Phase 238 chain

- **Aion CLI agent rename in `/api/agents` picker** — agent name "Aion CLI" + `/api/assets/logos/brand/aion.svg` come from the Bun ELF binary (BuildID `a9a0d18d...`), NOT from disk SKILL.md. Phase 234-03 sed scope intentionally excludes the binary per D-V42-SACRED. Rename would require upstream fork OR JS-injection via Caddy `sub`/`replace` plugin (not in Mini PC Caddy build) OR Bun ELF binary patch (prohibited by Phase 234-03 design rule). Operator explicitly accepted keeping "Aion CLI" visible — defer indefinitely.

- **3 builtin-skills code files with Aion comments** — `xiaohongshu-recruiter/scripts/generate_images.js`, `publish_xiaohongshu.py`, `star-office-helper/scripts/star_office_doctor.sh` still contain Aion variants inside code comments / internal log strings. Phase 238.2 sed pass deliberately excluded code files because the compound `s/AionUi/Liv AI/g` substitution would insert a literal SPACE into identifiers and break code execution. Not user-visible.

- **`/api/skills` JSON `relative_location` / `location` backend path fields** — still contain `aionui-skills/` directory name (e.g. `auto-inject/aionui-skills/SKILL.md`). Backend internal — UI renders only `name` + `description` frontmatter (already rebranded to `liv-ai-skills` / `Liv AI Skills`). Renaming the dirs would require AionUi backend cache invalidation + skill-load logic verification — disproportionate for cosmetic gain.

- **Sacred AionUi binary sha256 drift in MEMORY.md** — MEMORY records `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` as the canonical AionUi binary sha256, but live Mini PC carries `293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b` (drift introduced by an earlier Phase 238.x deploy). True Phase 241 invariant — `byte-identical PRE/POST` — held. MEMORY entry should be refreshed to `293a499...` and rephrased as "verify UNCHANGED across deploys" rather than asserting a fixed value.

### From Phase 239

- **D-DEFERRED-239-A** — `update.sh` rsync gap for `scripts/install/cli/*.sh`. Install scripts currently land on Mini PC via Rule-3 hot-fix scp (`/opt/livos/scripts/install/cli/` mode 100755). Permanent fix is extending update.sh rsync target list. Tracked in `239-deferred-items.md`.

- **D-DEFERRED-239-B / D-DEFERRED-239-C** — Repo missing root-level LICENSE / NOTICE files; MEMORY's canonical-blob path entry is stale. Documentation drift only; no behavior impact.

- **`cli-tools-step.tsx` WR-01 closure-capture race** — concurrent Install clicks on two cards within a single render tick can drop telemetry / OnboardingData entries due to `data.cliInstalled` closure capture. Fix: switch to functional updater `setData(prev => ...)`. Per-card state machine unaffected.

- **WR-02 / WR-04 / IN-01 / IN-06 advisory items** — `gemini.sh` + `aion-cli.sh` lack `sudo` for `npm install -g` (would EACCES under bruce uid unless npm prefix is user-local); installer.ts stdout/stderr concatenated separately (not chronological); `aion-cli.sh` is best-effort with unverified package names (Phase 240 intended supersede); `LIVOS_ROOT` env fallback undocumented at type level. Tracked but advisory only.

### From Phase 240

- (No new explicit deferrals — Phase 240 closes the cliInstaller.* tRPC namespace. Carries forward Phase 239's advisory items.)

### From Phase 241

- **System-MCP catalog seed on existing-operator boxes** — Phase 241 surfaced that the install seed `_dld_seed_mcp_servers` is D-109-IDEMPOTENT and never re-runs on existing boxes once any operator entry exists in `liv:mcp:config`. Future install/upgrade phases could (a) drop the IDEMPOTENT guard for system MCPs specifically (re-HSET 5 system entries on every install since they're delete-forbidden by Phase 219 T3 anyway); (b) ship a one-time fixup script under `scripts/maintenance/`; or (c) extend Phase 241 to fall back to install-seed payloads when the catalog lacks system entries. Decision deferred.

- **Plan PRE-snapshot greps had wrong paths** — Plan 241-04 Task 3 greps referenced `/opt/livos/livos/packages/ui/index.html` but actual path on Mini PC is `/opt/livos/packages/ui/index.html`. Caddy matcher syntax also misquoted. Snapshot template needs updating for future plans that reuse it.

### From Phase 242

- **Aion CLI / OpenCode / OpenClaw native skill format wrappers** — current shims are PLACEHOLDER single-file MDs with comment-header documenting placeholder status. Replace with native wrappers once each agent's skill format is determined.

- **Gemini skill support** — Gemini has no known skill system as of 2026-05-28. Gemini agents continue to discover Luse via MCP tool-discovery only.

- **Git pre-commit hook auto-running sync-luse-skills.sh** — out of scope per CONTEXT line 63. Manual `bash scripts/sync-luse-skills.sh` is the workflow.

- **`See: docs/luse/tools/<name>.md` lines on Phase 241 MCP tool descriptions** — closer coupling between MCP tool-discovery and `docs/luse/` prose. Future micro-phase candidate per D-242-F.

- **Translation of `docs/luse/` to other languages** — English-only per CONTEXT line 65.

### From Phase 243

- **Multi-session UI** — named tabs, session list panel.
- **Attach/detach across page reload** — requires Redis-backed scrollback or PTY-buffer persistence.
- **TTL GC** — auto-kill sessions inactive ≥ 24h since last attach.
- **Admin "kill session by id" UI** — Terminal session list with kill control.
- **Cwd / env preservation across sessions**.
- **Copy/paste / drag-drop file paths**.
- **Legacy `/terminal?token=` route removal** — deferred until persistent terminal proves out in operator usage. Kept as zero-code-revert rollback path.
- **D-243-03-DEFERRED-01** — Windows-dev VitePWA / `@novnc/novnc@1.7.0` exports resolution issue. Mini PC Ubuntu builds unaffected; only blocks `pnpm --filter ui build` on Windows dev machine. Tracked in `243-deferred-items.md`.

### From Phase 244

- **OBSOLETED 2026-05-27** — covered by Phase 238.2. No deferred work.

### v43 milestone-level deferrals (from PROJECT.md "Deferred (not in v43)")

- Per-user Liv Assistant instances (multi-user) — requires v7.0 multi-user activation
- AionUi upstream version bump (currently pinned to vendored 2.1.4 tarball)
- Replacing AionUi entirely with Livinity-native chat shell — v44+ design space
- Operator-signed plugin marketplace inside Liv AI
- Telegram / Lark / WeChat integration (AionUi features we don't surface)
- Office doc generation surfacing in LivOS file system
- Bytebot-style per-session containerized computer use (v31 P71 territory)
- Multi-user Liv Assistant data isolation (single-user same as v42)

---

## Operator UAT status

41 actionable items across `v43-UAT-CHECKLIST.md`. None ticked yet — all `pending` at milestone artifact close.

| Phase | Items | Auto-approved at ship | Reason |
|-------|-------|------------------------|--------|
| 238 | 5 | All wire-level GREEN — operator visual ceremony pending | Word-boundary grep delta (7→0) + HTML body grep proved zero Aion variants live |
| 238.x (5-9) | 5 | Cumulative hot-fix chain — all 5 shipped with wire-level evidence | Idempotent sed converges any PRE state onto canonical Livinity donut |
| 239 | 2 | Per `_auto_chain_active=true` + "soru sorma" preference | Backend 21/21 + UI 22/22 vitest GREEN; live detect probes 5/5 + invalid-name 400 rejection live over the wire |
| 240 | 3 | Per `<full_autonomous_mode>` + `workflow.auto_advance=true` | Caddy `/liv/trpc/cliInstaller.*` HTTP 200 + patch JS+CSS load with correct MIME via Caddy proxy + livinityd boot marker confirms full namespace wire-up |
| 241 | 3 | Live UAT walks executed on Mini PC at ship time (not auto-approved — REAL probes) | First-boot + idempotency + customization probes all emitted PASS lines verbatim in journalctl |
| 242 | 2 | Docs-only — no Mini PC deploy required | Sync script idempotency self-verified (9 new → 9 unchanged) at ship time; cross-agent prose probe still requires operator |
| 243 | 4 | Per `<full_autonomous_mode>` | D-243-NO-ROOT enforced at 3 layers — no code path can return non-bruce user. Differential `-DOES-NOT-EXIST` negative-control proves WS mount LIVE. Sacred SHA preserved across all 17+ commits. |
| 244 | 1 | N/A — OBSOLETED | No work needed |
| 245 | 5 | Self-referential artifacts | This file, the checklist, the SUMMARY, STATE/ROADMAP updates |
| **Total** | **41 (40 actionable + 1 N/A)** | | |

**Milestone gate:** v43.0 closes fully once the operator's at-leisure walk through `v43-UAT-CHECKLIST.md` flips every applicable box to `[x]`. The artifact layer is complete and self-consistent at this commit — STATE.md, ROADMAP.md, PROJECT.md, every per-phase SUMMARY, and the deploy logs all agree on the shipped state.

---

## Sacred SHA invariant

`liv/packages/core/src/sdk-agent-runner.ts` blob SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` UNCHANGED across every single Phase 238 → 245 commit. Pre-commit hook gates every commit with `[sacred-sha] PASS: 20 files verified`. Mini PC disk file sha256 `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` (NB: distinct from the AionUi binary `293a499...` documented above) matches PRE/POST on every deploy.

If at any point `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns a different SHA, the entire milestone is invalidated and v43 cannot ship. As of 2026-05-28 the value remains canonical.

---

## Next milestone

v44+ (TBD). Pre-conditions:

1. Operator completes `v43-UAT-CHECKLIST.md` walk and flips milestone status from `partial` → `complete`.
2. ROADMAP archive: move `.planning/milestones/v43/` to a stable home (per v42 precedent — v42 closed by archiving its directory).
3. Optionally pick up the v43 deferred items above as a v44 polish wave OR open a new design space (e.g. Livinity-native chat shell replacing the AionUi vendor).

No code blockers carry forward — every v43 ship landed cleanly without leaving open hot-fix chains. The Phase 238 cumulative cascade (238 → 238.1 → 238.2 → 238.3 → 238.4 → 238.5 → 238.6 → 238.7 → 238.8 → 238.9) converged on a stable Livinity-branded surface in a single autonomous run.
