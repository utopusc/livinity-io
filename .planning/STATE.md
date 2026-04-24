---
gsd_state_version: 1.0
milestone: v26.0
milestone_name: Device Security & User Isolation
status: completed
stopped_at: Completed 13-01-PLAN.md (shell tool isolation hardening)
last_updated: "2026-04-24T17:26:19.381Z"
last_activity: 2026-04-24 — 12-02-PLAN.md executed (4/4 tasks, 3 files modified, AUTHZ-01/02/03 complete)
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 5
  completed_plans: 5
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-24)

**Core value:** One-command deployment of a personal AI-powered server, accessible anywhere via livinity.io.
**Current milestone:** v26.0 -- Device Security & User Isolation
**Current focus:** Phase 12 -- Device Access Authorization

## Current Position

Phase: 13 -- Shell Tool Isolation (complete)
Plan: 14-01 (next — Phase 14 Device Session Binding)
Status: 13-01 complete — shell tool isolation hardened across three layers: (1) local shell tool description in daemon.ts directs agents to `device_<deviceId>_shell` proxies for remote execution with frozen `{cmd, timeout}` parameter list, (2) RESERVED_TOOL_NAMES guard on /api/tools/register returns 409 tool_name_reserved on collision with built-ins, (3) device shell proxy schema description forbids `device_id` param and cites server-side ownership enforcement. Phase 12's authorizeDeviceAccess gate remains the actual runtime enforcer — Phase 13 adds schema + registration defenses around it. SHELL-01 + SHELL-02 satisfied. Zero new TS errors.
Last activity: 2026-04-24 — 13-01-PLAN.md executed (4/4 tasks, 3 files modified, SHELL-01/02 complete)

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

### v26.0 Execution Metrics

| Phase / Plan | Duration | Tasks | Files |
|--------------|----------|-------|-------|
| 11-device-ownership-foundation P01 | 2min | 3 | 4 |
| 11-device-ownership-foundation P02 | 3min | 4 | 6 |
| 12-device-access-authorization P01 | 2min | 3 | 3 |
| 12-device-access-authorization P02 | 3min | 4 | 3 |
| 13-shell-tool-isolation P01 | 3min | 4 | 3 |

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

Last session: 2026-04-24T17:26:19.377Z
Stopped at: Completed 13-01-PLAN.md (shell tool isolation hardening)
Resume file: None
