---
gsd_state_version: 1.0
milestone: v26.0
milestone_name: Device Security & User Isolation
status: completed
stopped_at: Completed 16-02-PLAN.md
last_updated: "2026-04-24T18:40:54Z"
last_activity: 2026-04-24 — 16-02-PLAN.md executed (2/2 tasks, 2 files, 660s duration) — Phase 16 and v26.0 complete
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 11
  completed_plans: 11
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-24)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v26.0 -- Device Security & User Isolation
**Current focus:** Phase 16 -- Admin Override & Emergency Disconnect

## Current Position

Phase: 16 -- Admin Override & Emergency Disconnect (Plan 01 + Plan 02 complete — PHASE COMPLETE)
Plan: 16-02 complete — admin UI delivered; ADMIN-01 + ADMIN-02 now satisfied end-to-end with UI evidence. v26.0 milestone complete.
Status: 16-02 complete — (1) Task 1: new AdminDevicesSection (253 lines) at livos/packages/ui/src/routes/settings/_components/admin-devices-section.tsx. Consumes trpcReact.devicesAdmin.adminListAll.useQuery with refetchInterval: 10_000 (auto-refresh satisfies ≤10s offline-reflection must_have). Mutation trpcReact.devicesAdmin.adminForceDisconnect with onSuccess→toast+utils.invalidate, onError→toast(err.message) (surfaces FORBIDDEN for non-admin callers). Table columns: User/Device/Platform/Status/Last Seen/Action. Online rows: red variant='destructive' Force Disconnect button with TbX; offline rows: em-dash. Destructive action gated by confirmation Dialog. Loading/Error/Empty states handled. Inline formatRelativeTime + PLATFORM_LABEL helpers. (2) Task 2: registered admin-devices entry in settings-content.tsx (+8 lines): TbServer2 added to react-icons/tb imports; 'admin-devices' added to SettingsSection union; MENU_ITEMS entry {id:'admin-devices', icon:TbServer2, label:'Devices', description:'All devices across all users', adminOnly:true}; AdminDevicesSectionLazy named-export lazy import matching UsersSectionLazy pattern; case 'admin-devices' in SectionContent switch with Suspense+Loader2 fallback. useVisibleMenuItems filter unchanged (already handles adminOnly via role). Zero new TS errors in modified files (one pre-existing error at L181 verified via git show HEAD~1 — out of scope). All verification grep invariants pass. v26.0 DONE: 15/15 requirements satisfied across Phases 11–16.
Last activity: 2026-04-24 — 16-02-PLAN.md executed (2/2 tasks, 2 files, 660s duration) — Phase 16 and v26.0 complete

**Progress:** [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v26.0)
- Average duration: --
- Total execution time: 0 hours

**Prior milestone (v25.0 — Memory & WhatsApp Integration):**
| Phase 06-10 | 5 phases | 10 plans | 14/14 requirements satisfied |
| Audit status: tech_debt (14/14 req met, wa_outbox dead code, UI menu label) |

## v26.0 Phase Structure

| Phase | Name | Requirements | Depends On |
|-------|------|--------------|------------|
| 11 | Device Ownership Foundation | OWN-01, OWN-02, OWN-03 | — (foundation) |
| 12 | Device Access Authorization | AUTHZ-01, AUTHZ-02, AUTHZ-03 | Phase 11 |
| 13 | Shell Tool Isolation | SHELL-01, SHELL-02 | Phase 12 |
| 14 | Device Session Binding | SESS-01, SESS-02, SESS-03 | Phase 11 |
| 15 | Device Audit Log | AUDIT-01, AUDIT-02 | Phase 12 |
| 16 | Admin Override & Emergency Disconnect | ADMIN-01, ADMIN-02 | Phases 11, 12, 15 |

Coverage: 15/15 v26.0 requirements mapped ✓
| Phase 14-device-session-binding P01 | 237 | 3 tasks | 9 files |
| Phase 14 P02 | 149 | 3 tasks | 7 files |
| Phase 15 P01 | 108 | 3 tasks | 3 files |
| Phase 15 P02 | 153 | 3 tasks | 5 files |
| Phase 16 P01 | 237 | 3 tasks | 7 files |
| Phase 16 P02 | 660 | 2 tasks | 2 files |

### v26.0 Execution Metrics

| Phase / Plan | Duration | Tasks | Files |
|--------------|----------|-------|-------|
| 11-device-ownership-foundation P01 | 2min | 3 | 4 |
| 11-device-ownership-foundation P02 | 3min | 4 | 6 |
| 12-device-access-authorization P01 | 2min | 3 | 3 |
| 12-device-access-authorization P02 | 3min | 4 | 3 |
| 13-shell-tool-isolation P01 | 3min | 4 | 3 |
| 16-admin-override P01 | 4min | 3 | 7 |
| 16-admin-override P02 | 11min | 2 | 2 |

## Accumulated Context

### Decisions (carried from v25.0)

- SdkAgentRunner is default for all channels (no API key needed, uses Claude CLI OAuth)
- Router skips AI classify for channel sources (whatsapp, telegram, etc) — direct to ask/agent
- Tunnel client uses WS-level pong for liveness detection (90s ping timeout watchdog)
- channel_send tool supports whatsapp (added to validChannels)
- WhatsApp via whatsapp-web.js on mini PC (Baileys code exists but not wired in actual deployment)

### v26.0 Roadmap Decisions

- Phase numbering continues from v25.0: v26.0 starts at Phase 11 (last v25.0 phase was Phase 10)
- Phase 11 is foundation (schema + ownership + filtering) because every downstream phase reads user_id from devices
- Phase 12 (authorization middleware) is consumed by Phases 13, 15, 16 — written as a single reusable helper
- Phase 14 (session binding) is modeled as only dependent on Phase 11 so it can execute in parallel with 12/13/15 if desired
- Admin override (Phase 16) deliberately does NOT bypass per-tool authorization (Phase 12); admin bypass exists only via explicit admin endpoints
- Audit log (Phase 15) uses PostgreSQL role-based grants (INSERT/SELECT only) to enforce append-only at DB level, not just app layer

### Phase 11-01 Execution Decisions

- **ON DELETE RESTRICT (not CASCADE)** on `devices.user_id` FK: preserves audit history; deleting a user with active devices fails loudly, forcing explicit revoke-first workflow
- **Drizzle schema.ts documents FK via JSDoc comment, not `.references()`**: the `users` table is managed by `platform/relay/src/schema.sql`, not Drizzle; adding a Drizzle users entity would fragment the users schema
- **Backfill targets oldest user by `created_at`**: relay's users table has no `role` column, so no literal admin query is possible; oldest user is the deployment's de facto owner
- **Application-layer guard in `createDeviceRecord`** duplicates the DB FK intentionally: clearer error message (cites OWN-02 for traceability) and earlier rejection at the JS boundary

### Phase 11-02 Execution Decisions

- **Hard-reject missing userId in onDeviceConnected**: drops the event with an error log rather than soft-fallback. Prevents cross-user leakage if a stale relay forwards legacy messages
- **tRPC devices.list uses privateProcedure + legacy fallback**: ctx.currentUser undefined -> return all devices (matches requireRole's same fallback for single-user deployments that haven't migrated to v7.0 multi-user)
- **remove enforces both confirmName AND ownership**: safety UX is orthogonal to authorization — admin removing their OWN device must still confirm the name to avoid fat-fingered deletes
- **Response wrapper `{devices: [...]}`, not bare array**: backwards-compatible with future pagination/metadata fields (nextCursor, total)
- **FORBIDDEN code `device_not_owned` standardized**: Phase 12's authorizeDeviceAccess helper will consume the same code string for consistency
- **devices.list downgraded from adminProcedure to privateProcedure**: Phase 16 will add a separate admin endpoint for cross-user listing — today's list should work for every authenticated user seeing their own devices

### Phase 12-01 Execution Decisions

- **authorize.ts is a leaf node in the import graph**: duplicates `DEVICE_REDIS_PREFIX='livos:devices:'` rather than importing from device-bridge.ts so Plan 12-02 can safely make device-bridge import authorize without a cycle
- **missing_user reason returns BEFORE Redis GET**: guards against v7.0 sessions where ctx.currentUser arrives empty — the Phase 11 legacy "return all" fallback must not leak into authorization checks
- **Malformed JSON -> device_not_found (not a throw)**: mirrors device-bridge.ts:440-442 pattern; authorize helper is non-throwing by contract
- **audit-stub.ts uses LPUSH + LTRIM(0, 999) newest-at-HEAD**: distinct from device-bridge.ts onAuditEvent (RPUSH + LTRIM(-1000, -1) newest-at-tail); chosen so Phase 15's admin-UI reads failures newest-first via plain LRANGE without .reverse()
- **Barrel export at devices/index.ts is the Phase 15 swap point**: Plan 12-02 callsites will import from '../devices' (barrel), letting Phase 15 replace audit-stub.ts with PostgreSQL device_audit_log without touching any callsite
- **Barrel does NOT re-export router from routes.ts**: server/trpc/index.ts:22 imports it by deep path; rewiring tRPC assembly is out of scope for this plan. source/index.ts:22 deep import of DeviceBridge also preserved — no churn to main entry point

### Phase 12-02 Execution Decisions

- **userId-in-callbackUrl (query string, not POST body)**: Nexus's registered Tool.execute hardcodes the POST body as `{tool, params}` and cannot be extended without modifying Nexus. The callbackUrl is set per-tool-registration by livinityd and fully under our control — appending `?expectedUserId=<userId>` achieves end-to-end userId propagation with zero Nexus changes
- **DeviceBridge.redis visibility: private -> public readonly**: routes.ts ensureOwnership needs direct access for `authorizeDeviceAccess(bridge.redis, ...)`. `readonly` preserves write encapsulation while exposing the instance pointer for shared cache reads
- **Gate at executeOnDevice, not at HTTP handler**: single authorization checkpoint inside the bridge means every caller (HTTP /internal endpoint + any future internal invoker) is automatically gated. HTTP handler only maps AuthResult reasons to status codes (403 / 404 / 200)
- **/internal handler does NOT call recordAuthFailure**: executeOnDevice already audits. Keeping audit-on-gate (not audit-on-HTTP) avoids duplicate rows per rejection
- **/internal expectedUserId missing = 403 missing_user**: closed-by-default at HTTP boundary; the legacy tRPC fallback for ctx.currentUser=undefined does NOT exist at the REST layer
- **Ownership runs BEFORE confirmName on devices.remove**: an unauthorized caller never learns the actual device name via error responses (confirmName is a safety-UX gate for the rightful owner)
- **AUTHZ-03 reconciliation**: requirement literal says "Nexus REST /api/devices/*" but no such endpoints exist in nexus/api.ts. Actual defense-in-depth target is livinityd's /internal/device-tool-execute (the only HTTP endpoint Nexus calls into for device tool execution). AUTHZ-03 enforced there.

### Phase 13-01 Execution Decisions

- **Hardcoded RESERVED_TOOL_NAMES set in api.ts (not imported from tool-registry.ts TOOL_PROFILES)**: cleaner blast radius and a more explicit security contract. tool-registry's TOOL_PROFILES is a policy mechanism (profile-based filtering); RESERVED_TOOL_NAMES is a registration-time security invariant. Keeping them separate prevents accidental coupling.
- **Schema layer hardens descriptions; Phase 12 remains the runtime enforcer**: Phase 13 does NOT duplicate authorizeDeviceAccess anywhere. The AI-readable description strings in daemon.ts (local shell) and device-bridge.ts (DEVICE_TOOL_SCHEMAS.shell) exist to prevent hallucinated cross-user calls at the agent-reasoning layer; actual authorization continues to run in DeviceBridge.executeOnDevice as established in Phase 12.
- **HTTP 409 (Conflict) chosen for tool_name_reserved**: the name is reserved at the namespace level, not missing (400) or unauthorized (401/403). 409 accurately communicates "the request conflicts with the current state of the target resource."
- **Parameter list on local shell frozen to `{cmd, timeout}`; inline `Phase 13 SHELL-02` comment enforces it**: the literal word `device_id` appears in descriptive strings (telling the AI what NOT to do), but zero parameter entries named `device_id` or `deviceId` exist. Future editors adding a device routing parameter would have to bypass the comment intentionally.
- **Device shell description is load-bearing for AI reasoning**: the device-bridge description string flows through to Nexus's ToolRegistry at device-bridge.ts:225 where platform label is concatenated. Adding "Do not pass a device_id parameter" instructs the agent at registration time, not enforcement time — complements Phase 12's runtime gate.

### Phase 14-01 Execution Decisions

- **JWT sessionId claim carries sessions.id UUID, not sessions.token (opaque cookie value)**: JWT payload is base64-decodable by anyone holding the token; embedding the cookie's session secret would leak it into device logs and memory. Relay looks up by indexed PK (sessions.id) anyway.
- **device_grants.session_id is nullable with no FK to sessions(id)**: grant lifecycle INSERT happens before user auth (session unknown); adding ON DELETE CASCADE would couple logout with grant cleanup for no extra benefit over the 15-min grant expiry mechanism.
- **60s setInterval watchdog iterates allConnections() (not per-connection setTimeout)**: 24h token lifetime means 60s slack = 0.07% acceptable. Per-connection timers would leak if a cleanup path is missed. O(n) scan negligible at <10^4 devices/relay.
- **Five distinct 1008 close reasons (session_invalid/expired/user_mismatch, device_not_found/ownership_mismatch)**: indistinguishable reasons would force log-grep on the relay's pre-close message. Per-reason strings make forensics O(1).
- **Close code 4401 for token_expired (not 4403)**: semantic distinction from Plan 14-02's session_revoked. 4401 = "refresh and reconnect" (401-like); 4403 reserved = "stop reconnecting without re-auth" (403-like). Client agent distinguishes at the close event.
- **onDeviceConnect nanoid removed; onTunnelConnect nanoid preserved**: tunnel session IDs stay relay-generated (Phase 10 contract); only device bridge sessionId semantics changed to be JWT-sourced for revocation matching in Plan 14-02.
- **ws.on('message') handler converted from sync to async**: two `await pool.query(...)` inserts for session/devices validation require async context. All paths still `return` after ws.close() so no dangling promises.
- **Post-approve session-id lookup does a second query rather than modifying getSession**: getSession is widely used; adding sessions.id to its return would ripple into every callsite. Localized query in the approve route keeps the change surface minimal.

### Phase 14-02 Execution Decisions

- **Lazy-singleton ioredis publisher on platform/web**: non-logout request paths never pay the Redis connection cost; the publisher is instantiated on first use and kept warm by ioredis. First Redis dependency on the web side (relay already used ioredis).
- **Dedicated ioredis subscriber client on the relay (second `new Redis(config.REDIS_URL)`)**: ioredis subscribe mode is connection-exclusive — the existing `redis` command client is used by request-proxy bandwidth counters and custom-domain cache warming and CANNOT be reused for subscribe without breaking those paths.
- **Soft-fail publish (maxRetriesPerRequest:1 + enableOfflineQueue:false + try/catch around publish)**: logout's primary contract is cookie invalidation + sessions row delete. A dead Redis must not stall the logout HTTP response; bridges fall back to Plan 14-01's 60s token-expiry watchdog (max stall = 60s, not indefinite).
- **Plain-string message payload (sessionId UUID as-is, not JSON.stringify)**: single-field message, minimal parsing cost. Phase 16 admin-disconnect may upgrade to JSON when a cause-code field is needed, but SESS-03 does not.
- **SELECT id BEFORE DELETE in the logout route**: DeviceConnection.sessionId at the relay holds sessions.id (Plan 14-01 binding), not the token. The UUID must be captured before the row is gone; the race of two concurrent logout requests is handled idempotently (subscriber closes the same bridge twice harmlessly).
- **Close code 4403 'session_revoked' (not 4401)**: 4401 = "refresh the token and reconnect" (14-01 expiry); 4403 = "stop reconnecting, the session is gone". Client device agents distinguish at the close event and choose the right recovery strategy (refresh token vs abandon-and-re-pair).
- **Subscriber startup BEFORE server.listen**: revocations arriving before the HTTP server is accepting connections are harmless — no bridges exist yet to close. Subscriber shutdown happens INSIDE shutdown() after the watchdog clearInterval, BEFORE stopBandwidthFlush, so no new revocation messages are processed during the relay's final broadcast loop.

### Phase 15-02 Execution Decisions

- **Single audit sink — executeOnDevice is sole source of truth for Nexus-driven tool calls**: /internal/device-tool-execute deliberately untouched; it delegates to executeOnDevice which now audits via recordDeviceEvent. Auditing in the HTTP handler would produce duplicate rows per invocation. Phase 12 made the same choice for recordAuthFailure; Phase 15 preserves it.
- **auditedResolve closure pattern**: captures deviceId/toolName/params/deviceAuditedUserId at promise creation. Storing auditedResolve in pendingRequests.set(requestId, {resolve: auditedResolve, ...}) means onToolResult's `pending.resolve(event.result)` also goes through the wrapper → both timeout path AND tunnel-result path emit exactly one recordDeviceEvent row per invocation. result.success === true distinguishes success from tunnel-reported failure.
- **audit-routes.ts as sibling of routes.ts (not merged)**: keeps the audit domain cleanly isolated. Phase 16 (admin.listAllDevices, admin.forceDisconnect) will grow the audit router naturally without bloating device CRUD routes. Separate file also means audit-only imports (getPool directly) don't pull in DeviceBridge.
- **Parameterized SQL ($N placeholders from values.length)**: builds WHERE user_id = $1 AND device_id = $2 from values[] + conditions[] arrays — zero user-input interpolation. Zod validates userId as UUID and deviceId as min(1) at the input boundary; parameterization is defense-in-depth.
- **Explicit Promise<ToolResult> generic in executeOnDevice**: default resolve type is (value: T | PromiseLike<T>) => void, which caused TS2339 when reading result.success/.error in auditedResolve. Narrowing to Promise<ToolResult> eliminates PromiseLike widening without branch-checking shape at runtime.
- **httpOnlyPaths entry for audit.listDeviceEvents**: matches Phase 12 devices.rename/remove pattern — admin audit queries surface "livinityd unavailable" as HTTP errors rather than hanging on disconnected WS. The entry string must match the router path exactly (audit submodule + listDeviceEvents query name).
- **adminProcedure, not privateProcedure**: enforces requireRole('admin') gate before the query handler runs. Member-role users receive FORBIDDEN at the procedure middleware, not from an in-handler role check — less code, less chance of a bypass via early-return bugs.

### Phase 16-01 Execution Decisions

- **Separate tunnel verb from device_disconnect**: admin_force_disconnect is a NEW message type rather than reusing device_disconnect, so relay-side auditing + permission distinction stays clean. device_disconnect remains the owner-initiated removeDevice pathway; admin_force_disconnect is the cross-user override.
- **Cross-user scope on the relay side**: the admin_force_disconnect handler looks up DeviceRegistry.getDevice(targetUserId, deviceId), NOT (tunnel.userId, deviceId). The adminProcedure gate on livinityd is the authoritative permission check; once the signed tunnel delivers the message, relay trusts it. This is the entire point of the verb.
- **forceDisconnect does NOT mutate local state**: distinct from removeDevice which deletes Redis + local cache. Admin force-disconnect only tears down the live WS; the device JWT + DB row remain intact so the device can legitimately re-pair. Cleanup follows the normal onDeviceDisconnected echo pathway (relay's ws.close → device_disconnected tunnel event → bridge's onDeviceDisconnected).
- **Router name `devicesAdmin` (not `admin`)**: avoids colliding with any future generic admin router and keeps domain visibility. Callers use trpc.devicesAdmin.adminListAll / trpc.devicesAdmin.adminForceDisconnect.
- **Audit miss path writes tool_name='admin.force_disconnect' with success=false error='device_not_connected'**: gives the admin proof-of-attempt in device_audit_log even when the target is already offline. Follows Phase 15's two-path audit pattern (success + failure both emit exactly one row).
- **Platform-admin detection = oldest-user-by-created_at**: platform/web has no role column, so migration 0007's fallback convention is adopted at the REST layer for defense-in-depth. Primary enforcement of ADMIN-01 still lives on the livinityd side via adminProcedure. SELECT id FROM users ORDER BY created_at ASC LIMIT 1 is a 3-line check with zero false positives given deliberate-first-admin bootstrap.
- **Empty-set shortcut on username batch query**: if getAllDevicesFromRedis returns zero devices, skip the WHERE id = ANY($1::uuid[]) query entirely (PG rejects WHERE id IN () syntax; ANY($1::uuid[]) with empty array works but the shortcut saves the round-trip).
- **Both admin endpoints in httpOnlyPaths**: matches Phase 15 audit.listDeviceEvents pattern — admin queries/mutations route via HTTP so failures surface immediately rather than hanging on a dropped WS.

### Phase 15-01 Execution Decisions

- **Nil-UUID sentinel (`00000000-0000-0000-0000-000000000000`) for missing_user rows**: `user_id UUID NOT NULL` cannot accept `''`; pre-auth failures (where no JWT was resolved) use the all-zero UUID. No FK to users(id), so this synthetic value doesn't need to match any row. Admin queries can filter missing-user entries via `WHERE user_id = '00000000-...'::uuid`.
- **NO FK from device_audit_log.user_id to users(id)**: CONTEXT.md explicitly requires historical audit rows to survive user deletion for incident review. `REFERENCES users(id) ON DELETE CASCADE` would erase forensic history on user removal — violates AUDIT-01's "every invocation recorded" promise.
- **Redis-stub fallback on PG failure**: `recordDeviceEvent` catches all INSERT errors and delegates to the Phase 12 `recordAuthFailure` (capped Redis list). PG restart / connection blip must not cause audit data loss.
- **Trigger-based append-only (CONTEXT.md decision)**: `audit_log_immutable()` raising on BEFORE UPDATE OR DELETE chosen over separate PG role grants. Simpler to ship for single-DB LivOS deployment; same security effect (even `psql` as `livos` superuser gets blocked by the trigger).
- **params_digest stored as TEXT (hex) not BYTEA**: 64-char hex strings render directly in admin UIs without encoding conversion; storage cost negligible at audit-log scale.
- **Barrel retains recordAuthFailure export**: audit-pg.ts imports it directly from `./audit-stub.js` (not via barrel — avoids circular deps), but Plan 15-02 callsites may temporarily route through the barrel during migration. Keeping the export avoids flag-day swap.
- **DO-block trigger guard (not CREATE TRIGGER IF NOT EXISTS)**: older PG versions lack `IF NOT EXISTS` for triggers; the `DO` block checks `pg_trigger` before creating. Keeps `schema.sql` idempotent across startups without raising PG version floor.
- **computeParamsDigest is exported (not just internal)**: tests and Plan 15-02's admin query can assert digest shape without re-implementing SHA-256 logic.

### v25.0 Tech Debt Carried Forward

- Phase 8: wa_outbox lpush dead code in index.ts HeartbeatRunner + skill-loader.ts sendProgress
- Phase 8: chunkForWhatsApp unused exports in lib.ts / utils.ts
- Phase 7: Integrations menu description still reads "Telegram & Discord"
- Phase 10 (from integration checker): linkIdentity() defined but never called — cross-channel identity writes canonical user ID only via Redis cache, never syncs to PostgreSQL channel_identity_map
  - Note: explicitly NOT addressed in v26.0 (not in core milestone scope)

### Pending Todos

None

### Blockers/Concerns

- Multi-user on LivOS is validated but device-level isolation has never been security-tested
- Devices feature (v14.0) was built when LivOS was single-user — authorization added post-hoc
- Phase 15 audit log requires a PostgreSQL role migration — need to confirm `livos` DB user grants during Phase 11 schema work

## Session Continuity

Last session: 2026-04-24T18:33:33Z
Stopped at: Completed 16-01-PLAN.md
Resume file: None
