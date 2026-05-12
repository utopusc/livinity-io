# Phase 104 UAT Checklist (User-Walked Portion)

> Operator-walked verification of the user-facing acceptance criteria that the Docker
> UAT (Task 1 of plan 104-07) cannot prove automatically. Fill out the checkboxes as
> you walk; commit alongside `UAT-EVIDENCE/apple-walk-<timestamp>/` screenshots.
>
> **Pre-requisite:** Task 1 of plan 104-07 must have already shipped `walk.mjs`. If
> you have Docker Desktop running on Windows, you can additionally run
> `bash docker/local-uat/scripts/test-install-sh.sh` first and review
> `UAT-EVIDENCE/walk-<timestamp>/PASS-FAIL.md` before the Apple walk — but that is
> optional. The Apple-device verification IS REQUIRED for Phase 104 ship.

Operator: ________________________________
Walked: __________________ (ISO 8601 timestamp recommended)
Hybrid subdomain provisioned: ________________________________ (e.g., `ab12cd34.home.livinity.io`)
Sacred SHA verified pre-walk: ________________________________ (must match `f3538e1d811992b782a9bb057d1b7f0a0189f95f`)

---

## Pre-walk gate

- [ ] **Reviewed `UAT-EVIDENCE/walk-*/PASS-FAIL.md` from Task 1 (if Docker Desktop available)**
  - Note: this is OPTIONAL. The user-walked Apple portion is the binding gate. Task 1
    evidence makes diagnostics easier but is not blocking by itself.
- [ ] **All automated ACs PASS or have a documented WARN reason**
  - WARN reasons typically: livinityd not yet wired in UAT container; Caddy
    `local.activate` not yet called; idempotency harness depends on mode handlers.
  - FAIL on AC-104-13 / AC-104-14 / AC-104-15 is a hard block — fix before proceeding.

---

## Real-hardware install (AC-104-1 real path)

- [ ] Ran `sudo CLOUDFLARE_API_TOKEN=<your-token> bash scripts/install.sh --mode hybrid`
      on a fresh Ubuntu 24.04 box (Mini PC OR DigitalOcean droplet OR local VM)
- [ ] `install.sh` exited 0
- [ ] Banner printed the hybrid next-step URL (e.g., `https://livinity.local/setup` or
      the Cloudflare-managed subdomain)
- [ ] No errors in `/var/log/livos-install.log` (or wherever install.sh writes its log)

## Idempotency (AC-104-2 real path)

- [ ] Ran `bash scripts/install.sh --mode hybrid` a SECOND time
- [ ] Second run exited 0
- [ ] No service downtime observed (`systemctl is-active livos liv-core liv-worker liv-memory`
      shows 4 × active throughout)
- [ ] No new files written outside the install footprint (spot-check `ls -lt /etc/caddy/`,
      `/etc/systemd/system/`, `/opt/livos/`)

---

## Multi-tenant on real DNS (AC-104-9 real path)

For each subdomain below, you have already provisioned the user account via the
LivOS Settings UI (bruce admin + alice invite, or equivalent).

- [ ] `bruce.<provisioned-subdomain>` loads bruce's LivOS UI (NOT a Caddy default page,
      NOT a 502, NOT the alice page)
- [ ] `alice.<provisioned-subdomain>` loads alice's LivOS UI (OR a 401 if alice
      hasn't created an account yet — either is acceptable, the routing is what
      matters here)
- [ ] Per-user pages render distinct content (e.g., bruce's avatar is different from
      alice's)

---

## Apple-device verification (AC-104-10)

> The binding acceptance criterion for Phase 104. Hybrid mode requires Let's Encrypt
> certs via Cloudflare DNS-01, and the Apple device must trust the LE intermediate
> chain. Test on every Apple form factor you own; one failure means a re-trust walk.

### iPhone

- [ ] Device model: ____________________ iOS version: ____________________
- [ ] Browsed `https://bruce.<provisioned-subdomain>.home.livinity.io` in mobile Safari
- [ ] Page loaded the LivOS UI (NOT a Safari "Not Secure" interstitial)
- [ ] Address bar shows the lock icon WITHOUT any red strikethrough or warning
- [ ] Tap the lock icon → "Connection is Secure" + cert chain visible
- [ ] Screenshot saved to `UAT-EVIDENCE/apple-walk-<timestamp>/iphone-safari.png`

### iPad

- [ ] Device model: ____________________ iPadOS version: ____________________
- [ ] Browsed `https://bruce.<provisioned-subdomain>.home.livinity.io` in mobile Safari
- [ ] Same green-padlock criteria as iPhone
- [ ] Screenshot saved to `UAT-EVIDENCE/apple-walk-<timestamp>/ipad-safari.png`

### macOS — Safari

- [ ] Device model: ____________________ macOS version: ____________________
- [ ] Browsed `https://bruce.<provisioned-subdomain>.home.livinity.io` in Safari
- [ ] Address bar shows the lock icon
- [ ] Cmd+Click the lock icon → "View Certificate" → chain rooted in Let's Encrypt (NOT
      a self-signed CA)
- [ ] Screenshot saved to `UAT-EVIDENCE/apple-walk-<timestamp>/macos-safari.png`

### macOS — Chrome

- [ ] Same machine as Safari run; navigate to the same URL
- [ ] Chrome address bar shows the lock icon (NOT "Not Secure")
- [ ] Click lock → "Connection is secure" → "Certificate (Valid)"
- [ ] Screenshot saved to `UAT-EVIDENCE/apple-walk-<timestamp>/macos-chrome.png`

---

## D-104-NO-PROD-IMPACT (AC-104-12 real path)

> Verify the existing Mini PC `cloud`-mode deploy is NOT regressed by Phase 104 work.
> This must be done on the actual Mini PC at `bruce@10.69.31.68`, NOT on a fresh box.

- [ ] On Mini PC `bruce@10.69.31.68`: ran `bash /opt/livos/update.sh`
- [ ] `update.sh` exited 0
- [ ] `systemctl is-active livos liv-core liv-worker liv-memory` returns `4 × active`
- [ ] `curl -X POST https://bruce.livinity.io/api/agent/stream -d '{"task":"hello"}'`
      returns SSE chunks (not a 404/502/timeout)
- [ ] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` verified on Mini PC
      via `git hash-object /opt/liv/packages/core/src/sdk-agent-runner.ts`
- [ ] No new directives in `/etc/caddy/Caddyfile` (no `pki { ca liv-local { ... } }`
      block, no `import /etc/caddy/pki-global.conf`, no `tls internal`)
- [ ] `/etc/dnsmasq.d/livinity.conf` does NOT exist (cloud mode never installs dnsmasq)

## D-104-RELAY-ZERO-DATA-PLANE (AC-104-15 real path)

> Capture LAN-direct traffic with real tcpdump on the Mini PC (NOT in the Docker UAT)
> while browsing from a real Apple device. The UAT container's tcpdump assertion
> proves the in-container behavior; this proves the on-Mini-PC behavior in hybrid mode.

- [ ] On Mini PC: started `sudo tcpdump -i any -nn host 45.137.194.102 -w /tmp/uat-relay.pcap` in a background shell
- [ ] Browsed `https://bruce.<provisioned-subdomain>.home.livinity.io` from a real
      Apple device for ~30 seconds (load page, click around, watch tail of agent stream)
- [ ] Stopped the tcpdump (Ctrl+C)
- [ ] Ran `sudo tcpdump -r /tmp/uat-relay.pcap | wc -l` → **must equal 0**
- [ ] tcpdump output (or empty result) saved to `UAT-EVIDENCE/real-tcpdump.txt`

> Note: Server5 (45.137.194.102) is the relay host. Hybrid mode MUST NOT route any
> data-plane traffic through it. Acceptable Server5 touches: (a) DNS zone hosting
> for `home.livinity.io` — that is the user's resolver talking to public DNS, not
> their browser talking to Server5; (b) one-time invite redemption; (c) periodic
> ACME DNS-01 control-plane. None of these fire during normal browsing.

---

## Sign-off

- [ ] All automated ACs (Task 1 of plan 104-07) PASS or have a documented WARN
      reason that does not block ship
- [ ] All real-hardware ACs above PASS
- [ ] All four Apple-device screenshots committed under `UAT-EVIDENCE/apple-walk-<timestamp>/`
- [ ] `real-tcpdump.txt` committed under `UAT-EVIDENCE/`
- [ ] Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` verified pre + post the
      entire walk on BOTH the fresh-install box AND the Mini PC
- [ ] **Phase 104 ready to ship: Y / N**

Signed-off by: ____________________________________________
Date: _____________________________________________________

---

## Quick AC ID reference (cross-link to 104-VALIDATION.md)

| AC ID      | Where verified                                      |
| ---------- | --------------------------------------------------- |
| AC-104-1   | This checklist (real-hardware) + walk.mjs (Docker)  |
| AC-104-2   | This checklist (real-hardware) + walk.mjs (Docker)  |
| AC-104-3   | Plan 104-06 cloud-regression container              |
| AC-104-4   | walk.mjs (Docker)                                   |
| AC-104-5   | walk.mjs (Docker)                                   |
| AC-104-6   | walk.mjs (Docker) — local-lan mode only             |
| AC-104-7   | walk.mjs (Docker) — local-lan mode only             |
| AC-104-8   | Plan 104-03 vitest unit tests (regenerator)         |
| AC-104-9   | walk.mjs (Docker) + this checklist (real-DNS path)  |
| AC-104-10  | **THIS CHECKLIST** (Apple devices — required)       |
| AC-104-11  | walk.mjs (Docker)                                   |
| AC-104-12  | Plan 104-06 + this checklist (Mini PC update.sh)    |
| AC-104-13  | walk.mjs (Docker) — Chrome DevTools CDP             |
| AC-104-14  | walk.mjs (Docker) — noVNC                           |
| AC-104-15  | walk.mjs (Docker) + this checklist (real tcpdump)   |
| AC-104-16  | Plan 104-02 — `install.sh --help` + bad-mode check  |

---

*Phase: 104-local-install-and-docker-uat — Plan: 07 — Task 2 (checkpoint:human-verify)*
*Generated by Task 1 of plan 104-07. Operator fills out + commits when walked.*
