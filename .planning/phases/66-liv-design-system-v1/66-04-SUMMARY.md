---
phase: 66-liv-design-system-v1
plan: 04
subsystem: design-system
tags: [design-system, icons, tabler, p66]
requires:
  - "@tabler/icons-react@^3.36.1 (already in livos/packages/ui/package.json)"
provides:
  - "LivIcons: typed const map of tool category → Tabler icon component (10 keys)"
  - "LivIconKey: keyof typeof LivIcons type alias"
  - "Single import path '@/icons/liv-icons' for P68-P69 consumers"
affects:
  - "Icon-system inventory for Liv tool views (P68-P69 will adopt incrementally per D-18)"
tech-stack:
  added: []
  patterns:
    - "satisfies Record<string, TablerIcon> pattern for typed-const icon registry"
key-files:
  created:
    - livos/packages/ui/src/icons/liv-icons.ts
  modified: []
decisions:
  - "Used `TablerIcon` (ForwardRefExoticComponent) instead of plan's `Icon` (FunctionComponent) in the satisfies clause — `Icon` does not match the runtime shape of v3.36.1 named exports and would fail typecheck."
metrics:
  duration: "~10 min"
  completed: "2026-05-04T18:35:09Z"
---

# Phase 66 Plan 04: LivIcons Typed Tabler Icon Map Summary

Added `livos/packages/ui/src/icons/liv-icons.ts` exporting `LivIcons` — a typed
const map of 10 tool-category names to `@tabler/icons-react` v3.36.1 components —
plus the `LivIconKey` type alias. This is the icon inventory P68-P69 will consume;
no existing call sites were migrated (D-18 honored).

## Tool-Category Mappings (10)

| Key | Tabler Component | Suna Equivalent | Notes |
|-----|------------------|-----------------|-------|
| `browser` | `IconWorld` | — | General browser tool |
| `screenShare` | `IconScreenShare` | `MonitorPlay` (v31-DRAFT L247) | Suna→Tabler alias |
| `terminal` | `IconTerminal2` | `Terminal` (v31-DRAFT L247) | Suna→Tabler alias |
| `file` | `IconFile` | — | Read/list file tool |
| `fileEdit` | `IconEdit` | — | Edit/str-replace tool |
| `webSearch` | `IconWorldSearch` | `Globe` (v31-DRAFT L247) | Suna→Tabler alias |
| `webCrawl` | `IconSpider` | — | Crawl tool |
| `webScrape` | `IconCode` | — | Scrape (HTML→data) tool |
| `mcp` | `IconBolt` | — | MCP/extensions accent (matches `--liv-accent-violet`) |
| `generic` | `IconTool` | — | Fallback for unknown tools |

## Tabler Version

`@tabler/icons-react@^3.36.1` — already present in
`livos/packages/ui/package.json` dependencies. All 10 icon names verified to
exist in `node_modules/@tabler/icons-react/dist/esm/icons/` before writing the
file.

## Typecheck Status

- Targeted typecheck of `src/icons/liv-icons.ts` (isolated `tsc --noEmit` with
  the same compiler options as `tsconfig.json`): **passes with zero output**.
- Repository-wide `pnpm --filter ui typecheck`: fails, but **only on
  pre-existing errors in `stories/`, `routes/desktop/`, `routes/widgets/`,
  etc.** — none of which were touched by this plan. Per scope boundary in
  `executor-examples.md`, pre-existing typecheck failures in unrelated files
  are out of scope. Zero errors reference `liv-icons.ts`.

## Sacred File Verification

`git hash-object nexus/packages/core/src/sdk-agent-runner.ts` returns
`4f868d318abff71f8c8bfbcf443b2393a553018b` — unchanged.

## D-18 Verification (No Consumer Migrations)

`git diff --stat livos/packages/ui/src/routes/ livos/packages/ui/src/modules/`
shows zero changes. P68-P69 will adopt the `LivIcons` map incrementally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's `satisfies Record<string, Icon>` would fail typecheck**

- **Found during:** Task 1 (pre-write inspection of `@tabler/icons-react` types)
- **Issue:** The plan's `<interfaces>` block specified
  `as const satisfies Record<string, Icon>` and imported `type Icon`. In
  `@tabler/icons-react@3.36.1`, the `Icon` type is
  `FunctionComponent<IconProps>`, but the actual named exports are
  `ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>` (the
  package's own `TablerIcon` type alias). `forwardRef` components are NOT
  structurally assignable to `FunctionComponent` (they carry a `$$typeof`
  symbol and `RefAttributes`), so `satisfies Record<string, Icon>` would emit
  TS2322 errors at the `LivIcons` constant.
- **Fix:** Imported `type TablerIcon` instead of `type Icon` and used
  `satisfies Record<string, TablerIcon>`. `TablerIcon` exactly matches the
  runtime shape of every Tabler v3.x icon export. A header-comment paragraph
  in the file documents the rationale.
- **Files modified:** `livos/packages/ui/src/icons/liv-icons.ts` (the file
  being written for the first time — fix applied at write-time, not as a
  follow-up edit).
- **Commit:** `5209f475`

The plan's automated content check (`grep` for `IconWorld`, `LivIcons`,
`LivIconKey`, `@tabler/icons-react`, all 10 keys) still passes — the `Icon`
type was only in the example block, not in the `must_haves.truths` greppable
list.

### Auth Gates

None.

## Commits

| # | Hash | Type | Description |
|---|------|------|-------------|
| 1 | `5209f475` | feat | add LivIcons typed Tabler icon map for tool categories |

## Self-Check

- [x] `livos/packages/ui/src/icons/liv-icons.ts` exists (48 lines)
- [x] Imports from `@tabler/icons-react`
- [x] All 10 keys present: `browser`, `screenShare`, `terminal`, `file`, `fileEdit`, `webSearch`, `webCrawl`, `webScrape`, `mcp`, `generic`
- [x] Exports `LivIcons` const and `LivIconKey` type
- [x] Zero `lucide-react` imports
- [x] Targeted typecheck passes
- [x] Sacred file SHA unchanged (`4f868d318abff71f8c8bfbcf443b2393a553018b`)
- [x] D-18: zero diff in `routes/` and `modules/`
- [x] Commit `5209f475` exists in git log

## Self-Check: PASSED
