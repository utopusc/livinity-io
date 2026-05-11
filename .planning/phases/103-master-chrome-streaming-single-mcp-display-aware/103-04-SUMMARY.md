---
phase: 103
plan: 04
subsystem: agent-prompt
tags:
  - prompt-engineering
  - tdd
  - display-scoping
  - luse
  - prescriptive-instruction
dependency-graph:
  requires:
    - 103-03-single-mcp-display-aware-tool-schema (added optional `display?: ":N"` arg on 13 luse tools)
  provides:
    - Prescriptive agent system-prompt instruction telling the LLM to pass `display: ":N"` on every luse tool call
  affects:
    - 103-05 (LIVOS_PER_APP_LUSE='0' default flip — depends on agent compliance with this instruction)
    - 103-06 (E2E acceptance — agent will be observed using the display arg in transcripts)
tech-stack:
  added: []
  patterns:
    - TDD RED → GREEN for prompt-string changes (snapshot-equivalent via toContain assertions)
    - Prescriptive ("MUST pass display: \":N\"") over descriptive ("implicitly scoped via env") prompt phrasing
    - Belt-and-suspenders: prescriptive prompt + runtime env fallback (parseDisplayArg → defaultDisplay)
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts
    - livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts
decisions:
  - "Instruction flipped from descriptive 'implicitly scoped to :N via LUSE_TARGET_DISPLAY' (Phase 102-06 form) to prescriptive 'MUST pass display: \":N\" as a tool argument' (Phase 103-04 form). The descriptive form would not surface the new 103-03 `display` arg contract to the LLM."
  - "LUSE_TARGET_DISPLAY env name intentionally removed from the snippet string output. Rationale: the agent does not need to know about runtime fallbacks; mentioning the env name invites the agent to reason 'I don't need the arg because the env is set' (anti-pattern). The env name is still referenced in JSDoc comments (informational, not prompt-emitted)."
  - "Belt-and-suspenders preserved: agent-runner-factory still seeds LUSE_TARGET_DISPLAY per-turn so an agent that omits the arg resolves to the right display via parseDisplayArg → options.defaultDisplay (Phase 103-03 contract). This is documented in the JSDoc but NOT in the prompt itself."
  - "Failure-mode disclosure ('If you omit the display argument, the tool falls back to the host display (:1) and you will NOT see or interact with this WebApp') added to make the consequence visible to the LLM. Mirrors the same self-correction signal pattern used by action-summary strings (`display=:11`) in 103-03 mcp/tools.ts."
  - "DISPLAY_RE_PROMPT regex guard (line 174) UNCHANGED — T-102-06b prompt-injection mitigation preserved (the new instruction is a constant string with only the already-guarded `activeDisplay` value interpolated)."
  - "sanitizeActiveAppMeta call UNCHANGED — T-101-03 control-char strip on title/url/binary preserved."
metrics:
  duration: 2min
  completed: 2026-05-11
  tests_total: 26
  tests_added: 4
  lines_added: 41
  lines_removed: 5
  commits: 2
---

# Phase 103 Plan 04: buildActiveDisplaySnippet — Prescriptive Display Arg Instruction Summary

Closed REQ-103-B4 of Phase 103. Agent system prompt now PRESCRIPTIVELY instructs the LLM to pass `display: ":N"` as a tool argument on every Luse tool call (was previously a DESCRIPTIVE statement that the calls were "implicitly scoped via LUSE_TARGET_DISPLAY"). Surfaces the per-call display arg contract that 103-03 shipped on the tool schemas so the LLM actually uses it.

## What Shipped

| Task                                                     | Commit     | Files                                                    | Lines (+/-) |
| -------------------------------------------------------- | ---------- | -------------------------------------------------------- | ----------- |
| RED — failing tests for prescriptive instruction         | `dc86a7c2` | 1 (`agent-prompt-builder.test.ts`)                       | +23 / -2    |
| GREEN — flip snippet to "MUST pass display: \":N\"" form | `cab8b331` | 1 (`agent-prompt-builder.ts`)                            | +18 / -3    |

**Total: 41 + / 5 - across 2 files in 2 commits.**

## Behaviour

### Before (Phase 102-06 descriptive)

```text
## Active Display Context
You are operating in the context of the LivOS app: My WebApp (webapp).
Active X11 display: :11 (resolution 1280x720)
URL/Binary: https://yandex.com
All your Luse tool calls (screenshot, click, key) are implicitly scoped to :11 via LUSE_TARGET_DISPLAY. Coordinate space is 1280x720 native — no offset, no scaling.
```

The agent was told the scoping was implicit. Phase 103-03 added an optional `display` property to 13 tool schemas — but the agent had no signal that this arg existed or was preferred.

### After (Phase 103-04 prescriptive)

```text
## Active Display Context
You are operating in the context of the LivOS app: My WebApp (webapp).
Active X11 display: :11 (resolution 1280x720)
URL/Binary: https://yandex.com
IMPORTANT: Every Luse tool call (computer_screenshot, computer_click_mouse, computer_type_text, computer_press_keys, computer_scroll, list_windows, etc.) MUST pass display: ":11" as a tool argument so the operation is scoped to this WebApp's dedicated X server. If you omit the display argument, the tool falls back to the host display (:1) and you will NOT see or interact with this WebApp. Coordinate space is 1280x720 native — no offset, no scaling.
```

Three behavioural shifts:

1. **Prescriptive** — "MUST pass display" replaces "implicitly scoped". The agent now has an unambiguous instruction.
2. **Quoted value interpolation** — `display: ":11"` exactly matches the JSON tool-call syntax the model emits, removing format ambiguity.
3. **Failure-mode disclosure** — telling the agent that omission causes fallback to `:1` (host display) gives it a self-correction signal: if a screenshot shows the host desktop instead of the WebApp, the agent knows it forgot the arg.

The env name `LUSE_TARGET_DISPLAY` is no longer surfaced to the agent. The env-fallback still operates at runtime (agent-runner-factory + 103-03 `parseDisplayArg → options.defaultDisplay`), but mentioning it in the prompt invites the LLM to reason "I don't need the arg because the env is set" (anti-pattern). The fallback is now a defense-in-depth invariant, not an agent instruction.

### Resolution precedence (unchanged from 103-03)

1. **Explicit `args.display`** — agent passes per the new prescriptive instruction → `withScopedDisplay` mutates `process.env.DISPLAY` for the call duration
2. **`options.defaultDisplay`** — seeded from `LUSE_TARGET_DISPLAY` env at MCP boot (env fallback, still active belt-and-suspenders)
3. **Neither set** — native primitive sees whatever DISPLAY was before the call (host display `:1`)

## Tests

**Coverage matrix** (4 new tests in `buildActiveDisplaySnippet — Phase 102-06 Pillar C` describe block, all green):

| Test                                                                                            | Behaviour Verified                                                                |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `instructs agent to pass display arg explicitly (prescriptive form)`                            | Snippet contains exact phrase `"MUST pass display"`                                |
| `omits the obsolete LUSE_TARGET_DISPLAY env name from the agent prompt (runtime fallback only)` | Snippet does NOT contain `LUSE_TARGET_DISPLAY` (env-name leak gate)                |
| `omits the obsolete "implicitly scoped" descriptive phrase (Phase 103-04 instruction flip)`     | Snippet does NOT contain `implicitly scoped` (regression gate against revert)      |
| `interpolates the active display in the MUST pass display instruction with double quotes`       | Snippet contains literal `display: ":11"` when `activeDisplay=":11"` is passed     |

**Replaces:** the prior `'includes LUSE_TARGET_DISPLAY reference'` test (deleted as part of the RED-phase test edit — its assertion was inverted by the prescriptive flip).

**Full suite verification:**

```
$ pnpm vitest run source/modules/ai/agent-prompt-builder.test.ts --reporter=verbose
 Test Files  1 passed (1)
      Tests  26 passed (26)
   Duration  358ms
```

22 pre-existing tests (window-snippet, sanitize, display-snippet edge cases) all still green. RED phase confirmed: in the test-only commit `dc86a7c2`, the 4 new tests failed against the unchanged source (`4 failed | 22 passed`); after `cab8b331` they pass (`26 passed`). Gate sequence verified.

**TypeScript:**

```
$ pnpm tsc --noEmit -p . 2>&1 | grep "agent-prompt-builder"
(no matches — zero TS errors in modified files)
```

Pre-existing 379 baseline TS errors elsewhere in the package (user/routes, widgets/routes, webapps/trpc-router, file-store, etc.) are unchanged from the 103-03 baseline — out of plan scope per `<scope_boundary>`.

## Acceptance Criteria Verification

| Criterion                                                                                                          | Status |
| ------------------------------------------------------------------------------------------------------------------ | ------ |
| `grep -F "MUST pass display" livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` matches            | ✅ line 192 (JSDoc) + line 223 (snippet string)  |
| `grep -F 'implicitly scoped' livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` does NOT match     | ✅ no matches in file  |
| `grep -F "LUSE_TARGET_DISPLAY" agent-prompt-builder.ts` (in the SNIPPET STRING)                                     | ✅ removed from return body; only present in JSDoc comments (lines 124, 151, 200, 202 — informational, not emitted to LLM) |
| `display: "${input.activeDisplay}"` literal interpolation in snippet                                                | ✅ line 223 |
| `Coordinate space is 1280x720` preserved                                                                            | ✅ line 223 |
| `pnpm vitest run agent-prompt-builder.test.ts` — all tests pass including 4 new                                     | ✅ 26/26 pass |
| TypeScript no new errors                                                                                            | ✅ zero TS errors in modified files |

## Sacred SHA

```
git hash-object liv/packages/core/src/sdk-agent-runner.ts
→ f3538e1d811992b782a9bb057d1b7f0a0189f95f  (UNCHANGED across both commits)
```

Pre-commit hook (`.husky/pre-commit` + `scripts/check-sacred.sh`) fired and passed on commits `dc86a7c2` (RED) and `cab8b331` (GREEN). Plan touched only `livos/packages/livinityd/source/modules/ai/` files — no `liv/packages/core/src/*` modifications.

## Threat Model Verification

| Threat ID     | Component                                              | Disposition | Status                                                                                                                                                  |
| ------------- | ------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-103-04-01   | Prompt injection via activeDisplay or appMeta          | mitigate    | `DISPLAY_RE_PROMPT` regex guard at line 184 UNCHANGED. `sanitizeActiveAppMeta` UNCHANGED. New instruction string is a constant — no new caller-controlled interpolation. |

The new instruction line interpolates only `${input.activeDisplay}` which is already guarded by `DISPLAY_RE_PROMPT.test()` at the function entry. No new attack surface introduced.

## Deviations from Plan

None — plan executed exactly as written.

The only minor judgment call: the plan's `<action>` directed the obsolete `'includes LUSE_TARGET_DISPLAY reference'` test be renamed/updated to assert the new substring. I chose to REPLACE its assertion entirely (it became three more-specific tests: prescriptive form, env-name absence, "implicitly scoped" phrase absence) rather than tweak the existing one in place. Net result: same final test count delta the plan called for (+4 new tests including the inverted check), with sharper test names that document the Phase 103-04 instruction flip explicitly. Existing 22 tests remained untouched and green.

## TDD Gate Compliance

| Gate     | Commit       | Verification                                                                                              |
| -------- | ------------ | --------------------------------------------------------------------------------------------------------- |
| RED      | `dc86a7c2`   | `4 failed | 22 passed` against unchanged source — failures matched expected new assertions                |
| GREEN    | `cab8b331`   | `26 passed | 0 failed` after flipping the snippet's final line — all 4 new tests + 22 existing pass       |
| REFACTOR | (skipped)    | No structural cleanup needed — the change is a one-line string flip + accompanying JSDoc update          |

## Carry-forward to 103-05 / 103-06

- **103-05** (`LIVOS_PER_APP_LUSE='0'` default flip): The prescriptive instruction means the agent SHOULD pass `display` on every call to the single global luse MCP. With per-call routing now reliably surfaced to the LLM, per-WebApp MCP registration becomes redundant — the flag can default to off.
- **103-06** (E2E acceptance): Mini PC live-walk validation should observe transcripts where the agent emits `{"tool": "computer_screenshot", "input": {"display": ":11"}}` etc. Verify by `grep -E 'display": ":(1[0-9]|[1-9])"' /var/log/livos/*.log` after a multi-WebApp session.
- **Belt-and-suspenders runtime check**: If the agent occasionally still omits the arg (LLM compliance is probabilistic), the `LUSE_TARGET_DISPLAY` env fallback in `withScopedDisplay` resolves to the right display anyway. Watch action-summary strings (`display=:11` vs `display=` blank) for compliance rate signal.

## Self-Check

- ✅ `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.ts` — FOUND
- ✅ `livos/packages/livinityd/source/modules/ai/agent-prompt-builder.test.ts` — FOUND
- ✅ Commit `dc86a7c2` — FOUND in `git log` (RED phase)
- ✅ Commit `cab8b331` — FOUND in `git log` (GREEN phase)
- ✅ Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — preserved after both commits

## Self-Check: PASSED
