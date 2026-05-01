# Phase 46: Fail2ban Admin Panel — Context

**Gathered:** 2026-05-01
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss=true)

<domain>
## Phase Boundary

Admin can recover from SSH lockout via UI (unban + whitelist) without SSH access, observe banned IPs, manually ban malicious IPs (with self-ban guardrails), and review an immutable audit trail of all ban/unban events.

**Requirements:** FR-F2B-01, FR-F2B-02, FR-F2B-03, FR-F2B-04, FR-F2B-05, FR-F2B-06 (see `.planning/REQUIREMENTS.md`)

**Success Criteria (8):**
1. Admin opens Server Management → Security and sees auto-discovered jail list with poll @ 3-5s.
2. Unban modal with whitelist checkbox + last-attempted-user + IP disappears within next poll.
3. Manual ban-IP with type-`LOCK ME OUT` gate + Zod CIDR /0-/7 reject.
4. `device_audit_log` row written per action (REUSE existing table — `device_id='fail2ban-host'` sentinel).
5. Mobile cellular toggle surfaces both HTTP X-Forwarded-For + active SSH session IPs.
6. Three distinct service-state banners (binary missing / service inactive / no jails configured).
7. `Settings > Show Security panel` toggle defaults ON, persists in `user_preferences`.
8. New tRPC mutations (`fail2ban.unbanIp`, `fail2ban.banIp`) added to `httpOnlyPaths` (continuing Phase 45 FR-CF-03 pattern).

**Depends on:** Phase 45 ✅ (httpOnlyPaths array now in current pattern; new fail2ban.* mutations join it.)

</domain>

<decisions>
## Implementation Decisions

All implementation choices are at Claude's discretion — discuss phase was skipped per `workflow.skip_discuss=true`. Use ROADMAP phase goal, success criteria, REQUIREMENTS.md, and v29.4-* research files (`.planning/research/v29.4-{STACK,FEATURES,ARCHITECTURE,PITFALLS,SUMMARY}.md`).

**Locked decisions inherited from REQUIREMENTS.md:**
- D-NO-NEW-DEPS: 0 new npm/apt deps. fail2ban + cloudflared already on Mini PC via `install.sh:502-540`.
- D-LIVINITYD-IS-ROOT: livinityd runs as root on Mini PC; NO sudoers/polkit/D-Bus brokers (zero gain, net-new attack surface).
- D-FAIL2BAN-CLIENT-ONLY: text-parse `fail2ban-client status` output; no JSON wrappers, no Python `dbus` bindings.
- D-NO-SERVER4: Mini PC only.
- Sacred file `nexus/packages/core/src/sdk-agent-runner.ts` MUST NOT be touched.

**Module structure (from `.planning/research/v29.4-ARCHITECTURE.md`):**
- New backend module: `livos/packages/livinityd/source/modules/fail2ban-admin/` — mirrors v29.3 `livinity-broker/` shape (5 files: index.ts public API, client.ts execFile wrapper, parser.ts text parser, events.ts JSON event row writer, routes.ts tRPC procedures).
- tRPC routes: `fail2ban.listJails` (admin query), `fail2ban.getJailStatus` (admin query), `fail2ban.unbanIp` (admin mutation, httpOnlyPaths), `fail2ban.banIp` (admin mutation, httpOnlyPaths), `fail2ban.listEvents` (admin query reading from `device_audit_log` filtered by `device_id='fail2ban-host'`).
- UI: new "Security" sidebar entry (13th) inside `LIVINITY_docker` (path: `livos/packages/ui/src/routes/docker/store.ts:40-53` SECTION_IDS array per architecture research).
- Audit log: REUSE `device_audit_log` table at `livos/packages/livinityd/source/modules/database/schema.sql:109-118` with `device_id='fail2ban-host'` sentinel + `tool_name IN ('unban_ip','ban_ip','whitelist_ip')` + `params_digest=sha256(JSON.stringify({jail,ip}))` + `user_id=ctx.currentUser.id`. NO new table migration. Append-only trigger from v22.0 enforces immutability.

**Phase 45 dependency:**
- `httpOnlyPaths` array at `livos/packages/livinityd/source/modules/server/trpc/common.ts:174-182` is now correct namespacing convention. Phase 46 adds `'fail2ban.unbanIp'` + `'fail2ban.banIp'` (the two mutations) to the same cluster. Queries `listJails` / `getJailStatus` / `listEvents` stay on WS (cheap, idempotent, retry-safe).

**Pitfall mitigations from `.planning/research/v29.4-PITFALLS.md`:**
- B-01 (self-ban — admin runs unban → fail2ban detects new HTTP connection → re-bans): action-targeted unban command (`set <jail> unbanip <ip>` is precise, doesn't trigger jail re-evaluation); whitelist checkbox extends with `addignoreip` for true permanence.
- B-02 (admin-ban-own-IP): type-`LOCK ME OUT` exact-string gate; Zod validation rejects CIDR /0-/7 BEFORE the call reaches fail2ban-client.
- B-03 (unban-by-CIDR): Zod schema rejects /0-/7 (anti-self-DOS).
- B-19 (cellular CGNAT mismatch): mobile toggle disables self-ban check; surface BOTH HTTP X-Forwarded-For IP AND active SSH session IPs (parsed via `who -u`-equivalent abstraction).
- B-04 (caddy IP forwarding): "your current IP" check uses BOTH sources (HTTP via `X-Forwarded-For` AND SSH source via active session lookup) to match correctly.
- B-05 (fail2ban restart while UI is open): retry-with-backoff on transient "no jails" responses, not crash.
- W-20 (no mocking external binaries in unit tests): full restart-livinityd-mid-session test deferred to Mini PC UAT; cheap unit tests cover wrapper + parser behavior.

</decisions>

<code_context>
## Existing Code Insights

Pre-existing patterns Phase 46 must mirror:
- v29.3 `livinity-broker/` module shape (5-file pattern + atomic-commit-per-plan).
- v22.0 `device_audit_log` table (immutability trigger + SHA-256 params digest).
- v28.0 `LIVINITY_docker` SECTION_IDS sidebar pattern.
- Phase 45 `httpOnlyPaths` namespacing convention (`<router>.<route>` form).
- v29.2 `systemd-run --scope` cgroup-escape pattern (for one-click apt-install of fail2ban if missing).

Codebase context will be deepened during plan-phase research via gsd-pattern-mapper.

</code_context>

<specifics>
## Specific Ideas

- **Polling cadence:** 3-5s sweet spot (B-06 — too aggressive → fail2ban-client subprocess overhead; too slow → user thinks unban didn't work). Manual Refresh button as failsafe.
- **Multi-jail UX:** auto-discover via `fail2ban-client status` → parse comma-delimited Jail list. Don't hardcode "sshd". Mini PC may have nginx-http-auth, recidive, etc.
- **Test infrastructure:** mirror v29.3 broker test harness (bare `tsx` + `node:assert/strict`). Unit tests for wrapper + parser, integration test for tRPC route shape.
- **`test:phase46` npm script:** chains `test:phase45` + new fail2ban-admin module tests (parser.test.ts, client.test.ts, integration.test.ts).

</specifics>

<deferred>
## Deferred Ideas

- POSIX-enforced cross-user isolation (D-40-05/16 — synthetic dirs preferred for v29.4 too).
- Live restart-livinityd-mid-session test (per W-20, deferred to Mini PC UAT).
- Cellular CGNAT IP source via `who -u` parsing — abstract via livinityd module returning active session source IPs (mock-friendly for unit tests).
- B3b cloudflared SSH gateway — explicitly out of v29.4 scope (REQUIREMENTS.md).

</deferred>
