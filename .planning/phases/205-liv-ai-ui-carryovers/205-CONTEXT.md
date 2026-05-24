# Phase 205: Liv AI UI Carry-Over Bundle — Context

**Gathered:** 2026-05-24
**Status:** Ready for planning
**Mode:** Auto (decisions captured from prior /gsd-spec-phase Socratic interview; gray areas auto-resolved to recommended defaults)

<domain>
## Phase Boundary

Inside the openclaw-os chat shell (`livos/packages/liv-claw-os/packages/claw-client/`), replace the bottom "Connected" status tile with a Settings button that opens the existing `SettingsDialog` and exposes two new tabs — **MCP Servers** (live add/remove → openclaw picks up without restart) and **Gateway** (paired-device CRUD with self-lock guard + allowedOrigins + auth mode) — so the operator no longer needs to SSH-edit `/opt/livos/data/openclaw/openclaw.json` or shell-switch to `/settings` for MCP management.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**6 requirements are locked.** See `205-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `205-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Bottom "Connected" tile → Settings button swap in `claw-client` sidebar
- New `McpServersTab.tsx` mounted inside `SettingsDialog` (add / list / remove only)
- Live MCP propagation: livinityd McpBridge live reload + Redis pub/sub so openclaw sees changes without `systemctl restart`
- New `GatewayTab.tsx` inside `SettingsDialog` with: paired-device list + revoke; allowedOrigins list + add/remove; auth.mode dropdown + token rotation button
- New `openclawos.gateway.*` tRPC namespace on livinityd (devices.list/revoke, origins.list/add/remove, auth.get/setMode, auth.rotateToken)
- Self-lock guard on device revoke (JWT deviceId/jti match → 403 FORBIDDEN CANNOT_REVOKE_SELF)
- Both new tabs auth via the Phase 203 Hot-fix F5 X-Api-Key service-token path

**Out of scope (from SPEC.md):**
- Per-chat provider picker (205-01 dropped during interview)
- Per-chat MCP server allow/deny lists
- Plugin enable/disable UI inside Gateway tab
- "Type DELETE" confirmation pattern
- Mobile responsiveness pass
- Telemetry / audit log of who-revoked-which-device
- Auto-push rotated token to paired devices
- Backward-compat shim for the old `/settings → MCP` tab

</spec_lock>

<decisions>
## Implementation Decisions

### Entry point + dialog layout

- **D-205-01:** Bottom sidebar "Connected" tile is replaced with a single Settings button (gear icon). The current `ConnectionStatus.tsx` content moves into the SettingsDialog as the first tab so the connection signal is not lost.
- **D-205-02:** `SettingsDialog` gets a tab strip with this order: **Connection** (existing content, renamed slightly) → **MCP Servers** (new) → **Gateway** (new). Per `feedback_v36_no_bold_redesigns` memory, the change is additive — `SettingsDialog`'s shell + `PreferencesPanel` stay; new tabs nest inside.
- **D-205-03:** Tab strip uses a horizontal segmented control matching whatever pattern exists in claw-client today (researcher to confirm — likely shadcn/ui-style tabs given `@openuidev` upstream). No tab-overflow scroll needed — 3 tabs fit comfortably.

### MCP Servers tab (205-02)

- **D-205-04:** New file `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/McpServersTab.tsx`. Port the operator-facing surface from `livos/packages/liv-ai-app/components/settings/McpTab.tsx` — same fields (name, transport stdio/http, command/URL, env vars), same Add/Remove buttons, same redacted display of secret env vars.
- **D-205-05:** Talks to existing `mcp.config.{list,set,delete}` tRPC namespace via a thin HTTP client (model: `app-store.ts`'s tRPC v10/v11 batch envelope). Auth header is `X-Api-Key` matching `process.env.LIV_API_KEY` — the Hot-fix F5 path (commit `088947bb`). No new tRPC procedures are added for MCP.
- **D-205-06:** The Phase 204-02 deviation note (McpTab.tsx pre-existing mutation bug — `{"0":{"json":...}}?batch=1` silently broken on Mini PC) is **observed**: port the working `callMutation` helper pattern from `ProvidersTab.tsx` (bare non-batch POST). Do NOT copy-paste the broken envelope shape from McpTab.tsx.

### MCP propagation (restart-free) (205-02 hard constraint)

- **D-205-07:** Redis channel `liv:mcp:updated` is introduced — mirrors the existing `liv:config:updated` pattern from `NativeAppConfigStore` (livos/packages/livinityd/source/modules/apps/native-app-config.ts:127). Pub on every `mcp.config.set` / `.delete`; payload is a minimal JSON envelope `{op: 'set'|'delete', name: string, ts: ISO-8601}`.
- **D-205-08:** `livos/packages/livinityd/source/modules/agent-runtime/mcp-bridge.ts` (the consumer) opens a second ioredis duplicate connection at boot for the Redis subscribe side (ioredis blocks the connection in subscribe mode — duplicate channel pattern). On message, it diffs the current spawned-server map against `listServers()` and spawns/unloads as needed.
- **D-205-09:** Acceptance proof is **journalctl absence + tool visibility within 10s** (per SPEC § R3 Acceptance). No `systemctl restart liv-claw-gateway` line may appear in the journal during the test window. Tool visibility check via the `luse.list` plugin-rpc on the gateway.

### Gateway tab (205-03)

- **D-205-10:** New file `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/GatewayTab.tsx`. Three sections rendered as collapsible cards (default expanded): Paired Devices, Allowed Origins, Authentication.
- **D-205-11:** New tRPC router `openclawos.gateway.*` on livinityd. Subroutes: `devices.list`, `devices.revoke`, `origins.list`, `origins.add`, `origins.remove`, `auth.get`, `auth.setMode`, `auth.rotateToken`. Lives at `livos/packages/livinityd/source/modules/server/trpc/openclawos-gateway-router.ts` (sibling of existing `openclawos-router.ts`).
- **D-205-12:** Backend implementation reuses the Phase 203-06 `/openclawos/plugin-rpc` Express endpoint for any gateway-internal RPC + direct read/write of `/opt/livos/data/openclaw/openclaw.json` for the JSON-resident config (`allowedOrigins`, `auth.{mode,token}`, `plugins.entries`). Atomic tmp+rename writes (same pattern as `env-file-writer.ts:defaultFs.writeAtomic`). chmod 0600 preserved.
- **D-205-13:** Paired-device list reads from the openclaw `paired.json` + `pending.json` (same files `device-auto-approver.ts` already touches). Revoke path: delete the row from `paired.json` AND poison the matching device-token Redis slot (`liv:openclaw:devicetoken:<jti>`) — this is the existing F2/F3 invalidation path; do not invent a new revoke mechanism.

### Self-lock guard (205-03 critical safety)

- **D-205-14:** `devices.revoke` mutation extracts caller's `deviceId` from JWT payload via `ctx.server.verifyToken()` (existing helper). Comparison: `payload.deviceId === input.deviceId` (or `payload.jti === devices[input.deviceId].jti` as a fallback if deviceId is absent). Match → throw `TRPCError({ code: 'FORBIDDEN', message: 'CANNOT_REVOKE_SELF' })` before any state mutation.
- **D-205-15:** Vitest cases live in `livos/packages/livinityd/source/modules/server/trpc/openclawos-gateway-router.test.ts`. Minimum 2 cases: revoke-self → rejects with FORBIDDEN; revoke-other → succeeds.
- **D-205-16:** UI side: the `RevokeDeviceMutation` hook catches the FORBIDDEN response and surfaces a non-destructive toast `Cannot revoke the device you are currently signed in with`. The row stays. No special "is this me" badge on the row is required (out of scope; future polish).

### Token rotation (205-03)

- **D-205-17:** `auth.rotateToken` generates a 32-byte hex token (`crypto.randomBytes(32).toString('hex')`), writes it to `openclaw.json` `gateway.auth.token`, **does NOT** push to any paired device. Per SPEC out-of-scope, existing devices must re-pair. The UI shows a one-time-display banner with the new token + copy button so the operator can paste it elsewhere if needed (e.g. CLI clients).

### Auth strategy across the bridge

- **D-205-18:** All new tRPC calls from `claw-client` to livinityd go through Caddy's `/trpc/*` reverse-proxy (already configured per Phase 203-05). Auth header is `X-Api-Key` matching `process.env.LIV_API_KEY` — service-token shortcut via Hot-fix F5 (`is-authenticated.ts` lines 19-58). claw-client reads the key from the openclaw gateway env (already populated by env-file-writer post-F5).
- **D-205-19:** Routing surface — new `openclawos.gateway.*` namespace MUST be added to `httpOnlyPaths` in `livos/packages/livinityd/source/modules/server/trpc/common.ts` (memory pitfall: tRPC mutations hang silently on half-broken WS).

### Sacred SHA + invariants

- **D-205-20:** Every Phase 205 commit MUST pass the pre-commit `[sacred-sha] PASS: 20 files verified` check. INV-203-01 + INV-204-01 carry forward as INV-205-01.
- **D-205-21:** No protected blob is touched in this phase. `openui-apps-repository.ts`, `sdk-agent-runner.ts`, and the other 18 sacred files are not in the modification graph.

### Plan slicing strategy

- **D-205-22:** Recommended plan split (researcher/planner free to refine): **205-01** Settings entry-point swap + tab strip skeleton (claw-client only, no backend). **205-02** MCP Servers tab + live propagation (claw-client + livinityd McpBridge live reload + Redis pub). **205-03** Gateway tab + tRPC namespace + self-lock guard (claw-client + livinityd tRPC + JSON writer). Sequential or parallel waves — researcher's call based on file-touch graph.

### Claude's Discretion

- Tab order is set above (D-205-02) but the planner/researcher may swap order if UX research surfaces a stronger pattern in upstream openclaw-os.
- Toast / error-display component choice: defer to whatever the existing claw-client uses (researcher to confirm during plan-phase).
- Card styling for GatewayTab sections (collapsible vs always-open): defer to UX pass in plan-phase.
- Whether `auth.setMode` triggers a soft-restart of the gateway (`master` ↔ `token` transition may invalidate existing sessions): defer to plan-phase decision based on openclaw source.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SPEC + prior phase artifacts
- `.planning/phases/205-liv-ai-ui-carryovers/205-SPEC.md` — Locked requirements (6) — MUST read before planning
- `.planning/phases/204-provider-key-management/204-CONTEXT.md` — Phase 204 D-204-01..12 locked decisions (ProvidersTab pattern, env-file-writer, sudoers, redact-on-read INV-204-04). MCP servers tab borrows the redacted display pattern.
- `.planning/phases/203-liv-ai-openclaw-os/203-CONTEXT.md` — openclaw + claw-client + claw-plugin architecture; auth handshake + device-token lifecycle (foundation for self-lock guard).

### Hot-fix F5 — the auth path this phase depends on
- `livos/packages/livinityd/source/modules/server/trpc/is-authenticated.ts` lines 19-58 — `X-Api-Key` service-token shortcut introduced in commit `088947bb` (Hot-fix F5). All new claw-client → livinityd calls use this.
- `livos/packages/livinityd/source/modules/provider/env-file-writer.ts` lines 218-235 — `LIV_API_KEY` injection into the gateway env file (Hot-fix F5.2). Operator does not need to set this manually.

### Existing surfaces being touched
- `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/SettingsDialog.tsx` — Mount point for the new tabs.
- `livos/packages/liv-claw-os/packages/claw-client/src/components/settings/ConnectionStatus.tsx` — Source of the bottom-tile content that gets moved into a Connection tab.
- `livos/packages/liv-ai-app/components/settings/McpTab.tsx` — Source for the MCP Servers tab port; copy the field schema, NOT the broken tRPC batch envelope.
- `livos/packages/liv-ai-app/components/settings/ProvidersTab.tsx` — Source for the working `callMutation` helper + redacted-display pattern.
- `livos/packages/livinityd/source/modules/server/trpc/mcp-config-router.ts` — Existing tRPC contracts the new tab consumes (NO contract changes — INV-203-09).
- `livos/packages/livinityd/source/modules/server/trpc/openclawos-router.ts` — Sibling for the new `openclawos-gateway-router.ts`; follow the same factory-DI pattern.
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` — Add new namespace paths to `httpOnlyPaths`.
- `livos/packages/livinityd/source/modules/openclawos/device-auto-approver.ts` (12827 bytes, F3/F4 markers) — Existing pairing logic the revoke path inverts.

### Existing patterns to reuse
- `livos/packages/livinityd/source/modules/apps/native-app-config.ts` lines 17-19, 127, 144-145 — Redis pub/sub via `liv:config:updated` channel. Template for the new `liv:mcp:updated` channel.
- `livos/packages/livinityd/source/modules/agent-runtime/mcp-bridge.ts` — MCP bridge to extend with a live-reload subscribe loop.
- `livos/packages/livinityd/source/modules/provider/env-file-writer.ts` — Atomic tmp+rename writer pattern reused for `openclaw.json` writes.
- `livos/packages/livinityd/source/modules/openclawos/handshake-route.ts` — Existing JWT verify + device-token mint surface (template for self-lock guard JWT decode).

### Memory-locked guidance
- `feedback_v36_no_bold_redesigns` — Phase 205 stays additive: no SettingsDialog shell rewrite, no PreferencesPanel removal, no bottom-tile-replacement that loses connection signal (it moves into a tab).
- `feedback_livos_window_logic_no_url_routing` — Settings is a dialog inside the claw-client window, NOT a route at `/settings`.
- `project_v40_session_handoff` — Carry-over source for this phase; current operator state on Mini PC.
- `feedback_full_autonomous_no_questions` — Active in this run; planner may auto-resolve gray areas in their own phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`SettingsDialog.tsx`** (claw-client): existing shell with header bar, body slot, footer; adding tab strip is non-destructive.
- **`PreferencesPanel.tsx`** (claw-client): pattern for a tab body — form fields, save buttons, status banners.
- **`mcp.config.{list,set,delete}` tRPC** (livinityd): full CRUD contract already exists from Phase 202-07; consumer code is what this phase adds.
- **`ProvidersTab.tsx` `callMutation` helper** (liv-ai-app): the working tRPC POST envelope. Copy this, NOT McpTab's broken batch shape.
- **`EnvFileWriter.defaultFs.writeAtomic`** (livinityd): atomic tmp+rename pattern; reuse for `openclaw.json` writes.
- **`X-Api-Key` service-token path** (Hot-fix F5, commit 088947bb): livinityd `isAuthenticated` accepts `X-Api-Key` matching `process.env.LIV_API_KEY` and maps to admin user via `getAdminUser()`.
- **`liv:config:updated` Redis pub/sub** (`native-app-config.ts`): template for the new `liv:mcp:updated` channel.
- **device-token Redis poisoning** (existing F3 path): mechanism to invalidate a paired device on revoke without inventing new auth surface.

### Established Patterns
- **tRPC factory-DI** (`provider-config-router.ts`, `openclawos-router.ts`): create router takes deps object (keyStore, envFileWriter, restartHook, logger). New `openclawos-gateway-router.ts` follows the same shape.
- **Zod-validated input** (T-204-04 pattern): every mutation input schema is a `z.object({...})` with strict bounds. `KEY_SHAPE_REGEX`-style defense-in-depth.
- **httpOnlyPaths registration** (`common.ts`): all new namespaces with mutations get added to `httpOnlyPaths` so they cannot land on WebSocket.
- **Per-commit sacred-sha hook**: `[sacred-sha] PASS: 20 files verified` on every commit. Phase 205 touches zero of the 20 protected blobs.
- **No `systemctl restart` for plain config changes**: SPEC R3 explicitly disallows the easy path; live reload via Redis pub is the locked approach.
- **Redact-on-read for secrets**: `redactKey(provider, key)` in `key-store.ts` is the template — MCP env-var secrets in the new tab MUST be displayed redacted in the list view.

### Integration Points
- **claw-client sidebar bottom slot** — currently `ConnectionStatus.tsx`. Becomes the Settings button.
- **claw-client `SettingsDialog` body** — gets a tab strip wrapping existing Connection + Preferences plus the two new tabs.
- **livinityd tRPC app router** (`appRouter` in `index.ts`) — register the new `openclawos.gateway.*` namespace.
- **livinityd boot** (`index.ts`) — wire McpBridge's new subscribe loop at the same place McpBridge is constructed today (no new top-level service).
- **Caddy reverse proxy** — already routes `/trpc/*` → livinityd:8080; no Caddyfile changes required.

</code_context>

<specifics>
## Specific Ideas

- **"Bottom Connected tile feels dead"** — operator's exact complaint that triggered the entry-point swap. The Settings button must visually feel like progress: clear gear icon, hover affordance, opens dialog with a slight scale-in motion if framer-motion is available (deferred to UI pass).
- **MCP propagation must be invisible to the operator** — operator clicks Save → row appears → 5-10s later they ask the agent to run a tool from that MCP server and it works. No banner, no spinner, no "MCP servers updated" toast. Live reload is a non-event in the UI.
- **Self-lock guard error must be friendly** — toast copy: "Cannot revoke the device you are currently signed in with." Not technical (`CANNOT_REVOKE_SELF` is the wire-level error code; the user-visible string is plain English).
- **Token rotation is operator-only** — the new token is shown once after rotation in a banner with a "Copy" button. No second display, no "view current token" affordance. If they lose the token, rotate again.

</specifics>

<deferred>
## Deferred Ideas

- Per-chat MCP allow/deny lists (was discussed as scope creep; belongs in a "per-chat tool gating" phase)
- Plugin enable/disable UI inside Gateway tab (toggling a plugin off can break the chat surface itself; a separate phase with a guard is required)
- Mobile responsive pass for the new tabs (claw-client desktop is the target for Phase 205)
- "Type DELETE" GitHub-style confirmation for destructive ops (replaced by the lighter self-lock guard)
- Audit log of who-revoked-which-device (gateway journal already captures this at INFO level)
- Auto-push the rotated token to paired devices (requires per-device push channel; out of scope)
- Backward-compat shim for `liv-ai-app /settings → MCP` tab migration (the tab keeps working; we add a second surface)
- Per-chat provider picker (205-01, dropped during SPEC interview — existing `SessionComposer` qualified `provider/model` dropdown is sufficient)

</deferred>

---

*Phase: 205-liv-ai-ui-carryovers*
*Context gathered: 2026-05-24*
*Next step: `/gsd-plan-phase 205 --auto` — researcher + planner kick off automatically*
