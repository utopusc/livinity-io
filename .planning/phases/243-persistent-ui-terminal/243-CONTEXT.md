# Phase 243: Persistent UI terminal (xterm.js + livinityd PTY backend) — Context

**Gathered:** 2026-05-28
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous chain, skip_discuss)
**Scope:** **MVP SCOPE** — full multi-session/attach-detach/TTL-GC deferred to v44+

<domain>
## Phase Boundary

Add a working terminal panel to LivOS shell. Browser side = xterm.js. Backend = livinityd PTY module using `node-pty`. **v43 MVP scope:** single-session per browser tab, no attach/detach across reload, no multi-session UI, no TTL GC. Feature-flag gated OFF by default.

</domain>

<decisions>
## Implementation Decisions

### Locked (do NOT re-decide)
- **L-243-A:** `node-pty` is the chosen PTY library (NOT `node-pty-prebuilt-multiarch` — node-pty has prebuilt binaries for Linux x64 which is Mini PC's arch). If `npm install node-pty` fails on Mini PC due to missing build tools, fall back to `node-pty-prebuilt-multiarch`.
- **L-243-B:** PTY spawned as `bruce` user (NEVER root). D-243-NO-ROOT.
- **L-243-C:** WebSocket endpoint reuses Caddy `@liv_ws` block from Phase 237 (RFC 6455 compliance fix). Path: `/livos/terminal/ws`. Auth via JWT cookie (Phase 234-04 pattern).
- **L-243-D:** Feature flag: Redis key `livos:v43:terminal_panel` (default OFF). UI hides terminal dock entry when flag is OFF.
- **L-243-E:** Session metadata schema in Redis: `livos:pty:session:{id}` HSET with `user_id`, `name`, `createdAt`, `lastAttachAt`, `cwd`. Schema includes `user_id` from day one even though v43 is single-user.
- **L-243-F:** Sacred SHA preserved. Mini PC ONLY.

### Claude's Discretion
- **MVP scope (v43):** session lives for the duration of the WS connection. When socket closes, session dies. No reattach across reload.
- **WS protocol (minimal):**
  - Client → Server: `{ type: 'init', cols, rows, cwd? }`, `{ type: 'data', data }`, `{ type: 'resize', cols, rows }`, `{ type: 'close' }`
  - Server → Client: `{ type: 'ready', sessionId }`, `{ type: 'data', data }`, `{ type: 'exit', code, signal }`, `{ type: 'error', message }`
- **xterm.js panel:** new dock entry "Terminal" hidden behind `livos:v43:terminal_panel` flag. Opens in standard LivOS shell window. Single instance per shell.
- **Window component:** xterm.js + `@xterm/addon-fit` + `@xterm/addon-web-links`. Theme: match LivOS dark mode (background `#0b0b0c`, foreground `#e7e7e8`, accent `#7dd3fc`).
- **Tests:** vitest for PTY module (session creation, data flow, exit handling); component test for xterm panel (mount + WS mock).
- **Mini PC deploy:** `update.sh` must `npm install` node-pty on the server. Adding a new dep — verify `update.sh` runs `pnpm install` (yes per memory).

</decisions>

<code_context>
## Existing Code Insights

- LivOS shell UI = `livos/packages/ui/src/` React tree. Dock entries defined in dock-config / dock-manifest pattern (search for `dock` in `livos/packages/ui/src/`).
- livinityd modules pattern: `livos/packages/livinityd/source/modules/<name>/{index,types,...}.ts` + `__tests__/` (see cli-installer for Phase 239 precedent).
- tRPC routers: `livos/packages/livinityd/source/modules/server/trpc/`. WebSocket sits OUTSIDE tRPC — use a raw `ws` upgrade handler in the HTTP server.
- Caddy `@liv_ws` matcher: from Phase 237, allows unconditional WS upgrade for `/liv` and similar prefixes. Need to extend or copy for `/livos/terminal/ws`.
- Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` — preserved via pre-commit hook.

</code_context>

<specifics>
## Specific Ideas

Plans (estimate 4):
- **243-01:** livinityd `pty-sessions/` module — `node-pty` wrapper class, session metadata Redis writes, types. TDD tests for spawn/data/exit lifecycle. Add `node-pty` to `livos/packages/livinityd/package.json` deps.
- **243-02:** WebSocket endpoint at `/livos/terminal/ws` — JWT cookie auth, message protocol, Caddy block update. Tests with ws + mock node-pty.
- **243-03:** LivOS UI terminal panel — new dock entry (flag-gated), xterm.js window component, WS client. Storybook story optional.
- **243-04:** Mini PC deploy + flag flip + UAT (3 probes: open terminal / run `ls` / window close kills session).

UAT (3 probes):
1. With `livos:v43:terminal_panel=true`, dock shows Terminal entry → click → xterm window opens → shell prompt visible.
2. Type `whoami` → returns `bruce`.
3. Close window → session exits cleanly (verify via journalctl livos.service for clean WS close + PTY SIGHUP).

</specifics>

<deferred>
## Deferred Ideas (v44+)

- Multi-session UI (named tabs, session list panel)
- Attach/detach across page reload (requires Redis-backed scrollback or PTY-buffer persistence)
- TTL GC (24h since last attach)
- Admin "kill session by id" UI
- Cwd / env preservation across sessions
- Copy/paste / drag-drop file paths

</deferred>

<canonical_refs>
## Canonical References

- `.planning/phases/237-aionui-ws-handshake-fix/` — Caddy `@liv_ws` pattern
- `.planning/phases/234-liv-ai-polish/` — auth bypass at `/liv-login` (preserve)
- `.planning/phases/239-onboarding-cli-tools/239-01-SUMMARY.md` — livinityd module pattern
- `livos/packages/livinityd/source/modules/cli-installer/installer.ts` — argv-form spawn precedent
- `livos/packages/livinityd/source/modules/server/trpc/cli-installer-router.ts` — JWT-auth adminProcedure precedent

</canonical_refs>
