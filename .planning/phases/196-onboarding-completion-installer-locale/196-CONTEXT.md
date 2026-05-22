# Phase 196: xAI Onboarding Completion + First-Run Installer + Locale

**Gathered:** 2026-05-22
**Status:** Ready for planning
**Source:** Operator directive 2026-05-22 — Phase 195 deferred items + onboarding UX polish + locale. After Phase 195 live runtime probe confirmed `xai-auth-router: flowService not injected` (predicted gap), operator scoped follow-on phase covering: install.sh idempotent installer, livinityd DI wire-up, provider→ConnectAi auto-route, region/location selection, locale + timezone configuration.
**Milestone:** v38.3 (closes the xAI onboarding loop started in Phase 195) — and pushes against the milestone goal of "Bootstrap Polish + First-Run UX" (v34.0 line) by completing the first-run installer.
**Wave priority:** 1 (blocks every subsequent xAI-driven phase: LangGraph agent, lean Livinity broker, all api.x.ai callers — none can do anything until DI wire-up + opencode binary are on Mini PC)

<live_runtime_evidence>
## Why this phase exists — confirmed by live probe 2026-05-22

After `bash /opt/livos/update.sh` shipped Phase 195 SHA `da5fe05` to Mini PC, a signed legacy JWT request to `http://127.0.0.1:8080/trpc/auth.xai.start?batch=1` returned:

```
HTTP 500
xai-auth-router: flowService not injected — call createXaiAuthRouter({flowService, credsService})
in livinityd boot, then setProductionAppRouter(createAppRouter({chromeMaster, xaiAuth}))

  at emptyInjectionStub (xai-auth-router.ts:145:8)
  at Object.get          (xai-auth-router.ts:153:11)
```

And `which opencode` returned `not-found`.

Both gaps were predicted by 195-VERIFICATION.md (status: human_needed), and they are now confirmed at the actual runtime layer. The error message is self-documenting and points to the exact fix.

Phase 196 closes both gaps + adds three new onboarding UX deliverables operator explicitly requested: provider→auth auto-route, region/location selection step, locale+timezone configuration step.
</live_runtime_evidence>

<domain>
## Phase Boundary

Five concrete deliverables, each a separate plan:

1. **livinityd DI wire-up** — instantiate `XaiAuthFlowService` + `XaiCredentialsService` as module-scope singletons in `livos/packages/livinityd/source/index.ts` and wire them through `createXaiAuthRouter({flowService, credsService})` into the `createAppRouter` call at line 854. Keeps the existing `setProductionAppRouter` swap pattern from Phase 103. After this lands, `trpc.auth.xai.start` returns a real `{flowId, url}` instead of throwing the empty-injection Proxy error.

2. **install.sh — idempotent first-run installer** — NEW root-level `install.sh` (counterpart to existing `update.sh`). One command for a fresh box: installs opencode CLI, system dependencies (node, pnpm, postgres, redis, caddy), creates bruce user + sudoers (mirrors Phase 192 fragment), installs systemd units, runs initial pnpm + tsc builds, seeds /opt/livos/.env defaults, brings all 4 services up. Re-runnable safely (every step idempotent: detect-then-skip pattern). Final step: invokes `update.sh` to take it the rest of the way. opencode install picks the right method per platform: Linux → `curl -fsSL https://opencode.ai/install | bash`; macOS → same; Windows-WSL → same. Preserves sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (never touches `liv/packages/core/src/sdk-agent-runner.ts`). Integrates with update.sh so opencode version pin is checked on every update.

3. **Onboarding provider-step xAI auto-route** — currently the wizard's provider-selection step shows multiple provider options and waits for a separate Continue click before advancing to ConnectAiStep. After Phase 196: selecting xAI immediately advances to ConnectAiStep (no intermediate confirmation). Other providers retain the current behavior (or stay disabled). Preserves the existing onboarding-flow `Props = {onContinue, onSkip, onBack}` contract from Phase 195. No new top-level wizard wave — just internal step transition logic.

4. **Onboarding region/location selection step** — NEW onboarding wave step. Suggests a region based on IP geolocation (server-side from CF-IPCountry header if present, or browser `Intl.DateTimeFormat().resolvedOptions().timeZone` → continent lookup). User picks one of: `Europe`, `North America`, `Asia`, `South America`, `Africa`, `Oceania`. Records selection to Redis key `liv:user:region`. Manual override supported (operator-facing list with country sub-pickers; defaults to suggestion). Step shows before ConnectAiStep so xAI auth can use region-aware messaging if needed in future.

5. **Locale + timezone auto-config** — NEW onboarding step that runs after region selection. Auto-detects timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and proposes UI locale (e.g. en-US, tr-TR, de-DE) from accepted-language header + region. Operator confirms or overrides. Persisted to Redis (`liv:user:timezone`, `liv:user:locale`). Systemd `timedatectl set-timezone <zone>` invoked via narrow sudoers-allowed Cmnd (extends Phase 192 fragment) for system clock alignment. UI date/time/number formatting honors the chosen locale via Intl APIs (no new i18n library — just `new Intl.DateTimeFormat(locale).format(...)` + `new Intl.NumberFormat(locale).format(...)` helpers).

**Hidden mechanics summary (not user-visible):**
- install.sh: 7-10 phases visible as colored CLI section headers (preflight → opencode-install → system-deps → bruce-user → sudoers → systemd-units → builds → env-seed → service-up). Every section starts with detect-then-skip guard.
- DI wire-up: 3-4 line diff in `livinityd/source/index.ts` (import singletons + extend createAppRouter call). Plus initialization order verification (XaiAuthFlowService can't start before opencode binary is installed; XaiCredentialsService can't start before auth-json directory exists).
- Provider-step routing: one if-branch in `onboarding-flow/wizard.tsx` (or wherever the wave transitions are decided).
- Region/locale: 2 new step components in `onboarding-flow/steps/`, both ≤200 LOC. Suggestion logic in a separate util for testability.
- timedatectl invocation: NOT directly from livinityd as root; goes through the narrow sudoers Cmnd_Alias pattern from Phase 192 (sacred boundary preserved).

**Verified facts (already known from Phase 195 live probe + Phase 192 sacred registry):**
- Mini PC currently has NO opencode binary (`which opencode = not-found`).
- livinityd boots clean even without DI wire-up (empty-injection Proxy doesn't throw until the procedure is actually called).
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST be preserved through all 196 commits.
- The narrow sudoers fragment `/opt/livos/scripts/sudoers/livos-bruce.conf` (Phase 192) is the security boundary for any root-required operations like timedatectl.
- Mini PC = bruce@10.69.31.68 = the only LivOS deployment that matters.
- update.sh deploys from GitHub clone, NOT from local git checkout (so install.sh must clone too).
</domain>

<decisions>

### Plan 196-01: livinityd DI wire-up (closes Phase 195 HUMAN-UAT #1)
- MOD `livos/packages/livinityd/source/index.ts` (around line 854 — current `createAppRouter({chromeMaster: chromeMasterRouterInjected})` call site)
- Add module-scope singletons:
  ```ts
  import { XaiAuthFlowService } from './modules/xai-auth/index.js';
  import { XaiCredentialsService } from './modules/xai-credentials/index.js';
  import { createXaiAuthRouter } from './modules/server/trpc/xai-auth-router.js';
  const xaiAuthFlowService = new XaiAuthFlowService();
  const xaiCredentialsService = new XaiCredentialsService();
  const xaiAuthRouterProductionInstance = createXaiAuthRouter({
    flowService: xaiAuthFlowService,
    credsService: xaiCredentialsService,
  });
  ```
- Extend `createAppRouter` call: `createAppRouter({chromeMaster: chromeMasterRouterInjected, xaiAuth: xaiAuthRouterProductionInstance})`
- Wire `setProductionAppRouter()` if Phase 103 pattern requires (audit the call site to confirm)
- Initialization ordering: xai-auth/xai-credentials must come AFTER any required boot prerequisites (logger, redis, postgres init) but BEFORE tRPC server starts listening
- Graceful degradation: if XaiCredentialsService constructor throws (e.g. auth.json directory inaccessible), log warning + still mount router with the working FlowService — at minimum `auth.xai.start` should be callable for first-time-user even before any auth.json exists
- Acceptance: live `curl -X POST http://127.0.0.1:8080/trpc/auth.xai.start?batch=1` with signed admin JWT returns 200 OK with `{flowId, url}` (NOT 500 emptyInjectionStub)
- Acceptance: `trpc.auth.xai.status` returns `{connected: false}` on a Mini PC without any prior xAI auth (clean state)

### Plan 196-02: install.sh — idempotent first-run installer
- NEW `install.sh` at repo root (sibling to `update.sh`)
- NEW `scripts/install/` directory housing the individual phase scripts (preflight.sh, opencode-install.sh, system-deps.sh, bruce-user.sh, sudoers.sh, systemd-units.sh, env-seed.sh)
- install.sh structure (mirrors `update.sh` color-banner style):
  ```
  ━━━ Pre-flight checks ━━━
    - Detect OS (Ubuntu 22.04/24.04 supported), arch, available RAM (≥4GB), available disk (≥10GB)
    - Refuse to run on the wrong distro with a clear error
  ━━━ Cloning latest ━━━
    - git clone https://github.com/utopusc/livinity-io.git /tmp/livinity-install-$$
    - cd /tmp/livinity-install-$$
  ━━━ System dependencies ━━━
    - apt: nodejs ≥20, build-essential, postgresql-16, redis-server, caddy, git, curl
    - Idempotent: check first via `dpkg -s` / `command -v`
  ━━━ Installing opencode CLI ━━━
    - curl -fsSL https://opencode.ai/install | bash
    - Pin version: opencode --version must report ≥1.15.0; downgrade not allowed
    - Add to PATH if missing
  ━━━ Bruce user + sudoers ━━━
    - useradd -m -s /bin/bash bruce (skip if exists)
    - chown -R bruce:bruce /home/bruce
    - Install sudoers fragment to /etc/sudoers.d/livos-bruce (Phase 192 boundary)
  ━━━ Systemd units ━━━
    - Copy livos.service + liv-core.service + liv-worker.service + liv-memory.service
    - systemctl daemon-reload
    - systemctl enable (but NOT start yet)
  ━━━ Initial build + seed ━━━
    - pnpm install --frozen-lockfile (in cloned repo)
    - pnpm --filter @livos/config build
    - pnpm --filter ui build
    - npm install + tsc in liv packages
    - Generate /opt/livos/data/secrets/jwt (64 random bytes if missing)
    - Generate Redis + Postgres credentials, write /opt/livos/.env
  ━━━ Service start ━━━
    - systemctl start livos liv-core liv-worker liv-memory
    - Health check (curl http://127.0.0.1:8080/health, retry 30s)
  ━━━ Done ━━━
    - Print onboarding URL: http://<lan-ip>:8080
  ```
- All sections idempotent — re-running install.sh on an already-installed box is a no-op
- Every section logs to `/tmp/livinity-install-$$.log` with timestamps
- Sacred SHA preserved (install.sh never touches `liv/packages/core/src/sdk-agent-runner.ts`)
- update.sh updated in same plan: adds opencode version-pin check (warns if `opencode --version < 1.15`)
- Acceptance: on a fresh Ubuntu 24.04 VM, single command `curl -fsSL https://livinity.io/install | bash` (or local `bash install.sh`) brings up a fully working LivOS in <10 min; on a re-run the script exits with "Already installed, no changes."
- Acceptance: opencode binary at `/usr/local/bin/opencode` after install.sh completes; `opencode auth login -p xai -m console` produces the expected device-code URL

### Plan 196-03: Onboarding provider-step xAI auto-route
- MOD `livos/packages/ui/src/features/onboarding-flow/wizard.tsx` (or the provider-selection step component — identify via grep at planning time)
- MOD the provider-selection step's onSelect handler — when user picks xAI, call `onContinue()` immediately without showing an intermediate confirmation panel
- For non-xAI providers (Claude, Kimi if still listed): retain current "select + click Continue" flow OR mark them disabled with "Coming soon" badges
- All existing wave-navigation Props `{onContinue, onSkip, onBack}` honored
- vitest + RTL test: selecting xAI in the provider step transitions to ConnectAiStep within one tick (no intermediate render)
- Acceptance: operator picks "xAI" → ConnectAiStep loads immediately (single click vs. previous two-click flow)
- Acceptance: backwards-compatible — picking any other provider OR clicking back still works
- Edge case: what happens if a user has already disconnected xAI and reaches this step again? → Auto-route into ConnectAiStep which will show the "Sign in with xAI" button (correct behavior, no special-casing needed)

### Plan 196-04: Region/location selection onboarding step
- NEW `livos/packages/ui/src/features/onboarding-flow/steps/region-step.tsx`
- NEW server-side suggestion helper `livos/packages/livinityd/source/modules/locale/region-suggestion.ts`
- 6 region options: Europe / North America / South America / Asia / Africa / Oceania
- Server-side suggestion: if Cloudflare `CF-IPCountry` header present in initial setup-wizard fetch, map ISO country → region. Otherwise null suggestion (let client side propose from timezone).
- Client-side fallback: if no server suggestion, use `Intl.DateTimeFormat().resolvedOptions().timeZone` (e.g. `Europe/Istanbul` → suggest "Europe").
- UI: 6 large clickable cards (or radio-style), suggested one pre-selected with a "Suggested by your location" pill
- Optional: country-level sub-picker collapsed by default — user can expand to refine
- Persistence: tRPC mutation `setup.setRegion({region, country?})` writes to Redis `liv:user:region` + `liv:user:country?`
- Props: `{onContinue, onSkip, onBack}` per existing wave contract; `onSkip` allowed (region can default to whatever IP suggests)
- vitest + RTL test: cards render, default suggestion pre-selected, click + Continue persists + advances
- Acceptance: operator on Turkish IP sees "Europe" pre-selected; clicking Continue without any change works fine
- Acceptance: operator can override to any other region freely

### Plan 196-05: Locale + timezone configuration step
- NEW `livos/packages/ui/src/features/onboarding-flow/steps/locale-timezone-step.tsx`
- NEW server-side `livos/packages/livinityd/source/modules/locale/timezone-service.ts`
- Auto-detect on step mount:
  - Timezone: `Intl.DateTimeFormat().resolvedOptions().timeZone` (e.g. `Europe/Istanbul`)
  - Locale: `navigator.language` (e.g. `tr-TR`)
- Show: detected values pre-filled, "Suggested" pill on each. Operator can override via standard searchable selects (timezone list = IANA database; locale list = our supported set, e.g. en-US, tr-TR, de-DE, fr-FR, es-ES, ar-SA)
- Persistence: tRPC mutation `setup.setLocaleTimezone({timezone, locale})` writes Redis keys + invokes systemd `timedatectl set-timezone <zone>` via narrow sudoers Cmnd
- Sudoers boundary: extend `/etc/sudoers.d/livos-bruce` with one new Cmnd: `Cmnd_Alias TIMEDATECTL = /usr/bin/timedatectl set-timezone *` then `bruce ALL=(root) NOPASSWD: TIMEDATECTL`. Extends Phase 192 fragment — must be in sacred SHA registry.
- UI Intl helpers: NEW `livos/packages/ui/src/lib/intl.ts` with `formatDate(date, locale)`, `formatTime(date, locale)`, `formatNumber(n, locale)` — used in dashboard/settings later
- Validation: timezone must match `Intl.supportedValuesOf('timeZone')` to avoid setting an invalid zone
- vitest test: timezone-service unit tests for systemd invocation (mock execSync); Intl helpers smoke-test
- Acceptance: operator in Turkey sees `Europe/Istanbul` + `tr-TR` pre-filled; clicking Continue runs `timedatectl set-timezone Europe/Istanbul` (verifiable via `cat /etc/timezone` after onboarding completes)
- Acceptance: setting an invalid timezone via API returns 400 (defense in depth — even though UI only offers valid options)
</decisions>

<deferred>

### Operator UAT walk-through (Phase 195 HUMAN-UAT #3)
- AFTER Phase 196 ships, operator runs the full setup wizard on Mini PC: provider → xAI auto-route → ConnectAi flow → region step → locale/timezone step → end. Closes Phase 195 HUMAN-UAT items #1, #3, #4 (via the DI wire-up + live OpenCode auth) and Phase 196's own UAT.
- Phase 195 HUMAN-UAT item #5 (voice endpoints throw without network) is already verified and will roll forward.

### Real i18n library (full UI translation)
- Phase 196 ships locale-aware date/time/number formatting via `Intl` only — NOT full UI text translation
- A full i18next or react-intl integration that translates every string in the UI is a separate phase (likely Phase 198 or v39.0 scope)
- Phase 196 locale selection writes to Redis so the future i18n phase has the operator's choice already on disk

### Other AI providers (Claude OAuth, Anthropic API, OpenAI, etc.)
- Phase 196 only polishes the xAI path. Other providers either retain manual selection (Phase 195 baseline) or stay disabled with "Coming soon" badges.
- When/if a new provider is added, the same provider-step pattern (auto-route on selection) should be extended — but that's a future phase, not this one.

### Server4 / Server5 deployment
- HARD RULE — Phase 196 does NOT deploy to Server4 (not our box) or Server5 (relay, not LivOS deployment surface).
- install.sh is for the Mini PC and any future LivOS instance the operator owns. Server5 retains its current Next.js + Marketplace stack and is NOT touched.
</deferred>

<sacred_constraints>

### Sacred SHA preservation
- `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST remain unchanged across every Phase 196 commit.
- Phase 192 sudoers fragment SHA (registered in sacred registry) MUST remain unchanged for the existing 6 Cmnd_Aliases. Plan 196-05 EXTENDS the fragment with one new Cmnd_Alias (TIMEDATECTL); this requires re-registering the fragment with a NEW sacred SHA. Coordinate this carefully — the registry will need updating during Plan 196-05.

### File scope (don't touch what's not in files_modified)
- Each plan lists exact files_modified. Don't bleed into other modules.
- Don't reintroduce any of the deleted modules: cc-pty, claude-runner, livinity-broker, vault-items, computer-use, autonomous-scheduler, AI Chat-coupled features.
- Don't touch `liv/packages/core/`, `liv/packages/worker/`, `liv/packages/mcp-server/` at all in Phase 196 (this is livinityd + ui surface only).

### Mini PC sole deployment target
- All install.sh + DI wire-up + UAT activity targets `bruce@10.69.31.68` ONLY.
- Server4 + Server5 references are forbidden in 196 plans.
</sacred_constraints>

<unknowns>

### Resolved at planning time by gsd-planner
1. Exact line numbers / function names in `livinityd/source/index.ts` for the createAppRouter call site → grep at planning time, lock in plan
2. Current provider-step file path (`features/onboarding-flow/steps/provider-step.tsx` or similar?) → grep + sketch the diff
3. Existing onboarding wave order (where to slot region + locale steps before/after ConnectAi?) → read wizard.tsx, decide
4. Whether locale UI strings need any new translations YET (probably no — keep English-only for Phase 196 UI text; just format dates/times/numbers per locale)
5. install.sh testing strategy → likely a clean Ubuntu 24.04 Docker container as smoke-test (can't burn a real VM for every test)

### Open questions for operator (only ask if essential)
- None expected — operator already locked the scope in the original directive. If gsd-planner hits any genuine ambiguity, it can checkpoint-ask, but default to "pick the reasonable interpretation and document it in the plan."
</unknowns>
