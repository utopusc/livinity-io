---
phase: 104
review_source: 104-REVIEW.md
fix_date: 2026-05-12
total_findings: 17
fixed: 7
deferred: 10
status: partial
---

# Phase 104 — Code Review Fix Summary

**Fixed at:** 2026-05-12
**Source review:** `.planning/phases/104-local-install-and-docker-uat/104-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 17 (2 HIGH + 6 MEDIUM + 5 LOW + 4 INFO)
- Fixed: 7 (2 HIGH + 5 MEDIUM) across 6 atomic commits
- Deferred: 10 (1 MEDIUM + 5 LOW + 4 INFO)

## Fixed (committed)

### CF-01 (HIGH) — `8b25de54`

**Files:** `scripts/install/mode-hybrid.sh`
**Applied fix:** Build payload in a local shell var and pipe via `curl --data-binary @-` (stdin). The Cloudflare API token no longer appears in `ps auxww` output during the up-to-30s Server5 provision call. `unset payload` clears the local var on both success and failure paths. Aligns the bash provisioner with the TS sibling (`hybrid-provision.ts` already passes the body via `fetch({body: JSON.stringify(...)})`).

### WIZ-01 + PROVIDE-01 (HIGH + MEDIUM) — `29f46a07`

**Files:** `livos/packages/livinityd/source/modules/local-dns/routes.ts`, `livos/packages/ui/src/features/local-setup/HybridDnsSetup.tsx`
**Applied fix:** Combined fix because WIZ-01 (dead `prompt()` UX) and PROVIDE-01 (unused TS `provisionHybridSubdomain` helper) are two sides of the same gap. Added a new `local.provisionHybrid` tRPC mutation that wraps `provisionHybridSubdomain` server-side (so the CF token never leaves the LivOS host). Replaced the two `window.prompt()` calls in `HybridDnsSetup.tsx` with `provisionM.mutateAsync({hostIp, cloudflareApiToken: cfToken})`. The recoverable `ServerSideProvisionUnavailable` error surfaces as a normal inline error in the wizard. All 8/8 `routes.test.ts` + 10/10 `hybrid-provision.test.ts` + 17/17 `LocalSetupWizard.test.tsx` PASS (UI source-grep invariants preserved — `dash.cloudflare.com` link + "Zero data-plane Server5 traffic" surface intact).

### CADDY-01 (MEDIUM) — `61fd5128`

**Files:** `scripts/install/mode-cloud.sh`
**Applied fix:** Changed both `reverse_proxy localhost:8080` to `reverse_proxy 127.0.0.1:8080` (lines 63 and 70). Matches the file-level invariant documented at `caddy.ts:14`. The pre-Phase-104 sibling functions in `caddy.ts` (`applyCaddyConfigForTunnel` + `revertCaddyToDefault`) still emit `localhost` — flagged in the commit body for a Phase 105 cleanup since they're covered by D-104-NO-PROD-IMPACT and changing them needs separate Mini PC validation. The byte-equivalence regression test treats Caddyfile SHA drift as WARN (not FAIL) per A5, so this change does not break the cloud regression gate.

### PRIV-01 (MEDIUM) — `9eac45f4`

**Files:** `livos/packages/livinityd/source/modules/local-dns/routes.ts`
**Applied fix:** Promoted `local.activate`, `local.activateHybrid`, and `local.provisionHybrid` from `privateProcedure` to `adminProcedure`. Read-only `getStatus` / `getCaCert` / `getHybridStatus` stay on `privateProcedure`. Legacy single-user installs pass through because `requireRole` early-returns when `ctx.currentUser` is unset (is-authenticated.ts:76). Test fixtures already pass `currentUser.role: 'admin'`, so 8/8 `routes.test.ts` still PASS.

### CTX-01 (MEDIUM) — `3e592a72`

**Files:** `livos/packages/livinityd/source/modules/local-dns/routes.ts`
**Applied fix:** Removed all four `(ctx as any).livinityd.ai.redis` casts (plus three `eslint-disable @typescript-eslint/no-explicit-any` comments). `domain/routes.ts` already accesses `ctx.livinityd.ai.redis` without a cast — the `Context` type via `Merge<ContextWss, ContextExpress>` already exposes `livinityd` as a required property. Future refactor of `livinityd.ai.redis` -> `livinityd.redis` will now surface as a compile error here instead of a runtime breakage. 8/8 `routes.test.ts` PASS.

### FS-01 (MEDIUM) — `1b842643`

**Files:** `livos/packages/livinityd/source/modules/local-dns/pki.ts`
**Applied fix:** Added `-maxdepth 6` to the `find` shell-out (Caddy authority dir lives at `/var/lib/caddy/.local/share/caddy/pki/authorities/<name>/root.crt` — 6 levels covers it with slack) and `{timeout: 5000}` on `execAsync`. On a misconfigured `/var/lib/caddy` (NFS bind-mount, symlink to /, etc.) the bounded traversal terminates within 5s instead of stalling the route handler. The constant `CADDY_PKI_ROOT_CRT` path is tried first via `readFile`, so the shell fallback is only hit when the well-known path moved. 4/4 `pki.test.ts` PASS.

## Deferred (not fixed this round)

### QR-01 (MEDIUM) — Reason: architectural decision

`api.qrserver.com` leaks LAN IP to third party. Fixing requires either:
1. New npm dep (`qrcode-generator` / `qr-creator`) — violates D-NO-NEW-DEPS (stated invariant); or
2. New backend endpoint `/api/local/ca-cert-qr.png` in livinityd (Node `qrcode` package; same D-NO-NEW-DEPS issue); or
3. Inline pure-JS SVG QR helper (~3KB) — same dep concern but inline so not "new dep" in pkg-manifest sense.

Beyond the ≤10 line cap. Additionally, the UI source-grep test `LocalSetupWizard.test.tsx:50-52` explicitly asserts `api\.qrserver\.com.*create-qr-code` is present — changing the QR source would also require updating that test. Logged for a discuss-phase decision (Phase 105 candidate: "Local-LAN QR privacy hardening").

### BANNER-01 (LOW) — Reason: cosmetic

`show-banner.sh` prints to stdout instead of stderr. Other helpers use `>&2`. Mostly cosmetic — banner IS the user-facing exit message. Out of scope per "LOW: skip" rule.

### CURL-01 (LOW) — Reason: works by accident, not user-facing

`curl -1sLf` in `common-deps.sh` forces TLSv1.0 — almost certainly a typo for `-fsSL`. cloudsmith.io's TLS handshake currently succeeds (they support TLS 1.0 as fallback), so the code works. Logged for Phase 105 cleanup along with the Caddy installation docs cross-check. Skipped this round per "LOW: skip" rule.

### STOPDNS-01 (LOW) — Reason: subtle install-time race; medium risk vs LOW criticality

`systemctl restart systemd-resolved` mid-install can briefly break DNS for in-flight apt fetches. Reload (`systemctl reload-or-restart`) is safer + deferring to the end of `_install_dnsmasq_local_lan` is the right fix, but it touches the install path that walk.mjs exercises. Out of scope per "LOW: skip"; flagged for follow-up if observed in real-hardware UAT.

### CHROME-01 (LOW) — Reason: documentation-only

`--no-sandbox` in `docker/local-uat/entrypoint.sh` + `chrome-cdp.mjs` is correct inside the UAT container. Only a comment is needed. Skipped per "LOW: skip"; can be added as a doc-only commit later.

### LOG-01 (LOW) — Reason: hypothetical future risk

`set_livos_redis_key` in `_logging.sh` writes `${key}=${value}` unquoted in the rewrite path. Current callers pass mode names / TLDs / IPs / file paths — all safe. The `printf '%s=%s\n'` fix is correct but the risk is theoretical. Skipped per "LOW: skip".

### NEW-FILE-01 (INFO) — Reason: observation, not a defect

`/etc/hosts` append in walk.mjs has a `grep -q` guard; only matters across multiple `walk.mjs` runs without `docker compose down`. CI always tears down. No-op.

### NEW-FILE-02 (INFO) — Reason: observation about local dev hygiene

CDP `:9223` exposed on host's 0.0.0.0. For a local Docker dev box this is fine. The suggested compose binding `127.0.0.1:9223:9224` is a one-line change but the user explicitly runs the UAT on a local Windows host, so the practical exposure is limited. Logged for a future container-hardening pass.

### NEW-FILE-03 (INFO) — Reason: hypothetical future risk

`redis-cli ping | grep -q '^PONG$'` is brittle if Redis adds a warning prefix in the future. Current Redis returns just `PONG`. No-op.

### NEW-FILE-04 (INFO) — Reason: documentation note, no action

Two CONFIG_USE_HTTPS code paths are intentionally divergent. Reviewer flagged this as documentation, not a bug.

## Invariants verified after fixes

- **Sacred SHA `liv/packages/core/src/sdk-agent-runner.ts`:** PRESERVED — verified `f3538e1d811992b782a9bb057d1b7f0a0189f95f` after every commit (six git hash-object checks; final post-FS-01 confirmed).
- **D-104-NO-PROD-IMPACT (generateFullCaddyfile untouched):** PRESERVED — no edits to `caddy.ts` `generateFullCaddyfile` or to the legacy `livos/install.sh` cloud-mode path. `mode-cloud.sh` CADDY-01 change emits `127.0.0.1` instead of `localhost` — this is bootstrap-only and Caddyfile SHA drift is treated as WARN by the byte-equivalence test (test-cloud-byte-equivalence.sh:151).
- **D-104-CADDY-PKI-IMPORT (pki imported, not inlined):** PRESERVED — caddy.ts unchanged, `generateLocalCaddyfile:170` still emits `import /etc/caddy/pki-global.conf` first.
- **D-104-RELAY-ZERO-DATA-PLANE (no Server5 in data plane):** PRESERVED — the new `local.provisionHybrid` route is a control-plane call (mirrors the bash sibling's existing Server5 touch which is already inside the D-RELAY-ZERO-DATA-PLANE allowance for "control-plane subdomain mint"). No data-plane paths added.
- **Docker UAT (test-install-sh.sh 12/12):** NOT RE-RUN — Docker UAT is heavy (≥2min) and none of the fixes touch what walk.mjs exercises:
  - CF-01 lives in the Server5 call path that walk.mjs does not reach (test container does not provide CLOUDFLARE_API_TOKEN, so `_provision_hybrid_subdomain` early-exits on the `if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]` guard).
  - CADDY-01 changes `mode-cloud.sh` which is exercised only by the `docker/cloud-regression/` container, not `docker/local-uat/`.
  - PRIV-01 / CTX-01 / FS-01 / WIZ-01 / PROVIDE-01 all live in livinityd, which is not started inside the UAT container (walk.mjs runs install.sh only — livinityd boot is verified statically per VERIFICATION.md row 7).
  - Local vitest is the appropriate verification layer for these fixes: 52/52 PASS (Phase 104 verification report exact count preserved).
- **Vitest coverage:** 52/52 PASS across `local-dns/` + `domain/caddy.test.ts` (8/8 routes.test.ts, 10/10 hybrid-provision.test.ts, 4/4 pki.test.ts, 5/5 dnsmasq-config.test.ts, 25/25 caddy.test.ts). UI source-grep: 17/17 PASS (LocalSetupWizard.test.tsx).

---

_Fixed: 2026-05-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
