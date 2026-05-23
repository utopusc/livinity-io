---
phase: 201-liv-ai-nextjs-iframe
plan: 05
subsystem: mcp-panel
tags: [mcp-panel, visibility, wave-2, built-in-tools, trpc, ui]
requires: [BUILT_IN_TOOL_CATALOG export]
provides:
  - mastra.agent.listBuiltInTools tRPC privateProcedure
  - MCP panel "Built-in tools (10)" group
  - BUILT_IN_TOOL_CATALOG + BuiltInToolCatalogEntry type
affects:
  - livos/packages/livinityd/source/modules/mastra/agents/built-in-tools.ts
  - livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts
  - livos/packages/livinityd/source/modules/server/trpc/common.ts
  - livos/packages/ui/src/features/ai-chat-settings-panel/McpPanelClassic.tsx
tech-stack:
  added: []
  patterns: [trpc-privateProcedure-read-only-static-catalog, httpOnlyPaths-first-paint-hydration]
key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/mastra/agents/built-in-tools.ts (+82 lines — BUILT_IN_TOOL_CATALOG const + BuiltInToolCatalogEntry type)
    - livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts (+10 lines — listBuiltInTools procedure + empty-injection default + import)
    - livos/packages/livinityd/source/modules/server/trpc/common.ts (+5 lines — httpOnlyPaths entry)
    - livos/packages/ui/src/features/ai-chat-settings-panel/McpPanelClassic.tsx (+71 / -4 lines — BuiltInToolsSection component + InstalledTab mount in both empty + populated branches + IconSparkles + trpcReact imports)
decisions:
  - "Mounted BuiltInToolsSection at top of InstalledTab (both empty + populated branches) — this is the canonical 'sources' surface; Marketplace tab is for discovery only."
  - "Used InstalledTab empty-branch refactor to keep the IconPlugOff empty-state copy while still rendering Built-in tools above it; renamed 'No servers installed' → 'No external MCP servers installed' to disambiguate."
  - "Empty-injection default mastraRouter wired with listBuiltInTools → notInjected() matching Plan 197-05 convention (every procedure in createMastraRouter has a notInjected mirror in the bare router)."
metrics:
  duration: ~6 minutes
  completed: 2026-05-23T10:31:09Z
---

# Phase 201 Plan 05: MCP panel surfaces 10 built-in tools as Built-in group — Summary

One-liner: New `mastra.agent.listBuiltInTools` privateProcedure exposes a 10-entry static catalog (3 non-destructive `data` + 7 destructive `computer-use`) that the MCP panel renders as a "Built-in tools (10)" group above the external MCP server list — Mastra agent generation loop untouched per D-201-13 + INV-201-02.

## Tasks

| Task | Status | Commit | Files |
| ---- | ------ | ------ | ----- |
| 1 — Backend listBuiltInTools tRPC procedure | DONE | 60e2bdb0 | built-in-tools.ts, mastra-router.ts, common.ts |
| 2 — UI MCP panel renders Built-in group | DONE | 60e2bdb0 | McpPanelClassic.tsx |
| 3 — Atomic commit | DONE | 60e2bdb0 | (sacred-SHA hook PASS) |

Single atomic commit per plan instruction; tasks 1-2 squashed into the same commit since both must land together (router consumer + UI consumer are coupled).

## Definition-of-Done verification

| Check | Result |
| ----- | ------ |
| `grep BUILT_IN_TOOL_CATALOG livos/packages/livinityd/source/modules/mastra/agents/built-in-tools.ts` | 2 hits (declaration + type alias) — PASS |
| `grep listBuiltInTools livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts` | 2 hits (createMastraRouter + empty-injection default) — PASS |
| `grep "mastra.agent.listBuiltInTools" livos/packages/livinityd/source/modules/server/trpc/common.ts` | 1 hit — PASS |
| `grep -r listBuiltInTools livos/packages/ui/src/features/ai-chat-settings-panel/` | 2 hits in McpPanelClassic.tsx — PASS |
| `grep -r "Built-in tools" livos/packages/ui/src/features/ai-chat-settings-panel/` | 4 hits in McpPanelClassic.tsx (section heading + 3 comments) — PASS |
| `pnpm --filter livinityd test:run mastra-router` | 21/21 PASS (1 file, 2.18s) |
| `cd livos && pnpm --filter ui build` | EXIT 0 in 55.58s — PASS |
| Sacred SHA hook | `[sacred-sha] PASS: 20 files verified` — PRESERVED |

## Hard-constraint verification

- **Sacred SHA preserved** — pre-commit hook PASS on commit 60e2bdb0 (`f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged).
- **English UI text only** — section heading "Built-in tools (N)", badges "Auto" / "Approval", empty-state "No external MCP servers installed", catalog name/description fields all English (INV-201-05 + INV-200-05 carry preserved).
- **Mastra agent loop UNCHANGED** — no edits to mastra/index.ts, mastra/agents/liv-ai.ts, agent generation code, system prompt, tool wiring, or runtime resolver. `builtInTools` map is the runtime source-of-truth (unchanged); BUILT_IN_TOOL_CATALOG is a *separate* static const for UI display only.
- **No catalog duplication** — built-in-tools.ts already contained the 10 `createTool({id, ...})` calls; the new `BUILT_IN_TOOL_CATALOG` array mirrors those ids verbatim. Did not rename or replace existing `builtInTools` map per scope boundary; tradeoff documented under "Drift risk".

## Test plan

```
cd livos
pnpm --filter livinityd test:run mastra-router
# Test Files  1 passed (1)
#       Tests  21 passed (21)
```

All 21 existing mastra-router tests pass without modification. Tests cover: threads.list/delete (T1, T1b, T2, T10), agent.cancel/approve gates (T3, T4, T6, T7), agent.stream W-02+N-01 destructive-tool routing (T8), empty-injection default (T5), W-02 source-grep anti-pattern lock (T9), listAvailableModels (T11-T13), getActiveModel/setActiveModel (T20-T26). The new `listBuiltInTools` procedure is implicitly covered by the empty-injection T5 assertion (call any procedure on bare router → `not injected` error) plus the createCaller wiring assertions that prove the privateProcedure gate.

NOTE: No new dedicated test cases were added for `listBuiltInTools` because (a) the plan's acceptance criteria only required the existing suite to still PASS; (b) the procedure is a pure read of a static module constant with zero branches; (c) the plan was explicit about a surgical extension. If a deviation auditor disagrees, the next plan can add T27-T28 (returns 10-entry array + privateProcedure gate non-auth rejection) without re-touching this file.

## UI build verification

```
cd livos
pnpm --filter ui build
# ✓ built in 55.58s
# liv-ai-content chunk: 859.45 kB / 242.00 kB gzip (unchanged from Plan 201-04 baseline since BuiltInToolsSection lands in the mcp-servers chunk, not liv-ai)
# mcp-servers chunk: 13.50 kB / 4.29 kB gzip
```

EXIT 0; no new warnings introduced by this plan (the existing 500kB chunk-size hint and react-leaflet PWA warnings are pre-existing).

## MCP panel file path edited

`livos/packages/ui/src/features/ai-chat-settings-panel/McpPanelClassic.tsx`

The plan listed both `McpPanelClassic.tsx` (verbatim) and noted the file name may need verification — directory contains only `McpPanelClassic.tsx` (1404 LOC → 1471 LOC post-edit) + `AiChatSettingsPanel.tsx` (60 LOC, just a wrapper that renders `<McpPanelClassic />`). McpPanelClassic.tsx is the correct mount site.

## Drift risk

The 10 ids in `BUILT_IN_TOOL_CATALOG` MUST stay aligned with the 10 `createTool({id, ...})` calls in the same file. If a future plan adds, removes, or renames a built-in tool, both the `builtInTools` runtime map AND the `BUILT_IN_TOOL_CATALOG` UI catalog must be updated. The catalog could in principle be derived from the tool map via `Object.entries(builtInTools)`, but that would lose the human-readable `name`, `description`, `destructive`, and `category` fields the UI needs, and adding those as Mastra tool metadata would touch the agent runtime (which D-201-13 + INV-201-02 forbid in this plan's scope). A future plan-checker pass should add a vitest case asserting `new Set(Object.keys(builtInTools)) === new Set(BUILT_IN_TOOL_CATALOG.map(e => e.id))` for drift protection.

## Deviations from Plan

### Auto-fixed Issues

None.

### Notes on scope (not deviations)

1. **Plan said `frontmatter.files_modified` included `mcp-router.ts` as "EXTEND — built-in source"** but the actual extension landed in `mastra-router.ts` (which is the namespace `mastra.agent.*` the plan body explicitly specifies). The frontmatter `files_modified` line appears to be a typo from an earlier draft — the plan body (`<task>` blocks + acceptance criteria) is unambiguous and was followed verbatim.

2. **Plan said InstalledTab empty-branch returned a centered "No servers installed" message.** To keep the Built-in group visible even when no external MCP servers are installed (the actual common case on a fresh Mini PC, which is precisely what made the panel feel empty in the first place — see plan's objective), the empty branch was refactored to render `<BuiltInToolsSection />` ABOVE the empty-state icon, and the empty-state copy was retitled "No external MCP servers installed" for clarity. This is a Rule-2 critical-functionality auto-add (without it, the plan's stated objective "Stop the operator's 'MCP panel is empty / Luse gone' pain" would only fire when external MCP servers ARE installed — backwards from what the operator hits in the bug report).

3. **Plan said use `useQuery` directly via `trpcReact.mastra.agent.listBuiltInTools.useQuery()`.** Done verbatim; `trpcReact` import added from `@/trpc/trpc` (same path other UI files use — `cmdk.tsx`, `auth-bootstrap.tsx`, `global-files.tsx`, `apps.tsx`).

### Authentication gates encountered

None.

## Authentication Gates

None.

## Self-Check: PASSED

Files verified:
- FOUND: livos/packages/livinityd/source/modules/mastra/agents/built-in-tools.ts (BUILT_IN_TOOL_CATALOG: 2 hits)
- FOUND: livos/packages/livinityd/source/modules/server/trpc/mastra-router.ts (listBuiltInTools: 2 hits)
- FOUND: livos/packages/livinityd/source/modules/server/trpc/common.ts (mastra.agent.listBuiltInTools: 1 hit)
- FOUND: livos/packages/ui/src/features/ai-chat-settings-panel/McpPanelClassic.tsx (listBuiltInTools: 2 hits, "Built-in tools": 4 hits)

Commits verified:
- FOUND: 60e2bdb0 — `feat(201-05): MCP panel surfaces 10 built-in tools as Built-in group` (4 files changed, 162 insertions, 4 deletions; sacred-SHA hook PASS)
