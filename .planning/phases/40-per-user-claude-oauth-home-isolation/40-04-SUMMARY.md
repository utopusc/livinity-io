---
phase: 40-per-user-claude-oauth-home-isolation
plan: 04
status: complete
completed: 2026-04-30
requirements:
  - FR-AUTH-02
sacred-file-touched: false
---

# Plan 40-04 Summary — Per-User-Aware Claude Card in Settings UI

## One-liner

Extended `livos/packages/ui/src/routes/settings/ai-config.tsx` Claude Provider section with multi-user-mode awareness via a top-level `{isMultiUserMode ? (per-user UI) : (existing single-user UI)}` ternary. Per-user UI consumes Plan 03's 3 new tRPC endpoints (`claudePerUserStatus` query, `claudePerUserStartLogin` subscription, `claudePerUserLogout` mutation), shows inline device code + verification URL, and refreshes status on login/logout success. Single-user mode UX is byte-identical to pre-Phase-40.

## Files Modified

| File | Status | Lines added | Notes |
|------|--------|-------------|-------|
| `livos/packages/ui/src/routes/settings/ai-config.tsx` | Modified | +131 lines | Per-user state + hooks + handlers + multi-user UI branch |

## Changes Inside ai-config.tsx

### State additions (3 new useState hooks)

```typescript
const [perUserDeviceCode, setPerUserDeviceCode] = useState<{verificationUrl, userCode} | null>(null)
const [perUserLoginActive, setPerUserLoginActive] = useState(false)
const [perUserLoginError, setPerUserLoginError] = useState<string | null>(null)
```

### tRPC hooks added (3 new)

| Hook | Type | Behavior |
|------|------|----------|
| `claudePerUserStatusQ = trpcReact.ai.claudePerUserStatus.useQuery()` | query | Returns `{multiUserMode, authenticated, method?, expiresAt?}` |
| `trpcReact.ai.claudePerUserStartLogin.useSubscription(undefined, {enabled: perUserLoginActive, onData, onError})` | subscription | Streams `device_code` / `success` / `error` events; gated behind `perUserLoginActive` flag for lazy connection |
| `claudePerUserLogoutMutation = trpcReact.ai.claudePerUserLogout.useMutation({onSuccess: invalidate})` | mutation | Deletes per-user creds, invalidates status query |

### Derived state

```typescript
const isMultiUserMode = claudePerUserStatusQ.data?.multiUserMode === true
const isPerUserClaudeConnected = isMultiUserMode && (claudePerUserStatusQ.data?.authenticated ?? false)
```

### Handlers (2 new)

- `handleStartPerUserLogin()` — clears prior state, flips `perUserLoginActive = true` to enable the subscription.
- `handleStopPerUserLogin()` — flips `perUserLoginActive = false`, clears device code (auto-unsubscribes server-side via tRPC subscription cleanup → server's `kill()` runs).

### Conditional rendering (top-level ternary)

```jsx
{isMultiUserMode ? (
  /* NEW per-user UI: connection status + device-code display + sign in/out */
  <div className='space-y-4'>
    <h2>Claude Account (per-user subscription)</h2>
    {/* 4-way conditional: loading / connected / login-active / not-connected */}
  </div>
) : (
  /* EXISTING single-user UI: PKCE OAuth + API key — unchanged */
  <div className='space-y-4'>
    <h2>Claude Account</h2>
    {/* Existing 4-way conditional preserved verbatim */}
  </div>
)}
```

## Per-User UI Behavior Matrix

| State | Display |
|-------|---------|
| Loading status | "Checking status..." spinner |
| Connected | Green checkmark + "Connected — your Claude subscription" + Sign Out button |
| Login active + device code received | Verification URL link + monospace user code + Cancel button |
| Login active + waiting for device code | "Starting `claude login`..." spinner + Cancel button |
| Not connected | "Sign in with Claude sub" primary button + optional error message |

## Single-User Mode Preservation (D-40-07 / D-40-08)

The existing single-user Claude card code path is **byte-identical** when `multi_user_mode === false`:
- Same `<h2>Claude Account</h2>`
- Same `claudeStatusQ`-driven 4-way conditional
- Same `claudeStartLoginMutation` PKCE OAuth flow
- Same `setClaudeApiKeyMutation` API key entry
- Same `claudeLogoutMutation` Sign Out button

`grep claudeStartLogin livos/packages/ui/src/routes/settings/ai-config.tsx` confirms the legacy mutation reference is still present.

## Build

`cd livos && pnpm --filter ui build` exits 0 (vite + tsc + PWA generation), reported `built in 37.64s`. No new TypeScript errors introduced.

## Sacred File Untouched

`git hash-object nexus/packages/core/src/sdk-agent-runner.ts` = `623a65b9a50a89887d36f770dcd015b691793a7f` (matches Plan 40-02 baseline). This plan touched no nexus files.

## Decisions Honored

- **D-40-07**: single-user mode → bypass Phase 40 logic entirely. Confirmed: when `claudePerUserStatusQ.data?.multiUserMode === false`, the existing single-user card renders unchanged.
- **D-40-08**: existing UI surface preserved + per-user awareness layered on top.
- **D-40-09**: device flow is server-side; UI displays code + URL emitted by `claudePerUserStartLogin` subscription.
- **D-40-10**: token refresh handled by `claude` CLI internally; UI surfaces status from `checkPerUserClaudeStatus()` reading creds file. No periodic check — on-failure detection via subscription error event.

## ROADMAP Phase 40 Coverage

| Criterion | Status |
|-----------|--------|
| 1. User A login independent of User B | UI surface present; live verification deferred to UAT (Plan 05) |
| 2. Cross-user file read fails permission denied | Honest framing in module + UAT — synthetic isolation, not POSIX-enforced (D-40-05) |
| 3. SdkAgentRunner subprocess HOME=user-a | Mechanism present (homeOverride from Plan 02 + spawnPerUserClaudeLogin from Plan 03) |
| 4. Settings UI per-user login status, no API key entry | **STRUCTURALLY SATISFIED** — multi-user UI shows per-user status; per-user card has no API key input field. Verified: per-user branch JSX has no `<Input>` for API key. |

## Plan 05 Unblocked

Live UAT can exercise the per-user login flow on Mini PC (deferred to user's deploy cycle per scope_boundaries — NO deployment in Phase 40). Test artifacts from Plan 05 will pin Phase 40's invariants automatically.

## Self-Check: PASSED

- [x] `livos/packages/ui/src/routes/settings/ai-config.tsx` modified.
- [x] 13 `claudePerUser` references in the file (3 hooks + 5 in handlers + 5 in JSX).
- [x] `isMultiUserMode` derived variable present.
- [x] `claudeStartLogin` legacy reference preserved (single-user path intact).
- [x] `pnpm --filter ui build` exits 0.
- [x] Sacred file SHA unchanged from Plan 40-02 baseline.
