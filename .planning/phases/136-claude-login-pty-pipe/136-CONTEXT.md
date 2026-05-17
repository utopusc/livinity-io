# Phase 136 — Real `claude /login` PTY Pipe (CONTEXT)

**Opened:** 2026-05-17
**Driver:** Phase 135 ConnectAiStep ships a *visual* terminal animation (the reference's `CLAUDE_SCRIPT` constant). The wizard scope (`D-135-V2-CLAUDE-REAL`) calls for a real `claude /login` device-flow flow streamed into the same terminal frame. Phase 135 deferred this so the visual port could land; Phase 136 closes the gap.
**User quote (2026-05-17):** *"Connect AI step = REAL terminal with claude /login flow, terminal stream with browser handoff"*

## Locked decisions

| # | Decision | Locked value | Source |
|---|----------|--------------|--------|
| D-136-RUNTIME | Backend runtime owns the PTY | `livinityd` (port 8080, runs as root on Mini PC) | Per `[[reference-anthropic-subscription-state]]` the canonical creds dir is `/root/.config/anthropic/`; `livinityd` already runs root |
| D-136-PTY-LIB | PTY library | `node-pty` (Microsoft's, widely used; required because `claude` CLI uses TTY-only prompts that `child_process.spawn` with pipes can't drive) | Industry standard |
| D-136-TRANSPORT | UI ↔ backend transport | tRPC **subscription** on WebSocket (already wired in LivOS — `wsClient` in `livos/packages/ui/src/trpc/trpc.ts`) | Existing infra; no new transport |
| D-136-RPC-SHAPE | Procedure surface | `claudeLogin.start` (subscription, yields `{kind: 'output' \| 'auth-url' \| 'verification-prompt' \| 'success' \| 'error', payload}`), `claudeLogin.sendInput` (mutation, takes verification code string), `claudeLogin.cancel` (mutation) | Smallest surface that supports the flow |
| D-136-UI-LIB | Terminal renderer | `xterm.js` — **already a project dependency** per `livos/packages/ui/vite.config.ts` `globIgnores` entry (`**/assets/{…,xterm,…}-*.js`) | No new dep on the frontend |
| D-136-URL-PARSE | Auth URL detection | Regex `https://(claude|console)\.anthropic\.com/(login\|auth)[^\s]+` matched on each PTY chunk; first match opens `window.open(url, '_blank', 'noopener,noreferrer')` | Matches real `claude /login` output format (verified during planning) |
| D-136-CODE-INPUT | Verification-code capture | A dedicated input below the xterm frame appears when `Verification code:` prompt is detected; submit pipes the code + `\n` into PTY stdin via `claudeLogin.sendInput` | Reference flow + Anthropic device-flow spec |
| D-136-SCOPE | What this phase does NOT do | No browser launch UI inside the device (operator's local browser opens, then they paste into the LivOS UI). No multi-user — single Anthropic account per host (matches `BROKER_FORCE_ROOT_HOME` invariant). | Out of scope; v34+ can re-open multi-user |
| D-136-FALLBACK | Behavior if `claude` CLI not installed on host | UI surfaces a clear error + a copy-pasteable `curl -sSL ... \| sh` install command; advance/skip remains available | Operator dignity — never a silent hang |
| D-136-SACRED-SHA | `liv/packages/core/src/sdk-agent-runner.ts` SHA | MUST equal `f3538e1d811992b782a9bb057d1b7f0a0189f95f` on every commit | Project-wide invariant (`.husky/pre-commit` enforces) |
| D-136-SUBSCRIPTION-PATH | Subscription/Max account protection | `BROKER_FORCE_ROOT_HOME=1` env stays set; PTY child inherits it; tokens land at `/root/.config/anthropic/` not the live user's home | `[[feedback-subscription-only]]` |

## Codebase baseline (audited 2026-05-17)

**Frontend:**
- `livos/packages/ui/src/features/onboarding-flow/steps/connect-ai-step.tsx` (171 LOC) — to be rewritten: drop `CLAUDE_SCRIPT` constant + `setTimeout` loop; mount `<XtermView/>` consuming `trpcReact.claudeLogin.start.useSubscription`; verification-code input form
- `livos/packages/ui/vite.config.ts` — xterm is already optimizeDeps-excluded; no change needed there
- `livos/packages/ui/package.json` — add `@xterm/xterm` + `@xterm/addon-fit` runtime deps (if not already present)

**Backend:**
- `livos/packages/livinityd/source/modules/` — new module `claude-login/` with `procedures.ts` (tRPC) + `pty-spawner.ts` (node-pty wrapper) + `index.ts` (barrel)
- `livos/packages/livinityd/source/router.ts` (or equivalent root) — register `claudeLogin` namespace
- `livos/packages/livinityd/package.json` — add `node-pty` dep (Mini PC build needs `python3 + make + gcc` — Phase 106 already covers apt-install of build essentials)

**Process model:**
- Single in-flight `claude /login` child per host (mutex via Redis key `liv:claudeLogin:active`)
- Process spawned with `cwd: '/root'`, env `{ ...process.env, HOME: '/root', BROKER_FORCE_ROOT_HOME: '1' }`
- Stdout/stderr pipe → tRPC subscription emit (chunked, UTF-8)
- Subscription cleanup: on disconnect, kill PTY + remove Redis key
- Timeout: 5 min hard cap (user OAuth flow shouldn't take longer)

## Acceptance criteria (master)

- [ ] AC-136-M1: User clicks "Sign in with Claude" → terminal frame shows real `$ claude /login` stdout streaming line-by-line
- [ ] AC-136-M2: When the Anthropic auth URL appears, the URL is highlighted + clickable; clicking opens `https://...anthropic.com/...` in a new tab
- [ ] AC-136-M3: A "Verification code" input appears below the terminal when the `claude` CLI prompts for it
- [ ] AC-136-M4: User pastes code + clicks Verify → input is piped to PTY stdin → terminal shows the CLI's success/failure response
- [ ] AC-136-M5: On success, `/root/.config/anthropic/.credentials.json` exists on the Mini PC with `subscription` shape
- [ ] AC-136-M6: ConnectAiStep "Continue" CTA is disabled until success
- [ ] AC-136-M7: Cancel button kills the PTY process within 2s
- [ ] AC-136-M8: Concurrent invocation attempts (e.g. another browser tab) are blocked with a clear UI message
- [ ] AC-136-M9: Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved across every commit
- [ ] AC-136-M10: Live UAT — operator walks the flow on the Mini PC and ends up authenticated. Subscription path verified via existing `/v1/messages` smoke ping.

## Non-goals (explicitly out of scope)

- Multi-account Anthropic auth (single subscription per host stays the invariant)
- BYOK / direct API key path (per `[[feedback-subscription-only]]`)
- Refresh-token rotation UI (handled by Anthropic CLI itself)
- Account switcher in dock / settings (post-onboarding; v34+ slot)
- Replacing the `xterm.js` choice with WebTerminals or alternative renderers

## Dependencies

- Phase 135 ✅ (ConnectAiStep visual frame exists)
- Phase 106 ✅ (Mini PC apt build-essential already installed — required for native `node-pty` compile)
- `claude` CLI binary present on host (operator pre-req; Phase 136-A verifies + emits clear error if missing)

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| `node-pty` Windows-build fails on dev machine | LOW | Backend only runs on Linux in production; Windows dev workflow can stub the procedure or rely on docker |
| `claude` CLI changes its prompt format → URL/code regex breaks | MEDIUM | Document regex in code with a sample of current CLI output; add a feature flag to fall back to "open Anthropic URL in browser, paste full token JSON" path |
| Multiple browser tabs racing | LOW | Redis mutex (`liv:claudeLogin:active` with 5min TTL) |
| Stdin escape sequences (Ctrl-C etc.) injected via verification code | LOW | Whitelist verification code to `[A-Z0-9-]+` server-side before writing to stdin |
| OAuth subscription page rate-limits | LOW | Anthropic side; surface error + retry button |

## Sub-plans (in dependency order)

| # | Plan file | Scope | Approx LOC | Depends on |
|---|---|---|---|---|
| 136-01 | `136-01-PLAN.md` | Backend: `node-pty` dep + `claude-login` module skeleton + tRPC subscription scaffold | +200 | — |
| 136-02 | `136-02-PLAN.md` | Backend: PTY spawner, env protection, Redis mutex, kill/timeout, subscription emit | +250 | 136-01 |
| 136-03 | `136-03-PLAN.md` | Frontend: `<XtermView/>` component (mount xterm, wire subscription, append chunks, ANSI cleanup) | +200 | 136-01 |
| 136-04 | `136-04-PLAN.md` | Frontend: URL + verification-code parser, input form, sendInput mutation wiring | +150 | 136-03 |
| 136-05 | `136-05-PLAN.md` | Replace ConnectAiStep CLAUDE_SCRIPT with the new live view; success/error states; Continue gating | +100 | 136-04 |
| 136-06 | `136-06-PLAN.md` | Mini PC deploy + live UAT walk + capture creds.json shape verification | docs | 136-05 |

**Total est:** ~900 LOC frontend + backend net delta, 6 atomic commits.

## Rollback

Each commit is atomic. Worst case: `git revert HEAD~N..HEAD` for the Phase 136 range; ConnectAiStep falls back to its Phase 135 animated CLAUDE_SCRIPT. Backend tRPC procedure registration is namespaced (`claudeLogin.*`) and can be unregistered without affecting other routes.

## Related memories

- `[[project-phase-135-complete]]` — what shipped before this (visual port)
- `[[feedback-subscription-only]]` — must not introduce BYOK
- `[[reference-anthropic-subscription-state]]` — creds path + BROKER_FORCE_ROOT_HOME
- `[[reference-broker-protocols-verified]]` — existing broker translation context
