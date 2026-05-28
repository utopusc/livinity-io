---
status: partial
phase: 239-onboarding-cli-tools
source: [239-VERIFICATION.md]
started: 2026-05-27T00:00:00Z
updated: 2026-05-27T00:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Onboarding wizard renders new CliToolsStep when feature flag is ON
expected: Open https://bruce.livinity.io/onboarding with localStorage.setItem('livos.v43.onboarding_cli_section','true'); hard-reload; navigate to step 5; verify step header '05 · CLI Tools' + 'Pick your CLI agents'; verify 5 cards in fixed order (Claude Code, OpenCode, Gemini, OpenClaw, Aion CLI); claude-code + opencode show 'Installed ✓' pill (per detect-probe evidence); Continue enabled without clicking any Install; Continue advances to step 6 (Location).
result: [pending]

### 2. Onboarding wizard renders flag-disabled informational notice when feature flag is OFF
expected: Clear the localStorage key (or set to anything other than 'true'); hard-reload; navigate to step 5; verify the 'This step is disabled' notice renders (NOT the deleted legacy ProviderStep); verify notice mentions 'livos:v43:onboarding_cli_section' key; Skip advances to step 6.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
