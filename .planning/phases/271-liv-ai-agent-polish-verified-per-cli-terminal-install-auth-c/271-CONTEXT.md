# Phase 271: Liv AI agent polish — Context

**Gathered:** 2026-06-15
**Status:** Ready for planning
**Source:** Authored directly (gsd-planner agents not installed in this env; deep context from the v44.22 implementation session)

<domain>
## Phase Boundary

Follow-up polish to the v44.22 AionUi/Terminal overhaul (SHIPPED + operator-confirmed working). THREE cohesive sub-items, all small-to-medium:

A. **Per-CLI Terminal install+auth command correctness.** After v44.22 (commit a1d664a1), the Liv AI "Agents" panel's Install/Auth route to the real LivOS Terminal via `livos/packages/ui/src/hooks/use-cli-auth-bridge.ts` → `runCliInTerminalFallback()`, which maps a CLI NAME → a FIXED command from `CLI_AUTH_COMMANDS` (auth) / `installCommandFor()` (install). Several auth commands are Phase-253 guesses that may be WRONG in a real TTY (e.g. `codex auth login`, `qwen auth`, `qodercli`, `codebuddy`). Deliverable: a VERIFIED per-CLI install+auth command matrix, kept drift-locked with the server-side source of truth (`livos/packages/livinityd/source/modules/cli-installer/auth.ts` CLI_AUTH_COMMANDS + `install-scripts.ts`).

B. **Real brand logos for the 9 monogram agents.** v44.22 (commit 463712b1) made `logoCandidates()` use ONLY the LivOS static `/agent-logos/<name>.svg`; 10 CLIs have a static SVG, 9 fall to a monogram. Ship real brand SVGs for: openclaw, augment (auggie), codebuddy, qoder (qodercli), factory-droid (droid), hermes, nanobot, snow, kiro → `livos/packages/ui/public/agent-logos/` + set `logo:'<name>'` in CLI_META (`scripts/aionui-patches/local-agents-install-section.js`).

C. **Console-noise cleanup.** Three remaining noisy log/error lines in the Liv AI surface: (1) `[httpBridge] stub: googleAuth.status not yet implemented in backend` (logged ×2); (2) `/trpc/displays.getVncUrl` → 404; (3) cross-origin `favicon.ico` fetches (google.com, antigravity.google) blocked by CORS. Investigate root cause of each; suppress or fix.

OUT OF SCOPE: the AionUi vendored bundle itself (patched only via scripts/aionui-patches/*); the chat picker logic (already correct post-v44.22); anything in phases 272 (OAuth) / 273 (Layer-B guard).
</domain>

<decisions>
## Implementation Decisions

### A — auth/install command matrix (LOCKED)
- Source of truth = `livos/packages/livinityd/source/modules/cli-installer/auth.ts` (CLI_AUTH_COMMANDS) + `install-scripts.ts` (install scripts, CLI_BIN_NAMES). The UI mirror in `use-cli-auth-bridge.ts` MUST stay drift-locked (it already carries a "drift-lock" comment).
- VERIFY each of the 20 CLIs against its UPSTREAM docs: the correct install command AND the correct interactive auth/login command (some CLIs auth via `<cli> login`, some `<cli> auth login`, some via API-key env, some have NO standalone auth). Produce a matrix table (CLI → install cmd → auth cmd → auth type → upstream-doc citation). Fix any wrong entries in BOTH the UI mirror and auth.ts (keep them identical).
- Known-suspect entries to scrutinize first: codex (`codex auth login`?), qwen-code (`qwen auth`?), qoder-cli (`qodercli`?), codebuddy (`codebuddy`?), github-copilot (`copilot`?), nanobot/snow-cli/mistral-vibe (no auth cmd in the current map → confirm whether they need one).
- Binary-name drift also in scope: detector looks for `cursor-agent` but the installed binary is `cursor`; `kimi-cli` looks for `kimi` but installed is `kimi-cli`. Reconcile CLI_BIN_NAMES with AionUi's own binary_name set (claude→claude, cursor→cursor, qwen→qwen, …).

### B — logos (LOCKED)
- SVGs go in `livos/packages/ui/public/agent-logos/<name>.svg`, served at `/agent-logos/<name>.svg`. Filename must match the `logo:'<name>'` value set in CLI_META.
- Use accurate brand marks (monochrome/simple where the brand has no clean SVG). If a clean SVG can't be sourced for one, leave it monogram (acceptable) and note it — do NOT ship a wrong/placeholder logo.
- After adding, set `logo:'<name>'` in CLI_META for each shipped one (`scripts/aionui-patches/local-agents-install-section.js`).

### C — console noise (LOCKED)
- googleAuth.status stub: it's an httpBridge stub (`[httpBridge] stub: googleAuth.status not yet implemented`). Either implement a no-op `{authenticated:false}` response OR silence the stub log. Prefer a real minimal handler returning a stable shape so the SPA stops logging.
- displays.getVncUrl 404: a tRPC route the Liv AI surface calls that doesn't exist (or is mis-pathed). Find the caller; either add the route or guard the call so it doesn't fire / 404.
- favicon CORS: AionUi (or the panel) fetches remote favicons for agent links (google.com, antigravity.google) and the cross-origin image load is CORS-blocked. Lowest-risk fix: stop fetching remote favicons for those links (use a local asset or none), OR add `referrerpolicy/crossorigin` handling. If it's AionUi-internal (vendored), document it and suppress at the patch level if reachable; otherwise mark as won't-fix-here.

### Claude's Discretion
- Exact SVG sourcing per brand; whether to batch all 9 logos or ship the clean ones first.
- Whether each console-noise item is a real fix vs a suppression (decide per root cause).
- Test approach (live `bruce@10.69.31.68` Terminal verification for the auth commands is the gold standard).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Liv AI agent panel + bridge
- `scripts/aionui-patches/local-agents-install-section.js` — the Agents panel (CLI_META, logoCandidates, the 20-CLI list).
- `livos/packages/ui/src/hooks/use-cli-auth-bridge.ts` — Install/Auth → Terminal routing + CLI_AUTH_COMMANDS + installCommandFor (UI mirror; drift-lock target).
- `livos/packages/livinityd/source/modules/cli-installer/auth.ts` — server-side CLI_AUTH_COMMANDS (SOURCE OF TRUTH).
- `livos/packages/livinityd/source/modules/cli-installer/install-scripts.ts` — SUPPORTED_CLIS, CLI_BIN_NAMES, CLI_VERSION_ARGS, install-script resolution.
- `livos/packages/ui/public/agent-logos/` — static brand SVGs (10 present; 9 to add).

### Memory / background
- [[project_local_agents_panel_anatomy]] — AionUi detection model, the v44.22 fixes, the open follow-ups (this phase).
</canonical_refs>

<specifics>
## Specific Ideas
- The 9 monogram CLIs (CLI_META key → static-svg name to ship): openclaw→openclaw, augment→auggie, codebuddy→codebuddy, qoder-cli→qodercli, factory-droid→droid, hermes-agent→hermes, nanobot→nanobot, snow-cli→snow, kiro→kiro.
- The 10 already with logos: claude, opencode, gemini, codex, qwen(qwen-code), github-copilot, goose, cursor(cursor-agent), kimi(kimi-cli), mistral(mistral-vibe).
- Live test path: `ssh -i .../minipc bruce@10.69.31.68`; open the Terminal in the UI and run each auth command, OR run the command directly on the box to confirm it's the right invocation.
</specifics>

<deferred>
## Deferred Ideas
- favicon CORS if it turns out to be purely AionUi-vendored-internal and unreachable from the patch → document + mark won't-fix-here.
</deferred>

---

*Phase: 271-liv-ai-agent-polish*
*Context gathered: 2026-06-15 (authored directly)*
