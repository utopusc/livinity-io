# Phase 136 — Real `claude /login` PTY Pipe (MASTER PLAN)

> Companion to `136-CONTEXT.md` (locked decisions + acceptance criteria).
> This file is the executable roadmap consumed by `/gsd-execute-phase 136`.

## Goal

Replace the animated terminal in Phase 135's `ConnectAiStep` with a live, two-way PTY pipe to a real `claude /login` process on the host. The user signs in to Anthropic from within the onboarding flow; credentials land at `/root/.config/anthropic/` (subscription path); the wizard's "Continue" CTA only enables on confirmed success.

## Atomic commit roadmap

### Plan 136-01 — Backend skeleton + `node-pty` dep

**Files:**
- ✏️ `livos/packages/livinityd/package.json` — add `"node-pty": "^1.0.0"`
- ➕ `livos/packages/livinityd/source/modules/claude-login/index.ts` — barrel
- ➕ `livos/packages/livinityd/source/modules/claude-login/procedures.ts` — stub tRPC procedures returning `not-implemented` placeholders
- ✏️ `livos/packages/livinityd/source/router.ts` (or wherever the root tRPC router composes namespaces) — register `claudeLogin: claudeLoginRouter`
- ➕ `livos/packages/livinityd/source/modules/claude-login/__tests__/procedures.spec.ts` — happy-path test that the namespace is exported

**Acceptance:**
- `pnpm --filter @livinityd build` passes
- `pnpm --filter ui build` succeeds (frontend can import the new namespace types)
- Sacred SHA preserved

### Plan 136-02 — PTY spawner + Redis mutex + lifecycle

**Files:**
- ➕ `livos/packages/livinityd/source/modules/claude-login/pty-spawner.ts` — `spawnClaudeLogin(): AsyncIterable<{kind, payload}>`. Uses `node-pty.spawn('claude', ['/login'], { cwd: '/root', env: { ...process.env, HOME: '/root', BROKER_FORCE_ROOT_HOME: '1' }, name: 'xterm-256color', cols: 100, rows: 30 })`. Parses each chunk for URL + verification prompt. Emits typed events. Listens for cancel signal.
- ✏️ `livos/packages/livinityd/source/modules/claude-login/procedures.ts` — implement `start` as subscription consuming the async iterable; `sendInput` writes to stored PTY ref; `cancel` kills + cleans up
- Redis key `liv:claudeLogin:active` with 300s TTL; `start` rejects if already set
- 5min hard timeout from spawn → SIGKILL + emit `error`

**Acceptance:**
- Unit tests: `pty-spawner` happy path + URL detection + timeout + cancel
- Manual smoke on Mini PC: open subscription via tRPC playground, see streamed output, send fake verify code, observe child kill on disconnect
- Sacred SHA preserved

### Plan 136-03 — `<XtermView/>` component

**Files:**
- ➕ `livos/packages/ui/src/features/onboarding-flow/effects/xterm-view.tsx` — mount xterm + FitAddon, consume subscription via `trpcReact.claudeLogin.start.useSubscription`, append chunks to terminal, expose `onAuthUrl` + `onVerificationPrompt` + `onSuccess` + `onError` callbacks. Cleanup tears down xterm + cancels subscription.
- ✏️ `livos/packages/ui/package.json` — add `@xterm/xterm`, `@xterm/addon-fit` (verify version pinning matches vite config exclusion list)
- ➕ `livos/packages/ui/src/features/onboarding-flow/effects/__tests__/xterm-view.test.tsx` — happy path render + cleanup

**Acceptance:**
- Component mounts inside `.terminal` frame from Phase 135 CSS (no layout regression)
- xterm font/color tokens read from `[data-flow="onboarding"]` scope (verify via inline `theme={{ background: 'var(--liv-fg)', foreground: 'var(--liv-bg)' }}` mapping)
- Sacred SHA preserved

### Plan 136-04 — URL + code parser + verification input

**Files:**
- ➕ `livos/packages/ui/src/features/onboarding-flow/steps/_connect-ai/auth-parser.ts` — pure regex helpers `extractAuthUrl(chunk: string)`, `isVerificationPrompt(chunk: string)`. Test-covered.
- ➕ `livos/packages/ui/src/features/onboarding-flow/steps/_connect-ai/verification-input.tsx` — inline form below xterm: code input (regex-restricted), Verify button, hint text. Submits via `trpcReact.claudeLogin.sendInput.useMutation`.

**Acceptance:**
- Parser unit tests pass on sample CLI outputs (record real `claude /login` stdout in a fixture during planning; commit as test data)
- Whitelist regex `^[A-Z0-9-]{4,32}$` enforced UI-side AND server-side

### Plan 136-05 — Wire it all into ConnectAiStep

**Files:**
- ✏️ `livos/packages/ui/src/features/onboarding-flow/steps/connect-ai-step.tsx` — delete `CLAUDE_SCRIPT` constant + setTimeout loop + old `<div className='terminal-body'>` line renderer. Replace with `<XtermView/>` + `<VerificationInput/>` (when prompt detected). Add "Open authorization page" button (clickable URL) + "Sign me in" state machine (`idle → spawning → auth-url-emitted → awaiting-code → verifying → success/error`). "Continue" disabled until `success`. Skip remains.
- Optional: small `sound.play('success')` chirp on success state.

**Acceptance:**
- Operator flow walked end-to-end on Mini PC: from onboarding URL → click Sign in → real Anthropic OAuth page opens in new tab → user authorizes → code appears → operator pastes → terminal shows success → Continue enabled
- No regressions on prior steps (Welcome, Account, Wallpaper, Personalize, Done)
- `/root/.config/anthropic/.credentials.json` exists post-flow; broker `/v1/messages` smoke ping returns 200
- Sacred SHA preserved

### Plan 136-06 — Mini PC deploy + UAT + memory

**Files:** docs only
- `bash /opt/livos/update.sh` on Mini PC
- Operator-walked UAT checklist (`136-UAT-CHECKLIST.md`): cold-boot install → onboarding → claude login → smoke ping → mark each AC

**Acceptance:**
- All AC-136-M1..M10 pass
- Phase 135 follow-up section in `project_phase_135_complete.md` flipped to ✅ for the PTY item
- New memory: `project_phase_136_complete.md`
- ROADMAP.md flips Phase 136 to ✅
- Sacred SHA preserved across all 6 plans

## Open questions for execute-phase

These are deliberate gray-area items to surface in `/gsd-discuss-phase 136` before code lands:

1. Should the OAuth URL open via the in-LivOS webapp launcher (Phase 92-99 infra) or just `window.open` to the host browser? — Default: `window.open`. WebApp launcher is overkill for a 30-second OAuth flow.
2. Where does the "claude CLI not installed" error route? — Default: in-step error card with a copy-pasteable install command.
3. Should the OTP regex allow lowercase? — Anthropic codes are uppercase alphanumeric in current observation; keep uppercase-only for now.
4. Does the resume banner (from 135-D) need an entry-point that re-enters the ConnectAI step mid-spawn? — Default: no; resume into ConnectAI just shows the idle state, user re-clicks Sign in.

## Rollback

Each plan ships its own commit. `git revert` of any single plan leaves the others functional. Worst-case revert of 136-05 alone falls back to Phase 135 ConnectAiStep without losing backend procedures (they just become orphan endpoints).
