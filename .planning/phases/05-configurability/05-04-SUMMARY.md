---
phase: 05-configurability
plan: 04
status: complete
subsystem: ai-skills
tags: [config, skills, output-paths, path-construction]

dependency-graph:
  requires:
    - 05-01  # paths.output in @livos/config
  provides:
    - Config-driven output paths in all 8 skill files
    - Cross-platform path construction with path.join()
  affects:
    - Any new skill files should follow this pattern

tech-stack:
  added: []
  patterns:
    - Import paths from @livos/config for output directory
    - Use path.join() for file path construction in prompts
    - Dynamic path injection into agent task strings

file-tracking:
  created: []
  modified:
    - livos/skills/research.ts
    - livos/skills/leadgen-auto.ts
    - livos/skills/site-audit.ts
    - livos/skills/content.ts
    - livos/packages/livinityd/skills/content.ts
    - livos/packages/livinityd/skills/leadgen-auto.ts
    - livos/packages/livinityd/skills/research.ts
    - livos/packages/livinityd/skills/site-audit.ts

decisions:
  - id: outputPath-variable
    choice: Construct outputPath const before runAgent call
    reason: Allows path.join() evaluation before template literal interpolation
  - id: node-path-import
    choice: Import path from 'node:path' (not 'path')
    reason: Modern Node.js convention for built-in module imports

metrics:
  duration: 3 min
  completed: 2026-02-04
---

# Phase 5 Plan 04: LivOS Skills Output Paths Configuration Summary

Config-driven output paths using paths.output from @livos/config in all skill files.

## What Was Done

### Task 1: Root Skills (4 files)
Updated livos/skills/ directory:
- **research.ts**: `path.join(paths.output, 'research-${Date.now()}.md')`
- **leadgen-auto.ts**: `path.join(paths.output, 'leads-${Date.now()}.json')`
- **site-audit.ts**: `path.join(paths.output, 'audit-${Date.now()}.md')`
- **content.ts**: `path.join(paths.output, 'content-${Date.now()}.md')`

### Task 2: Livinityd Skills (4 files)
Updated livos/packages/livinityd/skills/ directory:
- Same pattern applied to all 4 duplicate skill files
- Identical imports and path construction approach

## Implementation Pattern

Each skill file now follows this pattern:

```typescript
import path from 'node:path';
import { paths } from '@livos/config';

// In the execute phase, before runAgent:
const outputPath = path.join(paths.output, `<skill>-${Date.now()}.<ext>`);

// In the task string:
task: `... Save the report to ${outputPath} ...`
```

## Verification Results

| Check | Result |
|-------|--------|
| Hardcoded paths in root skills | 0 found |
| Hardcoded paths in livinityd skills | 0 found |
| Files importing @livos/config | 8/8 |
| Files using paths.output | 8/8 |
| Files using path.join() | 8/8 |
| Workspace build | Passes |

## Commits

| Hash | Description |
|------|-------------|
| 928f005 | feat(05-04): use config-driven output paths in root skills |
| cb7274e | feat(05-04): use config-driven output paths in livinityd skills |

## Deviations from Plan

None - plan executed exactly as written.

## Key Files Modified

**Root Skills:**
- `livos/skills/research.ts` - Deep research skill output path
- `livos/skills/leadgen-auto.ts` - Lead generation skill output path
- `livos/skills/site-audit.ts` - Site audit skill output path
- `livos/skills/content.ts` - Content creation skill output path

**Livinityd Skills:**
- `livos/packages/livinityd/skills/research.ts`
- `livos/packages/livinityd/skills/leadgen-auto.ts`
- `livos/packages/livinityd/skills/site-audit.ts`
- `livos/packages/livinityd/skills/content.ts`

## Decisions Made

1. **outputPath variable**: Construct the output path as a `const` before the `runAgent` call rather than inline in the template literal. This ensures `path.join()` is evaluated at runtime, not embedded as a string.

2. **node:path import**: Use the modern `node:path` specifier for Node.js built-in modules.

## Next Phase Readiness

- All skill output paths now configurable via `LIVOS_OUTPUT_DIR` environment variable
- Default remains `/opt/livos/output` (from paths.ts schema)
- Pattern established for any future skill files
