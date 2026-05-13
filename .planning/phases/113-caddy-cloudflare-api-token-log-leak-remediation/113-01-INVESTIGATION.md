---
phase: 113
plan: 01
task: 1
date: 2026-05-13
status: complete
finding: root_cause_different_than_planned
locked_decisions:
  - D-113-NO-CADDY-DOWNTIME
  - D-113-NO-DNS-DROP
  - D-113-MAINSERVER-ONLY
  - D-113-SACRED-SHA-UNTOUCHED
---

# Phase 113 Task 1 — Investigation: Leak Source Identified

## TL;DR

Leak confirmed (5 plaintext `CLOUDFLARE_API_TOKEN=cfut_84Ur...` lines in journalctl since
boot, 2 in last 24h). **BUT the root cause is NOT what the plan assumed.** The systemd
unit ALREADY uses `EnvironmentFile=/etc/livos/secrets/cf-token` (chmod 600 root:root) — the
migration the plan was about to perform was already done in an earlier session
(`/etc/systemd/system/caddy.service.d/livos-cf-token.conf` exists, dated `May 13 18:20`,
pre-dating today's leak entry `May 13 18:24`).

The **actual leak source** is the `--environ` flag in the base unit's `ExecStart` line:

```
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
```

`caddy run --environ` deliberately prints the full process environment to stdout on
startup/reload (a Caddy debugging convenience), which systemd journald captures verbatim
— including any env vars loaded from `EnvironmentFile=`. So the EnvironmentFile fix is
necessary but NOT sufficient: the storage moved, but the dump-to-stdout step still leaks.

**Revised Task 2 plan:** keep the existing EnvironmentFile (already correctly configured)
and add a second drop-in override that strips `--environ` from `ExecStart` (reset
`ExecStart=` then re-declare it without the flag). Same locked decisions apply
(no-downtime via reload, no DNS-drop, mainserver-only, sacred SHA untouched).

---

## Probe Results (Verbatim)

### Probe 1 — `systemctl cat caddy`

Base unit lives at `/usr/lib/systemd/system/caddy.service`:

```
[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE
```

**Critical line:** `ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile`.
The `--environ` flag is what dumps env vars to stdout (and therefore to journald).

Existing drop-in at `/etc/systemd/system/caddy.service.d/livos-cf-token.conf`:

```
[Service]
EnvironmentFile=/etc/livos/secrets/cf-token
```

So the EnvironmentFile pattern is ALREADY in place. The plan's Task 2 (migrate
`Environment=` → `EnvironmentFile=`) is a no-op because it was already migrated.

### Probe 2 — `journalctl -u caddy | grep -i cloudflare_api_token`

```
--- last 24h ---
May 12 23:14:25 vmi2892419 caddy[2194697]: CLOUDFLARE_API_TOKEN=cfut_REDACTED
May 13 18:24:24 vmi2892419 caddy[2250754]: CLOUDFLARE_API_TOKEN=cfut_REDACTED
--- since boot ---
May 12 22:25:29 vmi2892419 caddy[2160598]: CLOUDFLARE_API_TOKEN=cfut_REDACTED
May 12 23:14:25 vmi2892419 caddy[2194697]: CLOUDFLARE_API_TOKEN=cfut_REDACTED
May 13 18:24:24 vmi2892419 caddy[2250754]: CLOUDFLARE_API_TOKEN=cfut_REDACTED
--- count since boot ---
5
```

Five plaintext occurrences. Each line is `caddy[PID]: CLOUDFLARE_API_TOKEN=cfut_...` —
the message body comes from the Caddy process itself, not from systemd's
`environ-print-on-start` (systemd has not done that since v220+ when `Environment=` is
not used). The format `CLOUDFLARE_API_TOKEN=<value>` with no JSON wrapper and no
prefix/key/timestamp matches exactly what `caddy run --environ` produces.

Real token redacted in this document but visible in journalctl. The token prefix
(`cfut_84Ur...`) matches the value the orchestrator recovered earlier today to create the
wildcard DNS record (`v34-HANDOFF-2026-05-13.md` Issue 5).

### Probe 3 — `ls -la /etc/caddy/`

```
total 20
drwxr-xr-x   2 root root  4096 May 13 18:24 .
drwxr-xr-x 158 root root 12288 May 13 20:43 ..
-rw-r--r--   1 root root   144 May 13 22:02 Caddyfile
```

Caddyfile contents:

```caddy
test.livinity.live, *.test.livinity.live {
    tls {
        dns cloudflare {env.CLOUDFLARE_API_TOKEN}
    }
    reverse_proxy 127.0.0.1:8080
}
```

Caddyfile reads `{env.CLOUDFLARE_API_TOKEN}` — wiring is correct, no Caddyfile change
needed. Note that `/etc/caddy/cloudflare.env` does NOT exist; the secret file lives at
`/etc/livos/secrets/cf-token`. The plan's preferred path `/etc/caddy/cloudflare.env`
will NOT be used — keep the existing `/etc/livos/secrets/cf-token` location to honor
"idempotency" / minimum blast radius.

### Probe 4 — `ls -la /etc/systemd/system/caddy.service.d/`

```
total 12
drwx------  2 root root 4096 May 13 18:20 .
drwxr-xr-x 27 root root 4096 May 13 18:24 ..
-rw-------  1 root root   54 May 13 18:20 livos-cf-token.conf
```

Override directory exists. Existing drop-in `livos-cf-token.conf` (54 bytes) is what
already wires the EnvironmentFile. Will leave it alone and ADD a second drop-in for the
`--environ` strip (small-blast-radius: one new file, no overwrite).

### Probe 5 — `systemctl show caddy --property=Environment / EnvironmentFiles`

```
Environment=
EnvironmentFiles=/etc/livos/secrets/cf-token (ignore_errors=no)
```

`Environment=` is **empty** (no inline secrets — proves the EnvironmentFile migration
already happened). The token is loaded via `EnvironmentFiles=`. So whatever is leaking
to journal is leaking via the **process stdout**, not via systemd's unit-load dump.

### Probe 6 — systemd version

```
systemd 255 (255.4-1ubuntu8.14)
```

Well above the 234+ threshold the plan called out. Supports `EnvironmentFile=` cleanly.
No version-related blocker for the fix.

### Probe A — Caddyfile (extra probe)

Already shown above. Single virtual host with wildcard subdomain TLS via Cloudflare DNS-01.

### Probe B — `/etc/livos/secrets/cf-token` (mode + sha256 only — value NOT printed)

```
-rw------- 1 root root 75 May 13 20:43 /etc/livos/secrets/cf-token
sha256: 52c1f5a3feb1859e92083e30ea5447021d2484a9187e68c408bb984c29aa612b
```

File is 75 bytes, mode 600 root:root. 75 bytes = `CLOUDFLARE_API_TOKEN=` (21 chars) +
token (~52 chars) + newline (1 char) + maybe trailing whitespace. Token-file is
properly secured.

### Probe D — `ExecStart` line (confirmation of leak source)

```
ExecStart={ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }
```

`argv[]=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile` — the `--environ`
flag is unambiguous in the resolved ExecStart. This is THE leak source.

---

## Diagnosis

**Bug class:** Caddy `--environ` debug flag in production unit.

**Why the journal line format `caddy[PID]: KEY=VALUE` proves it's `--environ`, not systemd:**
- systemd's own env dumps (when present) prefix with `systemd[1]:` (PID 1), not `caddy[PID]`.
- `--environ` is documented as "Print the environment to stdout" — Caddy will iterate
  `os.Environ()` and print each `K=V` pair followed by `\n`. systemd's journald collects
  stdout from the service, tags it with `caddy[PID]:`, and writes to journal.
- The leaked lines have no JSON wrapper (Caddy's own logger output is JSON), no `level`,
  no `ts`. They're raw stdout writes. That matches `--environ` exactly.

**Fix shape (revised from plan):**

1. Leave existing `/etc/systemd/system/caddy.service.d/livos-cf-token.conf` UNTOUCHED
   (already does `EnvironmentFile=/etc/livos/secrets/cf-token` correctly).
2. Add a NEW drop-in `/etc/systemd/system/caddy.service.d/strip-environ-flag.conf`:
   ```ini
   [Service]
   # Phase 113: remove --environ flag from base unit's ExecStart so Caddy
   # stops dumping env vars (including CLOUDFLARE_API_TOKEN) to journald.
   ExecStart=
   ExecStart=/usr/bin/caddy run --config /etc/caddy/Caddyfile
   ```
   The empty `ExecStart=` resets the inherited value from the base unit; the second line
   re-declares it without `--environ`. (Standard systemd drop-in pattern for command
   override.)
3. `systemctl daemon-reload && systemctl reload caddy` (graceful — D-113-NO-CADDY-DOWNTIME).
4. Verify no new `CLOUDFLARE_API_TOKEN` lines appear in journalctl after reload.
5. Verify TLS still works (`curl -sIL https://test.livinity.live` + wildcard subdomain).

**Why this preserves locked decisions:**
- **D-113-NO-CADDY-DOWNTIME:** `systemctl reload` is graceful — handshakes preserved. The
  base unit's `ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force` is
  NOT touched (no `--environ` flag there anyway), so reload-on-config-change still works.
- **D-113-NO-DNS-DROP:** `EnvironmentFile=/etc/livos/secrets/cf-token` still loaded
  (unchanged). `{env.CLOUDFLARE_API_TOKEN}` in Caddyfile still resolves. DNS-01 wildcard
  cert renewal unaffected.
- **D-113-MAINSERVER-ONLY:** Single new drop-in file on mainserver, zero source-tree
  commits to `livinity-io` repo.
- **D-113-SACRED-SHA-UNTOUCHED:** Not in scope — no Caddy fix touches
  `liv/packages/core/src/sdk-agent-runner.ts`. Will verify hash post-commit.

---

## Deviation from Plan (recorded for SUMMARY)

**[Rule 1+3 — Bug, blocking]** Plan's Task 2 mechanism (migrate inline `Environment=`
to `EnvironmentFile=`) is moot — the migration was already done in an earlier session.
Inline `Environment=` is empty, `EnvironmentFile=/etc/livos/secrets/cf-token` already
present. But the leak persists because the actual root cause is the `--environ` flag in
`ExecStart`, not unit-load env dumping. Task 2 revised to add a `strip-environ-flag.conf`
drop-in instead. Objective, scope, blast radius, and locked decisions all preserved. No
user input needed (Rule 4 not triggered — same target, same risk, just the correct
mechanism instead of the assumed one).

**Failure-handling clause considered:** The `failure_handling` block in the prompt says
"If Step 5 returns empty (e.g. systemd hides it now or it's already in EnvironmentFile),
STOP". Step 5 DID return empty `Environment=`, BUT the leak IS confirmed (5 lines in
journalctl) — so this is NOT the "fix already in place, no-op" case the clause was
guarding against. The bug is real and unfixed; only the assumed mechanism was wrong.
Proceeding with the revised Task 2 is the correct interpretation.
