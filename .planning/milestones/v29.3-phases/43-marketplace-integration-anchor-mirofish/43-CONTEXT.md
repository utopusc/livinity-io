# Phase 43: Marketplace Integration (Anchor: MiroFish) - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning
**Mode:** `--chain` (Claude presented 8-decision batch summary, user accepted all)

<domain>
## Phase Boundary

A marketplace app declaring `requiresAiProvider: true` in its manifest gets `ANTHROPIC_BASE_URL`, `ANTHROPIC_REVERSE_PROXY`, and `LLM_BASE_URL` automatically injected into its per-user Docker compose file at install time, with `extra_hosts: ["livinity-broker:host-gateway"]` added so the container can reach the broker. **MiroFish** (`666ghj/MiroFish`) is the v29.3 anchor: planner verifies the image is published to GHCR (or falls back to fork+build), authors a manifest with the new flag, and the manual UAT installs MiroFish on Mini PC end-to-end — typing a prompt in MiroFish UI must return a Claude response with zero "enter your API key" prompts.

**Scope anchor:**
- Extend `livos/packages/livinityd/source/modules/apps/schema.ts` AppManifestSchema with `requiresAiProvider?: boolean`
- Extend `livos/packages/livinityd/source/modules/apps/apps.ts` `installForUser()` (or wherever per-user compose generation happens — discovery in Plan 43-01) to inject the 3 broker env vars + extra_hosts when manifest flag is true
- Author MiroFish manifest in the Livinity app store path (TBD via audit; likely sibling repo `livinity-apps` or local `livos/data/app-stores/`)
- UI: small "Uses your Claude subscription" pill on marketplace cards where flag is true (cosmetic; non-blocking)
- Manual UAT: Mini PC install MiroFish → UI prompt → Claude response

**Out of scope:**
- Per-user usage dashboard (Phase 44)
- Other marketplace apps (Dify, RAGFlow, CrewAI templates) — deferred to v30+
- BYOK toggle / per-app API key fallback (D-NO-BYOK)
- Modifying broker code (Phases 41+42 are complete; Phase 43 just wires app installation)
- Sacred SdkAgentRunner (Phase 40 baseline preserved)

</domain>

<decisions>
## Implementation Decisions

### Manifest Schema Extension (D-43-01..02)
- **D-43-01:** Add `requiresAiProvider?: boolean` field to `AppManifestSchema` in `livos/packages/livinityd/source/modules/apps/schema.ts` (camelCase to match existing convention: `optimizedForLivinityHome`, `defaultUsername`, etc.). Optional with default false (omitted = no env injection, same behavior as today).
- **D-43-02:** No version bump on `manifestVersion` required — it's an additive optional field; existing manifests parse fine. Add a JSDoc comment above the field explaining what enabling it does (env var auto-injection + extra_hosts).

### Env Vars to Inject (D-43-03..04)
- **D-43-03:** When `requiresAiProvider == true`, the per-user compose file gets these 3 env vars added to the app's container service:
  - `ANTHROPIC_BASE_URL=http://livinity-broker:8080/u/<user_id>` — for apps using `@anthropic-ai/sdk`
  - `ANTHROPIC_REVERSE_PROXY=http://livinity-broker:8080/u/<user_id>` — for apps reading this alternate env (LibreChat, etc.)
  - `LLM_BASE_URL=http://livinity-broker:8080/u/<user_id>/v1` — for OpenAI-compat apps (MiroFish, CrewAI agents); note `/v1` suffix
  All three at once — covers ~90% of marketplace AI apps' env-var conventions per seed research.
- **D-43-04:** `<user_id>` resolved at install time (the user installing the app). Each per-user compose file is unique per user — a different user reinstalling the same app gets a different `<user_id>` baked into its env vars. Phase 41's broker reads the URL path to enforce; this is just env injection.

### Network Configuration (D-43-05)
- **D-43-05:** When `requiresAiProvider == true`, add `extra_hosts: ["livinity-broker:host-gateway"]` to the app's compose service. This is a Linux Docker (Mini PC) magic alias since 20.10 that resolves `livinity-broker` to the host gateway IP — where livinityd listens on 8080. **Phase 41 documented this contract; Phase 43 implements the injection.** No DNS server changes, no `/etc/hosts` edits on the host.

### Where Injection Happens (D-43-06..07)
- **D-43-06:** Compose file generation: `livos/packages/livinityd/source/modules/apps/compose-generator.ts` (or wherever the actual compose YAML is built — Plan 43-01 audit confirms). Add a function `injectAiProviderConfig(composeYaml, userId)` that reads the manifest's `requiresAiProvider` flag and mutates the YAML to add env + extra_hosts. Pure function, well-tested.
- **D-43-07:** Trigger point: `installForUser()` in `apps.ts` calls compose generator; if manifest flag is true, the new `injectAiProviderConfig()` function runs after standard compose generation. **Single integration point.** No other code paths affected.

### MiroFish Anchor (D-43-08..11)
- **D-43-08:** Source: GitHub `666ghj/MiroFish` (per user's prior session reference). Plan 43-01 audit:
  1. Check if image is published to a public registry (`ghcr.io/666ghj/mirofish:latest` or Docker Hub `666ghj/mirofish:latest`). If yes: use that image directly in manifest.
  2. If NOT published: fall back to forking the repo + building image in CI / on Mini PC + pushing to a Livinity-controlled registry. Document the chosen path in audit.
- **D-43-09:** MiroFish manifest fields (Plan 43-02 authors):
  - `id: "mirofish"`, `name: "MiroFish"`, `category: "ai-agents"` (or whatever existing category fits)
  - `repo: "https://github.com/666ghj/MiroFish"`
  - `requiresAiProvider: true` (the new flag)
  - Standard fields: `manifestVersion`, `version`, `port`, `description`, `gallery`, `support`, etc.
  - Compose stanza: image source from D-43-08, port mapping based on MiroFish's documented HTTP port
- **D-43-10:** Manifest file location: Plan 43-01 audit determines where Livinity loads marketplace manifests from. Two options surfaced in initial scout:
  1. Sibling repo `livinity-apps` (separate GitHub repo per LivOS conventions for community apps)
  2. Local store path `livos/data/app-stores/livinity-apps-store/<app_id>/`
  Planner picks based on discovery; both paths follow the same manifest format.
- **D-43-11:** No code changes to MiroFish itself. The whole point: MiroFish is unmodified upstream, env vars do the work.

### UI: Subscription Badge (D-43-12)
- **D-43-12:** Marketplace card (livos UI) gets a small pill "Uses your Claude subscription" rendered when manifest's `requiresAiProvider == true`. Cosmetic — informs user that no API key entry is needed. Non-blocking: if UI piece slips to v29.4, the broker still works. Planner can mark this as a separate plan if needed.

### Tests (D-43-13..16)
- **D-43-13:** Unit test for `injectAiProviderConfig()` — pure function. Cases: (a) manifest flag false → compose unchanged; (b) flag true → 3 env vars + extra_hosts added; (c) compose with existing env vars → merged correctly (no duplicates); (d) compose with existing extra_hosts → list appended.
- **D-43-14:** Schema test — assert `requiresAiProvider?: boolean` is optional, defaults to undefined, accepts true/false, rejects non-boolean.
- **D-43-15:** Integration test for installForUser — mock manifest with `requiresAiProvider: true`, run install, verify generated compose at `/opt/livos/data/users/<id>/apps/<app>/docker-compose.yml` contains all 3 env vars + extra_hosts.
- **D-43-16:** Manual UAT: Mini PC live test with MiroFish (Plan 43-05 deliverable). Steps: install MiroFish from marketplace as test user → MiroFish container starts with broker env vars wired → open MiroFish UI → type prompt → see Claude response. Screenshot evidence. UAT also asserts: zero "enter API key" inputs in MiroFish UI flow (DOM grep / visual verification).

### Sacred File Status (D-43-17)
- **D-43-17:** `nexus/packages/core/src/sdk-agent-runner.ts` is byte-identical to Phase 40 baseline `623a65b9a50a89887d36f770dcd015b691793a7f`. Phase 43 makes ZERO nexus changes — all work in livinityd apps module + manifest authoring + UI. Verify via `git diff` regression check at every plan commit.

### Out-of-Scope Carry-Forwards (D-43-18..19)
- **D-43-18:** Per-user usage dashboard (FR-DASH-01..03) — Phase 44.
- **D-43-19:** Additional marketplace anchor apps (Dify, RAGFlow, CrewAI templates) — deferred to v30+ per FR-MARKET-future-01..03.

### Claude's Discretion
- Whether MiroFish UI badge is a separate plan or rolled into manifest plan — planner picks
- Where to mount the schema integration test (zod inline test vs separate file) — planner picks
- Logging verbosity in `injectAiProviderConfig()` — planner picks (default: info-level "injecting broker config for user X" log)
- If MiroFish image isn't published, whether the fork+build path lands in this phase or as a Phase 43.1 mini-followup — planner picks based on audit complexity

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 43 source files (target)
- `livos/packages/livinityd/source/modules/apps/schema.ts` (AppManifestSchema — add `requiresAiProvider?: boolean`)
- `livos/packages/livinityd/source/modules/apps/apps.ts` (installForUser — calls compose generator)
- `livos/packages/livinityd/source/modules/apps/compose-generator.ts` (compose YAML builder — add `injectAiProviderConfig()`)
- `livos/packages/livinityd/source/modules/apps/builtin-apps.ts` (existing manifests as reference)
- `livos/data/app-stores/` OR sibling repo `livinity-apps` (MiroFish manifest authoring location — audit determines)
- `livos/packages/ui/src/routes/...marketplace...` (audit finds — UI pill rendering)

### Project-level constraints
- `.planning/PROJECT.md` (D-NO-BYOK; sacred SdkAgentRunner; D-NO-SERVER4)
- `.planning/REQUIREMENTS.md` (FR-MARKET-01, FR-MARKET-02; FR-MARKET-future-01..03 deferred)
- `.planning/ROADMAP.md` (Phase 43 — 4 success criteria)

### Phase 41 + 42 broker contract (consumed)
- Broker URL pattern: `http://livinity-broker:8080/u/<user_id>/v1/messages` (Phase 41) and `/u/<user_id>/v1/chat/completions` (Phase 42)
- Phase 41 D-41-07: `extra_hosts: ["livinity-broker:host-gateway"]` documented; Phase 43 implements injection
- Phase 42 D-42-03: same `/u/:userId/v1` prefix used for both Anthropic-format and OpenAI-compat

### MiroFish external
- GitHub repo: https://github.com/666ghj/MiroFish (planner audit checks Docker image publish state)

### Memory references
- `feedback_subscription_only.md` — D-NO-BYOK; no API key flow path; broker is the only AI gateway for marketplace apps
- `MEMORY.md` Multi-User Architecture — synthetic per-user dirs, JWT-based user resolution, per-user Docker isolation already established (Phase 7.0)
- `MEMORY.md` Mini PC notes — deployment target, `bash /opt/livos/update.sh` flow

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AppManifestSchema` (apps/schema.ts:26-63) — Zod schema with established camelCase field convention
- `installForUser()` in apps/apps.ts — per-user installation entry point (Phase 7.0 origin)
- compose-generator.ts — compose YAML builder (extension target for `injectAiProviderConfig()`)
- builtin-apps.ts — existing manifest patterns to mirror for MiroFish authoring
- Per-user data dir convention: `/opt/livos/data/users/<user_id>/apps/<app>/docker-compose.yml`

### Established Patterns
- Manifest schema: optional fields with `.optional()`, camelCase
- Per-user compose generation runs at install time (lazy)
- Existing apps don't need broker env vars — flag-gated, opt-in additive change
- `extra_hosts` Docker compose format: array of `"hostname:ip-or-host-gateway"`

### Integration Points
- Schema → installForUser → compose-generator: linear pipeline; `injectAiProviderConfig()` slots in at the end of compose-generator
- UI marketplace card: read manifest, render pill conditionally on `requiresAiProvider`
- MiroFish manifest just like any other Livinity marketplace app, with the new flag enabled

</code_context>

<specifics>
## Specific Ideas

- **MiroFish unmodified.** The whole point of v29.3: marketplace apps work AS IS with the broker. MiroFish gets `LLM_BASE_URL` env var; it points to broker; broker does the work. Zero code changes to MiroFish itself.
- **Inject all 3 env vars at once.** Different apps read different conventions (`ANTHROPIC_BASE_URL` vs `LLM_BASE_URL` vs `ANTHROPIC_REVERSE_PROXY`). Setting all 3 covers ~90% of OpenAI-compat / Anthropic SDK clients in one shot.
- **`extra_hosts: host-gateway` is the magic.** Linux Docker since 20.10 makes this trivial. No /etc/hosts edits, no Docker network surgery.
- **Manual UAT is the acceptance gate.** FR-MARKET-02 requires a real end-to-end MiroFish install on Mini PC. No way to fake it in CI.

</specifics>

<deferred>
## Deferred Ideas

- **Dify** marketplace app integration (FR-MARKET-future-01) — defer to v30+
- **RAGFlow** marketplace app integration (FR-MARKET-future-02) — defer to v30+
- **CrewAI agent template** authoring (FR-MARKET-future-03) — defer to v30+
- **BYOK toggle per app** — explicitly excluded by D-NO-BYOK
- **Cost forecasting on app install dialog** — Phase 44 dashboard scope
- **Auto-detection of marketplace app's preferred env var convention** — manually specify all 3 for now
- **Marketplace card filter "Subscription-powered"** — UI nice-to-have, defer

</deferred>

---

*Phase: 43-marketplace-integration-anchor-mirofish*
*Context gathered: 2026-04-30*
*Decisions: 19 (D-43-01..D-43-19). User approved 8-recommendation summary as a batch.*
