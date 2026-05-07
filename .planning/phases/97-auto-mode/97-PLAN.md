# Phase 97: Auto Mode — Skill-Guided Bytebot, Window-Scoped — Plan

## Sacred SHA discipline (READ FIRST)
- **Sacred file**: `liv/packages/core/src/sdk-agent-runner.ts`
- **Locked SHA**: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`
- **Verification command**: `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts`
- **Rule**: every task in this phase that touches a commit boundary (i.e. has a `[verify-sacred]` checkbox) runs the command BEFORE starting and AFTER its final commit. Mismatch on either side = hard-stop, escalate to user, do NOT keep working. The check is non-optional even on tasks that "obviously" don't go near `liv/`.
- **No path through the sacred runner** is acceptable in any task below. If a task discovers it needs to modify the runner, the design is wrong — re-route through `liv/packages/core/src/liv-agent-runner.ts` or `liv/packages/core/src/mcp-client-manager.ts`.

## Wave plan
```
Wave A (paralel — primitive surface area):
    97-01 (windowId on screenshot.ts) ─┐
    97-02 (windowId on input.ts)       ─┴─→ Wave B
    97-03 (sacred-SHA verification harness — runs alongside) ─→ used by all later waves

Wave B (paralel — MCP layering):
    97-04 (skill-context-builder + XML format)  ─┐
    97-05 (multi-instance bytebot MCP config)   ─┴─→ Wave C

Wave C (single — wrapper integration):
    97-06 (LivAgentRunner needs-help + skill-prompt injection) ─→ Wave D

Wave D (paralel — tool surface + recovery):
    97-07 (skill-replay-tool + tools.ts dispatch) ─┐
                                                   ├─→ Wave E
    97-08 (UAT walk-through + sacred close-out)   ─┘
```

## Task 97-01 — Extend `native/screenshot.ts` with optional `windowId`
**File**: `livos/packages/livinityd/source/modules/computer-use/native/screenshot.ts`

**Goal**: Accept optional `windowId?: number`. When set, route to the `maim -i <wid>` path; when undefined, the existing host-display path remains the default and is unchanged.

**Approach**:
- Add `windowId?: number` to the public function signature(s) and to any internal options object.
- New private branch invokes `maim -i <wid> <outputPath>`; reuse the existing post-P79 retry/error semantics.
- Surface `windowId` in error messages so failures are diagnosable.
- Add unit tests covering: (a) no-`windowId` path unchanged; (b) `windowId` set produces the `maim -i <wid>` argv; (c) failure on bad `windowId` surfaces a clear error; (d) the type signature change does not break existing callers.

**Verification**:
- `pnpm --filter @livos/livinityd test screenshot` green.
- Existing tests in `native/screenshot.test.ts` still green (no regressions).
- `[verify-sacred]` before and after the commit.

**Out-of-scope**: nut-js fallback (it stays host-display only); any change to `index.ts` exports beyond re-exporting the new option.

---

## Task 97-02 — Extend `native/input.ts` with optional `windowId`
**File**: `livos/packages/livinityd/source/modules/computer-use/native/input.ts`

**Goal**: Add `windowId?: number` to `clickMouse`, `typeKeys`, `pressKey`, and any other primitives that shell out to xdotool. When set, prepend `--window <wid>` to the argv. nut-js fallback stays host-display only.

**Approach**:
- Touch only the xdotool primary path. Fallback path is unchanged.
- For each primitive: build the argv array, conditionally prepend `--window <wid>` when `windowId` is set. Keep `--sync` flags and other P79 ergonomics intact.
- Mouse-position primitives: ensure `mousemove --sync` honors `--window` per xdotool docs.
- Tests in `native/input.test.ts`: matrix of primitives × {with windowId, without windowId} verifying the argv constructed for each combo.

**Verification**:
- `pnpm --filter @livos/livinityd test input` green.
- Manual smoke: spawn a test Chrome window on a dev box, run a click against its `wid`, observe focus-stealing-free click. (Spike-grade only — full UAT is 97-08.)
- `[verify-sacred]` before and after the commit.

**Out-of-scope**: window-scoping for nut-js; any change to which fallback gets used; new primitives.

---

## Task 97-03 — Sacred-SHA verification harness
**Files**: small script + a CI hook entry, e.g. `scripts/verify-sacred-sha.sh` (or `.cjs`/`.mjs` if already a Node convention) and a hook entry in the appropriate place (`.husky/`, `package.json` `scripts`, or the existing pre-commit hook config).

**Goal**: A one-line failure-mode check: if the current `HEAD:liv/packages/core/src/sdk-agent-runner.ts` SHA differs from `f3538e1d811992b782a9bb057d1b7f0a0189f95f`, exit non-zero with a clear message that names the sacred constraint and points at this phase's CONTEXT.md.

**Approach**:
- Single command: compute the SHA, compare against the constant, print PASS or FAIL with diff hint on failure.
- Wire into pre-commit (advisory — never silently skip), and into the phase's `[verify-sacred]` checkboxes.
- Document one-line invocation in `97-CONTEXT.md` Sacred constraints and reference it from PROJECT.md if the project's convention is to register such guards there.

**Verification**:
- Manual: run on clean tree → PASS. Manual: temporarily flip a byte in the sacred file (without committing) → FAIL with the expected message → revert.
- Confirm the harness is invoked by the regular `pnpm` test pipeline OR by a documented opt-in step that every later P97 task references.

**Out-of-scope**: hardening the constant location (move to a JSON registry, etc.) — keep it inline; refactoring is for a future hygiene phase.

---

## Task 97-04 — Skill context builder + XML system-prompt block
**File**: `livos/packages/livinityd/source/modules/webapps/skill-context-builder.ts` (new)

**Goal**: Given a `webapp_skills` row, return the system-prompt addition as a string in the XML form specified in v33-DRAFT §5 P97 (`<previously-learned-skill>…<actions>…<note>…`).

**Approach**:
- Module exports a single function: input `{skill, freeFormGoal?}`, output `{promptBlock: string, truncated: boolean, retainedCount: number}`.
- Render order: skill name attribute, flat numbered `<actions>` list of recent events, fixed `<note>` copy ("Adapt these to current screen state. Validate each step with computer_screenshot before clicking.").
- Truncation: keep the most recent 50 events; emit `<truncated count="N"/>` marker when applied (gray-area Q7 default).
- If `freeFormGoal` is set, render a sibling `<goal>…</goal>` block before the skill block.
- Strip embedded angle brackets / closing-tag bait from event payloads before rendering (cheap injection guard).
- Unit tests: short skill, long skill triggering truncation, missing fields, malicious tag-bait input.

**Verification**:
- `pnpm --filter @livos/livinityd test skill-context-builder` green.
- Inspect rendered output against a fixture skill — block must parse as well-formed XML (round-trip through a parser in the test).
- `[verify-sacred]` before and after the commit.

**Out-of-scope**: prompting the agent (97-06 owns injection); per-step structured tags (deferred to v34); auto-redaction (deferred per Q3 of v33-DRAFT §8).

---

## Task 97-05 — Multi-instance bytebot MCP config
**Files**:
- `livos/packages/livinityd/source/modules/computer-use/bytebot-mcp-config.ts` (extend)
- `livos/packages/livinityd/source/modules/computer-use/mcp/server.ts` (touch only as needed to honor `BYTEBOT_TARGET_WINDOW_ID`)
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` (thread windowId default into native primitive calls)

**Goal**: Allow spawning per-WebApp bytebot MCP server instances, each with `BYTEBOT_TARGET_WINDOW_ID=<wid>` in env. Existing host-display single-instance is unchanged and remains the default for non-WebApp use.

**Approach**:
- Extend the config builder to take a per-instance descriptor `{instanceKey: string, windowId: number}`. Instance key namespaces caches/sockets so two simultaneous instances don't collide.
- In `mcp/server.ts`: read `BYTEBOT_TARGET_WINDOW_ID` once at boot; if present, expose a default that `tools.ts` threads into native primitive calls when a tool's input doesn't override it.
- In `mcp/tools.ts`: each tool that wraps a native primitive consults the env-derived default and forwards it as `windowId` to `screenshot.ts` / `input.ts`.
- Soft resource cap (Q4 default): when a 4th instance registration is attempted, fail fast with a clear error. Cap lives in `mcp-client-manager.ts` per CONTEXT gray-area resolution; this task wires the failure surface, the cap value lives in 97-06.
- Tests: spawn two instances with different `wid`s; verify their tool calls produce the right argv; verify single-instance host-display path unchanged.

**Verification**:
- `pnpm --filter @livos/livinityd test bytebot-mcp-config tools` green.
- `ps` smoke: two instances visible, both with the env var set to distinct values.
- `[verify-sacred]` before and after the commit.

**Out-of-scope**: registering instances with `mcp-client-manager.ts` from the `liv` side (97-06 owns that); changing tool JSON-Schema (must stay backwards-compatible).

---

## Task 97-06 — `LivAgentRunner` extension: skill-prompt injection + needs-help recovery + MCP cap
**Files**:
- `liv/packages/core/src/liv-agent-runner.ts` (extend)
- `liv/packages/core/src/mcp-client-manager.ts` (extend — per-WebApp instance registration + soft cap)

**Goal**: Plumb the skill prompt block into the agent's system prompt addition path through the wrapper (NOT the sacred runner), and add the 3-strikes vision-validation needs-help signal. Register per-WebApp bytebot MCP instances through `mcp-client-manager.ts` with a soft cap of 3.

**Approach**:
- **Skill injection path**: extend the wrapper's existing prefix/system-addition surface (the lever P77 introduced) so an Auto-mode session call accepts an optional `{skillPromptBlock: string}` and includes it in the final system prompt without reaching into the sacred runner. If no such surface exists yet, add a thin one in `liv-agent-runner.ts` that composes with the runner's public input only.
- **Per-WebApp MCP registration**: extend `mcp-client-manager.ts` so a caller can register an additional MCP instance (P77 already enumerates `additionalMcpServers`; this task adds the WebApp-keyed registration entry with the `BYTEBOT_TARGET_WINDOW_ID` env). Cap at 3 concurrent registrations; 4th throws a typed error.
- **Needs-help signal**: add a per-run validation-failure counter (bumped on agent-emitted `validation:fail` lines, reset on `validation:pass`). At 3 in a row, emit a structured `needs_help` event the SSE pipeline relays as a chunk type and pause turn dispatch until the wrapper sees a user message. If the hermes tool-guardrail loop detector has shipped, reuse its counter scaffolding; otherwise inline a minimal version with a TODO.
- **Counter scope** (Q6 default): per-Auto-run; reset on Run.
- **Idle-reap hook** (Q5 default): when window-manager (P93) signals WebApp window closed, deregister the MCP instance from `mcp-client-manager.ts`. Plus 5-minute idle reap for safety.
- Tests in `liv-agent-runner.test.ts` and a new `mcp-client-manager.test.ts` slice covering: cap enforcement, injection round-trip, 3-strike pause, deregistration on close signal.

**Verification**:
- `pnpm --filter @liv/core test` green.
- `[verify-sacred]` before and after the commit. (This is the highest-risk task — sacred file diff MUST be empty.)
- Re-confirm the sacred SHA is `f3538e1d811992b782a9bb057d1b7f0a0189f95f` after every intermediate commit, not just the last.

**Out-of-scope**: any modification to `sdk-agent-runner.ts` (sacred); auto-redact; multi-user tenancy.

---

## Task 97-07 — `webapp_replay_skill` AgentPress tool + dispatch wiring
**Files**:
- `livos/packages/livinityd/source/modules/computer-use/skill-replay-tool.ts` (new)
- `livos/packages/livinityd/source/modules/computer-use/bytebot-tools.ts` (register the new tool alongside existing computer-use tools when in Auto mode)
- `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` (dispatch entry)

**Goal**: Expose `webapp_replay_skill({skillId, freeFormGoal?})` as an AgentPress tool. The wrapper auto-invokes it once at Auto-mode run start (Q8 default option-b) so the skill is in context from turn 1; the tool also remains callable later for re-priming.

**Approach**:
- New tool module owns: input schema (`skillId: uuid`, `freeFormGoal?: string`), DB load via the P96 skill-storage module, call-out to the 97-04 skill-context-builder, return shape matching existing AgentPress tool result conventions.
- Register the tool only on per-WebApp MCP instances (host-display single-instance does NOT get it — that path has no WebApp scope).
- The wrapper's auto-invoke flow lives in `liv-agent-runner.ts` (97-06) — this task only needs the tool itself, its registration, and tests.
- Tests: input validation (bad uuid, missing skill), happy path returns block matching 97-04 fixture, error path when the skill row doesn't exist or belongs to a different user.

**Verification**:
- `pnpm --filter @livos/livinityd test skill-replay-tool tools bytebot-tools` green.
- Manual: in a dev MCP instance, call the tool by hand and inspect the returned block.
- `[verify-sacred]` before and after the commit.

**Out-of-scope**: caching the rendered block (cheap to render; revisit if profiling shows hot path); auto-redact; per-step playback (this is guidance not playback).

---

## Task 97-08 — UAT walk-through + sacred close-out
**Files**: `.planning/phases/97-auto-mode/UAT.md` (new), small touch-ups to any of 97-01..97-07 that UAT exposes.

**Goal**: End-to-end live-Mini-PC walk through Auto mode against a real WebApp, with sacred-SHA verification at the close.

**Approach**:
- UAT script (in `UAT.md`) covers, against the Mini PC:
  1. Open a WebApp (created in P94, streamed in P95). Confirm it has a `wid`.
  2. Switch to Teach mode (P96), record a small skill (e.g. 3 clicks + 1 keystroke). Save with a name.
  3. Switch to Auto mode. Pick the saved skill. Click Run.
  4. Observe the wrapper auto-invoking `webapp_replay_skill`; observe the agent's first turn referencing the skill block.
  5. Observe at least the first two recorded steps replayed against the live window via `maim -i <wid>` + `xdotool --window <wid>`.
  6. Force a vision-validation failure (e.g. close the target tab between steps); confirm `validation:fail` line is emitted, counter increments, 3rd consecutive failure pauses the run with a `needs_help` SSE chunk.
  7. Open a 4th Auto session; confirm soft-cap rejection error.
  8. Close the WebApp's Chrome window; confirm the per-WebApp MCP instance exits within 60s.
  9. Confirm host-display ad-hoc computer-use still works unchanged.
- Each step has PASS/FAIL boxes + a notes column + a "deviation" column for anything to feed into P98.
- **Sacred close-out**: at the end of UAT, run `git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts` and paste the result + the locked constant into the bottom of `UAT.md`. They must match.

**Verification**:
- All UAT steps PASS or have an explicit P98-targeted carryover note.
- Sacred SHA at phase close matches `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
- `[verify-sacred]` is run one final time as the closing act of the phase, with the result quoted in the phase summary.

**Out-of-scope**: any new code beyond touch-ups; perf tuning; redaction; new tRPC routes; v34 carryover work.

---

## Phase exit checklist
- [ ] All 8 tasks above closed in their planned wave.
- [ ] Sacred SHA verified BEFORE phase open: `f3538e1d811992b782a9bb057d1b7f0a0189f95f`.
- [ ] Sacred SHA verified AFTER each commit-touching task: same.
- [ ] Sacred SHA verified at phase close: same.
- [ ] No new file in `liv/packages/core/src/` named or shaped like a fork of `sdk-agent-runner.ts`.
- [ ] `httpOnlyPaths` updated for any new tRPC namespace introduced (likely none in P97).
- [ ] UAT.md exists with all PASS or explicit P98 carryover notes.
- [ ] Phase summary references the verified SHA twice (open and close).
