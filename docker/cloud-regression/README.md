# Cloud-Mode Regression UAT

Phase 104 plan 104-06 — verifies `install.sh --mode cloud` produces a runtime
byte-equivalent to the Mini PC deploy at SHA `dab261cc`.

## Why this exists

**D-104-NO-PROD-IMPACT** is the hardest non-goal in Phase 104: the existing
cloud Mini PC deploy at SHA `dab261cc` (the user's only LivOS deployment that
matters, per project memory `feedback_no_server4`) must continue to function
unchanged after Phase 104 ships. This UAT is the CI gate that fails the phase
if any drift from that baseline is detected.

Without this gate, Phase 104 changes to `caddy.ts` / `install.sh` /
`mode-cloud.sh` could silently break the production Mini PC deploy. With it,
any drift surfaces as a hard test failure.

## Prerequisites

1. **Docker Desktop** (or any cgroup v2 Docker daemon — WSL ≥2.5.1 on
   Windows). Same prereq as `docker/local-uat/`.
2. **Mini PC baseline fixtures captured** (one-time operator step). Without
   these the regression runs in NEGATIVE-CHECKS-ONLY mode — still asserts
   D-104-NO-PROD-IMPACT invariants but skips the byte-level diff.

### Capture the Mini PC baseline (one-time)

```sh
bash docker/cloud-regression/scripts/capture-minipc-baseline.sh
git add docker/cloud-regression/fixtures/minipc-dab261cc/
git commit -m "baseline(104-06): capture Mini PC at deployed SHA dab261cc"
```

The capture script:
- SSHes to `bruce@10.69.31.68` using `pem/minipc` (override via
  `MINIPC_SSH_KEY=` env)
- Runs ONE batched bash heredoc (per memory `feedback_ssh_rate_limit`:
  fail2ban bans rapid probes — never split into multiple ssh calls)
- Captures Caddyfile, systemd units, env KEY shape (no values!), apt package
  names, and `/opt/livos/.deployed-sha`
- Verifies the captured SHA matches `dab261cc` (override via
  `ALLOW_SHA_DRIFT=1` to intentionally bump the baseline)
- Exits gracefully if the Mini PC is unreachable (ZeroTier flap,
  fail2ban ban, network issue) — fixtures dir keeps its `.gitkeep`
  placeholder and the operator can retry later

## Run the regression test

```sh
bash docker/cloud-regression/scripts/test-cloud-byte-equivalence.sh
```

Expected output:
- `PASS: container reached READY`
- `PASS: no-prod-impact: cloud-mode Caddyfile has no local-lan directives`
- `PASS: caddy validate clean`
- `PASS: caddy.service enabled` (AC-104-12)
- If baseline fixtures present:
  - `PASS: Caddyfile normalized SHA matches baseline` (or `WARN` with
    informational drift note — Caddyfile is bootstrap-only, livinityd's
    domain.activate regenerates it)
  - `PASS: apt package names match baseline`
  - per-unit `PASS: systemd unit matches baseline: <unit>` (or `WARN`
    informational drift — unit files come from `update.sh` rsync deploy,
    NOT install.sh)

Exits 0 on pass (or only `WARN`-level drift); 1 on any `FAIL` line, caddy
validate error, or `caddy.service` not enabled.

## What this regression DOES verify

1. **AC-104-3 negative invariants** (D-104-NO-PROD-IMPACT hard checks):
   - `/etc/caddy/pki-global.conf` does NOT exist in cloud mode (local-lan only)
   - `/etc/dnsmasq.d/livinity.conf` does NOT exist (local-lan only)
   - `/etc/caddy/Caddyfile` does NOT contain `import /etc/caddy/pki-global.conf`,
     `tls internal`, or `ca liv-local` directives (local-lan only)
2. **AC-104-12**: `caddy.service` is enabled post-install (i.e.,
   `install_caddy()` did its job; cloud-mode bootstrap is healthy)
3. **AC-104-3 positive byte-equivalence** (when fixtures present):
   - Caddyfile structure matches the Mini PC baseline (normalized SHA)
   - systemd unit file SHAs match (per unit)
   - apt package set matches (names only — versions drift by host clock)

## What this regression does NOT verify

- **Live cert issuance.** Cloudflare DNS-01 ACME cannot run inside the
  container (no real DNS access for the dummy CF token). The regression uses
  `caddy validate` as a config-syntax proxy. Real cert flow stays a manual
  user-walk against the Mini PC.
- **`livos.service` / `liv-core.service` / `liv-worker.service` /
  `liv-memory.service` content.** These come from `update.sh` rsync deploy,
  NOT from `install.sh`. install.sh `--mode cloud` only provisions system
  prereqs (Caddy + cloudflared + common-deps). Unit-file drift in those is
  therefore informational (WARN), not FAIL.
- **Per-host secrets.** `env.shape` extracts KEY NAMES from `/opt/livos/.env`
  only — values (DATABASE_URL password, JWT secret) are NEVER captured. So
  the regression cannot validate value parity; it validates env var name
  parity only.

## Port mapping (avoid collision with docker/local-uat/)

| Container port | Host port | Note |
|----------------|-----------|------|
| 80             | 8090      | Cloud-regression HTTP — local-uat already binds 80 |
| 443            | 8453      | Cloud-regression HTTPS — local-uat already binds 443 |

Both containers can run side-by-side during dev.

## Sacred SHA invariant

`liv/packages/core/src/sdk-agent-runner.ts` MUST equal
`f3538e1d811992b782a9bb057d1b7f0a0189f95f` after every commit. The
pre-commit hook installed in Phase 100-01 enforces this; no plan 104-06
change touches that file.
