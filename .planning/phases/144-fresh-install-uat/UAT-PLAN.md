# Phase 144 — Fresh-Install UAT for Phases 141 + 142 + 143

**Status:** READY TO EXECUTE
**Created:** 2026-05-17
**Sacred SHA:** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved
**Predecessors:** Phases 141 (multi-tenant install hardening), 142 (single-mode UX),
143 (portal naming sweep) — all CODE-COMPLETE + auto-deployed but never
walked end-to-end from a clean Mini PC. Phase 144 closes that loop.

---

## Why this phase exists

Phase 141-143 shipped 16 commits across three coherent themes. Every commit
went through update.sh on the SAME socinity Mini PC that hosted the
original-bug-discovery session. That meant every UAT had partial back-compat
state hanging around (e.g., `livos:domain:local_mode=hybrid` in Redis
inherited from Phase 141 era; a manually-prefixed Caddyfile; pre-141-09
cloudflared.service with an in-place sed-fixed token; chrome profile
cruft from the bug-discovery walk). Phase 144 wipes the Mini PC to zero state
(see `MINI-PC-ZERO-STATE.md`) and walks every code-path the three phases
shipped, fresh.

The Server5 + Cloudflare side is **deliberately not wiped** — that exercises
the realistic "re-install on previously-known user" recovery path that
Phase 141-09 specifically targeted.

---

## Test environment

| Layer | Address / value |
|---|---|
| Local repo HEAD | `7b0d11e7 feat(143/portal-rename): …` (push to `origin/master` already done) |
| Mini PC | `bruce@10.69.31.68` (ZeroTier, unstable — detach long ops with `nohup`) |
| Server5 | `root@45.137.194.102` (`livinity.io`, hosts API + landing + relay + marketplace) |
| Test user | `socinity` — Server5 row + CF tunnel still live; api key plaintext `liv_k_phase140socinityRESET12` (hashed in api_keys table) |
| CF tunnel id | `633ab1f5-3f10-4d62-a3a7-50d8eace247c` |
| Expected URL post-install | `https://socinity.livinity.io` (apex) + `https://{app}-socinity.livinity.io` (per app) |

## Required tools

- `ssh` with key `C:/Users/hello/Desktop/Projects/contabo/pem/minipc`
- `curl` from the local Windows host
- A browser to walk the LivOS UI + Server5 dashboard
- (Optional but useful) `chrome-devtools-mcp` for headless DOM probing

---

## How to run this UAT

Walk the sections **in order**. Each section is self-contained — copy the
SSH/curl block, run it, compare output against the **Expected** block. Mark
**PASS** / **FAIL** in the running test report at `UAT-REPORT.md` (create
empty when starting). On failure, follow the **If it fails** hint at the
end of the section.

The fastest path through is roughly:
- A (pre-flight): 2 minutes
- B (fresh install): ~5 minutes (mostly waiting for update.sh + service boot)
- C–E (Phase 141/142/143 surface): 5 minutes
- F (App install): 3 minutes
- G (Subdomain rename): 3 minutes
- H (Dashboard online): 2 minutes
- I (CSP allowlist): 2 minutes
- J (factory-reset.sh): 1 minute (KNOWN-FAIL — see note)
- K–L (regression replay + report): 5 minutes

**~30 minutes total** if every section passes first try.

---

## Section A — Pre-flight Sanity Check

### A1. Mini PC at zero state

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 '
  echo === SERVICES === ;
  for s in livos liv-core liv-worker liv-memory cloudflared ; do echo "  $s: $(sudo systemctl is-active $s.service 2>&1)" ; done ;
  echo === DIRS === ;
  for d in /opt/livos /opt/liv /etc/livos /var/lib/livos ; do sudo ls -d $d 2>&1 | sed "s|^|  |" ; done ;
  echo === PG === ;
  sudo -u postgres psql -d livos -c "\dt" 2>&1 | head -2'
```

**Expected:**
```
=== SERVICES ===
  livos: inactive
  liv-core: inactive
  liv-worker: inactive
  liv-memory: inactive
  cloudflared: inactive
=== DIRS ===
  ls: cannot access /opt/livos: No such file or directory
  ls: cannot access /opt/liv: No such file or directory
  ls: cannot access /etc/livos: No such file or directory
  ls: cannot access /var/lib/livos: No such file or directory
=== PG ===
Did not find any relations.
```

**If it fails:** Mini PC not at zero state. Re-run the wipe script
(`/tmp/mini-pc-full-wipe.sh` still on the box, or regenerate from
`MINI-PC-ZERO-STATE.md`).

### A2. Server5 socinity row + CF tunnel intact

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master root@45.137.194.102 '
  echo === USER ROW === ;
  sudo -u postgres psql -d platform -c "SELECT username, email_verified, cf_tunnel_id IS NOT NULL AS has_cf FROM users WHERE username='\''socinity'\'';" ;
  echo === API KEY === ;
  sudo -u postgres psql -d platform -c "SELECT u.username, k.prefix FROM api_keys k JOIN users u ON u.id=k.user_id WHERE u.username='\''socinity'\'';"'
```

**Expected:** one row each, `email_verified=t`, `has_cf=t`, `prefix=liv_k_phase140`.

**If it fails:** Server5 state drifted. Either re-create socinity (full
register flow) or pick a different test username and update every command
below.

### A3. Public URLs return 5xx (no Mini PC behind)

```bash
curl -s -o /dev/null -w "  socinity        %{http_code}\n" --max-time 8 https://socinity.livinity.io
curl -s -o /dev/null -w "  n8n-socinity    %{http_code}\n" --max-time 8 https://n8n-socinity.livinity.io
```

**Expected:** Both return `530` or `502` (CF tunnel origin unreachable —
proves the wipe really took the cloudflared connector offline; CF still has
the DNS + ingress config, but nothing's answering on the LAN side).

---

## Section B — Fresh Install From Scratch

### B1. Run the one-liner

> This kicks off in the foreground because `install.sh` exits 0 when the
> entire LivOS service set is up — usually 3–5 minutes on this Mini PC.
> ZeroTier may drop mid-install; detach if you want a survival guarantee:
> `... | sudo bash &` then re-attach SSH every 30s.

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 \
  'curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --subdomain socinity --api-key liv_k_phase140socinityRESET12 2>&1 | tee /tmp/install-144.log | tail -30'
```

**Expected last 5 lines:**
```
[OK] livinityd healthy at http://127.0.0.1:8080
[OK] Caddy reloaded
================================================================
  LivOS install (mode=portal) COMPLETE
================================================================
```

**If it fails:** read `/tmp/install-144.log` start-to-end, look for the
first red `[FAIL]` line. Most common failure modes:
- "Tunnel token: missing" → /api/me/tunnel-token endpoint not responding (Server5 web down — see Section A2)
- "PostgreSQL connection refused" → wait 30s + re-run (system PG slow to settle)
- "deployed_sha mismatch" → GitHub fetch broke; re-run

### B2. All 6 services active

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 \
  'for s in livos liv-core liv-worker liv-memory caddy cloudflared ; do echo "  $s: $(sudo systemctl is-active $s)" ; done'
```

**Expected:** all six lines say `active`.

### B3. install.sh banner shows portal mode (Phase 142-02)

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 \
  'grep -E "Mode: portal|mode=portal|UI: open" /tmp/install-144.log'
```

**Expected:** at least one match for `Mode: portal` (from parse-cli's
`info "Mode: $MODE"`) AND `LivOS install (mode=portal) COMPLETE` from the
banner.

### B4. Smoke test trio (the first proof the install is end-to-end)

```bash
curl -s -o /dev/null -w "  apex                   %{http_code}\n" --max-time 10 https://socinity.livinity.io
curl -s -o /dev/null -w "  /trpc/system.status    %{http_code}\n" --max-time 10 https://socinity.livinity.io/trpc/system.status
```

**Expected:** both `200`.

**If it fails:**
- `308` → Caddyfile missing `http://` prefix → walk Section C2's recovery
- `530` → cloudflared not connected → `sudo journalctl -u cloudflared --since '2 min ago' --no-pager` for clues
- `502` → livinityd not on `:8080` → `sudo systemctl status livos`

---

## Section C — Phase 141 features in production

### C1. Phase 141-01 boot drain log

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 \
  'sudo journalctl -u livos --since "10 min ago" --no-pager | grep -E "Phase 141-01|drain-install-pending"'
```

**Expected:** at least 3 lines:
```
drain-install-pending: applied livos:domain:local_mode=portal
drain-install-pending: applied livos:domain:tunnel_domain=socinity.livinity.io
drain-install-pending: applied livos:domain:host_ip=…
Phase 141-01: drained install-pending Redis seeds (applied=N skipped=M errored=0)
```

The applied-count proves the boot drainer fired. `errored=0` is the must-have.

### C2. Phase 141-03 Caddyfile hyphen-pattern (apex only — apps appear in Section F)

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 \
  'sudo cat /etc/caddy/Caddyfile'
```

**Expected:** every host block prefixed with `http://`, e.g.
```
http://socinity.livinity.io {
    reverse_proxy 127.0.0.1:8080 { ... }
}
```

No bare host blocks. (Apps will appear in this file after Section F.)

### C3. Phase 142-02 `local_mode=portal` written by fresh install

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 \
  'REDIS_PASS=$(sudo grep -oP "REDIS_URL=redis://[^:]*:\K[^@]+" /opt/livos/.env | head -1) ;
   sudo redis-cli -a "$REDIS_PASS" --no-auth-warning get livos:domain:local_mode'
```

**Expected:** literal string `portal` (Phase 142-02 normalization — fresh
install writes the new canonical value, NOT legacy `hybrid`).

### C4. Phase 141-09 cloudflared token reconcile (defensive — there shouldn't be a previous unit to reconcile against on a fresh box)

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 \
  'EXEC_TOKEN=$(sudo grep -oE -- "--token [A-Za-z0-9_=.-]+" /etc/systemd/system/cloudflared.service | head -1 | awk "{print \$2}") ;
   SECRETS_TOKEN=$(sudo cat /etc/livos/secrets/cf-tunnel-token) ;
   if [[ "$EXEC_TOKEN" == "$SECRETS_TOKEN" ]] ; then echo "OK: tokens match" ; else echo "FAIL: drift" ; fi'
```

**Expected:** `OK: tokens match`.

### C5. Phase 141-06 CSP allowlist (open-meteo)

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null bruce@10.69.31.68 \
  'sudo grep -A2 connectSrc /opt/livos/packages/livinityd/source/modules/server/index.ts | head -10'
```

**Expected:** the connect-src array includes `https://*.open-meteo.com`. Browser
validation happens in Section I.

### C6. Phase 141-07 dashboard online via CF Tunnel API (Server5-side, not Mini PC)

Open `https://livinity.io/dashboard` in a browser, log in as socinity. The
header card should say **"Online · ready when you are"** + the URL link to
`https://socinity.livinity.io`. If it says "asleep", wait 30s for the
30-second CF-Tunnel-connection cache to populate.

---

## Section D — Phase 142 CLI surface

### D1. `--mode local-lan` retired

```bash
ssh -i ... bruce@10.69.31.68 'bash /opt/livos/scripts/install.sh --mode local-lan 2>&1 | tail -5'
```

**Expected:** exit 64 + the line:
```
ERROR: --mode local-lan was retired in Phase 142-01.
```

### D2. `--mode cloud` Coming Soon

```bash
ssh -i ... bruce@10.69.31.68 'bash /opt/livos/scripts/install.sh --mode cloud 2>&1 | tail -5'
```

**Expected:** exit 64 + the line:
```
ERROR: --mode cloud is Coming Soon — not yet available in this LivOS build.
```

### D3. `--mode hybrid` and `--mode tunnel` normalize to portal silently

```bash
ssh -i ... bruce@10.69.31.68 'bash /opt/livos/scripts/install.sh --mode hybrid --domain foo.example.com --cf-tunnel-token faketok 2>&1 | grep -E "renamed → portal|Mode: portal"'
```

**Expected:** at least one line — either
```
--mode hybrid renamed → portal (Phase 142-02). Treating as --mode portal.
```
OR
```
Mode: portal
```

Repeat with `--mode tunnel` — same expectation.

### D4. `--help` text portal-first

```bash
ssh -i ... bruce@10.69.31.68 'bash /opt/livos/scripts/install.sh --help 2>&1 | sed -n "/^Modes:/,/^Tunnel-/p" | head -15'
```

**Expected:** the Modes section opens with `portal     DEFAULT …`, followed
by hybrid/tunnel as "Back-compat alias", cloud as "Coming Soon", and
local-lan marked "RETIRED (Phase 142-01)".

---

## Section E — Phase 143 wire-rename surface

### E1. tRPC canonical procedures exist

```bash
ssh -i ... bruce@10.69.31.68 'curl -s -X POST http://127.0.0.1:8080/trpc/local.activatePortal \
  -H "Content-Type: application/json" \
  -d "{}" 2>&1 | head -3'
```

**Expected:** a tRPC error like `{"error":{"json":{"message":"…","code":-32600 …}}}` — NOT a 404 or "procedure not found". The procedure responds (rejects without proper auth/input), proving it's wired into the router.

### E2. Legacy aliases also exist (back-compat)

```bash
ssh -i ... bruce@10.69.31.68 'curl -s -X POST http://127.0.0.1:8080/trpc/local.activateHybrid \
  -H "Content-Type: application/json" \
  -d "{}" 2>&1 | head -3'
```

**Expected:** SAME shape as E1 (alias procedure responds identically).

### E3. `/api/local/ca.crt` returns HTTP 410 Gone with Phase-142 hint

```bash
ssh -i ... bruce@10.69.31.68 'curl -s -o /tmp/ca-resp.json -w "  HTTP %{http_code}\n" http://localhost:8080/api/local/ca.crt ; cat /tmp/ca-resp.json'
```

**Expected:**
```
  HTTP 410
{"error":"local-lan mode retired (Phase 142-01)","hint":"Use --mode portal (Phase 142-02) — Cloudflare-issued cert at the edge"}
```

---

## Section F — App Install (n8n)

### F1. Install n8n from the App Store

Open `https://socinity.livinity.io` in the browser → App Store →
**n8n** → click **Install**. Fill in admin username/password when prompted
(any values). Wait for the install spinner to finish (~30–60s).

### F2. Server5 minted the hyphen-pattern subdomain

```bash
ssh -i ... root@45.137.194.102 \
  'sudo -u postgres psql -d platform -c "SELECT user_id, app_slug, subdomain, dns_record_id FROM user_app_subdomains WHERE app_slug = '\''n8n'\'';"'
```

**Expected:** one row with `subdomain = 'n8n-socinity'` (Phase 140
hyphen-pattern).

### F3. Caddyfile carries the canonical host

```bash
ssh -i ... bruce@10.69.31.68 'sudo grep "n8n" /etc/caddy/Caddyfile'
```

**Expected:**
```
http://n8n-socinity.livinity.io {
```
**Not** `http://n8n.socinity.livinity.io {` (the old Phase 140-pre-141-03
bug). This is the Phase 141-03 fix in action.

### F4. Redis subdomain entry includes the `host` field

```bash
ssh -i ... bruce@10.69.31.68 \
  'REDIS_PASS=$(sudo grep -oP "REDIS_URL=redis://[^:]*:\K[^@]+" /opt/livos/.env | head -1) ;
   sudo redis-cli -a "$REDIS_PASS" --no-auth-warning get livos:domain:subdomains | python3 -m json.tool 2>/dev/null || sudo redis-cli -a "$REDIS_PASS" --no-auth-warning get livos:domain:subdomains'
```

**Expected:** the JSON entry for n8n includes `"host": "n8n-socinity.livinity.io"`
(Phase 141-03 capture from `provisionAppSubdomain` return value).

### F5. Public URL serves the n8n login

```bash
curl -s -o /dev/null -w "  n8n-socinity    %{http_code}\n" --max-time 10 https://n8n-socinity.livinity.io
```

**Expected:** `200` (n8n login screen — or `401` if basic auth is the
gatekeeper; both prove the route works).

### F6. Settings UI shows the hyphen-pattern URL (Phase 141-04)

Navigate to LivOS settings (the gear icon on the dock) → **n8n** → **Public
Access**. The displayed URL must read `n8n-socinity.livinity.io` (hyphen),
NOT `n8n.socinity.livinity.io` (dot). The link should open the running
n8n in a new tab and serve `200`.

---

## Section G — Subdomain Rename (Phase 141-05)

### G1. Right-click n8n → Change subdomain

In the Settings → Public Access pane, click **Change subdomain**. Type
`workflow` in the input. Click **Update**.

### G2. Server5 logs show DELETE then POST

```bash
ssh -i ... root@45.137.194.102 'pm2 logs web --lines 20 --nostream 2>&1 | grep -E "app-subdomain"'
```

**Expected:** two log lines in order — a `DELETE /api/me/app-subdomain/n8n`
(or `/app-subdomain/{old-slug}`) followed by `POST /api/me/app-subdomain`
with the new slug.

### G3. New URL serves; old stops resolving (~30s for CF propagation)

```bash
curl -s -o /dev/null -w "  workflow-socinity %{http_code}\n" --max-time 10 https://workflow-socinity.livinity.io
curl -s -o /dev/null -w "  n8n-socinity      %{http_code}\n" --max-time 10 https://n8n-socinity.livinity.io
```

**Expected after ~30s:** `workflow-socinity → 200`, `n8n-socinity → 404` or
similar non-200.

---

## Section H — Dashboard Online via CF Tunnel API (Phase 141-07)

### H1. Verify "Online" badge

Open `https://livinity.io/dashboard` (still logged in as socinity). The
top card should say **"Online · ready when you are"** with the link to
`https://socinity.livinity.io`. Take a screenshot.

### H2. Stop cloudflared briefly → expect "asleep"

```bash
ssh -i ... bruce@10.69.31.68 'sudo systemctl stop cloudflared.service'
```

Wait 35 seconds (just past the 30s CF-connection cache in dashboard route).
Refresh the dashboard. **Expected:** badge flips to "asleep".

### H3. Restart cloudflared → expect "Online" again

```bash
ssh -i ... bruce@10.69.31.68 'sudo systemctl start cloudflared.service ; sleep 5 ; sudo systemctl is-active cloudflared'
```

Wait another 35 seconds. Refresh. **Expected:** badge back to "Online".

---

## Section I — CSP Allowlist for widgets (Phase 141-06)

### I1. Add the weather widget

In the LivOS UI top bar, hover the location/temperature area until the
weather widget appears. (If it doesn't auto-show, open Settings → Widgets →
enable Weather.)

### I2. DevTools Console clean of CSP violations

Open the browser DevTools (`F12`) → Console tab. Filter for "CSP" or
"Content Security Policy". **Expected:** zero violations for
`geocoding-api.open-meteo.com` or `api.open-meteo.com`.

If you see a violation like
`Refused to connect to 'https://geocoding-api.open-meteo.com/...'` — the
allowlist regressed; check the connect-src array in
`livos/packages/livinityd/source/modules/server/index.ts:283-ish`.

### I3. Widget renders a temperature

The widget should display a city name (or "unknown") + a temperature
number. No React error overlay. **Expected:** valid rendered widget.

---

## Section J — Factory-reset.sh availability (KNOWN-FAIL)

> ⚠️ This section is **expected to fail** in this UAT run. It surfaces a
> real-but-bounded Phase 144+ carryover: `update.sh` doesn't rsync the
> `scripts/install/` directory to the Mini PC, so `factory-reset.sh` ships
> in the repo but NOT on disk. We catch this here so it's documented, not
> hidden.

### J1. Probe for the script

```bash
ssh -i ... bruce@10.69.31.68 'sudo ls -la /opt/livos/scripts/install/factory-reset.sh 2>&1'
```

**Expected (this UAT run):**
```
ls: cannot access '/opt/livos/scripts/install/factory-reset.sh': No such file or directory
```

**Action:** add a Phase 144+ item to `update.sh` so it rsyncs `scripts/install/`
into `/opt/livos/scripts/install/`. The script source itself is correct;
only the deploy plumbing is missing.

---

## Section K — Re-install regression replay (Phase 141-09)

> Optional but high-value. Exercises the cloudflared-token-reconcile bug
> that surfaced the original socinity bug-discovery session.

The full version needs a second Server5 user account — skip if you don't
have one ready. Lighter version:

### K1. Re-run install.sh with the same args

```bash
ssh -i ... bruce@10.69.31.68 \
  'curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --subdomain socinity --api-key liv_k_phase140socinityRESET12 2>&1 | tail -10'
```

**Expected:** install completes cleanly, `LivOS install (mode=portal) COMPLETE`.
The Phase 141-09 reconcile branch SHOULD fire ("Phase 141-09: cloudflared.service
token drift detected — rewriting unit") if the token differs from the
existing unit, OR silently no-op if it matches.

### K2. Smoke test trio post-re-install

Same as B4 — all three URLs (apex, /trpc, n8n-socinity OR workflow-socinity
depending on whether you did Section G) should return `200`.

---

## Section L — Final smoke summary

```bash
USER=socinity
APP=workflow   # or n8n if you skipped Section G
for url in \
  https://$USER.livinity.io \
  https://$USER.livinity.io/trpc/system.status \
  https://$APP-$USER.livinity.io ; do
  printf "  %-60s " "$url"
  curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 "$url"
done
```

**Expected:** three `200`s.

---

## Test report template (`UAT-REPORT.md`)

Copy this skeleton into `UAT-REPORT.md` as you walk the sections. Mark each
sub-section PASS/FAIL with a one-line note.

```markdown
# Phase 144 UAT Report — {date}

**Tester:** {name}
**Mini PC:** 10.69.31.68
**Repo HEAD:** {git rev-parse --short HEAD}

## Results

| Section | Sub | Status | Notes |
|---|---|---|---|
| A | A1 | ☐ | Mini PC zero state |
| A | A2 | ☐ | Server5 socinity intact |
| A | A3 | ☐ | Public URLs return 5xx pre-install |
| B | B1 | ☐ | install.sh exit 0 |
| B | B2 | ☐ | All 6 services active |
| B | B3 | ☐ | Portal mode banner |
| B | B4 | ☐ | Smoke trio 200/200 |
| C | C1 | ☐ | 141-01 drain log |
| C | C2 | ☐ | 141-03 Caddyfile prefix |
| C | C3 | ☐ | 142-02 local_mode=portal |
| C | C4 | ☐ | 141-09 token match |
| C | C5 | ☐ | 141-06 CSP source has open-meteo |
| C | C6 | ☐ | 141-07 dashboard Online badge |
| D | D1 | ☐ | local-lan retired |
| D | D2 | ☐ | cloud Coming Soon |
| D | D3 | ☐ | hybrid/tunnel normalize |
| D | D4 | ☐ | --help portal-first |
| E | E1 | ☐ | activatePortal procedure live |
| E | E2 | ☐ | activateHybrid alias live |
| E | E3 | ☐ | /api/local/ca.crt → 410 Gone |
| F | F1 | ☐ | n8n install via App Store |
| F | F2 | ☐ | Server5 user_app_subdomains row |
| F | F3 | ☐ | Caddyfile n8n-socinity host |
| F | F4 | ☐ | Redis subdomains.host populated |
| F | F5 | ☐ | n8n public URL 200 |
| F | F6 | ☐ | Settings UI hyphen-pattern |
| G | G1 | ☐ | Change-subdomain mutation |
| G | G2 | ☐ | Server5 DELETE+POST logs |
| G | G3 | ☐ | New URL 200, old URL non-200 |
| H | H1 | ☐ | Dashboard Online |
| H | H2 | ☐ | Stop cloudflared → asleep |
| H | H3 | ☐ | Restart → Online |
| I | I1 | ☐ | Weather widget rendered |
| I | I2 | ☐ | No CSP violations console |
| I | I3 | ☐ | Temperature displays |
| J | J1 | ⚠ | factory-reset.sh missing on disk (expected; carryover) |
| K | K1 | ☐ | Re-install clean |
| K | K2 | ☐ | Post-re-install smoke trio |
| L | L1 | ☐ | Final 3×200 smoke |

## Carryover (Phase 144+ items surfaced)

1. update.sh should rsync `scripts/install/` → `/opt/livos/scripts/install/`
   so `factory-reset.sh` is available on disk after install (Section J).
2. {add any other failure-derived items here}

## Outstanding issues

{any bug surfaced during UAT that isn't covered by the section's
"If it fails" hint}
```

---

## Sacred SHA invariant

This UAT plan + its companion docs all carry
`f3538e1d811992b782a9bb057d1b7f0a0189f95f` in any commit-attribution. The
plan itself is not a commit per se but the `.planning/` artifacts will be
git-add-`-f`ed alongside the Phase 144 ROADMAP entry.

---

## Estimated time

- Quick pass (skip Section G + K, skim browser steps): **15 minutes**
- Thorough pass (every section, careful screenshots): **45–60 minutes**
- If install.sh fails on first try: add ~10 minutes for triage

---

## After UAT completes

Run `/gsd-autonomous` (or just say "next phase") to:

1. Auto-write a Phase 144 SUMMARY.md based on the report
2. Carry over the surfaced fixes (update.sh rsync of install scripts +
   anything else) as Phase 145 entries
3. Flip Phase 144 to ✅ in ROADMAP.md
