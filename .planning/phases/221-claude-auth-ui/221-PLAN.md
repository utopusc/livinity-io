# Phase 221 — Claude Auth UI in openclaw

**Mode:** AUTONOMOUS (operator: "hizli ve calistir").
**Operator quote:** "Claude Auth mod geri eklenmisti ya openclaw a onu geri getirebilir misin? UI dan auth yapmak istiyorum."
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (sdk-agent-runner.ts) — untouched.

## Context

Backend already exists in `liv/packages/core/src/providers/claude.ts`:
- `startLogin()` → PKCE OAuth URL
- `submitLoginCode(code)` → exchange code → write `~/.claude/.credentials.json`
- `getCliStatus()` → `{installed, authenticated, user}`
- `logout()` → clear credentials

Exposed by liv-core Express on port 3200:
- POST `/api/claude/start-login`
- POST `/api/claude/submit-code`
- POST `/api/claude/logout`
- (status: probe via getCliStatus during a list-providers call)

UI surface: claw-client `ProvidersTab.tsx` already has the xAI auth pattern (`auth.xai.{start,status,waitForCompletion,disconnect}`). Mirror that pattern for Claude.

## Tasks

### T1 — livinityd `auth.claude.*` tRPC proxy router
- New file: `livos/packages/livinityd/source/modules/server/trpc/claude-auth-router.ts`
- 4 admin-gated procedures:
  - `auth.claude.status` (query) → `{installed, authenticated, user?}` via liv-core `GET /api/claude/status` (need to add) OR direct CLI probe.
  - `auth.claude.startLogin` (mutation) → POST liv-core `/api/claude/start-login` → `{url, alreadyAuthenticated?}`
  - `auth.claude.submitCode` (mutation, input `{code: string}`) → POST liv-core `/api/claude/submit-code` → `{success, error?}`
  - `auth.claude.logout` (mutation) → POST liv-core `/api/claude/logout` → `{ok}`
- Uses `process.env.LIV_API_URL` + `process.env.LIV_API_KEY` (same as device-bridge.ts pattern).
- Wire into `createAppRouter` slot + add to `httpOnlyPaths`.
- **Commit:** `feat(221-T1): auth.claude.* tRPC proxy to liv-core OAuth`

### T2 — claw-client ProvidersTab "Claude (subscription)" section
- New section above provider grid (or as a featured row): "Claude Auth"
- Shows status badge: ✓ Authenticated as `<user>` / ✗ Not authenticated / ⚠ CLI not installed
- "Authenticate with Claude" button → calls `auth.claude.startLogin` → opens returned URL in new tab → reveals an "Paste authorization code" input + Submit
- After Submit → calls `auth.claude.submitCode` → on success show success banner + refetch status
- When authenticated: "Logout" button → calls `auth.claude.logout` → refetch
- **Commit:** `feat(221-T2): claw-client ProvidersTab — Claude Auth section`

## Out of scope
- Wiring the auth into agent loop (already in sdk-agent-runner via `claude` CLI subprocess; once credentials are on disk, the CLI picks them up).
- Multi-user per-user Claude OAuth (Phase 40 plan; this is operator-level auth).
- Token rotation UI (Anthropic rotates automatically; logout + re-login is the path).
