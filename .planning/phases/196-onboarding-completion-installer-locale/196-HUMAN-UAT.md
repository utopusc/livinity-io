---
status: partial
phase: 196-onboarding-completion-installer-locale
source: [196-VERIFICATION.md, 195-HUMAN-UAT.md]
started: 2026-05-22T11:30:00Z
updated: 2026-05-22T11:30:00Z
---

## Current Test

[awaiting human testing — Phase 195 HUMAN-UAT items #1 + #2 + #3 are SUBSUMED by this checklist; #4 + #5 roll forward unchanged]

## Tests

### 1. Mini PC deploy via update.sh after Phase 196 ship
expected: `bash /opt/livos/update.sh` on `bruce@10.69.31.68` succeeds; `Deployed SHA recorded:` matches Phase 196 HEAD after push; all 4 services (`livos`, `liv-core`, `liv-worker`, `liv-memory`) remain `active`.
result: [pending]

### 2. Live runtime probe — DI wire-up confirms HTTP 200 (closes Phase 195 HUMAN-UAT #1)
expected: with a legacy `{loggedIn:true}` admin JWT signed via `/opt/livos/data/secrets/jwt`, `curl -X POST http://127.0.0.1:8080/trpc/auth.xai.start?batch=1 -H "Authorization: Bearer <JWT>" -d '{"0":{"json":{"method":"console"}}}'` returns `HTTP 200` with `{flowId, url}` shape (NOT 500 `xai-auth-router: flowService not injected`). This is the DEFINITIVE proof Phase 196 closed the Phase 195 runtime gap.
result: [pending]

### 3. install.sh fresh-VM smoke (closes Phase 195 HUMAN-UAT #2)
expected: on a clean Ubuntu 24.04 VM (Docker container OK), `sudo bash install.sh` completes in <10 minutes, brings up all 4 services, `which opencode → /usr/local/bin/opencode`, `opencode --version` ≥ 1.15.0. Re-running `sudo bash install.sh` exits within 30s with no destructive changes (idempotent).
result: [pending]

### 4. End-to-end 9-step wizard walk on Mini PC (closes Phase 195 HUMAN-UAT #3)
expected: Operator opens setup wizard fresh (clears prior Redis onboarding state if needed). Steps appear in this exact order:
  1. Welcome
  2. Account
  3. Wallpaper
  4. Personalize
  5. Provider → clicks xAI card → IMMEDIATELY advances (single click)
  6. Region → "Europe" pre-selected from Turkish IP (or operator IP equivalent) → Continue
  7. Locale & Time → `Europe/Istanbul` + `tr-TR` pre-filled with "Suggested" pill → Continue → backend invokes `timedatectl set-timezone Europe/Istanbul`
  8. Connect AI → opens new tab to `https://x.ai/oauth/device?code=…` → operator completes → returns to LivOS → "✓ Connected — SuperGrok Tier 1" + chips [Chat, Tools, Image, Video]
  9. All set → wizard closes, dashboard loads
result: [pending]

### 5. timedatectl system-clock alignment + Redis persistence
expected: After step 7 of #4 above, on Mini PC: `cat /etc/timezone` shows `Europe/Istanbul`; `redis-cli get liv:user:timezone` returns `Europe/Istanbul`; `redis-cli get liv:user:locale` returns `tr-TR`; `redis-cli get liv:user:region` returns `europe`.
result: [pending]

### 6. (Rolled forward from Phase 195 #4) Token refresh round-trip after ~5h55min uptime
expected: `XaiCredentialsService` background refresh fires when <5min from JWT exp; `token-refreshed` event emitted; `auth.json` updated atomically; subsequent `api.x.ai` calls still 200. Operator can simulate via shortened JWT exp.
result: [pending]

### 7. (Rolled forward from Phase 195 #5) Voice endpoints throw without network call
expected: In running app, `audioSpeech()` and `audioTranscriptions()` throw `XaiVoiceNotSupportedError` immediately without any network round-trip; UI never lists "Voice" or "audio" chips in connected state.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
