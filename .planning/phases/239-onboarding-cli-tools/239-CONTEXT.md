# Phase 239: Onboarding "CLI Tools" section + remove "AI" section — Context

**Gathered:** 2026-05-27
**Status:** Ready for planning
**Mode:** Auto-resolved (--auto flag; recommended defaults selected per gray area)

<domain>
## Phase Boundary

Replace the existing Provider/AI step in the LivOS onboarding wizard (step 5 of 7) with a new "CLI Tools" step that lists 5 supported CLI agents (Claude Code, OpenCode, Gemini, OpenClaw, Aion CLI) as cards with one-click install buttons. Buttons call a livinityd-served install endpoint (whitelist-gated to these 5 CLIs). Install runs in-onboarding; auth deferred to post-onboarding (operator authenticates when first opening Liv AI).

**Scope:**
- New `cli-tools-step.tsx` in `livos/packages/ui/src/features/onboarding-flow/steps/`
- Update `constants.ts` STEP_NAMES + STEP_WEIGHT + OnboardingData type
- Delete `provider-step.tsx` + clean up `connect-ai-step.tsx` (if still referenced anywhere)
- New livinityd module `cli-installer/` exposing `installCli({name})` tRPC mutation (whitelist-gated)
- Reuse existing CLI detection logic from agent-runtime (Phase 200+ established this)
- D-239-FEATURE-FLAG: `livos:v43:onboarding_cli_section` Redis boolean (default `false`; operator flips via settings)

**Not in scope (deferred to other phases):**
- AionUi Local Agents tab "Available to Install" UI (Phase 240 — depends on the install endpoint this phase ships)
- Auth-flow inside onboarding (deferred — auth happens post-onboarding per first launch of Liv AI)
- New CLIs beyond the 5 listed (each new addition is its own phase)
- Onboarding wizard structural redesign (out of scope; this is 1:1 step replacement)

</domain>

<decisions>
## Implementation Decisions

### Step Position & Wizard Shape
- **D-239-01:** New CliTools step **replaces Provider** at slot index 4 (step #5 of 7). Step count stays at 7. STEP_NAMES becomes: `Welcome, Account, Wallpaper, Personalize, CLI Tools, Location, All set`.
- **D-239-02:** STEP_WEIGHT for CLI Tools step = 40 seconds (vs Provider's 35). Slightly higher because install actions may take 20-60s; total ETA bump is acceptable.
- **D-239-03:** OnboardingData type loses `provider?`, `authMode`, `otpSecret?`, `otpCode?` fields (Phase 196-03/196.1 AI auth state). Adds `cliInstalled: string[]` — array of CLI names successfully installed during onboarding (for telemetry + post-onboarding flows). No backwards-compat shim per CLAUDE.md "no shims" rule.

### File Deletions / Cleanups
- **D-239-04:** Delete `livos/packages/ui/src/features/onboarding-flow/steps/provider-step.tsx` + `provider-step.test.tsx`.
- **D-239-05:** Delete `livos/packages/ui/src/features/onboarding-flow/steps/connect-ai-step.tsx` + `connect-ai-step.test.tsx` (if any references remain — Phase 196.1 already merged its logic into provider-step; this is pure cleanup).
- **D-239-06:** Search-and-remove any remaining `provider` references in `setup-wizard-v2.tsx` and `use-stepper.ts`.

### Install Endpoint (foundational for Phase 240)
- **D-239-07:** New livinityd module at `livos/packages/livinityd/source/modules/cli-installer/`. Exports `installCli({name: string}) → {ok, output, exitCode}` tRPC mutation gated to a hardcoded `SUPPORTED_CLIS` whitelist (the same 5 names). NEVER accepts arbitrary commands — only whitelisted CLI names trigger their canonical install script.
- **D-239-08:** Each CLI's install script is a separate `scripts/install/cli/<name>.sh` shipped in repo (existing pattern). Examples:
  - `claude-code.sh` → `curl -fsSL https://claude.ai/install.sh | sh` (or per Anthropic docs)
  - `opencode.sh` → npm install -g opencode or equivalent
  - `gemini.sh` → npm install -g @google/gemini-cli
  - `openclaw.sh` → curl install from openclaw release
  - `aion-cli.sh` → npm install -g @iofficeai/aion-cli (or whatever the canonical pattern is)
  Research phase (gsd-phase-researcher) discovers exact install commands per CLI from official docs.
- **D-239-09:** `installCli` runs the script via `spawn` in a child process with stdout/stderr captured. Times out after 5 minutes. Returns `{ok: boolean, output: string, exitCode: number}`. UI shows a spinner during install, success/fail status after.
- **D-239-10:** Phase 240 EXTENDS this endpoint (does not replace) — it adds a second tRPC procedure for "uninstall" + a per-CLI "auth status" probe. Both phases share the `SUPPORTED_CLIS` whitelist as the single source of truth.

### CLI Detection (reuse from agent-runtime)
- **D-239-11:** Reuse the existing CLI detection from agent-runtime modules (`agent-runtime/agents/*` per Phase 200+). For each of the 5 CLIs, expose a `detectCli({name}) → {detected: boolean, version?: string, path?: string}` tRPC query. Research phase identifies the exact existing detection function(s).

### UI Card Grid
- **D-239-12:** Cards rendered in a responsive grid: 5 columns on `md` and above (single row), 2 columns on `sm`, 1 column on mobile. Card visual matches existing `provider-step.tsx` ProviderCardSpec aesthetic (icon + name + subtitle + status pill + action button).
- **D-239-13:** Each card has 3 visual states:
  - **Not installed** → "Install" button (primary)
  - **Installing** → spinner + "Installing…" pill
  - **Installed** → green check + "Installed ✓" pill, button hidden
  - **Failed** → red exclamation + "Retry" button + tooltip with error
- **D-239-14:** Continue button enabled WITHOUT requiring any installs (operator may skip — installs are optional). Wizard sets `cliInstalled = [list of names with "Installed" state]` on continue.

### Feature Flag & Migration
- **D-239-15:** D-239-FEATURE-FLAG implemented as Redis boolean key `livos:v43:onboarding_cli_section`. Default `false` (off). When `false`, wizard renders the OLD Provider step (no regression for in-flight onboardings). When `true`, wizard renders the new CliTools step. Operator flips via existing settings panel pattern (tRPC `mcp.config.*` analog — Phase 202+ established this).
- **D-239-16:** D-239-NO-AI-SECTION-DATA-LOSS verification: onboarding is first-run only; bruce-EQ on Mini PC already past onboarding so no live operator data to migrate. Any orphaned `OnboardingData.provider` state in Redis from past partial flows is harmless (key never read again). No migration needed; UAT confirms by checking Mini PC Redis has zero `provider:*` keys post-deploy.

### Auth Deferral
- **D-239-17:** No auth flow during onboarding. Operator finishes wizard with CLIs installed but unauthenticated. Auth happens later when operator first opens Liv AI and picks an agent (Phase 240 surface). This keeps onboarding fast (<2 min total).

### Claude's Discretion
- Card icon source for each CLI (use the existing AionUi-bundled icons if available; otherwise scaffold simple monogram circles matching Provider step's pattern)
- Exact copy for install button + status pills (English; aim for minimal text)
- Whether to surface install logs in a collapsible drawer on the card (nice-to-have; can defer to Phase 240 if scope grows)
- Test strategy for the install endpoint — unit test the whitelist + happy/error paths; do not actually run install scripts in CI (mock spawn)
- Whether to commit the install scripts together with the endpoint or as a follow-up sub-plan within Phase 239

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Onboarding wizard source
- `livos/packages/ui/src/features/onboarding-flow/constants.ts` — STEP_NAMES + STEP_WEIGHT + OnboardingData (update here for D-239-01..03)
- `livos/packages/ui/src/features/onboarding-flow/steps/provider-step.tsx` — current "AI" step being replaced; reference for card aesthetic + state machine pattern
- `livos/packages/ui/src/features/onboarding-flow/steps/connect-ai-step.tsx` — Phase 195-04 legacy, mostly absorbed into Provider; verify if delete-safe
- `livos/packages/ui/src/features/onboarding-flow/use-stepper.ts` — step routing logic
- `livos/packages/ui/src/routes/onboarding/setup-wizard-v2.tsx` — wizard mount + step registry
- `livos/packages/ui/src/features/onboarding-flow/step.tsx` — base step component

### Reusable existing patterns
- Phase 219 T3 `SYSTEM_MCP_NAMES` set in `mcp-config-router.ts` — pattern for whitelist-based source-of-truth
- Phase 241 `mcp-registrar/` module — closest analog for a new livinityd module under `modules/`
- `livos/packages/livinityd/source/modules/drain-install-pending-redis.ts` — boot-hook pattern (if installer needs warm-up)
- Existing tRPC procedures in `livos/packages/livinityd/source/modules/server/trpc/*-router.ts` — pattern for adminProcedure-gated mutations

### Cross-phase dependencies
- Phase 240 (Local Agents UI) — REUSES Phase 239's `installCli` endpoint. Plan must keep the API stable.
- Phase 241 (just shipped) — MCP layer; 239's CLI agents see Liv's MCPs once installed AND authenticated.
- ROADMAP.md Phase 239 section — feature flag + data-loss invariants

### Operator preferences (load-bearing)
- Mini PC ONLY deploy target
- `feedback_full_autonomous_no_questions` — autonomous chain, override cautious gates
- `feedback_v36_no_bold_redesigns` — additive micro-changes, screenshot between visual deltas; CLI Tools step should match existing card aesthetic, not invent a new visual language
- `feedback_livos_window_logic_no_url_routing` — no URL launchers, but onboarding is its own dedicated route (`/onboarding`), so this preference doesn't apply
- `user_language` — Turkish status updates; English in code/paths/commits

### Sacred + deploy
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST NOT change
- Mini PC sha256 `62f924594e81331afb159a9a50ef718ef3eb7e79cd5287d9bd2e4788cbab1bfe` byte-identical PRE/POST
- Deploy via `bash /opt/livos/update.sh` — builds UI via `pnpm --filter ui build`, restarts `livos` service (which includes UI bundle serve)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **ProviderCardSpec pattern** (`provider-step.tsx`) — card layout with icon + name + subtitle + enabled state. Adapt to CliToolCardSpec.
- **FooterBar + Continue/Skip/Back pattern** — same across all steps (`footer-bar.tsx`).
- **Step base component** (`step.tsx`) — handles the step container, header, ETA pill.
- **agent-runtime modules** (`livos/packages/livinityd/source/modules/agent-runtime/`) — likely has CLI detection logic from Phase 200+; researcher must locate.
- **`OnboardingData` + `setData()` pattern** — wizard state is lifted to a single object passed through props; new fields (`cliInstalled: string[]`) follow same pattern.

### Established Patterns
- **tRPC adminProcedure** for any state-mutating endpoint (D-202-21 / INV-202-05).
- **Module barrel pattern** — `mcp-registrar/index.ts` re-exports the module's public API; `cli-installer/index.ts` mirrors this.
- **Whitelist constant** — `SYSTEM_MCP_NAMES` Set pattern in `mcp-config-router.ts:67`; mirror for `SUPPORTED_CLIS`.
- **Spawn + capture pattern** — search for existing `child_process.spawn` uses in livinityd for stdout/stderr capture template.
- **Feature flag check at mount** — Redis GET → render switch. Existing pattern in router files.

### Integration Points
- Wizard mount: `setup-wizard-v2.tsx` step registry — replace `<ProviderStep>` with `<CliToolsStep>` (gated by D-239-15 feature flag)
- Constants: `constants.ts` — single source of truth for step count + names + weights
- livinityd boot: no new boot hook needed (cli-installer is request-driven, not boot-driven)
- tRPC server: extend existing trpc router with `cliInstaller.install` + `cliInstaller.detect` procedures

</code_context>

<specifics>
## Specific Ideas

- **Critical correctness:** D-239-07's whitelist gating is load-bearing. Never accept arbitrary `name` values — only the 5 names in `SUPPORTED_CLIS` map to install scripts. This is a remote-code-execution prevention boundary.
- **Operator framing:** Phase 239 is the LAST visible-UX phase of v43 before terminal (243). The CLI Tools step is the operator's first impression of "what agents does Liv ship with" — copy should be welcoming, not technical.
- **5 CLI list (final):** Claude Code, OpenCode, Gemini, OpenClaw, Aion CLI. Each with canonical install command discovered via research phase.
- **Performance target:** Install endpoint must complete in <5 min OR timeout cleanly. Each CLI install script's typical duration is 30-90s on Mini PC's NVMe.

</specifics>

<deferred>
## Deferred Ideas

- **Bundle install scripts repo-internal vs CDN-fetched** — currently planned repo-internal (`scripts/install/cli/`), but a CDN-fetched approach (always-fresh) could be a v44 idea.
- **Auth status indicator on cards** — Phase 240 may add "Authenticated" pill in Local Agents tab. Phase 239 cards stay binary (installed/not).
- **Bulk install action** — "Install all 5" mass button. Out of scope; operator picks per CLI.
- **Background install** — onboarding continues, install runs in background. Out of scope; current design is blocking-but-skippable.
- **Re-install / update flow** — Phase 240's territory.
- **First-run gate** — currently onboarding triggers on missing `livos:onboarding:complete` Redis key. No change for Phase 239; same gate.

</deferred>

---

*Phase: 239-onboarding-cli-tools*
*Context gathered: 2026-05-27 (auto-resolved via --auto)*
