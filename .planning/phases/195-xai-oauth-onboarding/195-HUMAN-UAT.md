---
status: partial
phase: 195-xai-oauth-onboarding
source: [195-VERIFICATION.md]
started: 2026-05-22T02:20:00Z
updated: 2026-05-22T02:20:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Production DI wire-up at livinityd boot
expected: `createAppRouter({chromeMaster, xaiAuth: createXaiAuthRouter({flowService: new XaiAuthFlowService(), credsService: new XaiCredentialsService()})})` replaces current chromeMaster-only injection at `livos/packages/livinityd/source/index.ts:854-857`. Empty-injection Proxy default stops throwing on `auth.xai.*` calls.
result: [pending]

### 2. Mini PC OpenCode CLI install + version pin in deploy/update.sh
expected: `opencode` binary at `/usr/local/bin/opencode` (or in PATH) on `bruce@10.69.31.68`; `opencode --version` ≥ 1.15 so `spawnOpencodeLogin` resolves correctly. CONTEXT.md `<deferred>` block points to "Phase 195.1 or follow-up."
result: [pending]

### 3. End-to-end UAT walk-through of the new ConnectAiStep on Mini PC
expected: Operator runs setup wizard, clicks "Sign in with xAI", sees a new tab open to `https://x.ai/oauth/device?code=…`, completes auth, returns to LivOS UI which now shows "✓ Connected — SuperGrok Tier 1" + chips [Chat, Tools, Image, Video] and Continue enabled.
result: [pending]

### 4. Token refresh round-trip on live Mini PC after ~5h55min uptime
expected: `XaiCredentialsService` background refresh fires when <5min from JWT exp; `token-refreshed` event emitted; `auth.json` on disk updated atomically; subsequent `api.x.ai` calls still 200. Operator may simulate via shortened JWT exp claim.
result: [pending]

### 5. Voice endpoint behavior matches CONTEXT.md verified facts
expected: `audioSpeech()` throws `XaiVoiceNotSupportedError` without network call; `audioTranscriptions()` same. UI never lists "Voice" or "audio" chips in connected state. (Tier-1 contract assertion best confirmed in running app even though unit-tested.)
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps
