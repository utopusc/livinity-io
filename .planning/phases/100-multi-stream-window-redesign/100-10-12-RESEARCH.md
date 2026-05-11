# 100-10-12 RESEARCH — SelfClaude Action-Driven Teach Pattern

**Source:** https://github.com/utopusc/selfclaude (user's hackathon project)
**Audience:** Phase 101 design+implementation team (likely future-self in next session)
**Status:** Research artifact — no source code shipped in 100-10-12. Phase 101 implements.
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sdk-agent-runner.ts) NEVER touched.

---

## What the user wants

Teach mode should be **event-driven**, not interval-driven:

1. User clicks "Record" / "Teach" button → mode enters armed state. NO continuous capture starts.
2. User CLICKS on the WebApp stream (a single click on a real UI element).
3. The system PAUSES, opens a small "What was that for?" prompt anchored near the click point.
4. User types an instruction in plain language: e.g. "Click the search box".
5. User submits → step is recorded as `{action: 'click', x: 543, y: 287, instruction: "Click the search box", t: T}`.
6. Mode returns to armed; user can click again to record next step.
7. User clicks "Stop" / "Save" to finalize the skill.

Replay path:
- For each step, executor runs the action (e.g. xdotool click @x,y on the WebApp's wid OR the Luse agent reads the instruction text + screenshot and performs the click via vision).
- The instruction is the HINT for the agent during replay. If pixel coords drift (window resized, UI changed), the agent uses the instruction text to recover the intent.

---

## Current LivOS Teach (P95-P96 + 100-09 baseline)

- **INTERVAL-DRIVEN:** timer fires every ~1s, captures a frame
- Frames have timestamps; replay = re-emit frames at recorded timing
- No semantic annotation; debugging a flaky replay means reading raw mouse coordinates

This is the wrong abstraction for the user's use case. The user wants TEACHING semantics, not screen recording.

---

## Data model diff

### v2 (today)

```json
{
  "version": 2,
  "events": [
    {"t": 1717000000000, "type": "frame", "screenshot": "<base64>"},
    {"t": 1717000001000, "type": "click", "x": 543, "y": 287, "wid": "0x..."}
  ]
}
```

### v3 (proposed SelfClaude pattern)

```json
{
  "version": 3,
  "name": "Open Gmail and compose",
  "steps": [
    {
      "t": 1717000000000,
      "action": {"type": "click", "x": 543, "y": 287, "wid": "0x...", "button": 1},
      "instruction": "Click the search box",
      "screenshot_before": "<base64>",
      "screenshot_after": "<base64>"
    },
    {
      "t": 1717000005000,
      "action": {"type": "type_text", "text": "hello world"},
      "instruction": "Type the search query",
      "screenshot_before": "<base64>",
      "screenshot_after": "<base64>"
    }
  ]
}
```

**Backwards-compat:** existing `mcp__bytebot__*` → `mcp__luse__*` shim (100-10-02 D-100-10-I) already lazy-translates v2 events. v3 introduces `steps` field; v2 `events` field still recognized by replay engine via the existing dispatcher path.

---

## UX flow (wireframe to be designed in Phase 101)

1. WebApp stream visible. Teach button in floating bottom bar (post-100-10-05 outside-window pattern).
2. Click Teach → button turns red (already done in 100-09-09), small "Click to record step" caption shows beneath.
3. User clicks anywhere in the stream area → click is captured, stream is BRIEFLY paused, a popover anchored to click point opens: **"What did you do?"** with text input + Save button + Cancel button.
4. User types instruction + Save → step saved, popover closes, mode returns to armed-record state.
5. Click Stop / Save → skill finalized with metadata (name? auto-generate from first instruction? user-provided?).

Cancel skips the step (so accidental clicks don't auto-record).

---

## CDP vs xdotool capture comparison

| Aspect | xdotool spy (today) | CDP (Phase 101) |
|--------|---------------------|-----------------|
| Click event source | poll `xdotool getmouselocation` (laggy, missed events) | `Input.dispatchMouseEvent` callback (frame-perfect) |
| Modifier capture | requires xinput tracking | CDP carries modifier flags natively |
| Cross-window | manual wid wrangling | CDP scopes events to target |
| Replay precision | timing drift accumulates | CDP can re-dispatch with original modifier flags |
| Privacy/scope | system-wide (sees host clicks too) | scoped to Chrome target only |
| Latency | ~50-200ms per poll cycle | ~5-20ms event-driven |

CDP wins for SelfClaude pattern. Aligned with Phase 101 overall direction (CDP orchestration).

---

## Migration path

- **v2 skills** (existing user recordings) → replay via v2 path (interval-based, current dispatcher code). Lazy-translate `mcp__bytebot__*` → `mcp__luse__*` per 100-10-02 shim.
- **v3 skills** (post-Phase 101 recordings) → semantic event-driven path. New `replayV3Skill` function consumes the `steps` array.
- A `liv:config:teach_mode_version` Redis flag controls which path the UI uses (forward-compat hook). Default `v2` until Phase 101 lands.

---

## Open questions for Phase 101 design

1. **Modal vs non-blocking popover:** Should the instruction prompt be modal-blocking (user must answer before next click registers), or queued (user can keep clicking and annotate retroactively)?
   - Recommendation: modal-blocking for the first version. Reduces ambiguity in what each annotation maps to.

2. **Scroll/keyboard events:** How are non-click events captured?
   - Option A: every keyboard event opens prompt (annoying)
   - Option B: only mouse clicks open prompt; keyboard buffered into the previous click's action chain
   - Recommendation: Option B with a "Pause buffer" affordance.

3. **Per-step screenshot:** Store before+after as base64 (heavy) or hash-only signature for drift detection?
   - Recommendation: base64 before+after for v3 v1, optional compression in v3 v2.

4. **Agent-as-recorder:** Should the AGENT itself be the recorder — watching the user's actions and writing the instruction text via vision? Inverse SelfClaude.
   - This is a major architecture choice. Defer to a Phase 101 sub-decision.

5. **Replay error recovery:** If step N fails (pixel coords drift, UI changed), should the agent self-recover using the instruction text via vision?
   - Advanced — likely Phase 102. v3 ships with hard-fail on drift; recovery is a feature flag for later.

6. **Naming and persistence:** Where do v3 skills live in storage? Same table as v2 with a `version` column, OR a new `teach_skills_v3` table?
   - Recommendation: same table with version column. Reduces schema churn.

---

## Reference reading

- https://github.com/utopusc/selfclaude — README + capture flow + replay engine
- https://chromedevtools.github.io/devtools-protocol/tot/Input/ — CDP `Input.dispatchMouseEvent`
- https://chromedevtools.github.io/devtools-protocol/tot/Page/ — CDP `Page` domain (frame events, navigation)
- `.planning/phases/100-multi-stream-window-redesign/100-10-CONTEXT.md` → "Deferred Ideas" → "Single Chrome multi-tab via DevTools Protocol — major rewrite, defer to v34" — Phase 101 enables CDP.
- `.planning/phases/100-multi-stream-window-redesign/100-09-09-SUMMARY.md` — Teach button red + click count (existing UX scaffolding to extend in v3).
- `.planning/phases/100-multi-stream-window-redesign/100-10-08-SUMMARY.md` — D-100-10-A revert; single :1 display + shared profile + Chrome singleton — the constraints Phase 101 inherits.

---

## Sacred SHA (carries forward unchanged)

`liv/packages/core/src/sdk-agent-runner.ts` MUST equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` before AND after every commit in Phase 101 — including the SelfClaude Teach refactor. Pre-commit hook enforces. NEVER `--no-verify`.

---

**Next step:** When Phase 101 starts, this research is the input. Run `/gsd-discuss-phase 101` (after creating the phase entry per the existing ROADMAP plant), then `/gsd-plan-phase 101` with this file in `<files_to_read>`.
