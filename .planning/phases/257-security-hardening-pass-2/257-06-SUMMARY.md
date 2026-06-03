---
phase: 257-security-hardening-pass-2
plan: 06
subsystem: infra
tags: [security, authz, rbac, caddy, caddyfile-injection, custom-domain, file-permissions, samba, openclawos, vitest]

# Dependency graph
requires:
  - phase: 257-02
    provides: server/index.ts loopback bind (listen()/resolveBindHost) — WS-F edits a DISTINCT region (custom-domain container match) of the same file, in wave 2 to keep one-writer-per-file-per-wave
  - phase: 256-04
    provides: caddy.ts forward_auth JWT gate (LIVOS-008) preserved; memory requireApiKey fail-closed (LIVOS-029/025) verified
provides:
  - "Admin-role gate on the openclawos approvals stream + resolve endpoints (LIVOS-027) — non-admin can no longer observe/resolve agent tool-call approvals; legacy single-user operator preserved"
  - "Charset-validated upstreamBearer before Caddyfile emit (LIVOS-035) — a hostile app token cannot inject Caddy config"
  - "Exact container-name match in the custom-domain gateway (LIVOS-036) — public custom-domain traffic cannot cross-route to a substring-matching container"
  - "share-password secret file written/chmod'd 0600 (LIVOS-039) — matches the 600 secrets policy; existing 0644 file corrected on next access"
  - "LIVOS-029 (memory fail-open) verified CLOSED by 256-04 (verify-and-document, no code)"
affects: [258-security, openclawos-approvals, domain-caddy, custom-domain-gateway, samba-shares]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Admin-equivalence predicate: role==='admin' OR genuine legacy single-user (loggedIn:true, no role, no userId) — mirrors 256-04"
    - "Strict charset (^[A-Za-z0-9._-]+$) gate before interpolating untrusted tokens into generated config; omit-on-mismatch (never break out)"
    - "Exact-name container resolution (no substring fallback) for public-facing routing"

key-files:
  created: []
  modified:
    - livos/packages/livinityd/source/modules/openclawos/approvals-routes.ts
    - livos/packages/livinityd/source/modules/openclawos/approvals-routes.test.ts
    - livos/packages/livinityd/source/modules/domain/caddy.ts
    - livos/packages/livinityd/source/modules/domain/caddy.test.ts
    - livos/packages/livinityd/source/modules/server/index.ts
    - livos/packages/livinityd/source/modules/files/samba.ts

key-decisions:
  - "Admin gate uses an admin-equivalence predicate (admin role OR genuine legacy single-user) so the single-operator Mini PC's own approvals access is not broken"
  - "upstreamBearer: compute a safeBearer and emit the bearer line ONLY on charset match; a malformed token omits the line entirely rather than failing the whole block"
  - "LIVOS-036: removed the .includes() substring fallback at BOTH custom-domain resolution sites; unknown/colliding slug now falls through to the existing 503"
  - "samba: both create-with-{mode:0o600} AND a best-effort chmod 0o600 on every access (corrects the live Mini PC's existing 0644 file)"
  - "LIVOS-029 is a skip-with-evidence (verify only) — 256-04 already made memory requireApiKey fail closed (503 on unset LIV_API_KEY)"

patterns-established:
  - "Pattern 1: untrusted-token-into-generated-config must be charset-validated and omit-on-mismatch"
  - "Pattern 2: public-facing resolution uses exact identity match, never substring"

requirements-completed: [LIVOS-027, LIVOS-035, LIVOS-036, LIVOS-039]

# Metrics
duration: 4min
completed: 2026-06-03
---

# Phase 257 Plan 06: WS-F Low/Info Hygiene Summary

**Admin-role gate on openclawos approvals (LIVOS-027), charset-validated upstreamBearer to block Caddyfile injection (LIVOS-035), exact container-name match in the custom-domain gateway (LIVOS-036), 0600 share-password secret (LIVOS-039), and a verify-and-document close of the already-fixed memory fail-open (LIVOS-029).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-03T21:51:41Z
- **Completed:** 2026-06-03T21:55:07Z
- **Tasks:** 5 (4 code, 1 verify-and-document)
- **Files modified:** 6

## Accomplishments
- Closed LIVOS-027: the openclawos approvals SSE stream + resolve endpoints now require an admin-equivalent caller (admin role OR genuine legacy single-user); a multi-user member/guest token is rejected (401). Both handlers share the gate.
- Closed LIVOS-035: upstreamBearer is charset-validated (`^[A-Za-z0-9._-]+$`) before interpolation; a quote/newline/brace token omits the bearer line entirely, so a hostile app compose can no longer inject Caddy config. 256-04 forward_auth blocks preserved.
- Closed LIVOS-036: both custom-domain container-resolution sites use exact container-name match only (dropped the `.includes(appSlug)` substring fallback); a colliding/unknown slug now hits the existing 503 instead of cross-routing public traffic.
- Closed LIVOS-039: the share-password secret is created `{mode: 0o600}` and chmod'd 0600 on each access (corrects the live Mini PC's existing 0644 file).
- Verified LIVOS-029 is CLOSED by 256-04 — no redundant code.

## Per-Finding Still-Exists Result

| Finding | Plan-time state | Result |
|---------|-----------------|--------|
| LIVOS-027 | OPEN — `authenticate()` did `verifyToken; return true`, no role | Confirmed open → FIXED (admin-equivalence gate) |
| LIVOS-035 | OPEN — `${sub.upstreamBearer}` interpolated unescaped at caddy.ts:596 | Confirmed open → FIXED (charset gate + omit-on-mismatch) |
| LIVOS-036 | PARTIALLY OPEN — exact clause first but `||...includes(appSlug)` substring fallback remained (both sites) | Confirmed open → FIXED (substring fallback removed at both sites) |
| LIVOS-039 | OPEN — `fse.writeFile(sharePasswordFile, sharePassword)` no mode (0644) | Confirmed open → FIXED (0o600 write + chmod) |
| LIVOS-029 | CLOSED by 256-04 — memory `requireApiKey` 503s on unset LIV_API_KEY | Confirmed CLOSED → SKIP-WITH-EVIDENCE, no code |

**LIVOS-029 skip evidence:** `liv/packages/memory/src/auth.ts:23-28` — `requireApiKey` reads `process.env.LIV_API_KEY` at CALL time and, when unset, logs `[Memory] LIV_API_KEY not configured — refusing requests (fail-closed)` and returns `res.status(503).json({error: 'Server auth not configured'})`. Comments are tagged `Phase 256-04 (LIVOS-025): FAIL CLOSED`. `git grep '503' -- liv/packages/memory/src/auth.ts` matches lines 14 and 26. Memory fails CLOSED, not open. No 257 code needed.

## Task Commits

1. **Task 1: admin-role gate on openclawos approvals (LIVOS-027)** — `109e704f` (fix, TDD)
2. **Task 2: charset-validate upstreamBearer before Caddyfile emit (LIVOS-035)** — `ccb34722` (fix, TDD)
3. **Task 3: exact container-name match in custom-domain gateway (LIVOS-036)** — `df27724b` (fix)
4. **Task 4: share-password secret file mode 0600 (LIVOS-039)** — `b0983d02` (fix)
5. **Task 5: verify-and-document LIVOS-029** — no code (documented here)

_Tasks 1 and 2 are TDD; each test+impl shipped in one atomic commit (RED state captured in-flight, GREEN at commit time)._

## Tests

- `approvals-routes.test.ts`: **13 passed** (9 pre-existing, token-bearing cases updated to admin payloads; +4 new: admin allowed, guest rejected (401), member rejected (401), legacy single-user allowed).
- `caddy.test.ts`: **89 passed** (+3 new LIVOS-035: clean token emitted, injection token omitted, 256-04 forward_auth preserved; WS-D.T4 256-04 upstreamBearer block still green).
- Combined run: **102 passed (102)**.
- `tsc --noEmit -p packages/livinityd`: no new error in `server/index.ts` or `samba.ts`.
- LIVOS-029 verify command (`git grep 503 -- liv/packages/memory/src/auth.ts`) returns the fail-closed lines.

## Files Created/Modified
- `openclawos/approvals-routes.ts` — added `isAdminEquivalent()` predicate; `authenticate()` captures the decoded payload and admits only admin-equivalent callers.
- `openclawos/approvals-routes.test.ts` — +4 admin-gate cases; existing token-bearing cases use admin payloads.
- `domain/caddy.ts` — `safeBearer` charset gate before the reverse_proxy bearer-header emit; bearer + Host/Origin rewrite emitted only on match.
- `domain/caddy.test.ts` — +3 LIVOS-035 cases.
- `server/index.ts` — removed `.includes(appSlug)` substring fallback at both custom-domain container-resolution sites (exact match only).
- `files/samba.ts` — `getSharePassword` writes `{mode: 0o600}` + best-effort `chmod 0o600` on access.

## Decisions Made
- See key-decisions frontmatter. Notably: admin-equivalence (not strict role lookup) preserves the single-operator Mini PC; omit-on-mismatch for upstreamBearer (don't fail the whole block); chmod-on-access to fix the live 0644 file in place.

## Deviations from Plan

None — plan executed exactly as written.

The pre-existing test cases in `approvals-routes.test.ts` that supplied non-admin/empty payloads (`{}`, `{userId:'admin'}` with no role) and asserted success were updated to admin payloads. This is part of the planned LIVOS-027 contract change (the plan explicitly states authenticate() now captures the payload and rejects non-admin), not a deviation.

## Issues Encountered
None. Confirmed the 257-02 listen()/`resolveBindHost()` bind region (server/index.ts ~2008-2013) is untouched — my LIVOS-036 edits are at the container-match regions (~203, ~712), a distinct region of the same file (wave-2 single-writer preserved). Confirmed the 256-04 forward_auth/upstreamBearer caddy.ts region (~586-594) is preserved — the LIVOS-035 edit is the neighboring reverse_proxy emit (~596). The sacred-SHA pre-commit hook passed on every commit (`20 files verified`); no `--no-verify` used.

Out-of-scope unstaged changes present at start of run (`.planning/*-PLAN.md`, `apps/cred-egress-proxy.ts`, `skills-lock.json`, untracked `.agents/skills/...`) were left untouched per the scope boundary.

## User Setup Required
None — no external service configuration required. (Operational note for a deploy: the existing live `/opt/livos/data/secrets/share-password` is corrected to 0600 automatically on next `getSharePassword` call; a manual `chmod 600` is optional belt-and-suspenders.)

## Next Phase Readiness
- WS-F (the deferrable Low/Info cut line) is complete — Phase 257 does not need to split it to Phase 258.
- All SC-F criteria met: approvals require admin (legacy single-user preserved); upstreamBearer charset-validated (no Caddy injection); custom-domain exact container-name match; share-password 0600; LIVOS-029 confirmed closed by 256-04.
- No blockers.

## Self-Check: PASSED

- FOUND: `.planning/phases/257-security-hardening-pass-2/257-06-SUMMARY.md`
- FOUND commit `109e704f` (Task 1, LIVOS-027)
- FOUND commit `ccb34722` (Task 2, LIVOS-035)
- FOUND commit `df27724b` (Task 3, LIVOS-036)
- FOUND commit `b0983d02` (Task 4, LIVOS-039)

---
*Phase: 257-security-hardening-pass-2*
*Completed: 2026-06-03*
