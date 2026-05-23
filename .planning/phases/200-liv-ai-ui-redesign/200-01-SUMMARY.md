---
phase: 200-liv-ai-ui-redesign
plan: 01
subsystem: liv-ai-ui
tags: [phase-200, wave-0, dep-audit, shadcn, avatar, collapsible, foundation]
requires: []
provides:
  - shadcn-avatar-primitive
  - shadcn-collapsible-primitive
  - radix-avatar-dep
  - radix-collapsible-dep
affects:
  - livos/packages/ui/package.json
  - livos/pnpm-lock.yaml
  - livos/packages/ui/src/shadcn-components/ui/avatar.tsx
  - livos/packages/ui/src/shadcn-components/ui/collapsible.tsx
tech-stack:
  added:
    - "@radix-ui/react-avatar@^1.1.11"
    - "@radix-ui/react-collapsible@^1.1.12"
  already-present:
    - "zustand@^5.0.2"
    - "remark-gfm@^4.0.0"
  patterns:
    - "verbatim shadcn registry copy (D-200-02) — no `npx shadcn add` to avoid Windows postinstall ELIFECYCLE (Phase 198-02 documented)"
    - "pnpm add -F ui --ignore-scripts <pkg> — bypasses tabler-icons cp -r postinstall failure on Windows host"
key-files:
  created:
    - livos/packages/ui/src/shadcn-components/ui/avatar.tsx
    - livos/packages/ui/src/shadcn-components/ui/collapsible.tsx
    - .planning/phases/200-liv-ai-ui-redesign/200-01-SUMMARY.md
  modified:
    - livos/packages/ui/package.json
    - livos/pnpm-lock.yaml
decisions:
  - "D-200-05 closed: dep audit done, 2 of 4 deps added (avatar + collapsible)"
  - "D-200-06 closed: avatar.tsx ported verbatim from shadcn registry default style"
  - "D-200-07 closed: collapsible.tsx ported verbatim from shadcn registry default style"
metrics:
  duration: ~6 minutes
  completed: 2026-05-23
sacred_sha: f3538e1d811992b782a9bb057d1b7f0a0189f95f
sacred_sha_status: PASS
---

# Phase 200 Plan 01: Dep Audit + shadcn Avatar/Collapsible Install Summary

One-liner: Wave 0 foundation laid — added the 2 missing Radix dependencies (`@radix-ui/react-avatar`, `@radix-ui/react-collapsible`) and ported the 2 shadcn primitive wrappers (`avatar.tsx`, `collapsible.tsx`) into `livos/packages/ui/src/shadcn-components/ui/` so Plan 200-02's registry port can compile.

## Objective

Audit `livos/packages/ui/package.json` against the four Wave 0 deps required by the upcoming Plan 200-02 registry port (`zustand`, `remark-gfm`, `@radix-ui/react-collapsible`, `@radix-ui/react-avatar`). Add any missing entries, then port two missing shadcn primitives verbatim from the canonical `https://ui.shadcn.com/registry/styles/default/{avatar,collapsible}.json` payloads.

## Audit Log — 4 Wave-0 Dependencies

| Package | Pre-Plan State | Action | Final Version |
|---------|---------------|--------|---------------|
| `zustand` | PRESENT (`^5.0.2`) in `dependencies` | none | `^5.0.2` (unchanged) |
| `remark-gfm` | PRESENT (`^4.0.0`) in `dependencies` | none | `^4.0.0` (unchanged) |
| `@radix-ui/react-avatar` | ABSENT | `pnpm add -F ui --ignore-scripts @radix-ui/react-avatar` | `^1.1.11` |
| `@radix-ui/react-collapsible` | ABSENT | `pnpm add -F ui --ignore-scripts @radix-ui/react-collapsible` | `^1.1.12` |

**Permissive scope (INV-200-04):** exactly two new explicit `dependencies` entries added. Both were already resolvable transitively in `pnpm-lock.yaml` (pulled in by `@streamdown/code` or `@assistant-ui/react`), but adding them as **explicit top-level deps** ensures Plan 200-02's verbatim imports (`import * as AvatarPrimitive from '@radix-ui/react-avatar'`) resolve under strict pnpm isolation without depending on hoisting accidents.

Post-Plan grep verifies all four present:

```
$ grep -E '"(zustand|remark-gfm|@radix-ui/react-collapsible|@radix-ui/react-avatar)"' livos/packages/ui/package.json
		"@radix-ui/react-avatar": "^1.1.11",
		"@radix-ui/react-collapsible": "^1.1.12",
		"remark-gfm": "^4.0.0",
		"zustand": "^5.0.2"
```

## Lockfile Delta

```
$ git diff --stat livos/pnpm-lock.yaml livos/packages/ui/package.json
 livos/packages/ui/package.json | 14 ++++++++------
 livos/pnpm-lock.yaml           | 32 ++++++++++++++++++++++++++++++++
 2 files changed, 40 insertions(+), 6 deletions(-)
```

The lockfile gained 32 lines (new top-level `dependencies` blocks for `react-avatar` 1.1.11 + `react-collapsible` 1.1.12). The package.json reformat counts 14 lines (alphabetized insertion among existing `@radix-ui/*` siblings — pnpm reformatting churn).

## Shadcn Primitive Ports

### avatar.tsx (39 lines)

Path: `livos/packages/ui/src/shadcn-components/ui/avatar.tsx`

Source: `https://ui.shadcn.com/registry/styles/default/avatar.json` (canonical shadcn registry, default style — payload from the plan's `<interfaces>` block, verbatim).

Exports: `Avatar`, `AvatarImage`, `AvatarFallback` (Radix Avatar wrappers via `forwardRef`).

`cn` import path resolved to `@/shadcn-lib/utils` per `components.json:utils` alias (NOT the upstream registry's `@/lib/utils`) per D-200-04.

### collapsible.tsx (10 lines)

Path: `livos/packages/ui/src/shadcn-components/ui/collapsible.tsx`

Source: `https://ui.shadcn.com/registry/styles/default/collapsible.json` (canonical shadcn registry, default style — payload from the plan's `<interfaces>` block, verbatim).

Exports: `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` (thin re-exports of `CollapsiblePrimitive.Root`, `.CollapsibleTrigger`, `.CollapsibleContent`).

## Typecheck Status

`pnpm --filter ui typecheck` (full-suite) baseline pre-existing error surface: 508 errors (largely in `stories/src/routes/stories/*` referencing missing `@/modules/widgets/*` modules — a Vite stories workspace, not Phase 200's surface) plus a few Phase 199 carryovers in `src/features/liv-ai/devtools-mount.tsx` (missing `@assistant-ui/react-devtools` type defs) and `src/features/liv-ai/model-picker.test.tsx` (stale Grok model literals).

**Targeted verification** of files added in Plan 200-01:

```
$ npx tsc --noEmit --project tsconfig.json 2>&1 | grep -E "(avatar\.tsx|collapsible\.tsx)"
(no output)
```

Both new files compile clean. **No new typecheck errors introduced by Plan 200-01.**

See Deferred Issues below for the baseline error surface — it is out of Plan 200-01's scope (a phase boundary task should plan a separate cleanup pass before Wave 0 final commit).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `pnpm add -F ui <pkg>` failed via postinstall on Windows host**
- **Found during:** Task 1, first `pnpm add` invocation
- **Issue:** Phase 198-02 documented postinstall ELIFECYCLE returned: `mkdir -p public/generated-tabler-icons && cp -r ./node_modules/@tabler/icons/icons/. ./public/generated-tabler-icons` — `mkdir -p` syntax invalid for Windows `cmd.exe` (pnpm runs scripts through cmd, not git-bash). Postinstall fails AFTER lockfile write but BEFORE `package.json` is written, leaving lockfile updated but package.json unchanged — broken atomic.
- **Fix:** Re-ran `pnpm add -F ui --ignore-scripts @radix-ui/react-avatar` and `@radix-ui/react-collapsible`. `--ignore-scripts` skips the broken `copy-tabler-icons` postinstall and lets pnpm complete the package.json + lockfile write atomically. Generated `public/generated-tabler-icons` dir already exists from prior dev runs — no functional impact.
- **Files modified:** `livos/packages/ui/package.json` (+2 entries), `livos/pnpm-lock.yaml` (+32 lines).
- **Tracking:** This is a recurring Windows-host pitfall — should be documented as memory key. Linux Mini PC deploys via `update.sh` run postinstall in a bash environment where `mkdir -p` + `cp -r` work; this is host-only.

### Plan-text vs reality reconciliation

**2. [Rule 1 - Bug] Plan verification command used `sha1sum`, repo uses `git hash-object`**
- **Plan task 4 verify (line 212):** `sha1sum livos/packages/livinityd/source/modules/agent/sdk-agent-runner.ts | grep -q "f3538e1d..."`
- **Reality:** (a) the sacred file's path is `liv/packages/core/src/sdk-agent-runner.ts`, NOT `livos/packages/livinityd/source/modules/agent/sdk-agent-runner.ts` — the latter directory does not exist; (b) the gate hook (`scripts/check-sacred.sh`) uses `git hash-object`, not `sha1sum`. For text files with LF line endings (`liv/...sdk-agent-runner.ts`), `git hash-object` returns a different value than `sha1sum` because of the git-blob `blob {len}\0` header.
- **Fix used:** `git hash-object liv/packages/core/src/sdk-agent-runner.ts` → `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (matches expected). Pre-commit hook verifies via `scripts/check-sacred.sh` — that is the authoritative gate.

**3. [Rule 1 - Bug] Plan claimed `head -1 button.tsx` would show `"use client"` directive — siblings have no such directive**
- **Plan task 2 action (line 167):** "Use the `"use client"` directive at the top (matches other shadcn primitives in the same directory — verify via `head -1 livos/packages/ui/src/shadcn-components/ui/button.tsx`)."
- **Reality:** `head -1 button.tsx` → `import {Slot} from '@radix-ui/react-slot'`. None of the existing 29 sibling files under `shadcn-components/ui/` use `"use client"` (this is a Vite app, not Next.js — the directive is a no-op string literal at module top).
- **Decision:** Kept `"use client"` verbatim per the plan's `<interfaces>` source block (which IS the verbatim shadcn registry payload per D-200-02). The directive is harmless under Vite and signals canonical-registry provenance for future Phase 200 readers. If a later linting pass complains, a one-line removal is trivial — out of scope for Plan 200-01.

**4. [Rule 3 - Blocking] Plan task verify expected `pnpm --filter ui typecheck` to be green; baseline has 508 errors**
- **Plan task 1 verify (line 154):** `pnpm --filter ui typecheck` must exit 0.
- **Reality:** Pre-existing baseline has 508 errors — overwhelmingly in `stories/src/routes/stories/*` (the Vite stories workspace referencing modules that don't exist), plus a handful of Phase 199 carryovers (`devtools-mount.tsx`, `model-picker.test.tsx`).
- **Decision:** Replaced full-suite green-gate with **per-file targeted verification** of just the two new primitives via grep'd `tsc --noEmit --project tsconfig.json` output. Both files have zero errors. Pre-existing baseline error surface is out of scope per the SCOPE BOUNDARY rule — Plan 200-01 did not introduce them and cannot remediate them without touching files outside its 4-file modification envelope. The proper fix is a separate Phase 200 hygiene pass before Wave 0's final commit. **Logged here for the Phase 200 planner's attention — Plan 200-02's typecheck gate may need similar narrowing.**

## Deferred Issues

These pre-existed Plan 200-01 and are out of scope:

1. **`stories/src/routes/stories/{widgets,wifi}.tsx`** — 30+ TS2307 errors for missing `@/modules/widgets/*` and `@/modules/wifi/*` modules. The `stories/` workspace appears decoupled from `src/modules/*` — Vite stories was likely refactored without updating these route stubs.
2. **`src/features/liv-ai/devtools-mount.tsx:52`** — `Cannot find module '@assistant-ui/react-devtools'`. This is Phase 199's @assistant-ui/react-devtools optional integration; the package is not in `package.json` (it's a dev-only inspector). Suggests `// @ts-expect-error` guard or conditional dynamic import.
3. **`src/features/liv-ai/model-picker.test.tsx`** — 6 errors of `Type '"grok-4.20-0309-fast"' is not assignable to type '"grok-4.20-0309-non-reasoning" | "grok-4.20-0309-reasoning" | "grok-4.3"'`. Stale test fixtures referencing a model literal that was removed from `LIV_AI_MODELS`. A Phase 199 carryover.

None block Plan 200-02 (registry port — its 8 files are new and self-contained). Recommend a 30-line hygiene plan before final phase close.

## Confirmation

Plan 200-02 (the 8-file registry port) can proceed: all four required deps are present in `packages/ui/package.json`, both required shadcn primitives are on disk at `livos/packages/ui/src/shadcn-components/ui/{avatar,collapsible}.tsx`, both compile clean against `tsconfig.json`.

## Sacred SHA Verification

```
$ git hash-object liv/packages/core/src/sdk-agent-runner.ts
f3538e1d811992b782a9bb057d1b7f0a0189f95f
```

PASS — matches `scripts/sacred-shas-v38.json:expected_sha`. Pre-commit hook (`.husky/pre-commit` → `scripts/check-sacred.sh`) will independently verify on commit.

## Self-Check: PASSED

- FOUND: `livos/packages/ui/src/shadcn-components/ui/avatar.tsx` (39 lines, exports Avatar/AvatarImage/AvatarFallback)
- FOUND: `livos/packages/ui/src/shadcn-components/ui/collapsible.tsx` (10 lines, exports Collapsible/CollapsibleTrigger/CollapsibleContent)
- FOUND: 4 dep names in `livos/packages/ui/package.json` via grep
- FOUND: `liv/packages/core/src/sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` unchanged
- Commit hash: recorded post-commit below.
