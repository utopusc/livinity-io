# Phase 257: Security Hardening Pass 2 — Context

**Gathered:** 2026-06-03
**Status:** Ready for planning
**Source:** Remaining `SECURITY-AUDIT.md` findings after Phase 256

<domain>
## Phase Boundary

Close the audit findings Phase 256 left out of scope. 256 closed the 3 Critical (LIVOS-003/016 accepted) + the highest-impact coupled High/Medium (001/002/004/007/008/009/013/014/017/018/019/025/037) and is DEPLOYED + live on the Mini PC. 257 sweeps the **remaining ~21**, grouped by theme + module, prioritized High → Medium → Low/Info.

**MANDATORY for every task:** re-verify the finding still exists in the CURRENT code before fixing — some may be partially or fully closed by 256 (e.g. LIVOS-029 memory fail-open may already be closed by 256-04's memory/auth.ts change; LIVOS-024 SSRF surface was reduced but not removed by WS-C's admin-gate). If already closed, mark skip-with-evidence; do not write redundant code.

IN scope (re-verify each): High 010, 011, 012, 015; partial-High→complete 005, 006; Medium 020, 021, 023, 024, 026; Low 027, 028, 029, 030, 031, 032, 033, 034, 035, 036, 038, 039; Info 040.
OUT of scope: 256-accepted (003/016 docker.sock curated, 022 Portainer builtin); per-app metered-key marketplace expansion; microVM/gVisor isolation.
</domain>

<decisions>
## Implementation Decisions

### Priority / sequencing
- Fix in priority order: **High first (WS-B/C/D + the partial-Highs in WS-A), then Medium (WS-A/E remainder), then Low/Info (WS-F)**. Low/Info (WS-F) is a final wave that MAY be deferred to a follow-up if scope balloons — confirm during planning.
- Mini PC only deploy target (Server4/5 off-limits). Single operator. Preserve all Phase 256 gains (auth fail-closed, sandbox, cred-proxy, sanitizer, classifier) and agent autonomy — no regressions.

### WS-A — Session & token lifecycle (005, 006, 023, 028)
- 005: wire the existing-but-unused `sessions` table so a password change OR account deactivation REVOKES outstanding JWTs (check a session/jti against the table in `is-authenticated.ts`). Don't break the legacy single-user / service-token paths 256-04 preserved.
- 006: tighten legacy/proxy-token cross-user file-tree access so a legacy/proxy token cannot read another user's tree.
- 023: scope the `LIVINITY_SESSION` cookie to the exact host (not `.livinity.io`) so it isn't leaked to the shared platform host / sibling tenants.
- 028: bind JWT `aud`/`iss` and use SEPARATE signing secrets for proxy vs session tokens.

### WS-B — Supply-chain integrity (011, 012, 026)
- 011: `update.sh` must verify it is deploying an intended commit (pin/allowlist a commit or verify a signature/tag) rather than blindly executing whatever GitHub HEAD serves as root.
- 012: skill marketplace must NOT `import()` arbitrary downloaded `index.js` in-process without a signature/sandbox; add a signature or isolation gate.
- 026: the documented `curl | bash` install path needs a checksum/integrity step.

### WS-C — Network & request-forgery surface (015, 024, 038)
- 015: livinityd admin daemon (:8080) must not be reachable from the LAN — bind to loopback and/or add a UFW rule (Mini PC). Keep the legitimate Caddy/loopback path working.
- 024: `apps.addRepository` (now admin-only via 256) still needs a scheme/host allowlist + DNS-rebind guard against SSRF / internal-target fetch.
- 038: MCP streamableHttp SSRF guard must resist DNS-rebind / IPv6 bypass (not just a literal-hostname check).

### WS-D — luse file exposure (010)
- 010: luse `computer_read_file` must be path-sandboxed so it cannot read the whole `/home/<slug>/` (OAuth creds, ~/.claude, ~/.ssh). Mirror the WS-A files-allowlist shape from 256.

### WS-E — Secret hygiene (020, 021, 030, 031, 032, 033, 034)
- Remove hardcoded/fallback secrets from tracked source: Redis pw in heartbeat-runner (020), platform-DB pw (021), livinityd-PG fallback (030), legacy `liv:liv` (031), Server4 Redis (032). Replace with env/secret-file reads that FAIL CLOSED if unset.
- 033: derive the at-rest credential encryption key INDEPENDENTLY of the JWT signing secret (no key reuse).
- 034: fix the world-writable (0o777) scratch HOME that nests the operator-cred mount → least-privilege mode.
- Goal: `git grep` for the known default passwords returns zero tracked-source hits.

### WS-F — Remaining Low/Info hygiene (027, 029, 035, 036, 039, 040)
- 027: openclawos approvals/handshake routes need a role check (not just any-logged-in-user).
- 029: confirm memory service fail-closed (likely already done by 256-04 — verify + close or mark done).
- 035: escape `upstreamBearer` when interpolated into the Caddyfile (config-injection).
- 036: custom-domain gateway must authenticate + use exact (not substring) container-name match.
- 039: `share-password` secret file mode → 600.
- 040: avoid blanket unpinned apt install on every update.sh run.
</decisions>

<canonical_refs>
## Canonical References
- `SECURITY-AUDIT.md` (repo root) — per-finding file:line + evidence + recommendation for every LIVOS-### above. Authoritative.
- `.planning/phases/256-security-hardening-contained-autonomy/256-0{1..6}-SUMMARY.md` + `256-DEPLOY-LOG.md` — what 256 already changed (auth fail-closed, sandbox, cred-proxy, sanitizer, classifier, installer additions) so 257 builds on it without conflict or redundancy.
- Existing patterns to reuse: 256's files-allowlist (`liv/packages/core/src/sandbox.ts` SANDBOX_DENY_READ) for WS-D; 256-04 `is-authenticated.ts` fail-closed shape for WS-A; the broker for any key handling.
- Deploy: `update.sh` / `scripts/install/deploy-livinityd.sh` (Mini PC rsync+build+restart). New OS/firewall steps (UFW rule for WS-C) go in the installer.
</canonical_refs>

<specifics>
## Specific Ideas
- WS-A 005 token revocation: a per-session `jti` claim checked against `sessions` (revoked-at column) is the least-invasive shape; password-change/deactivate writes a revocation.
- WS-C 015: prefer binding livinityd to 127.0.0.1 + Caddy reverse-proxy (already the public path) over only a UFW rule, so a firewall flush doesn't re-expose it.
- WS-E: many are one-line replacements (read env, throw if unset) — batch as small atomic commits; the win is the grep-clean invariant.
</specifics>

<deferred>
## Deferred Ideas
- WS-F (Low/Info) MAY split to a Phase 258 if High+Medium already fill the phase budget — decide during planning.
- Anything requiring a provider-side change (e.g. true OAuth token-exchange for the cred-proxy) stays out.
</deferred>

---

*Phase: 257-security-hardening-pass-2*
*Context gathered: 2026-06-03*
