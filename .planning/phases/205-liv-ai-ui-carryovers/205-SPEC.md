# Phase 205: Liv AI UI Carry-Over Bundle — Specification

**Created:** 2026-05-24
**Ambiguity score:** 0.18 (gate: ≤ 0.20)
**Requirements:** 6 locked

## Goal

Inside the openclaw-os chat shell (`livos/packages/liv-claw-os/packages/claw-client/`), replace the bottom "Connected" status tile with a **Settings button** that opens the existing `SettingsDialog` and exposes two new tabs — **MCP Servers** (live add/remove → openclaw picks up without restart) and **Gateway** (paired-device CRUD with self-lock guard + allowedOrigins + auth mode) — so the operator no longer needs to SSH-edit `/opt/livos/data/openclaw/openclaw.json` or shell-switch to `/settings` for MCP management.

## Background

Operator UAT after Phase 203/204 surfaced two gaps:

1. **MCP control lives in the wrong shell.** The MCP server-management UI (`livos/packages/liv-ai-app/components/settings/McpTab.tsx`, Phase 202-07) only renders inside the liv-ai-app Next.js subapp at `/settings → MCP`. The openclaw-os chat shell (`claw-client`) has **no MCP UI at all** — search returned zero matches for `model|provider` keywords in `claw-client/src/components/settings/`. Operator must leave the chat surface to manage MCP servers.

2. **Gateway state is SSH-only.** `openclaw.json` schema (verified live on Mini PC) contains `gateway.controlUi.allowedOrigins[]`, `gateway.auth.{token, mode}`, and `plugins.entries` — all editable only via shell. Paired devices live in adjacent JSON files (`/opt/livos/data/openclaw/devices/paired.json`, `pending.json`). No UI surface exists.

The existing `claw-client/src/components/settings/SettingsDialog.tsx` (today: `ConnectionStatus` + `PreferencesPanel` only) is the natural mount point. The bottom "Connected" tile in the sidebar serves as the new entry button. Phase 203 Hot-fix F5 (commit `088947bb`) just unlocked the auth path the new tabs need — `X-Api-Key` service-token shortcut on livinityd's tRPC layer.

Sub-feature 205-01 (per-chat provider picker) was **dropped** during the Socratic interview — operator confirmed the openclaw `SessionComposer.tsx` qualified `provider/model` dropdown already covers per-chat provider scope, and persistence is handled by openclaw's own session store.

## Requirements

1. **Settings entry-point swap**: Bottom "Connected" status tile in the claw-client sidebar is replaced with a Settings button.
   - Current: `ConnectionStatus.tsx` renders a "Connected / Connecting / Disconnected" tile at the sidebar bottom. Clicking it does nothing (status-only).
   - Target: The bottom sidebar slot renders a Settings button (gear icon + label or compact). Click opens the existing `SettingsDialog.tsx`. Connection status indicator collapses into the dialog's existing Connection tab.
   - Acceptance: With the dev server running, the bottom sidebar element is clickable; clicking it opens the `SettingsDialog`. The pre-existing connection status is still visible inside that dialog (not lost).

2. **MCP Servers tab in SettingsDialog**: New tab exposes full add/remove/list of MCP servers from inside the chat shell.
   - Current: `SettingsDialog` has no MCP tab. Equivalent UI exists only at `livos/packages/liv-ai-app/components/settings/McpTab.tsx` (separate Next.js subapp). claw-client's settings directory has 3 files: `ConnectionStatus.tsx`, `PreferencesPanel.tsx`, `SettingsDialog.tsx`.
   - Target: New `McpServersTab.tsx` inside `claw-client/src/components/settings/`. Renders the list of configured MCP servers (name, transport, status, last-error) with per-row Remove button and a top-of-tab "Add MCP Server" form (name + transport (stdio/http) + command/URL + optional env vars + Save). Uses the existing `mcp.config.{list,set,delete}` tRPC namespace via livinityd — auth path is the F5 X-Api-Key shortcut (claw-client → livinityd HTTP).
   - Acceptance: From the running claw-client, opening Settings → MCP Servers and clicking "Add MCP Server" with valid input writes an entry to the livinityd MCP config store (verifiable via `mcp.config.list` returning the new row); clicking Remove on an existing entry calls `mcp.config.delete` and the row disappears from the list without a page reload.

3. **MCP propagation to openclaw is restart-free**: Newly added MCP servers become invokable by openclaw chat agents without a `systemctl restart liv-claw-gateway`.
   - Current: openclaw gateway and its claw-plugin spawn MCP child processes only on plugin init. Mutating the Redis-backed MCP config does NOT trigger a re-spawn — restart required.
   - Target: livinityd's `McpBridge` watches the same Redis hash the `mcp.config.*` router writes to (or publishes `liv:mcp:updated` on `mcp.config.set`/`.delete`), spawns/unloads MCP server child processes live, and the claw-plugin's adapter sees the new tools on the next tool-list call.
   - Acceptance: Add an MCP server via the new Settings tab → start a chat in claw-client → the agent's available tool list (visible in the openclaw composer/tool inspector OR observable via `luse.list` plugin-rpc) includes a tool exported by that MCP server **within 10 seconds** of the add mutation completing — **without** any service restart in `journalctl -u liv-claw-gateway`.

4. **Gateway tab in SettingsDialog**: New tab exposes paired-device CRUD + allowedOrigins + auth-mode controls.
   - Current: `gateway.controlUi.allowedOrigins[]`, `gateway.auth.{token, mode}`, and `plugins.entries` live only in `/opt/livos/data/openclaw/openclaw.json` (SSH edit). Paired/pending device JSON files are also SSH-only. Verified live on Mini PC: file has 6 allowedOrigins entries, `auth.mode = "token"`.
   - Target: New `GatewayTab.tsx` with three sections: (a) Paired Devices — list rows with deviceId prefix + role + last-seen + Revoke button; (b) Allowed Origins — list of strings with Add (URL input) + Remove per-row; (c) Authentication — auth.mode dropdown (`token` ↔ `master`) and a Rotate Token button. Reads + writes via a new `openclawos.gateway.*` tRPC router on livinityd that proxies to the openclaw plugin-rpc surface (existing Phase 203-06 `/openclawos/plugin-rpc` endpoint) and to the `device-auto-approver` module for device CRUD.
   - Acceptance: Opening Settings → Gateway lists at least the 6 allowedOrigins currently in `openclaw.json`; clicking Add → entering a URL → Save adds a row AND the new value appears in `openclaw.json` within 5 seconds (verifiable via `sudo cat /opt/livos/data/openclaw/openclaw.json`); Remove deletes the row and the JSON file is updated.

5. **Self-lock guard on device revoke**: Operator cannot revoke their own current session's device via the Gateway tab.
   - Current: No revoke endpoint exists. If naively built, an operator could click Revoke on their own row and lock themselves out.
   - Target: The `openclawos.gateway.devices.revoke` mutation decodes the caller's `Authorization: Bearer` JWT (or LIVINITY_SESSION cookie), reads `payload.deviceId` (or `payload.jti` when deviceId is absent), and compares it against the target deviceId in the input. On match, the mutation throws TRPCError with code `FORBIDDEN` and message `CANNOT_REVOKE_SELF` — the device is **not** revoked. The UI surfaces this as a non-destructive error toast.
   - Acceptance: An integration test (vitest) constructs a JWT with deviceId=`abc123`, calls `openclawos.gateway.devices.revoke({deviceId: 'abc123'})`, and asserts the call rejects with `FORBIDDEN` + message `CANNOT_REVOKE_SELF`. A second test with deviceId=`other` succeeds. Live smoke: in the claw-client Gateway tab, clicking Revoke on the row corresponding to the current browser's session yields an error toast and the row remains.

6. **Sacred SHA + Phase 203/204 invariants carry forward**: Phase 205 does not touch the 20-blob sacred registry and does not regress any Phase 203/204 invariant.
   - Current: Sacred SHA canonical is `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. INV-203-01..10 and INV-204-01..08 are all PASS as of commit `088947bb`.
   - Target: Every Phase 205 commit passes the pre-commit `[sacred-sha] PASS: 20 files verified` check. INV-203-09 (`mcp.config.*` namespace contracts unchanged at the wire level) is preserved — the new Settings tab is a **consumer** of the existing tRPC namespace, not a contract mutation.
   - Acceptance: All Phase 205 commits log `[sacred-sha] PASS: 20 files verified`. `pnpm vitest run source/modules/server/trpc/mcp-config-router.test.ts` continues to pass with zero schema diffs. The Phase 204 6-state restart banner pattern is **not** triggered for MCP add/remove (requirement 3 acceptance is the falsifiable check).

## Boundaries

**In scope:**
- Bottom "Connected" tile → Settings button swap in `claw-client` sidebar
- New `McpServersTab.tsx` mounted inside `SettingsDialog` (add / list / remove only)
- Live MCP propagation: livinityd McpBridge live reload + Redis pub/sub so openclaw sees changes without `systemctl restart`
- New `GatewayTab.tsx` inside `SettingsDialog` with: paired-device list + revoke; allowedOrigins list + add/remove; auth.mode dropdown + token rotation button
- New `openclawos.gateway.*` tRPC namespace on livinityd (devices.list/revoke, origins.list/add/remove, auth.get/setMode, auth.rotateToken)
- Self-lock guard on device revoke (JWT deviceId/jti match → 403 FORBIDDEN CANNOT_REVOKE_SELF)
- Both new tabs auth via the Phase 203 Hot-fix F5 X-Api-Key service-token path

**Out of scope:**
- Per-chat provider picker (205-01 was dropped during interview) — operator confirmed the existing `SessionComposer` qualified `provider/model` dropdown already covers this need; openclaw's session store already persists per-chat state
- Per-chat MCP server allow/deny lists — only global add/remove of MCP servers; per-chat MCP toggles are a separate future phase
- Plugin enable/disable UI inside Gateway tab — `plugins.entries` is read-only in this phase (toggling a plugin off can break the chat surface itself; defer to a separate phase with a guard)
- "Type DELETE" confirmation pattern for destructive ops — replaced by the lighter self-lock guard (per Round 3 decision)
- Mobile responsiveness pass on the new tabs — desktop layout only; mobile pass is a separate frontend polish phase
- Telemetry / audit log of who-revoked-which-device — out of scope; the gateway's existing journal already captures revoke events at INFO level
- Token rotation flow that auto-pushes the new token to paired devices — rotate button generates a new token only; existing devices must re-pair
- Backward-compat shim for the old `/settings → MCP` tab in `liv-ai-app` — that tab keeps working; this phase adds a second surface, does not migrate users away

## Constraints

- **No `systemctl restart liv-claw-gateway` on MCP add/remove.** Requirement 3 acceptance is the falsifiable test. This forces a Redis pub/sub or filesystem-watch implementation; the simpler "just restart" path is explicitly excluded.
- **Sacred SHA must be preserved on every commit.** Phase 205 work does not touch any of the 20 protected blobs. Pre-commit hook will block any violation.
- **English-only UI strings** (carries INV-203-05 forward). No Turkish characters in `.tsx` / `.ts` files.
- **Mini PC is the only deploy target.** Per the standing rule from MEMORY.md, Server 4 is off-limits and Server 5 is a relay only; no Phase 205 deploy goes to either.
- **tRPC routing additions must be added to `httpOnlyPaths` in `common.ts`** so the new `openclawos.gateway.*` namespace does not accidentally land on the WebSocket transport (per memory pitfall — mutations hang silently on half-broken WS).

## Acceptance Criteria

- [ ] Clicking the bottom sidebar element in the running claw-client opens `SettingsDialog` (the dialog is the existing component, not a new one)
- [ ] `SettingsDialog` contains exactly the existing Connection content **plus** two new tabs: "MCP Servers" and "Gateway" — in that order
- [ ] Adding an MCP server via the MCP Servers tab produces a new row in `mcp.config.list` and the row is visible in the tab without a page reload
- [ ] Removing an MCP server via the MCP Servers tab deletes the row and the row disappears from the tab list
- [ ] After adding an MCP server, an openclaw chat agent in the same session can invoke a tool exported by that MCP server within 10 seconds — verified by tool appearing in `luse.list` plugin-rpc response — and **without** any `liv-claw-gateway` restart in `journalctl`
- [ ] Gateway tab lists the same allowedOrigins set as `/opt/livos/data/openclaw/openclaw.json` (verified by `sudo cat` cross-check)
- [ ] Adding/removing an allowedOrigin via the UI updates `openclaw.json` within 5 seconds (file diff cross-check)
- [ ] Revoke button on the row corresponding to the current browser session yields a `FORBIDDEN` toast and does not remove the row
- [ ] Revoke button on a non-self row removes the device row and the device fails to reconnect (verifiable via `journalctl -u liv-claw-gateway` showing `pairing required`)
- [ ] `pnpm vitest run` on the new vitest suites (McpServersTab, GatewayTab, openclawos.gateway router, self-lock guard) passes with ≥ 5 cases per suite
- [ ] Every Phase 205 commit shows `[sacred-sha] PASS: 20 files verified`
- [ ] No regression in Phase 204 ProvidersTab (the existing `/settings → Providers` in liv-ai-app still works)

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                |
|--------------------|-------|------|--------|------------------------------------------------------|
| Goal Clarity       | 0.92  | 0.75 | ✓      | One sentence locks shell + entry point + 2 tabs       |
| Boundary Clarity   | 0.78  | 0.70 | ✓      | 205-01 explicitly removed; 8 out-of-scope items       |
| Constraint Clarity | 0.75  | 0.65 | ✓      | Restart-free MCP is the hard constraint               |
| Acceptance Criteria| 0.75  | 0.70 | ✓      | 11 pass/fail checkboxes                               |
| **Ambiguity**      | 0.18  | ≤0.20| ✓      | All dimensions above minimum                          |

## Interview Log

| Round | Perspective      | Question summary                                                                        | Decision locked                                                                                                                |
|-------|------------------|-----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| 1     | Researcher       | How should the in-chat provider picker behave? Where does MCP UI live? Gateway scope?  | Per-chat scope (1st instinct); sidebar MCP toggle (1st instinct); full CRUD Gateway with auth mode toggle                       |
| 2     | Simplifier       | Persistence layer for provider, mutation behavior for MCP, risk gating for Gateway?    | **Re-scope**: replace bottom "Connected" with Settings button; MCP + Gateway both go INSIDE existing SettingsDialog as tabs    |
| 3     | Boundary Keeper  | Drop 205-01? Self-lock guard mechanism? MCP propagation strategy?                       | Drop 205-01 (existing model dropdown sufficient); JWT deviceId/jti for self-lock; live mcp-bridge reload + Redis pub (no restart) |

---

*Phase: 205-liv-ai-ui-carryovers*
*Spec created: 2026-05-24*
*Next step: `/gsd-discuss-phase 205` — implementation decisions (Redis channel name, McpBridge watcher shape, dialog layout, tab order, error toast component, etc.)*
