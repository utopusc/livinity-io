---
phase: 271-liv-ai-agent-polish
plan: 01
subsystem: ui
tags: [liv-ai, cli-installer, aionui, svg, trpc, auth, drift-lock]

requires:
  - phase: 267-270
    provides: AionUi agents panel, use-cli-auth-bridge Terminal routing, CLI_AUTH_COMMANDS/auth-methods, agent-logos static SVGs
provides:
  - Verified per-CLI install+auth command matrix (271-AUTH-MATRIX.md)
  - codex/openclaw auth-command corrections (auth.ts + UI mirror) + claude-code UI drift fix
  - 9 real brand SVGs for the previously-monogram agent CLIs
  - 3 Liv AI console-noise items fixed/triaged (displays.getVncUrl guard, favicon CORS short-circuit, googleAuth.status won't-fix)
affects: [liv-ai-agents-panel, cli-auth, future-cli-additions]

tech-stack:
  added: []
  patterns:
    - "Drift-lock triad: auth.ts CLI_AUTH_COMMANDS == auth-methods.ts loginArgv == use-cli-auth-bridge.ts UI mirror"
    - "No-ACAO host short-circuit for remote-favicon canvas reads (avoid CORS console noise)"

key-files:
  created:
    - .planning/phases/271-.../271-AUTH-MATRIX.md
    - livos/packages/ui/public/agent-logos/{openclaw,auggie,codebuddy,qodercli,droid,hermes,nanobot,snow,kiro}.svg
  modified:
    - livos/packages/livinityd/source/modules/cli-installer/auth.ts
    - livos/packages/ui/src/hooks/use-cli-auth-bridge.ts
    - scripts/aionui-patches/local-agents-install-section.js
    - livos/packages/ui/src/modules/window/app-contents/x11-display-stream-window.tsx
    - livos/packages/ui/src/components/launcher-icon.tsx

key-decisions:
  - "Conservative auth-command edits: changed ONLY the 2 upstream-contradicted entries (codex, openclaw); kept all others (gemini LOW-confidence → live-verify)"
  - "claude-code UI Terminal-fallback fixed to bare 'claude' to match server paste-back spawn"
  - "displays.getVncUrl route EXISTS — guarded the client caller (lowest-risk) rather than touching the route"
  - "googleAuth.status console line is vendored-AionUi-internal, unreachable from patches → won't-fix-here"

patterns-established:
  - "Pattern: per-CLI command changes must be applied to BOTH auth.ts and the UI mirror in the same commit (drift-lock)"

requirements-completed: []

duration: ~25min
completed: 2026-06-15
---

# Phase 271 Plan 01: Liv AI agent polish Summary

**Verified+corrected the per-CLI auth-command matrix (codex/openclaw/claude-code drift fixed), shipped 9 real brand SVGs, and quieted 3 Liv AI console-noise lines.**

## Performance

- **Duration:** ~25 min (parallel research + frontend agents, then orchestrator drift-lock edits)
- **Completed:** 2026-06-15
- **Tasks:** 3 (A: matrix+code, B: logos, C: console noise)
- **Files modified:** 5 source files + 9 new SVGs + 1 deliverable doc

## Accomplishments
- **Task A:** 20-CLI install+auth matrix verified against official upstream docs with per-row confidence + sources (`271-AUTH-MATRIX.md`). Two upstream-contradicted commands corrected in `auth.ts` (and the UI mirror): `codex auth login` → `codex login --device-auth`; `openclaw auth login` → `openclaw onboard`. Fixed a UI-mirror drift where `claude-code` showed `claude auth login` while the server spawns bare `claude` (paste-back). All three now byte-consistent across `auth.ts` ↔ `auth-methods.ts` ↔ `use-cli-auth-bridge.ts`.
- **Task B:** 9 brand SVGs (openclaw, auggie, codebuddy, qodercli, droid, hermes, nanobot, snow, kiro) added to `public/agent-logos/` matching the existing convention; `logo:` set in CLI_META for each. All 19 CLI_META `logo:` references now resolve to a real file. `node --check` passes.
- **Task C:** (1) `displays.getVncUrl` — route exists & mounted; guarded the only client caller (`x11-display-stream-window.tsx`) with a display-id validator so the mutation can't fire malformed on load. (2) remote-favicon CORS — short-circuit known no-ACAO hosts (google.com, antigravity.google, gstatic.com) to `'blocked'` in `launcher-icon.tsx` without a canvas read. (3) `googleAuth.status` stub log — confirmed it originates in the vendored AionUi bundle (strings absent repo-wide), unreachable from `scripts/aionui-patches/*` → documented won't-fix-here.

## Task Commits

1. **Task B: brand SVGs** — `38e977f4` (feat)
2. **Task C: console noise** — `1a9c4f50` (fix)
3. **Task A: code corrections** — `8f79166a` (fix)
4. **Task A: matrix deliverable** — `f19d31f7` (docs)

## Files Created/Modified
- `cli-installer/auth.ts` — codex/openclaw CLI_AUTH_COMMANDS corrected + comments
- `hooks/use-cli-auth-bridge.ts` — claude-code/codex/openclaw Terminal-fallback strings drift-locked to server
- `scripts/aionui-patches/local-agents-install-section.js` — 9 CLI_META `logo:` keys set
- `public/agent-logos/*.svg` — 9 new brand marks
- `x11-display-stream-window.tsx` — `isValidDisplayId()` guard on the getVncUrl mutation
- `components/launcher-icon.tsx` — no-ACAO favicon host short-circuit
- `271-AUTH-MATRIX.md` — the verified deliverable

## Decisions Made
See key-decisions frontmatter. Core principle: conservatism — do NOT regress working commands on speculation; change only upstream-contradicted entries, mark the rest for live-TTY verification.

## Deviations from Plan
None material. Plan anticipated `install-scripts.ts` CLI_BIN_NAMES changes for cursor-agent/kimi-cli; research showed both are correct as-shipped (suspicions unfounded), so no change was made — documented in the matrix (kiro flagged for future reconciliation once a verified installer exists).

## Issues Encountered
- Repo-wide `tsc --noEmit` is broken at baseline (~3771 pre-existing env/type-drift errors). Verified via stash-diff that the UI edits introduce **zero new** type errors; a clean isolated typecheck for just these files isn't obtainable with the current config. (Real verification gate is the deploy build `pnpm --filter ui build`, run at deploy time.)

## User Setup Required
**Live-TTY auth verification is operator-gated (Task A is `autonomous:false`).** On the Mini PC (`bruce@10.69.31.68`), run each corrected/uncertain auth command for the installed CLIs and confirm it starts the right flow (do not complete auth) — checklist in `271-AUTH-MATRIX.md`. Minimum: `claude` (paste-back), `codex login --device-auth` (device code), `gemini auth login` (⚠ LOW-confidence), `opencode auth login`, `cursor-agent login`. Then cut a release, deploy via `update.sh`, SW-cache-clear, and confirm in the Agents panel: 9 logos render (no monograms), Install/Auth open the Terminal with the corrected commands, and the 3 console lines are quiet.

## Next Phase Readiness
- Code-complete and committed; ready for the deploy + operator UAT.
- Open follow-up if live-TTY finds a wrong command: correct BOTH `auth.ts` and the UI mirror together (drift-lock).

---
*Phase: 271-liv-ai-agent-polish*
*Completed: 2026-06-15*
