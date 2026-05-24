# Phase 206: Unified Provider+Model Config via openclaw Native CLI — Specification

**Created:** 2026-05-24
**Ambiguity score:** 0.185 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

Operator picks a default model from any openclaw-supported provider (35+ available), connects via OAuth or API key inline in the Liv AI Settings → Providers tab, and the next chat message succeeds without a "missing provider" error — replacing Phase 204's gateway env file path which writes to a location the running openclaw agent never reads.

## Background

**Verified live on Mini PC 2026-05-24 (after Phase 205 Hot-fix N+O shipped):**

1. `openclaw 2026.5.20` is the in-process agent runtime (PID 1369066, spawned by `liv-claw-gateway`). It reads provider credentials from `$OPENCLAW_STATE_DIR/agents/main/agent/auth-profiles.json` where `OPENCLAW_STATE_DIR=/opt/livos/data/openclaw`.

2. Phase 204's `provider.config.set` tRPC procedure writes API keys to `/opt/livos/etc/liv-claw-gateway.env` via `EnvFileWriter`. Live inspection: the env file contains only `LIV_API_KEY=...` despite 6 providers being "saved" via the Phase 205 Hot-fix O ProvidersTab UI. **The agent never reads this file** — confirmed by `openclaw capability model auth status` returning `auth.storePath: /opt/livos/data/openclaw/agents/main/agent/auth-profiles.json` and `missingProvidersInUse: ["openai"]`.

3. Operator's chat surface fails with `"No API key found for provider 'openai'. Auth store: /opt/livos/data/openclaw/agents/main/agent/auth-profiles.json"` because `defaultModel: openai/gpt-5.5` was set in `openclaw.json` but no auth profile exists for `openai`.

4. The `/models` slash command in the chat surface returns `amazon-bedrock (84), openai (1)` — opencode's hardcoded provider catalog defaults, not the actual configured providers from auth-profiles.json. xAI is connected via OAuth (verified: `~/.local/share/opencode/auth.json` contains `["xai"]`) but **does not appear in `/models` output** because the gateway's provider enumeration ignores auth-profiles state.

5. **Upstream research (2026-05-24 by technical-researcher agent):** `thesysdev/openclaw-os` (the project we forked into `livos/packages/liv-claw-os/`) has NO provider auth UI at all. Its `SettingsDialog.tsx` is a gateway-URL + shared-secret form only. The canonical openclaw web pattern is "credentials managed via CLI; web UI just observes." `auth-profiles.json` canonical shape is `{ version:1, profiles: { '<provider>:<name>': {type:'api_key'|'oauth', provider, key} } }`. The fork's ProvidersTab is original work without an upstream port to align with — confirmed correct adaptation given LivOS controls the host.

6. **Native CLI surface (test-verified):**
   - `openclaw capability model providers` → JSON-lines per provider with `{provider, count, defaults[], available, configured, selected}`
   - `openclaw capability model list` → JSON-lines per model with `{id, name, provider, contextWindow, reasoning, input}`
   - `openclaw capability model auth status` → JSON with `{configPath, agentDir, defaultModel, resolvedDefault, auth: {storePath, providersWithOAuth, missingProvidersInUse, runtimeAuthRoutes}}`
   - `openclaw capability model auth login --provider X --method Y` → spawns the auth flow (OAuth device-code OR API key prompt depending on method)
   - `openclaw capability model auth logout --provider X --json`

7. **Known upstream issues to flag:** GitHub openclaw#58106 — OpenRouter models hidden in default model picker (`models.list` without `view:'all'` parameter omits them). Phase 206 must use `view:'all'` or shell-out fallback to surface OpenRouter's 265 models.

The phase replaces the dead env file path with a thin tRPC wrapper around the verified CLI surface, exposes per-provider OAuth/API-key flows in the existing N+O ProvidersTab shell, adds a default-model picker to the same tab, and migrates `defaultModel` writes from `openclaw.json` direct-edit to upstream-aligned `sessions.patch` / `agents.defaults.model.primary` semantics.

## Requirements

1. **`openclaw.*` tRPC namespace replaces `provider.config.*`**: A new livinityd tRPC router shell-execs the openclaw CLI binary and surfaces JSON output as tRPC procedures.
   - Current: `provider-config-router.ts` writes to `/opt/livos/etc/liv-claw-gateway.env` which the agent ignores. No CLI bridge exists in livinityd.
   - Target: New `openclaw-router.ts` exposes at minimum: `openclaw.providers.list` (query), `openclaw.models.list` (query — uses `view:'all'` to include OpenRouter per upstream issue #58106), `openclaw.auth.status` (query), `openclaw.auth.login` (mutation — spawns CLI with `--provider X --method Y`, surfaces URL+flowId for OAuth or prompts for API key inline), `openclaw.auth.logout` (mutation), `openclaw.config.setDefaultModel` (mutation — patches `agents.defaults.model.primary` in `openclaw.json`).
   - Acceptance: Each procedure callable via `callQuery`/`callMutation` from claw-client; live Mini PC test returns the same JSON shape as the native CLI binary; `provider-config-router.ts` and the `/opt/livos/etc/liv-claw-gateway.env` write path are no longer invoked by any UI surface.

2. **xAI OAuth flow uses native `auth login --provider xai --method <method>`**: The Phase 195 xai-auth-router (which spawns `opencode auth login -p xai -m "xAI Grok OAuth (Headless / Remote / VPS)"` directly) is generalized to call openclaw's `capability model auth login --provider xai --method <method>` instead.
   - Current: `xai-auth/flow-service.ts` + `xai-auth/url-extractor.ts` hardcoded to xAI-specific `auth.x.ai/oauth/device` URL regex and opencode invocation. Other providers cannot use this surface.
   - Target: New generic `auth-flow-service.ts` accepts `{provider, method}` parameters; spawns `openclaw capability model auth login --provider <p> --method <m>`; parses URL from stdout via a per-provider URL pattern table (xai pattern preserved; openrouter+anthropic+openai patterns added as those become testable). `auth.xai.*` paths remain for back-compat — internally delegate to the generic surface.
   - Acceptance: `openclaw.auth.login` mutation with `{provider:'xai', method:'<headless method>'}` returns the same `{flowId, url, startedAt}` shape as the existing `auth.xai.start`; live Mini PC test confirms xAI OAuth still works end-to-end and lands the token in `auth-profiles.json` (NOT only in `~/.local/share/opencode/auth.json` like today).

3. **ProvidersTab default-model picker**: The N+O ProvidersTab gets a "Default model" selector at the top, populated from `openclaw.models.list` results grouped by provider.
   - Current: ProvidersTab has no default-model picker. Default model lives in `openclaw.json` set by Phase 203 install scripts; operator has no UI to change it.
   - Target: At the top of ProvidersTab, render a `Default model: [provider/model-id ▾]` combo populated by `openclaw.models.list` (live, `view:'all'`). Selection writes via `openclaw.config.setDefaultModel`. Picker disables until at least one provider is configured. Below the picker is the existing provider card grid (Hot-fix O).
   - Acceptance: Picker shows ≥100 models across ≥10 providers (OpenRouter alone has 265); selection persists via `openclaw.json` write and survives `systemctl restart liv-claw-gateway`; the chat surface's existing model dropdown (`SessionComposer.tsx`) reads the same value as the new default.

4. **Provider card status reflects `auth-profiles.json` reality, not env file**: Each provider card's "Connected / Not connected" pill reads from `openclaw.auth.status` instead of `provider.config.list`.
   - Current: Pill driven by `provider.config.list` which only knows about gateway env file entries — false positives (operator sees "Connected via API key" while the agent has no profile).
   - Target: Pill driven by `openclaw.auth.status.auth.runtimeAuthRoutes[].status` (`configured` / `missing`) + the providersWithOAuth list. xAI badge "Connected via xAI account" stays but data source is `auth.runtimeAuthRoutes` for `provider:'xai'`.
   - Acceptance: After running `openclaw capability model auth logout --provider xai` on Mini PC, the xAI card in the UI flips to "Not connected" within one refetch cycle. After running `auth login` for any provider, the card flips to "Connected".

5. **xAI exit acceptance — OAuth lands in `auth-profiles.json`**: The xAI OAuth flow that already works in N+O must, after Phase 206 ships, land credentials in `/opt/livos/data/openclaw/agents/main/agent/auth-profiles.json` (not just `~/.local/share/opencode/auth.json`).
   - Current: xAI OAuth completes successfully but credentials are written to bruce's opencode store, which is on a different code path than the openclaw agent reads.
   - Target: `openclaw capability model auth login --provider xai` is the spawn target; it writes to `auth-profiles.json` per the upstream auth-profile contract.
   - Acceptance: Operator completes xAI OAuth flow; `cat /opt/livos/data/openclaw/agents/main/agent/auth-profiles.json` shows an `xai:default` entry with `type:'oauth'`; `openclaw capability model auth status` returns `providersWithOAuth: ['xai']`; `/models` slash command in chat shows xai provider in the listing.

6. **OpenRouter exit acceptance — API key flow works end-to-end**: Operator pastes an OpenRouter API key in the ProvidersTab; the next chat message routed to an OpenRouter model succeeds.
   - Current: OpenRouter is NOT a recognized provider in `provider-router.ts` `ALLOWED_PROVIDERS` list and has no card in the N+O ProvidersTab (only 6 providers hardcoded).
   - Target: OpenRouter appears as a provider card driven by `openclaw.providers.list` (no manual hardcoding — the CLI already returns `{provider:'openrouter', count:265, available:true}`). API key paste calls `openclaw capability model auth login --provider openrouter --method api-key` (or whatever the CLI accepts for API-key input — verified in Discuss phase via `--help`). Model picker (Requirement 3) lists OpenRouter's 265 models.
   - Acceptance: After pasting an OpenRouter API key, `auth-profiles.json` contains `openrouter:default` with `type:'api_key'`; the default-model picker can select an OpenRouter model (e.g., `openrouter/anthropic/claude-3-haiku`); sending a message with that model selected returns a streaming response from OpenRouter.

7. **Phase 204 Save-key UI surface no longer reachable**: The ProvidersTab body that calls `provider.config.set` is replaced; operators cannot trigger a write to the dead gateway env file from the UI.
   - Current: N+O ProvidersTab calls `callMutation('provider.config.set', ...)` which writes to `/opt/livos/etc/liv-claw-gateway.env`.
   - Target: ProvidersTab calls only `openclaw.auth.*` and `openclaw.config.*` procedures. The `provider.config.*` tRPC routes still EXIST in livinityd (deferred deletion for migration safety per operator-locked SPEC interview Round 1 answer) but are unreachable from the UI surface.
   - Acceptance: Grep of `livos/packages/liv-claw-os/packages/claw-client/src/` returns zero references to `provider.config.set` or `provider.config.delete`; restarting livinityd + reloading the UI shows no path from any button click to those routes (verified via livinityd debug log or grep of compiled bundle).

8. **`/models` slash command surfaces configured providers**: The chat surface's `/models` output reflects the configured providers from `auth-profiles.json`, not opencode's catalog defaults.
   - Current: `/models` returns `amazon-bedrock (84), openai (1)` regardless of actual auth state. Misleads operator into thinking those providers are usable when they have no auth.
   - Target: `/models` returns only providers that appear in `auth.runtimeAuthRoutes` with `status:'configured'` (or `providersWithOAuth`). xAI + OpenRouter shown after Requirement 5 + 6 succeed.
   - Acceptance: After completing xAI OAuth and pasting an OpenRouter API key, `/models` in chat returns at minimum `xai (14), openrouter (265)` — and amazon-bedrock + the unauthed openai are gone unless separately authenticated. (Note: if the slash command source code lives in openclaw itself, this requirement may need to be deferred / addressed via filtering at our claw-plugin layer — confirm during Discuss phase.)

## Boundaries

**In scope:**
- New livinityd `openclaw-router.ts` tRPC namespace (`openclaw.*`) wrapping the verified native CLI surface
- Generalization of Phase 195 `xai-auth-router.ts` → `auth-flow-service.ts` (provider-agnostic) with back-compat shim for `auth.xai.*` paths
- ProvidersTab redesign body changes: Default model picker (top), provider cards reading from `openclaw.auth.status` (middle), card grid driven by `openclaw.providers.list` (replaces hardcoded PROVIDER_NAMES)
- xAI + OpenRouter exit acceptance E2E on Mini PC (the 2 operator-locked required providers)
- `/models` slash command output corrected to reflect `auth-profiles.json` reality (or claw-plugin filtering if upstream lacks the hook)
- `provider-config-router.ts` decoupling from UI (route remains for now; UI no longer calls it)
- sw.js CACHE_VERSION bump to evict v12 (Hot-fix N+O cache)

**Out of scope:**
- Removal of `provider-config-router.ts` source file + `EnvFileWriter` module + sudoers drop-in + `/opt/livos/etc/liv-claw-gateway.env` infrastructure — operator chose "PLAN.md'de çözülür" (decide during planning) for migration strategy; deletion deferred to a future cleanup phase
- Migration of any existing keys from `/opt/livos/etc/liv-claw-gateway.env` to `auth-profiles.json` — env file is empty in production (only LIV_API_KEY); no migration data to move
- Anthropic, OpenAI/Codex, Groq, Mistral, Google, GitHub Copilot, Ollama provider acceptance — these come through generically via `openclaw.providers.list` (the CLI lists them all), but their per-provider E2E test is not a gate for this phase. Operator narrowed to xAI + OpenRouter as required. The others must NOT regress — they get cards via the generic path, but if a method label doesn't match openclaw's expected method string, the connect button surfaces an error (acceptable for this phase)
- Mobile MobileSettingsDialog — content-swap was kept desktop-only in Phase 205 Hot-fix N. Mobile remains modal-based until a follow-up phase
- Chat composer's per-session model dropdown (`SessionComposer.tsx`) refactor — it already reads from `availableModels` engine state; Phase 206 just adds a writer for the GLOBAL default
- WebSocket RPC migration (upstream `models.list` WS pattern vs our CLI shellout) — research confirmed CLI shellout is the right adaptation given livinityd controls the host; switching to WS RPC is a separate architectural decision out of scope here
- Anthropic Max subscription detection / broker subscription badge — already separately wired via `BROKER_FORCE_ROOT_HOME` in `claude.ts`; not part of Providers tab
- New provider additions beyond what openclaw 2026.5.20 already supports (35+) — we surface what the binary already knows
- Bypassing the auth-profiles.json browser-never-sees-raw-key invariant — keys flow through tRPC server-side only; the UI receives only previews / status, never raw values (carries forward Phase 204 INV-204-04)

## Constraints

- **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST remain preserved** across all Phase 206 commits (INV-203-01 → INV-205-21 carry-forward; pre-commit hook at `.husky/pre-commit` enforces this).
- **English-only UI strings (INV-204-02 carry-forward)** — Turkish only in operator-facing live-status messages during execution; never in compiled bundles.
- **`OPENCLAW_STATE_DIR=/opt/livos/data/openclaw` MUST be the resolved state dir** for every CLI shellout from livinityd. Setting this env var on the spawned child is mandatory because the openclaw default is `~/.openclaw` which would diverge from the running agent's actual state.
- **Browser must never receive raw API keys** — INV-204-04 carry-forward. The `openclaw.auth.status` and `openclaw.providers.list` procedures return only metadata; key paste flows POST the key to livinityd and the key never reaches the response.
- **Mini PC only deploy (INV-204-03 carry-forward)** — Server4 / Server5 deploy is explicitly OFF the table per operator hard rule.
- **livinityd shell-spawn safety** — argv is passed as an array (never via `shell:true`); provider names + method names validated against an allow-list before invocation. Defense-in-depth carries forward from Phase 195 T-195-01-01.
- **OAuth flow lifetime ≤ 10 minutes per provider** — matches Phase 195's xAI ceiling; CLI's natural process death after 10min is sufficient cleanup. Browser-side polling cadence: 2s (carries forward from N+O xAI UX).
- **`pnpm exec tsc --noEmit` and `pnpm build` (claw-client) MUST pass before commit** — same gate as N+O. Vitest assertion coverage for new `openclaw-router.ts` procedures is required but does not block iteration speed.
- **CLI shellout timeout** — each `capability model providers` / `capability model list` / `capability model auth status` call must complete in under 10 seconds on the Mini PC under nominal load. The livinityd procedure surfaces a typed timeout error if exceeded; UI shows "Couldn't reach openclaw — try again" banner.
- **`provider.config.*` routes MUST remain compile-clean during this phase** — they are not removed but they are not called from the UI. Their tests (Phase 204 vitest coverage) MUST continue to pass.

## Acceptance Criteria

- [ ] `openclaw.providers.list` tRPC query returns the same JSON-lines parsed output as `openclaw capability model providers` on Mini PC (verified by diffing CLI output against tRPC response)
- [ ] `openclaw.models.list` tRPC query returns at minimum 100 models across at least 10 providers (proves `view:'all'` workaround for #58106 is wired)
- [ ] `openclaw.auth.status` tRPC query response shape matches the CLI's `capability model auth status` JSON 1:1
- [ ] `openclaw.auth.login` with `{provider:'xai'}` starts the device-code flow and surfaces a URL + flowId; completing the OAuth flow in a browser writes an `xai:default` entry to `/opt/livos/data/openclaw/agents/main/agent/auth-profiles.json` (verified via `cat`)
- [ ] `openclaw.config.setDefaultModel` with `{model: 'openrouter/anthropic/claude-3-haiku'}` updates `openclaw.json` `agents.defaults.model.primary`; survives `systemctl restart liv-claw-gateway`
- [ ] ProvidersTab Default model picker renders ≥100 model options and persists selection across page reloads
- [ ] OpenRouter card appears in ProvidersTab via `openclaw.providers.list` (no manual hardcoding); pasting an API key writes an `openrouter:default` entry to `auth-profiles.json`
- [ ] Chat surface sends a message routed to an OpenRouter model (e.g., `openrouter/anthropic/claude-3-haiku`) and receives a streaming response without "missing provider" error
- [ ] Chat surface sends a message routed to an xAI model with xAI OAuth-connected and receives a streaming response without error
- [ ] `/models` slash command in chat surface returns at minimum `xai` AND `openrouter` in the provider list after Requirements 5 + 6 are satisfied (the prior `amazon-bedrock (84), openai (1)` defaults are gone OR clearly marked as "unauthed")
- [ ] Grep of `livos/packages/liv-claw-os/packages/claw-client/src/` returns zero references to `provider.config.set` / `provider.config.delete` (Phase 204 UI surface fully decoupled)
- [ ] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` PRESERVED across all Phase 206 commits (pre-commit hook PASS on every commit)
- [ ] `pnpm exec tsc --noEmit` (claw-client) PASS at end of phase
- [ ] `pnpm build` (claw-client) PASS at end of phase
- [ ] Mini PC `bash /opt/livos/update.sh` deploys cleanly; all 6 systemd services (livos, liv-core, liv-worker, liv-memory, liv-claw-gateway, livos-app-liv-ai) remain active after deploy

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                                 |
|--------------------|-------|------|--------|----------------------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | Native CLI surface fully test-verified on Mini PC; outcome locked. |
| Boundary Clarity   | 0.80  | 0.70 | ✓      | Operator narrowed to xAI + OpenRouter required; migration deferred to PLAN.md; 9 out-of-scope items listed. |
| Constraint Clarity | 0.70  | 0.65 | ✓      | Sacred SHA + OPENCLAW_STATE_DIR + INV-204-04 + CLI timeout 10s locked. |
| Acceptance Criteria| 0.80  | 0.70 | ✓      | 15 pass/fail criteria, all verifiable against Mini PC live state. |
| **Ambiguity**      | 0.185 | ≤0.20| ✓      | Gate passed after Round 1 + research synthesis.                        |

## Interview Log

| Round | Perspective       | Question summary                                                          | Decision locked                                                                                                                                                                                                                          |
|-------|-------------------|---------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 0     | Researcher (pre)  | Live Mini PC inspection: gateway env file, auth.json locations, agent dir | Phase 204's env file dead (only LIV_API_KEY); xAI OAuth lands in `~/.local/share/opencode/auth.json` (wrong path for agent); agent dir at `/opt/livos/data/openclaw/agents/main/agent/`; `auth-profiles.json` is canonical store      |
| 0     | Researcher (pre)  | Live openclaw CLI surface probe                                           | 35+ providers natively supported (incl. openrouter 265 models); `capability model auth login --provider X --method Y` is the universal auth entry; JSON output on every subcommand                                                       |
| 1     | Boundary Keeper   | Phase 204 env file / provider-config-router.ts disposition                | "PLAN.md'de çözülür" — SPEC marks as deprecate, deletion strategy deferred to plan. UI decoupling required; source-file removal optional                                                                                              |
| 1     | Boundary Keeper   | Required-provider scope for exit                                          | xAI (OAuth) + OpenRouter (API key) are the only 2 gating providers. Others (Anthropic, OpenAI/Codex, Groq, Mistral, Google, GitHub Copilot) must work generically but are not E2E-tested                                                |
| 1     | Boundary Keeper   | Done definition                                                            | (1) Chat doesn't fail with "missing provider"; (2) `/models` reflects configured providers; (3) Phase 204 Save-key UI surface unreachable; (4) Mini PC live UAT on 3 providers (xAI OAuth + OpenAI fallback + OpenRouter API key)     |
| 1+    | Researcher (web)  | How does upstream openclaw / openclaw-os / sibling forks handle auth UI? | Upstream has NO provider auth UI (CLI-only); fork's ProvidersTab is original work with no upstream pattern to align to; CLI-shellout-via-tRPC is the right adaptation. Issue #58106 known: OpenRouter hidden without `view:'all'` flag. |
| 1+    | Researcher (web)  | Canonical `auth-profiles.json` shape + profile-ID convention             | `{ version:1, profiles: { '<provider>:<name>': {type:'api_key'|'oauth', provider, key} } }` — Phase 206 follows this convention via the CLI; no direct JSON edits.                                                                       |

---

*Phase: 206-unified-provider-model-config*
*Spec created: 2026-05-24*
*Next step: /gsd-discuss-phase 206 — implementation decisions (livinityd shell-spawn safety patterns, OAuth URL extractor per-provider regex table, default-model picker placement, migration plan for `provider-config-router.ts`)*
