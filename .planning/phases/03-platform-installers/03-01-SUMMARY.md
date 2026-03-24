---
phase: 03-platform-installers
plan: 01
subsystem: agent
tags: [node-sea, postject, inno-setup, windows-installer, cjs, esbuild, auto-start]

# Dependency graph
requires:
  - phase: 01-web-setup-wizard
    provides: setup-ui/ SPA build and setup-server.ts for web setup wizard
  - phase: 02-system-tray-icon
    provides: tray.ts module with systray2 integration, esbuild externals config
provides:
  - Complete SEA binary build pipeline (build-sea.mjs) producing standalone livinity-agent.exe
  - Inno Setup .iss script for professional Windows installer with auto-start
  - --background flag for silent auto-start on boot with file logging
  - build-installer.bat wrapper script
affects: [04-macos-installer, 05-linux-installer, download-page]

# Tech tracking
tech-stack:
  added: [postject]
  patterns: [sea-cjs-bundle, async-main-wrapper, import-meta-fallback, traybin-alongside-binary]

key-files:
  created: [agent/build-sea.mjs, agent/installer/windows/setup.iss, agent/installer/windows/build-installer.bat]
  modified: [agent/esbuild.config.mjs, agent/sea-config.json, agent/package.json, agent/src/index.ts, agent/src/cli.ts, agent/src/setup-server.ts]

key-decisions:
  - "CJS output format for esbuild (SEA always runs embedderRunCjs, ESM not supported in Node 24 SEA)"
  - "Bundle systray2 into CJS output instead of externalizing (SEA require() can't resolve filesystem modules)"
  - "Async main() wrapper in index.ts to eliminate top-level await (incompatible with CJS format)"
  - "import.meta.url fallback via try/catch in setup-server.ts for CJS/SEA compatibility"
  - "traybin/ copied alongside binary for __dirname resolution in SEA mode"
  - "Inno Setup PrivilegesRequired=lowest for non-admin install to user's AppData"

patterns-established:
  - "SEA binary build: esbuild CJS bundle + node --experimental-sea-config + postject injection"
  - "Native module resolution: bundle pure-JS deps, copy .node addons and Go binaries alongside binary"
  - "Background mode: LIVINITY_BACKGROUND env var gates file logging and suppresses browser auto-open"

requirements-completed: [WIN-01, WIN-02, WIN-03, WIN-04]

# Metrics
duration: 12min
completed: 2026-03-24
---

# Phase 3 Plan 1: Windows Installer Pipeline Summary

**Complete SEA binary build pipeline with CJS format, Inno Setup installer script with auto-start registry key, and --background flag for silent boot operation**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-24T09:09:49Z
- **Completed:** 2026-03-24T09:22:35Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Created build-sea.mjs (203 lines) that produces a standalone livinity-agent.exe with all native dependencies via esbuild + SEA blob + postject injection
- Created Inno Setup .iss script (119 lines) with all 10 sections: Setup, Languages, Tasks, Files, Icons, Registry, Run, UninstallRun, UninstallDelete, Code
- Added --background flag and file logging to ~/.livinity/agent.log for silent auto-start on boot
- Fixed SEA ESM/CJS compatibility: switched to CJS format, bundled systray2, wrapped top-level await, added import.meta fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Complete SEA build pipeline and --background flag** - `afb95fb` (feat)
2. **Task 2: Create Inno Setup installer script and build wrapper** - `56daabe` (feat)
3. **Fix: SEA CJS compatibility and runtime module resolution** - `67f1f3b` (fix)

## Files Created/Modified
- `agent/build-sea.mjs` - Complete SEA build script: esbuild bundle, blob generation, binary copy, postject injection, native dep copies
- `agent/installer/windows/setup.iss` - Inno Setup 6 script with shortcuts, registry auto-start, uninstaller, credential cleanup
- `agent/installer/windows/build-installer.bat` - Wrapper that runs build:sea then ISCC with error handling
- `agent/esbuild.config.mjs` - Changed from ESM to CJS format, bundled systray2, added import.meta define
- `agent/sea-config.json` - Added disableExperimentalSEAWarning
- `agent/package.json` - Added build:sea and build:installer:win scripts
- `agent/src/index.ts` - Wrapped in async main(), added --background flag parsing
- `agent/src/cli.ts` - Background mode: console redirect to file, skip browser setup, suppress Ctrl+C message
- `agent/src/setup-server.ts` - CJS/SEA fallback for import.meta.url, added exeDir as setup-ui path candidate

## Decisions Made
- Switched esbuild from ESM to CJS format because Node.js 24 SEA always runs scripts via `embedderRunCjs` regardless of `type: module` in sea-config.json. ESM SEA support is not yet functional.
- Bundled systray2 into the CJS output instead of externalizing it. SEA's built-in require() only resolves Node built-in modules, not filesystem packages. Only node-screenshots remains external (has native .node addon).
- Placed traybin/ directly alongside the SEA binary instead of in node_modules/systray2/. In SEA mode, `__dirname` resolves to the binary's directory, so systray2's `path.join(__dirname, 'traybin', binName)` finds the Go binary correctly.
- Used PrivilegesRequired=lowest in Inno Setup so the installer works without administrator privileges.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SEA binary failing with "Cannot use import statement outside a module"**
- **Found during:** Task 1 verification (running dist/livinity-agent.exe status)
- **Issue:** SEA always runs embedded scripts as CJS via `embedderRunCjs`. The ESM-format bundle with top-level await and import.meta.url failed at runtime despite `"type": "module"` in sea-config.json.
- **Fix:** Switched esbuild to CJS format, wrapped index.ts in async main(), defined import.meta.url as undefined, added try/catch fallback in setup-server.ts
- **Files modified:** agent/esbuild.config.mjs, agent/src/index.ts, agent/src/setup-server.ts
- **Verification:** `dist/livinity-agent.exe status` runs successfully
- **Committed in:** 67f1f3b

**2. [Rule 1 - Bug] Fixed SEA binary failing with "ERR_UNKNOWN_BUILTIN_MODULE: systray2"**
- **Found during:** Task 1 verification (after CJS format fix)
- **Issue:** Externalizing systray2 from esbuild caused `require('systray2')` in the CJS bundle to use SEA's internal module resolver, which only knows built-in Node modules.
- **Fix:** Removed systray2 from esbuild externals, let esbuild bundle it. Copied traybin/ alongside binary for __dirname resolution.
- **Files modified:** agent/esbuild.config.mjs, agent/build-sea.mjs
- **Verification:** `dist/livinity-agent.exe status` and `dist/livinity-agent.exe` both run successfully
- **Committed in:** 67f1f3b

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes required for SEA binary to run at all. Fundamental issue with Node.js SEA ESM support. No scope creep.

## Issues Encountered
- Node.js 24.11.1 SEA does not honor `"type": "module"` in sea-config.json, always running embedded scripts as CJS via `embedderRunCjs`. This required switching the entire build to CJS format.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SEA binary build pipeline is complete and verified: `npm run build:sea` produces working standalone .exe
- Inno Setup script ready for compilation (requires Inno Setup 6 installed on the build machine)
- macOS and Linux installer scripts can follow the same pattern (bundle + native deps + platform installer)
- The CJS format decision applies to all platforms (SEA limitation, not Windows-specific)

---
## Self-Check: PASSED

All 8 files verified present. All 3 commits verified in git log.

---
*Phase: 03-platform-installers*
*Completed: 2026-03-24*
