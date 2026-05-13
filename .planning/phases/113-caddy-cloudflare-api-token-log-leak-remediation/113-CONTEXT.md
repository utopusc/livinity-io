# Phase 113: Caddy CLOUDFLARE_API_TOKEN Log Leak Remediation - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Stop Caddy systemd unit from logging the plaintext `CLOUDFLARE_API_TOKEN=cfut_...` env-var to `journalctl -u caddy` on every reload. Currently anyone with root or journalctl read access on mainserver can recover the CF API token from logs — medium-severity credential leak. Fix is server-side only (Caddy systemd unit + possibly EnvironmentFile permission/format) — NO code in this repo.

**Driver / Evidence:** v34 session 2026-05-13 — the orchestrator literally recovered the CF token from `journalctl -u caddy | grep -i cloudflare_api_token` to create the wildcard DNS record (proves leak is real). Documented in `.planning/v34-HANDOFF-2026-05-13.md` Issue 5.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
- Pick minimum-blast-radius fix: load CF token via `EnvironmentFile=/etc/caddy/cloudflare.env` (chmod 600 root) instead of `Environment=CLOUDFLARE_API_TOKEN=...`. systemd doesn't log EnvironmentFile contents.
- Alternative if EnvironmentFile already in use but value still leaks: investigate stderr redirect or systemd `LoadCredential=` (systemd 250+ credential system).
- Keep wildcard cert renewal working — no Caddy downtime, no TLS handshake interruption.

### Locked Constraints
- **D-113-NO-CADDY-DOWNTIME:** change must reload gracefully — no TLS handshake interruption.
- **D-113-NO-DNS-DROP:** wildcard cert renewal continues to work after the fix (Cloudflare DNS-01 challenge unaffected).
- **D-113-NO-LIVOS-AUTH-BYPASS:** scope is Caddy-only, livinityd untouched.
- **D-113-SACRED-SHA-UNTOUCHED:** `sdk-agent-runner.ts` SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` not in scope.
- **D-113-MAINSERVER-ONLY:** this is an ops fix on mainserver `154.53.56.75`. No code changes in `livinity-io` repo source tree (other than possibly capturing the fix as a `scripts/install/` helper for future fresh installs).

</decisions>

<code_context>
## Existing Code Insights

**No source code changes expected.** Fix is entirely on mainserver:
- `/etc/systemd/system/caddy.service` (or `/lib/systemd/system/caddy.service`) — systemd unit file
- `/etc/caddy/Caddyfile` — Caddy config (probably already references `{env.CLOUDFLARE_API_TOKEN}` — no change needed there if env wiring is fixed)
- `/etc/caddy/cloudflare.env` — NEW file (if adopting EnvironmentFile approach), chmod 600 root:root, contains `CLOUDFLARE_API_TOKEN=cfut_...`

**Possible carry-over to scripts/install/:**
If we want fresh installs to benefit from this remediation, add a helper to `scripts/install/deploy-livinityd.sh` (or equivalent Caddy install script) that writes the unit with EnvironmentFile pattern instead of inline Environment=. Optional — primary scope is the existing mainserver leak.

</code_context>

<specifics>
## Specific Ideas

**Investigation commands (executor will run via SSH to mainserver):**
```bash
ssh root@154.53.56.75 'systemctl cat caddy | head -40; \
                       journalctl -u caddy --since "1 hour ago" | grep -i cloudflare_api_token | head -3; \
                       ls -la /etc/caddy/ 2>&1; \
                       systemd-analyze --version'
```

**Fix-A — EnvironmentFile (preferred):**
```bash
# 1. Write env file (mainserver, root)
install -m 600 -o root -g root /dev/null /etc/caddy/cloudflare.env
echo "CLOUDFLARE_API_TOKEN=<token>" > /etc/caddy/cloudflare.env

# 2. Edit Caddy unit
systemctl edit caddy
# In override: replace Environment= with EnvironmentFile=/etc/caddy/cloudflare.env

# 3. Reload + verify
systemctl daemon-reload
systemctl reload caddy
journalctl -u caddy --since "1 minute ago" | grep -i cloudflare_api_token | head -3
# Expect: empty
```

**Verification — journalctl clean check:**
```bash
# Force a reload to trigger a fresh journal entry
ssh root@154.53.56.75 'systemctl reload caddy && sleep 2 && \
                       journalctl -u caddy --since "1 minute ago" | grep -ci cloudflare_api_token'
# Expect: 0 (zero matches)
```

</specifics>

<deferred>
## Deferred Ideas

- Rotating the CF API token after remediation (the existing one is already exposed in older journal entries unless `journalctl --vacuum-time` is also run). Optional follow-up: vacuum journal + rotate token via Cloudflare dashboard. Out of scope for this fix (rotation is operator decision).
- Migrating other secrets in systemd units (Redis password, JWT, DB password, etc.) to the same EnvironmentFile pattern. Out of scope — Phase 113 is specifically the CF token leak.
- Caddy plugin alternatives (e.g. caddy-credman) — overkill for a single token; EnvironmentFile is enough.

</deferred>
