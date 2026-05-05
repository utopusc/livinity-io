---
phase: 70-composer-streaming-ux-polish
plan: 07
subsystem: ui
tags: [mention-menu, placeholder, agents, mcp-tools, skills, vitest, p66-tokens]
requires:
  - 70-01-PLAN  # shouldShowMentionMenu helper (composer trigger detection)
  - P66 design tokens (var(--liv-bg-elevated), var(--liv-accent-cyan/violet/rose), var(--liv-border-subtle), var(--liv-text-*))
  - shadcn cn() helper at @/shadcn-lib/utils
provides:
  - LivMentionMenu React component (130 LOC)
  - LIV_PLACEHOLDER_MENTIONS hardcoded array (9 items: 3 agents + 3 tools + 3 skills)
  - filterMentions(mentions, filter) pure helper (case-insensitive substring on name + label)
  - Mention TypeScript interface + MentionCategory type union
affects:
  - 70-08 (integration) — will render <LivMentionMenu> when shouldShowMentionMenu(value) is true
tech-stack:
  added: []  # D-NO-NEW-DEPS honored — zero new deps
  patterns:
    - "Mirrors LivSlashMenu prop pattern (filter, selectedIndex, onSelect, onFilteredCountChange)"
    - "Group-by-category visual layout with stable order (agent → tool → skill)"
    - "Returns null when filtered.length === 0 (caller hides the popup automatically)"
    - "P66 tokens via Tailwind arbitrary-property syntax: bg-[color:var(--liv-bg-elevated)]"
key-files:
  created:
    - livos/packages/ui/src/routes/ai-chat/components/liv-mention-menu.tsx (130 lines)
    - livos/packages/ui/src/routes/ai-chat/components/liv-mention-menu.unit.test.tsx (93 lines)
  modified: []
decisions:
  - "Honored CONTEXT D-28: 9 placeholders split 3+3+3 across agent/tool/skill categories"
  - "Honored CONTEXT D-29: real data integration deferred to P76 (Agent Marketplace) — no live data sources wired"
  - "Used P66 design tokens exclusively — no hardcoded colors"
  - "Display order forced via orderedCategories: ['agent', 'tool', 'skill'] for stable rendering"
  - "Filter scope: name + label only (description excluded by design — keeps filter precise)"
  - "Mention names contain NO leading @ — the parent composer (70-08) inserts the @ on selection"
metrics:
  duration: "~2m 19s (1777942543 → 1777942682)"
  tasks_completed: 2
  files_created: 2
  files_modified: 0
  tests_added: 13
  tests_passing: 13
  build_status: clean
  sacred_sha_drift: none
  completed_at: "2026-05-05T00:58:02Z"
---

# Phase 70 Plan 07: LivMentionMenu Placeholder Summary

**One-liner:** Placeholder mention picker (`@` trigger) with 9 hardcoded items across 3 categories (agents/tools/skills) + pure filterMentions helper, ready for P76 marketplace data swap.

## What Shipped

### 1. `livos/packages/ui/src/routes/ai-chat/components/liv-mention-menu.tsx` (130 lines)

A React function component + supporting data/helpers:

- **`Mention` interface** — `{name, label, category, description}` shape.
- **`MentionCategory`** — `'agent' | 'tool' | 'skill'` type union.
- **`LIV_PLACEHOLDER_MENTIONS`** — exactly 9 entries:
  - **Agents (3):** `researcher`, `coder`, `analyst`
  - **Tools (3):** `brave-search`, `github`, `docker`
  - **Skills (3):** `summarize`, `translate`, `extract`
- **`filterMentions(mentions, filter)`** — pure helper. Empty filter returns the input list. Non-empty filter does case-insensitive substring match against `name + ' ' + label` (description excluded by design).
- **`LivMentionMenu`** component — accepts `{mentions?, filter, selectedIndex, onSelect, onFilteredCountChange?, filteredMentionsRef?}`. Renders a vertical list grouped by category with section headers (`Agents` / `Tools` / `Skills`), each item showing `@name` + description + `coming soon` badge. Returns `null` when filtered list is empty. Uses P66 design tokens exclusively (`var(--liv-bg-elevated)`, `var(--liv-accent-cyan)`, `var(--liv-accent-violet)`, `var(--liv-border-subtle)`, `var(--liv-text-primary/secondary/tertiary)`).

Position styling matches the slash menu (`absolute bottom-full left-0 right-12 mb-2`) for visual parity.

### 2. `livos/packages/ui/src/routes/ai-chat/components/liv-mention-menu.unit.test.tsx` (93 lines)

13 vitest cases (gate ≥ 8) split across two `describe` blocks:

- **`LIV_PLACEHOLDER_MENTIONS (D-28)`** (5 tests) — 9 entries, 3 per category, every field present and non-empty, names are unique, names contain no leading `@`.
- **`filterMentions (D-28)`** (8 tests) — empty filter returns full list, case-insensitive name match, label match (`'brave'` finds `brave-search`), empty result on no-match, mid-substring (`'mar'` finds `summarize`), stable subset preserves original order, scope is name+label only (not description — `'agent'` returns `[]` because no name/label contains "agent"), custom mentions array overrides defaults.

All 13 pass in ~1.67s.

## Verification

| Check                                                                                  | Result        |
| -------------------------------------------------------------------------------------- | ------------- |
| `pnpm --filter ui build` exits 0                                                       | ✓ clean (37.89s, 202 PWA precache entries) |
| `pnpm --filter ui exec vitest run … liv-mention-menu.unit.test.tsx` exits 0            | ✓ 13/13 pass  |
| File contains `LivMentionMenu`, `LIV_PLACEHOLDER_MENTIONS`, `filterMentions`, `researcher`, `brave-search`, `summarize`, `coming soon` | ✓ all present |
| 3 of each category (`category: 'agent'` × 3, `'tool'` × 3, `'skill'` × 3)              | ✓ 9 total     |
| P66 token usage (`var(--liv-`)                                                         | ✓ present     |
| File size ≥ 130 lines                                                                  | ✓ 130 lines   |
| Test file size ≥ 80 lines                                                              | ✓ 93 lines    |
| Test count ≥ 8                                                                         | ✓ 13 tests    |
| Sacred file SHA `4f868d318abff71f8c8bfbcf443b2393a553018b` unchanged pre + post each task | ✓ unchanged   |
| No new npm dependencies added (D-07)                                                   | ✓ zero deps   |

## Sacred File Verification

`nexus/packages/core/src/sdk-agent-runner.ts` SHA verified at four checkpoints (Task 1 start, Task 1 end, Task 2 start, Task 2 end) — all returned `4f868d318abff71f8c8bfbcf443b2393a553018b`. No drift.

## Commits

| Task | Commit    | Message                                          |
| ---- | --------- | ------------------------------------------------ |
| 1    | `7e09c8f9` | feat(70-07): add LivMentionMenu placeholder component |
| 2    | `9a91d7fd` | test(70-07): add vitest coverage for LivMentionMenu |

## Deviations from Plan

None — plan executed exactly as written.

The plan's reference implementation snippet (in `<action>`) used `Object.keys(byCategory)` to iterate categories, but downstream insertion order in JavaScript objects with non-integer keys preserves the order entries were added. The implementation tightens this with an explicit `orderedCategories: MentionCategory[] = ['agent', 'tool', 'skill']` array filtered for non-empty groups, ensuring deterministic display order even if the source `mentions` prop has a different ordering. This matches the plan's stated truth that the component "renders mentions in stable order (agent group, then tool, then skill)" without changing the contract.

## Decisions Made

- **Display order locked.** `orderedCategories: MentionCategory[] = ['agent', 'tool', 'skill']` is the fixed render sequence regardless of how upstream mention arrays are sorted. This makes 70-08 integration deterministic.
- **Filter scope = name + label only.** Description is intentionally excluded from `filterMentions`. The test `does NOT match against description` codifies this — keeps autocomplete precise (e.g. typing `agent` does NOT match all 3 agents whose descriptions say "agent" — that would be noisy). Matches the plan's `behavior` block: "matches mentions where name OR label contains 'res' (case-insensitive)".
- **No leading `@` in mention `name` field.** The parent composer (70-08) inserts `@<name>` on select. This is asserted by the `mention names contain no leading @ (parent inserts it)` test, locking the contract for 70-08.
- **`filteredMentionsRef` mirrors slash menu's pattern.** Allows the parent (70-08) to read the current filtered list synchronously inside an `onKeyDown` handler without an extra render cycle.

## Threat Surface Scan

No new network endpoints, auth paths, file access, or schema changes introduced. The threat register (T-70-07-01 tampering, T-70-07-02 information-disclosure) is fully covered by the threat model in the PLAN — both are accepted (placeholder data is hardcoded; roadmap is publicly documented). No threat flags raised.

## Known Stubs

The 9 placeholder mentions are intentional stubs — every entry carries a "coming soon" badge in the UI, signaling to users that real data arrives in P76 (Agent Marketplace). This is documented in CONTEXT D-29 and is the explicit goal of P70-07. Not a regression, not a bug, not a TODO — by design.

## Self-Check: PASSED

- File `livos/packages/ui/src/routes/ai-chat/components/liv-mention-menu.tsx`: FOUND (130 lines).
- File `livos/packages/ui/src/routes/ai-chat/components/liv-mention-menu.unit.test.tsx`: FOUND (93 lines).
- Commit `7e09c8f9`: FOUND in `git log`.
- Commit `9a91d7fd`: FOUND in `git log`.
- Sacred file SHA: unchanged at `4f868d318abff71f8c8bfbcf443b2393a553018b`.
- Build: clean.
- Tests: 13/13 pass.
