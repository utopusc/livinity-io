---
status: partial
phase: 271-liv-ai-agent-polish
source: [271-VERIFICATION.md]
started: 2026-06-15
updated: 2026-06-15
---

## Current Test

[awaiting human testing on Mini PC `bruce@10.69.31.68`]

## Tests

### 1. Live-TTY auth-command correctness (Task A — autonomous:false)
expected: For the installed CLIs, the corrected/uncertain auth commands start the correct flow in a real terminal (do NOT complete auth). Minimum: `claude` (paste-back prompt), `codex login --device-auth` (device code), `gemini auth login` (⚠ LOW-confidence — confirm subcommand exists), `opencode auth login`, `cursor-agent login`. Full checklist in 271-AUTH-MATRIX.md.
result: [pending]

### 2. Deploy + Agents-panel UAT
expected: After release tag → `update.sh` → SW-cache-clear: the 9 previously-monogram agents (openclaw, auggie, codebuddy, qodercli, droid, hermes, nanobot, snow, kiro) render real logos; Install/Auth open the Terminal with the corrected commands; the 3 console-noise lines (googleAuth.status, displays.getVncUrl 404, favicon CORS) are quiet.
result: [pending]

### 3. Live build gate
expected: `pnpm --filter @livos/config build && pnpm --filter ui build` succeeds (the real deploy gate; repo-wide tsc is broken at baseline but the UI edits add zero new type errors).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
