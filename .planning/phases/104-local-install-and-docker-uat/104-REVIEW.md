---
phase: 104
status: findings
review_date: 2026-05-12
total_files_reviewed: 33
findings_count:
  blocker: 0
  high: 2
  medium: 6
  low: 5
  info: 4
---

# Phase 104 — Code Review

## Summary

Phase 104 ships a clean, well-tested local-install + Docker UAT stack. Sacred SHA preserved, all three D-104-* invariants hold statically and at runtime (verified by 12/12 walk.mjs and the negative-grep tests in `caddy.test.ts`). Bash scripts use `set -euo pipefail` consistently, secrets are written at `0600` with parent dirs at `0700`, the TS Server5 provisioner refuses to leak the CF token in error messages, and the Caddyfile generators emit ONLY `reverse_proxy 127.0.0.1:*` lines (negative-grepped against 45.137.194.102/103).

Two notable issues stand out: (1) the **bash** Server5 provisioner path in `mode-hybrid.sh` leaks the Cloudflare API token via `curl --data` argv (the TS sibling in `hybrid-provision.ts` already avoids this — they should be aligned), and (2) the wizard's `HybridDnsSetup.tsx` collects the token in a React `useState` but then forces the user through a `prompt()` dialog for the subdomain instead of actually wiring the provision call — surface UX bug that defeats the careful TS work.

Beyond those, the Caddy-config third-party-QR-code, the cloud-mode `localhost` vs `127.0.0.1` drift, the orphaned `hybrid-provision.ts` exports, and a few `as any` Redis casts are all medium-or-lower.

## Findings

### [HIGH] CF-01 — Cloudflare API token leaks via `curl --data` argv in mode-hybrid.sh

**File:** `scripts/install/mode-hybrid.sh:118-123`
**Issue:** The Server5 provisioning POST passes the user's Cloudflare API token in `curl --data "...${CLOUDFLARE_API_TOKEN}..."`. On Linux, any unprivileged user running `ps auxww` while curl is in flight (≤30s `--max-time`) sees the full argv including the secret. On a fresh-install host this window is small, but on a multi-user host (LivOS's stated multi-tenant target) it is a real exposure.

The TS sibling `livos/packages/livinityd/source/modules/local-dns/hybrid-provision.ts:91-98` correctly sends the body via `fetch({body: JSON.stringify(...)})` — the bash path should match.

**Risk:** Local privilege-escalated token exfiltration; user-supplied secret leaked to any local user with PID-visibility.

**Fix:**
```bash
# Build body in a HEREDOC and feed via stdin / @- (curl reads from stdin, never argv).
local payload
payload=$(printf '{"hostIp":"%s","cloudflareApiToken":"%s"}' "$HOST_IP" "$CLOUDFLARE_API_TOKEN")
if ! response=$(printf '%s' "$payload" | curl -fsSL -X POST \
    -H "content-type: application/json" \
    -H "user-agent: LivOS-install.sh/Phase104" \
    --data-binary @- \
    --max-time 30 \
    "$endpoint" 2>/dev/null); then
    ...
fi
unset payload
```

Alternative: write the payload to a `mktemp` 0600 file under `/run` and `--data-binary @"$tmpf"`, then `rm -f "$tmpf"` — equivalent safety, lets you `cat` for debugging.

---

### [HIGH] WIZ-01 — HybridDnsSetup uses `prompt()` instead of calling the provisioner

**File:** `livos/packages/ui/src/features/local-setup/HybridDnsSetup.tsx:18-41`
**Issue:** The wizard collects `cfToken` via a password-typed input in `LocalSetupWizard.tsx`'s `HybridConfigStep`, then routes to `HybridDnsSetup` to "provision subdomain." But the implementation of `handleProvision` is two `window.prompt()` calls asking the user to retype the subdomain + zoneId that `install.sh` allegedly logged. There is no tRPC call. The `provisionHybridSubdomain` helper in `hybrid-provision.ts` is unused by the UI. As a result:

1. The CF token entered in the wizard is collected, held in React state, but never sent anywhere — pure typescript pageant.
2. The user is asked to re-find install.sh log output and copy-paste into a modal `prompt()` — broken UX, especially on mobile where the wizard runs from the same browser tab as the install was performed via SSH.
3. `prompt()` returns `null` on cancel — the code treats `null` falsey-string as "Both required" which is OK but the failure mode is silent.

**Risk:** Bad UX (most users won't complete enrollment); the entered CF token is never used (false UX promise); the actual provision-token flow exists in `hybrid-provision.ts` but is dead.

**Fix:** Wire a tRPC route `local.provisionHybrid({hostIp, cloudflareApiToken})` that calls `provisionHybridSubdomain(...)` server-side (so token never leaves the LivOS-host), then call `mutateAsync` in `handleProvision`. Remove the `prompt()` calls. Track this as a Phase 105 surface bug if v104 ships as-is — the static-grep tests still pass because they only check that the URL string appears.

```tsx
const provisionM = trpcReact.local.provisionHybrid.useMutation()
const handleProvision = async () => {
  setBusy(true); setError(null)
  try {
    const r = await provisionM.mutateAsync({hostIp, cloudflareApiToken: cfToken})
    onProvisioned(r.subdomain, r.zoneId)
  } catch (e: unknown) {
    setError(e instanceof Error ? e.message : String(e))
  } finally { setBusy(false) }
}
```

---

### [MEDIUM] CADDY-01 — mode-cloud.sh uses `localhost` while domain/caddy.ts uses `127.0.0.1`

**File:** `scripts/install/mode-cloud.sh:63, 70`
**Issue:** `caddy.ts:14` documents an explicit invariant: *"Uses 127.0.0.1 instead of localhost to ensure IPv4 connections."* But `mode-cloud.sh` emits `reverse_proxy localhost:8080` in its bootstrap Caddyfile. On dual-stack Ubuntu (Mini PC is dual-stack), Caddy may resolve `localhost` to `::1` first, then fall through to `127.0.0.1` only if livinityd isn't IPv6-bound. This is exactly the failure mode the comment was added to prevent.

**Risk:** Subtle "Caddy can't reach livinityd" failure on first-boot if livinityd binds 0.0.0.0 only (IPv4). Byte-equivalence regression test will warn-but-not-fail because Mini PC `Caddyfile` is auto-generated by livinityd, not by install.sh — so the drift is invisible until first restart.

**Fix:** Change both `localhost:8080` to `127.0.0.1:8080` in mode-cloud.sh. Also bring `applyCaddyConfigForTunnel` (caddy.ts:369-375) and `revertCaddyToDefault` (caddy.ts:378-385) in line — they also emit `localhost:8080` despite the file-level invariant. (These two are pre-Phase-104 but the inconsistency is now visible because mode-cloud.sh mirrors them.)

---

### [MEDIUM] PRIV-01 — `local.activate` is privateProcedure (any user), should be adminProcedure

**File:** `livos/packages/livinityd/source/modules/local-dns/routes.ts:87, 116`
**Issue:** `local.activate` and `local.activateHybrid` are `privateProcedure` — meaning any authenticated user (including guest-role) can rewrite `/etc/caddy/Caddyfile`, change the Redis mode flag, and trigger `caddy reload`. This is a system-wide configuration mutation that should be admin-only. Same critique applies to the legacy `domain.setDomain` / `domain.activate` (caddy.ts:109/163), which is a pre-existing convention — but Phase 104 is a fresh surface that should set the bar higher.

**Risk:** Privilege-escalation-via-config-change: a compromised non-admin user can flip the system into a different TLS mode (e.g., from cloud → hybrid pointing at an attacker-controlled subdomain).

**Fix:** Change to `adminProcedure`:
```ts
import {router, adminProcedure} from '../server/trpc/trpc.js'
// ...
activate: adminProcedure.input(localActivateSchema).mutation(...)
activateHybrid: adminProcedure.input(hybridActivateSchema).mutation(...)
```
`getStatus`/`getCaCert`/`getHybridStatus` can stay `privateProcedure` (read-only). Document the existing `domain.*` decision in a comment and link to a Phase 105 follow-up to harden those too.

---

### [MEDIUM] QR-01 — QR code generated by third-party service leaks LAN IP

**File:** `livos/packages/ui/src/features/local-setup/QrCodeStep.tsx:18`
**Issue:** The CA-cert URL (containing the user's LAN IP, e.g. `http://192.168.1.100/api/local/ca.crt`) is sent to `api.qrserver.com` to generate the QR PNG. This leaks:
- The host's RFC1918 LAN IP to a third party
- The fact that the user runs LivOS on a specific LAN at a specific time
- (Indirectly) the existence of an unauthenticated CA-cert endpoint on that IP

The comment claims this is "D-NO-NEW-DEPS fallback" but a minimal QR generator is ~3KB of vanilla JS (qr-creator, qrcode-svg pure-JS impl). The dep cost is real but proportional to the privacy gain.

**Risk:** Information leak to api.qrserver.com (passive logging on their side); HTTP (not HTTPS) image URL would also be a concern, but the wizard uses HTTPS to qrserver.com so the URL is only in qrserver's logs, not in transit.

**Fix:** Either:
1. Generate QR locally — there's a 3KB pure-JS QR generator (`qrcode-generator` or `qr-creator`) — accept the D-NO-NEW-DEPS deviation for the privacy gain.
2. Serve a server-side endpoint `/api/local/ca-cert-qr.png` from livinityd that returns a locally-generated PNG (Node has `qrcode` available; if D-NO-NEW-DEPS blocks it, generate ASCII art).
3. As a band-aid: encode JUST the cert PEM bytes in the QR (not the URL) — the device decodes and trusts directly, no IP leak. (This is also more robust: works even when the device is on a different LAN.)

---

### [MEDIUM] PROVIDE-01 — hybrid-provision.ts exports are unused in production

**File:** `livos/packages/livinityd/source/modules/local-dns/hybrid-provision.ts:76, 139`
**Issue:** `provisionHybridSubdomain` and `writeCfTokenSecret` are exported, exercised by 168 lines of unit tests, but never imported by any non-test code. `install.sh --mode hybrid` re-implements the same flow in bash (`mode-hybrid.sh:108-157`). The TS code is dead in production. This is acceptable as test scaffolding for a future tRPC route, but the asymmetry creates two divergent implementations that must be kept in sync (and the bash one already has CF-01 above).

**Risk:** Drift. Future maintainer fixes a bug in one path, misses the other. Tests pass because the TS path is well-covered, but production runs the bash path.

**Fix:** Pick one:
1. Wire the TS `provisionHybridSubdomain` into a `local.provisionHybrid` tRPC route (also fixes WIZ-01 above), and remove the curl call from `mode-hybrid.sh:118-123`. install.sh's `_provision_hybrid_subdomain` would degrade to "make sure livinityd is up; UI handles provisioning."
2. Mark the TS exports `@internal` / `@deprecated — UI flow not yet wired (Phase 105)` and add a comment to `mode-hybrid.sh` noting that the bash path is the only production caller for now.

---

### [MEDIUM] CTX-01 — `(ctx as any).livinityd.ai.redis` is unsafe and untyped

**File:** `livos/packages/livinityd/source/modules/local-dns/routes.ts:65, 91, 120, 136`
**Issue:** Every Redis access goes through `(ctx as any).livinityd.ai.redis`. The cast silently disables type checks against the actual `Livinityd` shape. If `livinityd.ai.redis` is moved/renamed (e.g., to `livinityd.redis` once the AI provider is decoupled from Redis), these routes break silently at runtime.

**Risk:** Stale type information; future refactor regressions caught only at runtime in production.

**Fix:** Type the context properly. Look at how `domain/routes.ts` uses Redis — there's likely a typed `ctx.livinityd: Livinityd` import. If the v32 `setProductionAppRouter` pattern is in play, follow that. Example:
```ts
import type Livinityd from '../../index.js'
// ...
getStatus: privateProcedure.query(async ({ctx}) => {
    const redis = (ctx.livinityd as Livinityd).ai.redis
    // ...
})
```
If the surrounding routers do the same `as any` cast, this is informational; if they don't, this is a regression in code quality.

---

### [MEDIUM] FS-01 — pki.ts:43 `find` shells without timeout, no max-depth

**File:** `livos/packages/livinityd/source/modules/local-dns/pki.ts:41-49`
**Issue:** The `findRootCertPath()` fallback shells `find /var/lib/caddy -name root.crt -type f -path '*liv-local*' -print -quit`. No `-maxdepth`, no timeout via `execAsync` options. On a misconfigured `/var/lib/caddy` (e.g., bind-mounted to an NFS share, or symlinked to `/`), this could traverse arbitrary directories. The `-quit` flag bails on first match but a slow filesystem could hang the route.

**Risk:** Latency spike on `local.getStatus` / `local.getCaCert` / `/api/local/ca.crt` if `/var/lib/caddy` is bogus. Not a security issue (path is hard-coded to a Caddy default), but a robustness one.

**Fix:**
```ts
const {stdout} = await execAsync(
    "find /var/lib/caddy -maxdepth 6 -name root.crt -type f -path '*liv-local*' -print -quit",
    {timeout: 5000},
)
```

---

### [LOW] BANNER-01 — show-banner.sh prints to stdout, but other helpers print to stderr

**File:** `scripts/install/show-banner.sh:7-32`
**Issue:** Logging helpers (`_logging.sh:19-23`) explicitly redirect to `>&2` to keep stdout clean "for any future piping consumer." But `show-banner.sh` emits to stdout (no `>&2`). Mostly cosmetic — if someone pipes `install.sh` output, the banner is the only thing they get on stdout, which is actually surprising and confusing.

**Fix:** Add `>&2` to the `echo` lines in `print_banner`, or accept that the banner IS the user-facing exit message and document the asymmetry in a comment.

---

### [LOW] CURL-01 — `curl -1sLf` flag suspicious in common-deps.sh

**File:** `scripts/install/common-deps.sh:31, 33`
**Issue:** `curl -1sLf` — the `-1` is `--tlsv1.0` (force TLSv1.0 ONLY!). That's a downgrade from modern TLSv1.2/1.3 to a deprecated, vulnerable protocol. This is almost certainly a typo for `-fsSL` (which is also used elsewhere). cloudsmith.io's TLS handshake will likely succeed regardless (they support TLS 1.0 as fallback), so the code works by accident.

**Risk:** Downgrade to TLSv1.0 cipher suites for the curls to cloudsmith.io. Functionally insignificant (cloudsmith already negotiates the highest available), but the intent is wrong and a future curl release may drop TLSv1.0 support entirely, breaking installs.

**Fix:**
```bash
curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
```

(`-f` fail-on-error, `-s` silent, `-S` show-errors-when-silent, `-L` follow-redirects. Note Caddy official docs use exactly this on their install page.)

---

### [LOW] STOPDNS-01 — systemd-resolved restart can break in-flight DNS

**File:** `scripts/install/mode-local-lan.sh:14-24`
**Issue:** `systemctl restart systemd-resolved` is fired idempotently when the drop-in didn't exist, but it interrupts every in-flight DNS query system-wide for ~1-2s. If install.sh is being run via `curl ... | bash` (the advertised mode), the script is itself doing apt fetches and Server5 calls — any in-flight DNS during this window fails. Reload (`systemctl reload-or-restart`) is safer.

**Risk:** Sporadic install-time failures on slow links; the operator sees `curl: (6) Could not resolve host` mid-install with no clear cause.

**Fix:**
```bash
systemctl reload-or-restart systemd-resolved
```
Also consider deferring the restart until AFTER the apt-get install steps complete — i.e., move the `systemctl restart systemd-resolved` to the END of `_install_dnsmasq_local_lan`.

---

### [LOW] CHROME-01 — uat-driver `google-chrome --no-sandbox` is correct for the container, but warn elsewhere

**File:** `docker/local-uat/entrypoint.sh:51`, `docker/local-uat/uat-driver/lib/chrome-cdp.mjs:59`
**Issue:** `--no-sandbox` is required inside the container (cap-restricted env) but is dangerous if these helper scripts are ever reused outside the UAT container. Add a comment.

**Fix:** Add `# WARNING: --no-sandbox is safe ONLY inside the UAT container (privileged: true, isolated network).` above each invocation.

---

### [LOW] LOG-01 — set_livos_redis_key writes ${value} unquoted in error path

**File:** `scripts/install/_logging.sh:42-46`
**Issue:** `grep -v "^${key}=" "$pending"` is fine, but the rewrite `echo "${key}=${value}" >> "$pending"` doesn't escape special chars in `${value}`. If the value contains `\n`, `${}` interpolation, or trailing whitespace, the queue file becomes ambiguous. For the keys currently used (mode names, TLDs, IPs, file paths) there's no risk, but a future caller passing a path with spaces or a description string would break.

**Fix:** Add a sanity check or use `printf '%s=%s\n' "$key" "$value"`.

---

### [INFO] NEW-FILE-01 — entrypoint.sh writes to /etc/hosts inside walk.mjs

**File:** `docker/local-uat/uat-driver/walk.mjs:386`
**Observation:** AC-104-15 pins `${TEST_USER}.${fakeSubdomain}` into /etc/hosts via `docker exec ... echo "..." >> /etc/hosts`. This is fine for a one-shot UAT walk in a throwaway container, but two consecutive `walk.mjs` runs without `docker compose down` would append duplicate lines (the `grep -q` guard handles one duplicate but doesn't normalize). Low-impact in CI but worth flagging as test-cleanliness.

---

### [INFO] NEW-FILE-02 — Container exposes :9223 to the host as plaintext HTTP CDP

**File:** `docker/local-uat/docker-compose.yml:27`, `docker/local-uat/entrypoint.sh:46-64`
**Observation:** Chrome DevTools Protocol on `:9223` is accessible from any host that can reach the container's listening interface. CDP gives full browser control (read cookies, screenshot, evaluate arbitrary JS). The compose maps `9223:9224` on the HOST'S 0.0.0.0 by default — meaning anyone on the host's network can drive the UAT Chrome.

For a local Docker dev box this is fine. The risk is if a developer accidentally runs this on a server with a public IP. Add a comment in compose to bind to 127.0.0.1 only:
```yaml
- '127.0.0.1:9223:9224'
```

---

### [INFO] NEW-FILE-03 — `redis-cli ping | grep -q '^PONG$'` is brittle if Redis logs decoration prefix

**File:** `scripts/install/_logging.sh:35`
**Observation:** Plain `redis-cli ping` returns just `PONG`, but if a future RedisAUTH layer logs a warning or password prompt before the response, the check might miss. Fine for current Redis use; future-proofing optional.

---

### [INFO] NEW-FILE-04 — Two divergent CONFIG_USE_HTTPS code paths

**File:** `scripts/install/mode-cloud.sh:56-74`, `docker/cloud-regression/docker-compose.yml:38-39`
**Observation:** The cloud-regression compose sets `CONFIG_DOMAIN=bruce.livinity.io` + `CONFIG_USE_HTTPS=true`, exercising the HTTPS bootstrap path. This is GOOD — the negative checks in entrypoint.sh would otherwise be running against the `:80` bootstrap and would miss any drift in the `${domain} { reverse_proxy localhost:8080 }` shape. Just documenting that the test fixture and the production bootstrap diverge intentionally.

---

## Files reviewed

- `livos/packages/livinityd/source/modules/domain/caddy.ts` (sacred file — diff verified additive only)
- `livos/packages/livinityd/source/modules/domain/caddy.test.ts`
- `livos/packages/livinityd/source/modules/local-dns/routes.ts`
- `livos/packages/livinityd/source/modules/local-dns/routes.test.ts`
- `livos/packages/livinityd/source/modules/local-dns/pki.ts`
- `livos/packages/livinityd/source/modules/local-dns/pki.test.ts`
- `livos/packages/livinityd/source/modules/local-dns/dnsmasq-config.ts`
- `livos/packages/livinityd/source/modules/local-dns/dnsmasq-config.test.ts`
- `livos/packages/livinityd/source/modules/local-dns/hybrid-provision.ts`
- `livos/packages/livinityd/source/modules/local-dns/hybrid-provision.test.ts`
- `livos/packages/livinityd/source/modules/server/index.ts` (diff only — `/api/local/ca.crt` handler)
- `livos/packages/livinityd/source/modules/server/trpc/common.ts`
- `livos/packages/livinityd/source/modules/server/trpc/index.ts`
- `livos/packages/ui/src/features/local-setup/LocalSetupWizard.tsx`
- `livos/packages/ui/src/features/local-setup/ModePickStep.tsx`
- `livos/packages/ui/src/features/local-setup/QrCodeStep.tsx`
- `livos/packages/ui/src/features/local-setup/PlatformInstructions.tsx`
- `livos/packages/ui/src/features/local-setup/HybridDnsSetup.tsx`
- `livos/packages/ui/src/features/local-setup/types.ts`
- `livos/packages/ui/src/features/local-setup/__tests__/LocalSetupWizard.test.tsx`
- `livos/packages/ui/src/routes/settings/index.tsx`
- `livos/packages/ui/src/routes/settings/local-access.tsx`
- `scripts/install.sh`
- `scripts/install/_logging.sh`
- `scripts/install/parse-cli.sh`
- `scripts/install/detect-platform.sh`
- `scripts/install/common-deps.sh`
- `scripts/install/show-banner.sh`
- `scripts/install/mode-cloud.sh`
- `scripts/install/mode-local-lan.sh`
- `scripts/install/mode-hybrid.sh`
- `docker/local-uat/Dockerfile`
- `docker/local-uat/docker-compose.yml`
- `docker/local-uat/entrypoint.sh`
- `docker/local-uat/scripts/test-install-sh.sh`
- `docker/local-uat/scripts/test-install-idempotency.sh`
- `docker/local-uat/uat-driver/walk.mjs`
- `docker/local-uat/uat-driver/lib/chrome-cdp.mjs`
- `docker/local-uat/uat-driver/lib/tcpdump-check.mjs`
- `docker/cloud-regression/Dockerfile`
- `docker/cloud-regression/docker-compose.yml`
- `docker/cloud-regression/entrypoint.sh`
- `docker/cloud-regression/scripts/capture-minipc-baseline.sh`
- `docker/cloud-regression/scripts/test-cloud-byte-equivalence.sh`

## Invariants verified

- **Sacred SHA `liv/packages/core/src/sdk-agent-runner.ts`:** PASS — hash is `f3538e1d811992b782a9bb057d1b7f0a0189f95f` (last touched in commit `fc55c795` from Phase 77-02+03, well before the 104 range; `git diff 5cd3a194..HEAD -- liv/packages/core/src/sdk-agent-runner.ts` is empty).
- **D-104-NO-PROD-IMPACT (`generateFullCaddyfile` untouched):** PASS — body of `generateFullCaddyfile` at `caddy.ts:53-115` matches pre-104 shape; only NEW functions `generateLocalCaddyfile` (line 161), `generateHybridCaddyfile` (line 257), `validateLocalTld` (line 145), `validateHybridDomain` (line 234), and the `LocalSubdomainConfig` interface (line 130) were added. Caddy.test.ts:79-103 enforces this with negative-greps (cloud mode emits NO `import pki-global.conf`, NO `pki {`, NO `ca liv-local`, NO `issuer internal`, NO `dns cloudflare`).
- **D-104-CADDY-PKI-IMPORT (pki imported, not inlined):** PASS — `generateLocalCaddyfile:170` emits `import /etc/caddy/pki-global.conf` as the FIRST string pushed to `blocks`; caddy.test.ts:42-46 asserts this is the first non-blank line of output. mode-local-lan.sh:59-71 writes the pki block to `/etc/caddy/pki-global.conf` (separate file, never inlined into the main Caddyfile).
- **D-104-RELAY-ZERO-DATA-PLANE (no Server5 in data plane):** PASS — `generateHybridCaddyfile` reverse_proxy lines all target `127.0.0.1:*` (caddy.test.ts:159-172 iterates every `reverse_proxy` line and asserts the regex `/reverse_proxy 127\.0\.0\.1:\d+/`). Negative-grep test caddy.test.ts:193-216 asserts output never contains `45.137.194.102` (Server5) or `45.137.194.103` (Server4). Runtime check at walk.mjs:380-425 uses `tcpdump host 45.137.194.102` during a hybrid page load and asserts packet count == 0. `hybrid-provision.ts` is the one allowed Server5 touch (control-plane subdomain mint only), and `mode-hybrid.sh:_provision_hybrid_subdomain` is its bash sibling — neither is a data-plane path.

---

## REVIEW COMPLETE — status: findings
