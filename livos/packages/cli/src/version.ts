// Phase 172-01 — version reader for @livos/cli.
//
// Reads the version field from the workspace package.json at build time
// via a JSON import (resolveJsonModule: true in tsconfig). Exported as a
// pure function so test harnesses can mock the import.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + D-09 luse-system-prompt.ts
// + all Phase 162-171 source files UNCHANGED. This file only reads its
// own package.json — no cross-package coupling.

import pkg from '../package.json' with {type: 'json'}

/**
 * Return the @livos/cli version string from package.json.
 * Pure function — no side effects.
 */
export function getVersion(): string {
  return pkg.version
}
