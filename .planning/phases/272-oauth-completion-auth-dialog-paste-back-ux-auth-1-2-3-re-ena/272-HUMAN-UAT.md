---
status: partial
phase: 272-oauth-completion
source: [272-VERIFICATION.md]
started: 2026-06-15
updated: 2026-06-15
---

## Current Test

[awaiting human testing on Mini PC `bruce@10.69.31.68` after deploy]

## Tests

### 1. Live auth round-trip in the dialog
expected: In Liv AI → Agents, click an agent's "Auth". The no-terminal **dialog opens** (not the Terminal). The code-paste field is **visible immediately** (no infinite "Waiting…" spinner) even for bare `claude`. "Use an API key instead" is a clear **button**. Pasting a code + **Enter** submits. The in-dialog "Advanced: run in Terminal instead" still works.
result: [pending]

### 2. Terminal-default regression check
expected: `cli-install` still opens the Terminal install; `cli-uninstall` still opens the dialog's destructive confirm. (If you prefer Terminal-default for auth, revert the one-line `cli-auth` branch in use-cli-auth-bridge.ts.)
result: [pending]

### 3. Build + deploy gate
expected: `pnpm --filter @livos/config build && pnpm --filter ui build` succeeds; release tag → `update.sh` → SW-cache-clear shows the new dialog behavior.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
