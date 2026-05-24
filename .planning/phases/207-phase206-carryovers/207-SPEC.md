# Phase 207: Phase 206 Carry-Overs + UAT-Surfaced Bugs — Specification

**Created:** 2026-05-24
**Status:** Open after Phase 206 ship (SHA `a493ed33` deployed on Mini PC)
**Trigger:** Operator UAT 2026-05-24 surfaced 5 distinct issues after Phase 206 + bridge ship

## Goal

Close the operator-visible regressions surfaced after Phase 206 + bridge deploy, and finish the auth-flow generalization deferred from Phase 206 SPEC.

## Background — operator-reported issues (verbatim)

1. **MCP tools invisible to chat agent.** Operator chatted with `/model openrouter/x-ai/grok-4-fast` after pasting OpenRouter API key. Agent responded: "MCP (Model Context Protocol) ile ilgili özel araçlar bulunmuyor". Agent only sees built-in tools (file ops, web, image, music, mouse/keyboard, etc.) — not the MCP servers configured via Settings → MCP. Phase 205-03 wired MCP into livinityd's config but the agent's tool catalog isn't pulling from it.

2. **Composer model dropdown shows ALL 955 models, not just configured providers.** Operator quote: "Default · Default (off) inputun sag assagisinda default yaziyor ya oraya tikladigimda model seceyim … Bagli olan api veya auth larin modellerini gostersin". Wants the SessionComposer model picker to filter to providers with `auth.runtimeAuthRoutes[].status==="configured"`.

3. **WebSocket `/ws/agent` connection failing repeatedly.** Console floods with `WebSocket connection to 'wss://bruce.livinity.io/ws/agent?token=…' failed`. This is a separate endpoint from `/trpc` WS (which works) — appears to be the legacy agent stream endpoint from before openclaw. Either route is missing or auth path is wrong.

4. **`openclawos.apps.list` returns empty payload error.** Console: `livinityd openclawos.apps.list returned empty payload`, `code: apps.list_failed`. Polled repeatedly with exponential backoff. The chat shell's `OpenClawEngine` retries forever. Server-side route is returning an empty success body that the client envelope-parser rejects.

5. **EventSource MIME-type mismatch.** Console: `EventSource's response has a MIME type ("text/html") that is not "text/event-stream". Aborting the connection.` Some SSE endpoint (probably the agents-status SSE from Phase 202-04 or the openclaw plugin notifications stream) is serving HTML — Caddy/livinityd routing gap.

## Phase 206 carry-overs (already documented)

6. **OAuth bridge token-refresh staleness.** The `openclaw.auth.bridgeFromOpencode` mutation writes a SNAPSHOT of the current xAI OAuth access token. When opencode's TokenRefresher rotates the token (~24h xAI cycle), the bridged copy goes stale.
7. **Generic `auth-flow-service`.** xAI is the only provider with OAuth support today. OpenAI Codex / Claude / GitHub Copilot OAuth flows from opencode's CLI need the same bridge.
8. **Phase 204 dead-code deletion.** `provider-config-router.ts` + `EnvFileWriter` + sudoers drop-in still preserved compile-clean but unreachable from UI.
9. **Mobile `MobileSettingsDialog`** still modal — desktop is content-swap.

## Operator preferences locked

- **Phase 206 acceptance NARROWED**: only xAI (OAuth via bridge) + OpenRouter (API key) required for exit. Currently:
  - xAI: bridge ships `a493ed33`, untested by operator post-deploy
  - OpenRouter: operator confirmed API key paste works via Save button; `/model openrouter/...` selects it; chat reaches OpenRouter successfully (operator's grok-4-fast message returned a reply)
- **`/model {provider/id}` slash command WORKS** (operator confirmed). This is the per-chat override.
- **Default model picker WORKS** for selection but lists too many (955 models — operator wants filter to configured only).

## Operator UI request 2026-05-24 (NEW for Phase 207)

**Move default-model picker OUT of Providers tab INTO chat composer bottom-right.** Operator quote: "Bak ben ana modeli buradan secmek istemiyorum … Default yaziyor ya sag assagida hemen sag tarafinda yine default yaziyor soldaki default model secsin Provider i ile beraber tikladigim zaman hemen ustunde Dropbox acilsin searchde olsun Ama aktif olan provider a gore seceyim".

Translation: Don't want default model selector in Providers tab. The LEFT "Default" button at composer bottom-right (next to the right-side "Default off" thinking-mode button) should open an upward-opening searchable dropdown showing models from CONFIGURED providers only. Click that left "Default" → model picker. Don't touch right "Default (off)".

This is essentially requirement #2 below — but operator clarified it should REPLACE the Providers tab's "Default model" picker, NOT supplement it. Remove the Default-model picker from ProvidersTab.tsx; wire SessionComposer's existing model dropdown to filter on configured providers.

## Path correction 2026-05-24

Phase 206's bridge mutation actually deploys at `openclaw.bridgeFromOpencode` (top-level of openclaw router), NOT `openclaw.auth.bridgeFromOpencode` — router brace shuffle left it as a sibling of auth/config/profiles. Verified live curl returns `{ok:true, bridged:["xai"]}`. Client path fixed in claw-client v16. Future cleanup: move into the auth namespace properly OR rename the call site (no operator-visible change either way).

## Requirements

1. **MCP tools reach agent**: chat agent's tool catalog includes MCP-configured servers in addition to built-ins.
   - Current: agent self-reports having only built-in tools when asked.
   - Target: `mcp.config.list` entries flow through to the agent's tool registry so the agent answers "I see X, Y, Z MCP servers" with the configured set.
   - Acceptance: configure a `filesystem` MCP server via Settings → MCP, ask agent "which MCPs do you see", agent lists `filesystem` in its tools.

2. **Composer LEFT "Default" button = default-model picker (filtered, replaces ProvidersTab picker)**: SessionComposer's bottom-right LEFT button (currently shows "Default") opens an upward searchable dropdown of models from CONFIGURED providers only. Picking persists to `agents.defaults.model.primary` (writes via `openclaw.config.setDefaultModel`). The RIGHT "Default (off)" stays as thinking-mode (untouched per operator). The Providers tab's "Default model" picker is REMOVED.
   - Current: 955 models from all 39 providers regardless of auth state; default picker lives in ProvidersTab.
   - Target: composer-embedded default-model picker filtered to providers with `auth.runtimeAuthRoutes[].status==="configured"` OR `providersWithOAuth[]` OR `providers[].profiles.apiKey > 0`. Upward-opening dropdown matches existing TextButtonSelect pattern. Searchable.
   - Acceptance: with only xAI + openrouter configured, composer "Default" left-button dropdown shows ≤ 279 models (14 xai + 265 openrouter), NOT 955. ProvidersTab no longer renders a default-model picker.

3. **WebSocket `/ws/agent` either works or is removed**: no more console floods.
   - Current: repeated failed connections to `wss://bruce.livinity.io/ws/agent?token=…`.
   - Target: either restore the endpoint OR remove the client-side connection attempts (depending on whether this is dead-code from pre-openclaw era).
   - Acceptance: open chat in browser, 0 `wss://...ws/agent` failures in console after 60s.

4. **`openclawos.apps.list` returns valid payload**: chat shell's apps list doesn't error.
   - Current: `livinityd openclawos.apps.list returned empty payload` polled forever.
   - Target: route returns `[]` (empty array) when no apps exist, NOT empty body that fails envelope parse.
   - Acceptance: console shows `apps.list (rpc-N) ok` instead of `apps.list_failed`.

5. **SSE EventSource serves correct content-type**: `text/event-stream` not `text/html`.
   - Current: `EventSource's response has a MIME type ("text/html")`.
   - Target: identify the failing SSE route (probably agents-status SSE), set proper Content-Type header.
   - Acceptance: no `EventSource` MIME warnings in console.

6. **OAuth bridge refresh**: stale-token detection + auto-rebridge.
   - Current: snapshot only.
   - Target: on every chat dispatch or every 30 min, re-run `bridgeFromOpencode` if opencode's expires timestamp is fresher than openclaw's snapshot.
   - Acceptance: leave session running >24h, chat still works without manual operator action.

7. **Generic auth-flow generalization**: extend xai-auth pattern to OpenAI Codex + Claude.
   - Current: only xAI in ProvidersTab OAuth.
   - Target: `openclaw.auth.bridgeFromOpencode` already handles ANY provider opencode supports; UI surfaces per-provider "Connect via opencode" button.
   - Acceptance: operator can OAuth-connect Anthropic and OpenAI Codex from the ProvidersTab.

## Boundaries

**In scope:**
- All 7 requirements above
- Composer dropdown filter logic in `SessionComposer.tsx`
- MCP-to-agent tool flow investigation + fix
- Console error cleanup (WS + SSE + apps.list)

**Out of scope:**
- Phase 204 source-file deletion (further deferred)
- Mobile route migration (further deferred)
- Full OAuth-flow generalization (only OpenAI Codex + Anthropic in this phase; Google/GitHub Copilot deferred)

## Constraints

- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` MUST be preserved.
- Mini PC only deploy (carries forward INV-204-03).
- No breaking changes to `openclaw.*` tRPC namespace (Phase 206 stable).
- Composer dropdown filter MUST be opt-in or fail-open (so dev without livinityd doesn't show empty list).

## Operator UAT walkthrough (after Phase 207 ships)

1. Hard reload to evict SW cache.
2. Ask agent "which MCPs do you see" — agent lists configured MCP servers, not just built-ins.
3. Open composer model dropdown — count is small (only configured-provider models).
4. Open browser console — 0 WS/SSE failures.
5. Switch chat between xAI / OpenRouter via `/model` slash — both work.
6. Wait 24+ hours → send chat with xAI → succeeds (refresh worked).

## Resume command for next session (after /clear)

```
Phase 207 SPEC at .planning/phases/207-phase206-carryovers/207-SPEC.md
Read it first. 7 requirements scoped from Phase 206 UAT 2026-05-24.

Current Mini PC SHA: a493ed33 (Phase 206 + bridge + wirefix all shipped).
Operator confirmed working: OpenRouter API key paste + /model slash + chat
with openrouter/x-ai/grok-4-fast returns streaming responses.

Operator confirmed BROKEN:
1. Agent doesn't see MCP tools (only built-ins surfaced)
2. Composer model dropdown shows all 955 models (should filter to configured)
3. WS /ws/agent flooding console with failures
4. openclawos.apps.list returns empty payload error
5. EventSource MIME mismatch (text/html instead of text/event-stream)

Plus Phase 206 carry-overs:
6. OAuth bridge token-refresh staleness (~24h stale)
7. Generic auth-flow for non-xAI providers

Memory keys: project_phase206_shipped + project_phase207_open
Sacred SHA: f3538e1d... PRESERVED across all 5 Phase 206 commits.

Run /gsd-discuss-phase 207 to plan implementation.
```
