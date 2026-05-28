---
milestone: v43.0
status: partial
total_items: 41
passed: 0
pending: 41
failed: 0
generated: 2026-05-28
last_phase_shipped: 245
ship_status: artifact-complete, operator-walk pending
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
deploy_target: bruce@10.69.31.68 (Mini PC only; Server4 + Server5 OFF-limits per 2026-04-27 hard rule)
---

# v43.0 E2E UAT Checklist

Operator walk-through covering every Phase 238 → 244 deliverable shipped during the v43 milestone. Tick each box once visual / functional verification PASSES inside a real browser session against `https://bruce.livinity.io`. File an issue against the listed `Source` if any item FAILS.

Phases 239 / 240 / 241 / 243 each carried `human-verify` checkpoints that were **auto-approved** at ship time under `<full_autonomous_mode>` + `workflow._auto_chain_active=true`. The wire-level evidence was captured per phase; this checklist is the still-pending ceremonial visual walk.

---

## Phase 238: AionUi complete rebrand (logo + text)

Source: `.planning/phases/238-aionui-complete-rebrand/238-03-DEPLOY-LOG.md` (deployed SHA `09cb8ebf`)

- [ ] **HTML body shows zero `Aion*` word-boundary variants on `https://bruce.livinity.io/liv/`**
  - **Expected:** DevTools → View Source → `grep -iE '\b(Aion|AION|aion)\b'` returns 0 hits. Word "Liv" appears ≥ 3 times. No "AionUi" substring anywhere in the served HTML body.
  - **Source:** 238-03 DEPLOY-LOG Step D.6

- [ ] **Built-in skill rebrand is byte-correct: `https://bruce.livinity.io/liv/api/skills` JSON has zero `Aion` variants and ≥ 1 `Liv AI` / `liv-ai-skills` hit**
  - **Expected:** `curl -H 'Referer: https://bruce.livinity.io/liv/' https://bruce.livinity.io/liv/api/skills` → JSON body containing `"name":"liv-ai-skills"` + `"description":"...Liv AI Skills registry..."`. Backend internal path field `relative_location:"auto-inject/aionui-skills/SKILL.md"` is an accepted residual (Phase 238.2 documented).
  - **Source:** 238.2 DEPLOY-LOG Step D

- [ ] **Footer GitHub URLs point at `livinity.io` (not the broken `github.com/iOfficeAI/Liv AI/...` with a literal SPACE)**
  - **Expected:** Open `https://bruce.livinity.io/liv/` → scroll to footer or open Settings → click any GitHub-anchored link → destination URL is `https://livinity.io` (or a `livinity.io/*` path). NO `iOfficeAI` host appears in any browser tab navigation.
  - **Source:** 238.1 DEPLOY-LOG Step D

- [ ] **LivOS `apple-touch-icon`, browser-tab favicon, and Chrome address-bar tint all flipped to Livinity branding**
  - **Expected:** Browser tab favicon = Livinity donut (NOT the upstream AionUi PNG). Chrome address-bar theme color = `#1d1d1f` (Livinity black, NOT AionUi grey `#4E5969`). Mobile/PWA install icon = Livinity favicon SVG.
  - **Source:** 238.4 DEPLOY-LOG Step D.1

- [ ] **Default agent on first-page-load is Claude Code (NOT Aion CLI)**
  - **Expected:** Hard-reload `https://bruce.livinity.io/liv/` → agent picker lands on **Claude Code** by default. All three agents (Aion CLI / Claude Code / OpenCode) remain visible/selectable per operator preference ("cli kalabilir"); only the default lands on Claude.
  - **Source:** 238.3 DEPLOY-LOG STEP C

## Phase 238.x: AionUi rebrand polish (cumulative hot-fix chain)

Source: ROADMAP.md v43 section — Phase 238.5 through 238.9 inclusive

- [ ] **238.5 — LivOS desktop dock tile for Liv AI shows Livinity-themed icon (NOT upstream purple-blue gradient)**
  - **Expected:** Open LivOS shell at `https://bruce.livinity.io/` → desktop dock → Liv AI tile is `#1d1d1f` background with white speech bubble (NOT `#6366f1 → #3b82f6` gradient). Cache-bust `?v=238_5` in URL.
  - **Source:** ROADMAP Phase 238.5 (commit `99f4ecb6`)

- [ ] **238.6 — Sidebar top-left brand mark renders 'L'-shape / Livinity wordmark (NOT AionUi V-mountain SVG path)**
  - **Expected:** Open Liv AI → look at sidebar top-left logo container — visible mark is the Livinity logo. NO V-mountain (`M40 20 Q38 22 25 40...`) is rendered. NO small dot/smile-arc artifacts.
  - **Source:** ROADMAP Phase 238.6 (commit `94785c51`)

- [ ] **238.7 — Inline brand SVG anywhere it renders shows the REAL Livinity donut (outer circle + inner dot), NOT a bare 'L' letter**
  - **Expected:** Inspect any rendered brand surface (sidebar logo, dock tile, favicon) → the brand is the canonical Livinity donut (outer ring + inner small circle), matching `platform/web/public/favicon.svg` exactly. NO simple 'L' polygon survives anywhere.
  - **Source:** ROADMAP Phase 238.7 (commit `18737d3c`)

- [ ] **238.8 — Sidebar donut adapts to OS-level prefers-color-scheme via CSS bg-image**
  - **Expected:** Toggle OS or browser dark mode preference → reload `https://bruce.livinity.io/liv/` → sidebar donut color flips. Light mode = black ring + white dot, dark mode = white ring + black dot. AionUi's in-app Arco theme picker should also drive the flip via `[data-theme='dark']` override.
  - **Source:** ROADMAP Phase 238.8 (commit `997242c8`)

- [ ] **238.9 — Split light/dark favicon variants served correctly (CSS @media switch instead of broken SVG-internal @media)**
  - **Expected:** `curl -sS https://bruce.livinity.io/liv/branding/favicon-light.svg | head -3` → 459B SVG starts with outer `#0a0a0a` ring + `#ffffff` inner dot. `curl -sS https://bruce.livinity.io/liv/branding/favicon-dark.svg | head -3` → 446B with `#f5f5f7` ring + `#050507` inner dot. CSS in `livinity-overlay.css` flips between them by `prefers-color-scheme` AND `[data-theme]`. Sidebar brand identical to livinity.io website tab favicon behavior.
  - **Source:** ROADMAP Phase 238.9 (commits `d13bd1df` + `7842706a`)

## Phase 239: Onboarding CLI Tools

Source: `.planning/phases/239-onboarding-cli-tools/239-HUMAN-UAT.md` + `239-VERIFICATION.md`

- [ ] **Onboarding wizard renders CliToolsStep when feature flag is ON**
  - **Expected:** Open `https://bruce.livinity.io/onboarding` → DevTools console: `window.localStorage.setItem('livos.v43.onboarding_cli_section','true')` → hard-reload → navigate to step 5 → step header reads `05 · CLI Tools` and "Pick your CLI agents" → 5 cards visible in fixed order (Claude Code, OpenCode, Gemini, OpenClaw, Aion CLI) → Claude Code + OpenCode show `Installed ✓` pill (per detect-probe evidence) → Continue button ENABLED without any clicks → Continue advances to step 6 (Location).
  - **Source:** 239-HUMAN-UAT.md item 1 / 239-VERIFICATION.md human_verification[0]

- [ ] **Onboarding wizard renders flag-disabled informational notice when feature flag is OFF**
  - **Expected:** DevTools console: `window.localStorage.removeItem('livos.v43.onboarding_cli_section')` → hard-reload → navigate to step 5 → "This step is disabled" notice renders (NOT the deleted legacy ProviderStep) → notice mentions the `livos:v43:onboarding_cli_section` flag key → Skip advances to step 6.
  - **Source:** 239-HUMAN-UAT.md item 2 / 239-VERIFICATION.md human_verification[1]

## Phase 240: Local Agents — install-from-UI

Source: `.planning/phases/240-local-agents-install-from-ui/240-03-DEPLOY-LOG.md` Section E (UAT walks — 3 probes, all auto-approved)

- [ ] **UAT-1 (Detect): Local Agents tab renders "Available to Install" subsection with 3 not-detected CLI rows + 2 installed CLI rows**
  - **Expected:** Open `https://bruce.livinity.io/liv/` → click **Local Agents** tab → "Available to Install" subsection appears BELOW the detected-agents list → 3 install rows render for `gemini`, `openclaw`, `aion-cli` (each with an `Install` button; aion-cli's Auth button HIDDEN per `AUTH_UNSUPPORTED`). The pre-installed `claude-code` + `opencode` rows show `Installed ✓` + Auth button.
  - **Source:** 240-03 DEPLOY-LOG Section E UAT-1

- [ ] **UAT-2 (Install): Click `gemini` Install → row transitions to "Installing…" → "Installed ✓" within ≤ 300s + audit row written**
  - **Expected:** On the `gemini` row click **Install**. Button shows "Installing…" with spinner. Within 300s (INSTALL_TIMEOUT_MS) the row converts to "Installed ✓" with Auth button. Then from a separate terminal: `sudo psql -d livos -c "SELECT tool_name, success, timestamp FROM device_audit_log WHERE tool_name='cliInstaller.install' ORDER BY timestamp DESC LIMIT 1;"` returns one row with `success=true` and a fresh timestamp.
  - **Source:** 240-03 DEPLOY-LOG Section E UAT-2

- [ ] **UAT-3 (Auth): Click `gemini` Auth → device-code URL appears (truncated to ≤ 3 lines / 400 chars) + Redis status key set to `running` + audit row written**
  - **Expected:** Click **Auth** on the freshly-installed `gemini` row. Button shows "Authenticating…" with spinner. Output area surfaces the gemini device-code URL (tail-truncated to ≤ 3 lines / 400 chars per T-239-02-02 mitigation). From a separate terminal: `redis-cli -a "$(grep REDIS_PASSWORD /opt/livos/.env | cut -d= -f2)" GET liv:cli:auth:gemini` returns `running` during the 300s window. After Ctrl-C or AUTH_TIMEOUT_MS: `sudo psql -d livos -c "SELECT tool_name, success FROM device_audit_log WHERE tool_name='cliInstaller.auth' ORDER BY timestamp DESC LIMIT 1;"` returns one row.
  - **Source:** 240-03 DEPLOY-LOG Section E UAT-3

## Phase 241: MCP auto-add Liv tools (Luse / docker / shell)

Source: `.planning/phases/241-mcp-auto-add-liv-tools/241-04-SUMMARY.md` (3-walk UAT — all already executed live on Mini PC; operator walk re-confirms via UI)

- [ ] **First-boot UI walk — Liv AI MCP config shows all 5 Liv system MCPs (luse / liv-docker / liv-system / liv-apps / liv-vault) registered**
  - **Expected:** Open `https://bruce.livinity.io/liv/` → Settings → MCP Servers → list contains exactly these 5 entries (alongside any operator-added entries like `filesystem`): `luse`, `liv-docker`, `liv-system`, `liv-apps`, `liv-vault`. `luse` is in the "enabled" state. No duplicates.
  - **Source:** 241-04 SUMMARY UAT-1 (sentinel created=5 skipped=0 errored=0)

- [ ] **Idempotency UI walk — no duplicates appear after `redis-cli DEL livos:v43:mcp_seeded:v1 && systemctl restart livos`**
  - **Expected:** After the DEL + restart cycle, reload Liv AI's MCP Servers panel — still exactly 5 system MCPs (created=0, skipped=5). `luse.updated_at` timestamp UNCHANGED in the JSON detail panel (proves Pitfall 1 strict-name-match preserve was real).
  - **Source:** 241-04 SUMMARY UAT-1 (idempotency probe)

- [ ] **Customization preservation walk — operator edit to `liv-system` survives both no-op restart AND forced re-run**
  - **Expected:** From Liv AI's MCP UI: DELETE `liv-system` then re-POST with `transport.command=/operator/edit/marker` + `description=OPERATOR-EDITED-MARKER`. Restart `livos`. Reload UI — operator's edited values are STILL there (sentinel-SET fast path). Then `redis-cli DEL livos:v43:mcp_seeded:v1` + restart. Reload — operator edit STILL preserved (strict-name-match D-241-04 invariant).
  - **Source:** 241-04 SUMMARY UAT-2 (customization probe; cleanup restored canonical `/usr/bin/npx` payload)

## Phase 242: Luse skill set (universal / docs-only)

Source: `.planning/phases/242-luse-skill-set-universal/242-SUMMARY.md` (docs-only phase; no Mini PC deploy; cross-agent prose verification possible)

- [ ] **Cross-agent prose verification — ask the SAME natural-language Luse task to each agent inside Liv AI and confirm identical hint copy**
  - **Expected:** Inside Liv AI open a chat with **Claude Code** → ask "tell me what Luse's `click` tool does". Then repeat with **Aion CLI** then **OpenCode** then **OpenClaw**. Each agent's response paraphrases the SAME canonical text from `docs/luse/tools/click.md` (no agent-privileging language, no contradictory inputs/outputs). The "secrets-via-clipboard" warning from `docs/luse/tools/type.md` surfaces identically when asked about `type`.
  - **Source:** 242-SUMMARY D-242-A (canonical agent-agnostic single source of truth); Phase 245 CONTEXT cross-agent verification probe

- [ ] **Sync script idempotency proves cleanly — `bash scripts/sync-luse-skills.sh` second run reports `0 new / 0 updated / 9 unchanged`**
  - **Expected:** From the repo root: `bash scripts/sync-luse-skills.sh` → first invocation prints `Synced 9 shims (9 new / 0 updated / 0 unchanged)` (or `9 unchanged` if previously run). Run it again. Output line MUST end in `9 unchanged` with 0 new + 0 updated. No file mtimes change.
  - **Source:** 242-SUMMARY Verification table row "Sync script idempotent"

## Phase 243: Persistent UI terminal

Source: `.planning/phases/243-persistent-ui-terminal/243-SUMMARY.md` UAT Outcomes (3 probes — all auto-approved)

- [ ] **Probe 1 — Terminal dock entry appears + xterm window opens + bash prompt visible within ~2 seconds**
  - **Expected:** Confirm Redis flag first: `redis-cli GET livos:v43:terminal_panel` → returns `'true'`. Open `https://bruce.livinity.io/` (LivOS shell, NOT the `/liv/` Liv AI iframe). A **Terminal** dock entry is visible. Click it → an xterm.js window opens with theme `bg #0b0b0c / fg #e7e7e8 / cursor #7dd3fc`. Within ~2 seconds a `bruce@bruce-EQ:~$` prompt appears.
  - **Source:** 243-SUMMARY UAT Probe 1

- [ ] **Probe 2 — `whoami` in the terminal returns literal `bruce` (NEVER `root`)**
  - **Expected:** Inside the terminal window type `whoami` + Enter. Output line is exactly `bruce`. Type `id` + Enter — `uid=` line shows the bruce uid, not 0. (D-243-NO-ROOT enforced at type system + runtime guard + test drift-lock; no code path can return root.)
  - **Source:** 243-SUMMARY UAT Probe 2

- [ ] **Probe 3 — Closing the terminal window kills the server-side PtySession cleanly (journalctl `pty-terminal` SIGHUP)**
  - **Expected:** Note the session id displayed in the terminal panel's status pill. Close the window. From a separate SSH session: `sudo journalctl -u livos -n 50 | grep pty-terminal` → most recent entries show a session-close + SIGHUP for that session id. `redis-cli HGETALL livos:pty:session:<sessionId>` returns empty (or marked closed). No zombie node-pty process: `pgrep -af node-pty | grep <sessionId>` returns nothing.
  - **Source:** 243-SUMMARY UAT Probe 3

- [ ] **Instant rollback drill — `redis-cli SET livos:v43:terminal_panel false` hides the dock entry without restart**
  - **Expected:** With the dock open: `redis-cli SET livos:v43:terminal_panel false`. Reload `https://bruce.livinity.io/` once. The Terminal dock entry disappears. Open any window context that previously hit the terminal route — it falls back to `LegacyTerminalWindowContent`. Reset to `true` and confirm the dock entry returns. No `systemctl restart` needed at any point.
  - **Source:** 243-SUMMARY "Operator rollback (instant, no code revert)" + D-243-FLAG-ROLLBACK

## Phase 244: MD docs Aion → Liv text

- [ ] **N/A — Phase 244 OBSOLETED 2026-05-27 (superseded by Phase 238.2)**
  - **Expected:** No UAT required. Mini PC probe found 0 `.md` files under `/opt/liv-assistant/current/`; all AionUi markdown lives in `data/builtin-skills/` which Phase 238.2 already covered. ROADMAP Phase 244 row is explicitly marked `⏭️ OBSOLETED`.
  - **Source:** ROADMAP.md Phase 244 entry + STATE.md "Phase 244 OBSOLETED" note

## Phase 245: v43 E2E UAT + milestone close (THIS phase)

Source: this checklist + `.planning/milestones/v43/v43-SHIP-NOTES.md`

- [ ] **`.planning/milestones/v43/v43-UAT-CHECKLIST.md` exists and renders correctly in operator's editor**
  - **Expected:** Open this file. Frontmatter visible at top. Every phase 238 → 244 represented with at least one item. Total item count in frontmatter matches the rendered checkbox count.
  - **Source:** Phase 245 Task 1 deliverable

- [ ] **`.planning/milestones/v43/v43-SHIP-NOTES.md` exists with `## What landed` / `## What's deferred` / `## Operator UAT status` sections**
  - **Expected:** Open the file. All three sections present. "What landed" lists every phase 238 → 243 with a one-line headline outcome. "What's deferred" aggregates each phase SUMMARY `<deferred>` content.
  - **Source:** Phase 245 Task 2 deliverable

- [ ] **`.planning/phases/245-v43-e2e-uat-milestone-close/245-SUMMARY.md` exists**
  - **Expected:** Phase directory exists. SUMMARY frontmatter `status: complete`. `key_files.created` lists the UAT checklist + ship notes paths.
  - **Source:** Phase 245 Task 3 deliverable

- [ ] **STATE.md Current Position reflects "Phase 245 SHIPPED 2026-05-28" + v43 milestone status "complete pending operator walk"**
  - **Expected:** Grep STATE.md for `Phase 245`. Top-of-file Current Position banner names Phase 245 as the most recent ship. v43 milestone note marks the artifact-complete-but-operator-walk-pending state explicitly.
  - **Source:** Phase 245 Task 3 deliverable

- [ ] **ROADMAP.md Phase 245 row flipped from `🟡 PLANNED` to `✅ SHIPPED 2026-05-28 (1/1 plan)`**
  - **Expected:** Grep ROADMAP.md for `### Phase 245:` heading — line shows `✅ SHIPPED 2026-05-28 (1/1 plan)`. Plans checklist below shows the one plan ticked `[x]`.
  - **Source:** Phase 245 Task 3 deliverable

---

## How to run

1. Open `https://bruce.livinity.io` in a fresh browser session (or hard-reload if already open). Sign in normally.
2. Walk each section above in order. Inside each section, perform the listed verification — visit the URL, click the UI, run any side-terminal commands referenced.
3. Tick the checkbox `[x]` once the expected behavior matches what you see. **Do not tick a box on partial / uncertain matches** — leave it as `[ ]` and add a note under the item.
4. If an item FAILS, leave the checkbox `[ ]`, append a one-line note ("FAIL: <symptom>"), and file an issue against the listed `Source` file/SHA. Phase 238.x items reference the ROADMAP.md entry which holds the canonical ship commit hash.
5. Once every applicable box is ticked (Phase 244 is documented N/A), update this file's frontmatter: bump `passed` to the new total, drop `pending` to zero, flip `status` to `complete`.
6. When `status: complete` is reached, the v43.0 milestone is fully closed and v44 planning may begin.

**Operator note:** Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` for `liv/packages/core/src/sdk-agent-runner.ts` was preserved across every Phase 238 → 245 commit via the pre-commit hook. Any unexpected change to that file constitutes an automatic FAIL against the entire milestone — do not tick any boxes if `git hash-object liv/packages/core/src/sdk-agent-runner.ts` returns anything other than the SHA above.
