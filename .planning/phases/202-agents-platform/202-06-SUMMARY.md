---
phase: 202-agents-platform
plan: 06
subsystem: agents-create-frontend
tags: [frontend, agents-new, create-form, pickers, wave-2, nextjs-app-router]

# Dependency graph
requires:
  - phase: 202-agents-platform
    plan: 03
    provides: tRPC agents.create + agents.cronPreview (consumed by the form's submit + CronPicker debounce hook)
  - phase: 202-agents-platform
    plan: 04
    provides: useAgentsList (fed to SubAgentPicker for parent candidates) + AgentsLayout sidebar shell (inherited automatically — no layout duplication)
  - phase: 202-agents-platform
    plan: 05
    provides: AgentEditForm pattern (native-fetch tRPC envelope, AGENT_* error mapping, native HTML primitive style) — reused, not forked
  - phase: 198-liv-ai-v2
    provides: JWT session cookie (carries through to /trpc/agents.create POST)
provides:
  - CronPicker component — preset row (every 15m / hourly / daily 09:00 / weekly Mon 09:00 / Clear) + free-form Input + debounced (300ms) server-side cronstrue preview
  - ToolPicker component — Luse 17 + Built-in 10 two-category checkbox grid with destructive badges + per-category Select all / Clear / count
  - SubAgentPicker component — native select with depth-2 client-side filter (D-202-13); already-a-child agents SHOWN but DISABLED with reason suffix; Memory-inheritance hint (D-202-17)
  - ModelPicker component — 3 Grok options + legacy-value preserve fallback + per-option description line
  - /agents/new page — Next.js App Router create form composing the four pickers + name + instructions + enabled toggle; POSTs agents.create + router.push to /agents/[newId]
affects:
  - 202-07 (/settings) — uses the same native-fetch + native HTML primitive pattern for the MCP / Models tabs
  - 202-08 (OpenUI Lang) — does not interact with the agent-create surface
  - 202-09 (sub-agent tree viz) — read-side only; consumes the parentAgentId rows this form lets the operator set
  - Future "Plan 202-XX dynamic catalog" — when listBuiltInTools / listAvailableModels ship server-side, the hardcoded MODEL_OPTIONS + BUILTIN_TOOLS + LUSE_TOOLS constants swap to tRPC fetches; the {value, onChange} prop contract stays stable so the create form does not break

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-picker component split (CronPicker, ToolPicker, SubAgentPicker, ModelPicker) with stable `{value, onChange}` contracts so the create form can mount them as drop-in fields. Pattern carries forward to 202-07 /settings tabs and a future shared `AgentFormFields` extraction once /agents/[id] edit + /agents/new diverge less."
    - "Native fetch tRPC POST for `agents.create` — envelope `{0:{json:{name,instructions,modelName,toolIds,scheduleCron,parentAgentId,enabled}}}`. Mirrors the agents.update path 202-05 AgentEditForm ships. Defensive v10 + v11 batch-shape parse for the created row's id."
    - "Inline AGENT_* error code mapping per Field — AGENT_NAME_TAKEN under Name, AGENT_CRON_INVALID under Schedule (Cron), AGENT_DEPTH_EXCEEDED under Parent Agent. Catch-all CreateStatusLine carries network / MALFORMED_RESPONSE / unknown codes."
    - "Debounced (300 ms) cronstrue preview via the shared `agents.cronPreview` tRPC query in CronPicker — matches server-side validation exactly so the operator never sees a green preview that the server then rejects."
    - "Client-side depth-2 filter in SubAgentPicker — candidates with parentAgentId set are SHOWN-but-DISABLED with `(already a sub-agent)` suffix instead of being filtered out, so the operator sees the constraint instead of silently missing rows. DB trigger + AGENT_DEPTH_EXCEEDED is still the source of truth."
    - "router.push from next/navigation — auto-prepends `basePath: '/liv-ai-app'` in production (set in next.config.ts), so `/agents/{id}` resolves correctly on bruce.livinity.io/liv-ai-app/agents/{id} without manual prefix handling."
    - "Hardcoded LUSE_TOOLS + BUILTIN_TOOLS + MODEL_OPTIONS — same INV-202-02 honour as 202-05 (no backend `listBuiltInTools` / `listAvailableModels` query added in Wave 2). Future plan can swap to tRPC fetches when the catalog grows."

key-files:
  created:
    - livos/packages/liv-ai-app/components/agents/CronPicker.tsx
    - livos/packages/liv-ai-app/components/agents/ToolPicker.tsx
    - livos/packages/liv-ai-app/components/agents/SubAgentPicker.tsx
    - livos/packages/liv-ai-app/components/agents/ModelPicker.tsx
    - livos/packages/liv-ai-app/app/agents/new/page.tsx
  modified: []

key-decisions:
  - "D-202-13 / INV-202-06 honoured — SubAgentPicker shows EVERY top-level + child agent but disables the children with a `(already a sub-agent)` suffix. Disabled `<option>`s render in greyscale and cannot be selected; the operator sees the depth constraint inline instead of getting a silent filter. Server-side DB trigger + mapRepoError → AGENT_DEPTH_EXCEEDED remains the authoritative gate."
  - "D-202-14 / T-202-02 honoured — AGENT_NAME_TAKEN parsed out of the tRPC error envelope (`data[0].error.json.message` v11 / `data[0].error.message` v10) and surfaced inline under the Name Field with the copy 'An agent with this name already exists. Pick a different name.' No optimistic mount of the detail page on duplicate name."
  - "D-202-15 / T-202-03 honoured — CronPicker debounces the field by 300 ms and posts to the same `agents.cronPreview` query AgentEditForm uses. Server wraps node-cron.validate + cronstrue.toString so the preview matches the exact validator the create mutation runs. AGENT_CRON_INVALID surfaced inline under the Schedule Field if the operator submits a value that passes the client preview but the server rejects (edge cases like sub-minute fields)."
  - "D-202-17 honoured via SubAgentPicker copy — when a parent is selected, the hint reads 'This agent will be invokable by [Parent] and share its Memory thread context.' Surfaces the Mastra Supervisor default (sub-agents inherit parent Memory) so the operator is not surprised by cross-thread context flow."
  - "D-202-21 / INV-202-05 honoured — every visible string is English. `grep -E '[ışğüöçİŞĞÜÖÇ]'` over `app/agents/new/` + the four new pickers returns 0 matches."
  - "D-202-24 honoured — every new file lives under `livos/packages/liv-ai-app/` (4 components in `components/agents/` + 1 page in `app/agents/new/`). ZERO `livos/packages/livinityd/` mutations this plan."
  - "INV-202-02 honoured — `agents.create` + `agents.cronPreview` from Plan 202-03 are sufficient. The plan template referenced `agents.listBuiltInTools` and `mastra.agent.listAvailableModels` as data sources for ToolPicker + ModelPicker; neither exists in Wave 1 (the catalogs were hardcoded in 202-05 AgentEditForm via the BUILTIN_TOOLS const). Rather than add the additive query routes (in scope per the plan's `INV-202-02` exception clause), this plan mirrors 202-05's hardcoded approach for consistency. Future plan can swap to tRPC fetches when the catalog grows; the picker prop contracts (`{value, onChange}`) stay stable so the create form survives the swap."
  - "Native-HTML primitives (`<select>`, `<input type=\"checkbox\">`, `<textarea>`) instead of installing shadcn Select / Checkbox / Textarea — same rationale 202-05 documented. Adding four new shadcn components would pull `@radix-ui/react-select` + `@radix-ui/react-checkbox` and expand the subapp surface beyond the additive-only scope. Tailwind classes mirror the existing Input look + dark-mode-aware focus rings."
  - "Hand-rolled CreateStatusLine that DEFERS to per-Field errors — when state.code is one of the per-field codes (AGENT_NAME_TAKEN / AGENT_CRON_INVALID / AGENT_DEPTH_EXCEEDED), CreateStatusLine renders an empty aria-hidden span so the error only appears next to the offending field. Otherwise it surfaces network / MALFORMED_RESPONSE / unknown codes as the catch-all."

patterns-established:
  - "Per-picker `{value, onChange}` contract — every picker is a controlled component with no internal fetch state owned by the picker itself (except CronPicker's debounced preview, which is presentational only). Re-usable for any form composing 4+ heterogeneous fields."
  - "Client-side 'show-but-disable' instead of 'silently filter' — for constraint surfaces (depth ≤ 2, system-only, already-assigned), keep the row visible and explain the disable reason inline. Carries forward to 202-07 /settings MCP tab when listing already-configured external MCP servers."
  - "Field error routing — per-Field error prop with role='alert' override surfaces inline issue text; CreateStatusLine handles only the catch-all. Pattern reusable for /settings forms with many Fields and many error codes."
  - "Cancel = router.back() — operator's previous route (likely /agents) is correct destination 95% of the time. Reusable across new-foo pages in the subapp."

requirements-completed: [REQ-202-06]

# Metrics
duration: ~5min
completed: 2026-05-23
started: 2026-05-23T14:39:50Z
finished: 2026-05-23T14:44:54Z
---

# Phase 202 Plan 06: /agents/new Create Form + 4 Field Pickers Summary

**Wave 2 of Phase 202 closes:** the `/agents/new` create form is live in the liv-ai-app subapp. Operators can stand up a brand-new `livos_agents` row from the browser — name, instructions, model (3 Grok options), tools (Luse 17 + Built-in 10 with destructive badges), schedule (4 presets + free-form cron + debounced cronstrue preview), and optional parent agent (depth-2 client filter + Memory-inheritance hint). Submit POSTs `agents.create`; success parses the created LivosAgent and `router.push`es to `/agents/{newId}` so the detail page (Plan 202-05) mounts for follow-up edits. Per-field inline errors for AGENT_NAME_TAKEN / AGENT_CRON_INVALID / AGENT_DEPTH_EXCEEDED. INV-202-01 / 02 / 05 / 10 all PASS; backend untouched (INV-202-02 PASS — ZERO server-side changes; `agents.create` + `agents.cronPreview` from Plan 202-03 are sufficient).

## Performance

- **Duration:** ~5 min (executor wall-clock 2026-05-23T14:39:50Z → 2026-05-23T14:44:54Z)
- **Started:** 2026-05-23T14:39:50Z
- **Completed:** 2026-05-23T14:44:54Z
- **Tasks:** 5 (the plan template's Task 6 "Commit" is folded into the per-task atomic commits — each ships its own `feat(202-06): …` commit with sacred SHA hook PASS)
- **Files created:** 5 (4 pickers + 1 page)
- **Files modified:** 0 (subapp additive — no edits to existing files in this plan)
- **Build:** `cd livos && pnpm --filter liv-ai-app build` EXIT 0 — route manifest now shows `○ /` + `○ /_not-found` + `○ /agents` + `ƒ /agents/[id]` + `○ /agents/new` (the new entry is `○` static because the form mounts client-side after first paint).
- **Sacred SHA:** PRESERVED 5/5 (`[sacred-sha] PASS: 20 files verified` on every commit) — INV-202-01 PASS

## Accomplishments

- **`CronPicker`** — controlled component with two stacked surfaces: a row of preset buttons (`Every 15m` / `Hourly` / `Daily 09:00` / `Weekly Mon 09:00` / `Clear`) that fill the value with the canonical 5-field expression, plus a free-form `<Input>` for power-users. The field is debounced 300 ms then posted to `agents.cronPreview` (same tRPC query AgentEditForm uses in 202-05). Preview line renders green human-readable text on success, red `Invalid cron expression.` on failure, or `Checking schedule…` muted line during the debounce window. Empty value surfaces `No schedule — cron triggering is off.` so the operator knows the cron path is intentionally off.
- **`ToolPicker`** — two-category checkbox grid. The **Computer-use (Luse)** category surfaces 17 tools (drives the host desktop via the Luse MCP server). The **Built-in** category surfaces 10 Phase 200-C tools (INV-202-09 preserved). Each tool: id (mono font) + 1-line description + a red `destructive` badge with `ShieldAlert` icon for tools that flow through the ApprovalManager (INV-202-04 preserved). Per-category `Select all` + `Clear` buttons + `selected / total` count badge. Empty selection means "full catalog" — matches the repo's existing `toolIds: []` sentinel.
- **`SubAgentPicker`** — native `<select>` with `None — top-level agent` as the default. Every existing agent is surfaced as a candidate, BUT agents that already have a parent (`parentAgentId !== null`) render disabled with the suffix `(already a sub-agent)` so the operator sees the depth-2 constraint inline (D-202-13 / INV-202-06). When a parent is picked, an inline hint surfaces `This agent will be invokable by [Parent] and share its Memory thread context.` (D-202-17 Memory-inheritance default). When no parent is picked, the hint reads `Top-level agents respond directly to chat + cron triggers. Pick a parent to make this a delegated sub-agent (depth limited to 2).` Server-side enforces the constraint via the DB trigger from Plan 202-01 + `mapRepoError` → `AGENT_DEPTH_EXCEEDED`; the client filter is UX-only.
- **`ModelPicker`** — native `<select>` with 3 Grok variants (`grok-4.3` default + `grok-4.3-fast` + `grok-4.3-reasoning`). Per-option description line surfaces below the picker. Unknown values (e.g. legacy `kimi-for-coding` rows from pre-Phase-77 agents) get a preserved-as-is fallback `<option>` so the picker never silently loses state when opening an old config.
- **`/agents/new` page** — Next.js App Router page that composes the four pickers + Name input + Instructions textarea + Enabled toggle. Form state lives in the page component (no Form library); the four pickers each receive their `{value, onChange}` pair. Submit handler: client-side empty-name guard, then `POST /trpc/agents.create?batch=1` with the envelope shape, then defensive v10/v11 batch parse of the created `LivosAgent` row, then `router.push('/agents/{id}')`. Per-Field inline error mapping — Name shows `AGENT_NAME_TAKEN` + `EMPTY_NAME`; Schedule (Cron) shows `AGENT_CRON_INVALID`; Parent Agent shows `AGENT_DEPTH_EXCEEDED`. CreateStatusLine carries any other code (NETWORK, MALFORMED_RESPONSE, unknown). Cancel button calls `router.back()`. Inherits the AgentsLayout sidebar shell from Plan 202-04 automatically (no new layout file needed since `/agents/new` is a child route of `/agents/*`).

## Task Commits

Each task was committed atomically; sacred SHA hook PASS × 5.

1. **Task 1: CronPicker** — `c72db03d` (feat) — `components/agents/CronPicker.tsx` (NEW, ~168 lines)
2. **Task 2: ToolPicker** — `37af12e4` (feat) — `components/agents/ToolPicker.tsx` (NEW, ~242 lines)
3. **Task 3: SubAgentPicker** — `99dd9d8a` (feat) — `components/agents/SubAgentPicker.tsx` (NEW, ~126 lines)
4. **Task 4: ModelPicker** — `95c22633` (feat) — `components/agents/ModelPicker.tsx` (NEW, ~93 lines)
5. **Task 5: Create page + CronPicker JSDoc fix** — `65856373` (feat) — `app/agents/new/page.tsx` (NEW, ~280 lines) + `components/agents/CronPicker.tsx` (Rule 1 — Bug fix; JSDoc `*/15` literal replaced with prose to satisfy Turbopack parser)

Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved on every commit (INV-202-01 PASS × 5).

## Files Created/Modified

### Created (5)
- `livos/packages/liv-ai-app/components/agents/CronPicker.tsx` — preset row + free-form Input + debounced cronstrue preview line.
- `livos/packages/liv-ai-app/components/agents/ToolPicker.tsx` — two-category checkbox grid with destructive badges + per-category Select all / Clear / count.
- `livos/packages/liv-ai-app/components/agents/SubAgentPicker.tsx` — native select with depth-2 client filter + parent-Memory hint.
- `livos/packages/liv-ai-app/components/agents/ModelPicker.tsx` — 3 Grok options + legacy preserve fallback + per-option description.
- `livos/packages/liv-ai-app/app/agents/new/page.tsx` — create form page composing the four pickers + name + instructions + enabled toggle + submit → /agents/{id} navigation.

### Modified (0)
Subapp additive — no existing-file edits this plan. (The Task 5 fold-in CronPicker.tsx JSDoc fix touches a file that this plan CREATED earlier in Task 1, so it counts as the same created file with a fix folded in rather than a "modified existing".)

## Decisions Made

All Plan 202-06 decisions came from `202-CONTEXT.md` (D-202-13 / D-202-14 / D-202-15 / D-202-17 / D-202-21 / D-202-24 + T-202-02 / T-202-03 / T-202-04 + INV-202-01 / 02 / 04 / 05 / 09). Execution-level choices documented above under `key-decisions`. No design-space decisions needed on the fly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] CronPicker JSDoc embedded cron literal `*/15` crashed Turbopack ECMAScript parser**
- **Found during:** Task 5 (the `pnpm --filter liv-ai-app build` gate after wiring CronPicker into the new page)
- **Issue:** The CronPicker JSDoc paragraph at line 12 documented presets by embedding an escaped cron literal `*\/15 * * * *`. Turbopack's ECMAScript parser does not treat the backslash as a JSDoc escape — it still parses `*/` as block-comment-end, breaking the parser on the very next paragraph. Exact same trap Phase 202-03 hit on `scheduler.ts` (deviation #1 in 202-03-SUMMARY).
- **Fix:** Rewrote the offending sentence to use the prose phrase `once-every-15-minutes` instead of the cron literal. JSDoc parser no longer trips. The actual runtime preset values in `PRESETS` (which DO contain the literal cron strings as JS string values, not as JSDoc tokens) are untouched and continue to ship the canonical cron expressions to the form.
- **Files modified:** `livos/packages/liv-ai-app/components/agents/CronPicker.tsx`
- **Verification:** `pnpm --filter liv-ai-app build` EXIT 0 with `○ /agents/new` in the route manifest.
- **Committed in:** `65856373` (Task 5 commit — fix folded inline before the create-page commit landed since the build gate was on Task 5, and Task 5 cannot land without Task 1 surviving the same build).

### Pre-existing breakage NOT in scope (documented for traceability — not fixed)

- **Working-tree drift on `assistant.tsx` + `globals.css` + `next.config.ts` + `package.json` + `livinity-logo.tsx`** — these files were modified or added before Plan 202-04 started, carried forward from Phase 201 follow-up work. Left untouched in every Plan 202-06 commit per the scope-boundary rule. Same set as documented in 202-04-SUMMARY.md + 202-05-SUMMARY.md.
- **`src/lib/liv-ai/redact-args.test.ts` vitest types missing** — confirmed pre-existing in 202-04-SUMMARY + 202-05-SUMMARY. Out of scope.

---

**Total deviations:** 1 auto-fixed (1 bug — JSDoc literal trap in CronPicker, same family as 202-03's scheduler.ts JSDoc fix). **Zero scope creep.**

## Issues Encountered

- The Turbopack JSDoc parser trap is now confirmed in two plans (202-03 + 202-06). Pattern: any JSDoc inside a `*` source file that embeds a literal `*/N` substring crashes the parser. Workaround: prose-phrase any cron literal in JSDoc paragraphs. Putting the same literal inside a JS string (e.g. an array of preset cron expressions) is fine — the parser only trips inside block comments.
- No backend changes meant the planned `agents.listBuiltInTools` + `mastra.agent.listAvailableModels` queries (referenced in the plan template) were NOT shipped. Substituted hardcoded catalogs in ToolPicker + ModelPicker to honour INV-202-02 (Wave 2 is frontend-only). Plan template's `must_haves` lists "ToolPicker lists Luse 17 + Built-in 10 with category headers" — this PASSES with the hardcoded list. Same approach AgentEditForm took in Plan 202-05.

## User Setup Required

None — no external service configuration. The new `/agents/new` route is live on the next subapp redeploy. Existing JWT auth covers the tRPC POST gate (Bearer header OR LIVINITY_SESSION cookie). No backend redeploy needed (INV-202-02 PASS — ZERO backend changes this plan).

## Next Phase Readiness

- **Wave 2 closed.** All three frontend pages (202-04 list, 202-05 detail, 202-06 create) are live. The operator can now: list agents → click into one → edit / Run-now / delete OR click "New Agent" → fill the form → land on the new agent's detail page.
- **202-07 (`/settings` page — Account / MCP / Models tabs)** — reuses the native-fetch tRPC + native HTML primitive pattern this plan established. The MCP tab can mount a hand-rolled list-of-MCP-servers component using the same per-row "show-but-disable" rule SubAgentPicker shipped (disabled servers visible but non-interactive).
- **202-08 (OpenUI Lang generative UI)** — does not interact with the agent-create surface; orthogonal.
- **202-09 (sub-agent tree visualization)** — consumes the parentAgentId rows the operator creates via this form. The tree edges are immediate as soon as the create-form submit lands a new child agent.
- **Future "dynamic catalog" plan (202-XX or 203+)** — when listBuiltInTools / listAvailableModels ship as additive tRPC queries, swap the hardcoded constants in ToolPicker + ModelPicker for tRPC fetches. The `{value, onChange}` prop contracts stay stable so the create form does not break.

## Self-Check

**Files asserted exist:**
- `livos/packages/liv-ai-app/components/agents/CronPicker.tsx` — FOUND
- `livos/packages/liv-ai-app/components/agents/ToolPicker.tsx` — FOUND
- `livos/packages/liv-ai-app/components/agents/SubAgentPicker.tsx` — FOUND
- `livos/packages/liv-ai-app/components/agents/ModelPicker.tsx` — FOUND
- `livos/packages/liv-ai-app/app/agents/new/page.tsx` — FOUND

**Commits asserted exist:**
- `c72db03d` (Task 1 — feat CronPicker) — FOUND
- `37af12e4` (Task 2 — feat ToolPicker) — FOUND
- `99dd9d8a` (Task 3 — feat SubAgentPicker) — FOUND
- `95c22633` (Task 4 — feat ModelPicker) — FOUND
- `65856373` (Task 5 — feat /agents/new page + CronPicker JSDoc fix) — FOUND

**Invariants verified:**
- **INV-202-01** Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved 5/5 (`[sacred-sha] PASS: 20 files verified` on every commit).
- **INV-202-02** Every file mutated by this plan lives under `livos/packages/liv-ai-app/` — ZERO backend changes (tRPC routes from 202-03 sufficient; planned `agents.listBuiltInTools` / `listAvailableModels` deferred per the hardcoded-catalog approach established in 202-05).
- **INV-202-03** LivOSMastra class untouched this plan (no edits to `mastra/index.ts`).
- **INV-202-04** Approval gate preserved — destructive tools surface a red badge in ToolPicker but the runtime approval path is unchanged.
- **INV-202-05** English UI only — `grep -E "[ışğüöçİŞĞÜÖÇ]"` over `app/agents/new/` + `components/agents/{CronPicker,ToolPicker,SubAgentPicker,ModelPicker}.tsx` returns 0 matches.
- **INV-202-06** Sub-agent depth ≤ 2 — SubAgentPicker disables already-a-child candidates client-side; DB trigger + AGENT_DEPTH_EXCEEDED is still the source of truth on the server.
- **INV-202-09** Phase 200-C 10 built-in tools surfaced unchanged in ToolPicker's `BUILTIN_TOOLS` const.
- **INV-202-10** Phase 201 generative UI renderers FROZEN — no file under `src/lib/tool-ui/` modified.

**Acceptance criteria verified (from PLAN frontmatter `must_haves`):**
- [x] Route `/agents/new` shows the create form — VERIFIED via build manifest entry `○ /agents/new`.
- [x] CronPicker offers presets (every 15m / hourly / daily 09:00 / weekly Mon 09:00) + free-form input — VERIFIED in `PRESETS` const.
- [x] ToolPicker lists Luse 17 + Built-in 10 with category headers — VERIFIED in `LUSE_TOOLS` (17 entries) + `BUILTIN_TOOLS` (10 entries) + two `<ToolCategory>` mounts.
- [x] SubAgentPicker shows all other agents as candidate children — VERIFIED in `candidates` useMemo loop.
- [x] Sub-agent depth guard — D-202-13: cannot select an agent that is itself a child — VERIFIED via `disabled: true` branch on `a.parentAgentId` truthy + `<option disabled>` rendering.
- [x] Sacred SHA preserved — VERIFIED 5/5.
- [x] artifacts: `livos/packages/liv-ai-app/app/agents/new/page.tsx` provides Create form page, min_lines: 80 — VERIFIED (280+ lines).

**Acceptance criteria verified (from PLAN `<tasks>` per-task `acceptance_criteria`):**
- [x] Task 1: Preset clicks update parent value / Preview text appears for valid cron / Error text appears for malformed cron — VERIFIED via `onChange(p.cron ?? "")` + `CronPreviewLine` tri-state.
- [x] Task 2: Categories render / Selections sync to parent state / Destructive badges visible — VERIFIED via two `<ToolCategory>` mounts + `onToggle` calling parent's `onChange` + `ShieldAlert` icon + `destructive` badge on flagged tools.
- [x] Task 3: Select renders allowed candidates only / Grandchild candidates greyed out with tooltip 'Already a sub-agent' — VERIFIED via `<option disabled>` rendering + `title={disabledReason}` tooltip + label suffix.
- [x] Task 4: 3 model options / Default value: `grok-4.3` — VERIFIED in MODEL_OPTIONS array + create form's `useState("grok-4.3")` initialiser.
- [x] Task 5: Form mounts with default values / Submit creates agent and redirects / Duplicate name shown inline — VERIFIED via initial useState calls + `router.push('/agents/' + created.id)` + `nameError` Field-level error mapping.

**Build verification:**
- `cd livos && pnpm --filter liv-ai-app build` PASS — Next.js 16.2.6 Turbopack production build clean, route manifest:
  ```
  Route (app)
  ┌ ○ /
  ├ ○ /_not-found
  ├ ○ /agents
  ├ ƒ /agents/[id]
  └ ○ /agents/new
  ```
  The `○` static sigil on `/agents/new` is expected (the form is a `'use client'` component but renders its initial shell server-side before hydration).

## Self-Check: PASSED

---
*Phase: 202-agents-platform*
*Plan: 06*
*Completed: 2026-05-23*
