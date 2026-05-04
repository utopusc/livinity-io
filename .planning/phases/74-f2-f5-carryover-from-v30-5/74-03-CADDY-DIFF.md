# 74-03 — Server5 Caddy F4 Timeout Audit Diff

**Phase:** 74 (F2-F5 Broker Carryover)
**Plan:** 74-03 (F4 Caddy timeout for long agentic sessions)
**Status:** **AUDIT-ONLY (pre-edit)** — proposed change documented; live edit gated behind `## CHECKPOINT REACHED` per user brief 2026-05-04
**Server:** `45.137.194.102` (Server5 — `vmi2892422`). NOT the off-limits server. NOT Mini PC.
**Caddyfile path:** `/etc/caddy/Caddyfile`
**Audit captured (UTC):** `20260504T200518Z`

---

## D-NO-SERVER-OFFLIMITS Pre-Flight

Confirmed Server5 (NOT the off-limits IP) before any read:

```
=== HOSTNAME_AND_IP ===
vmi2892422
45.137.194.102 10.21.0.1 172.17.0.1 2605:a141:2289:2422::1
=== SAFETY_CHECK_NOT_OFFLIMITS ===
PASSED_NOT_OFFLIMITS
```

`hostname -I` does **not** contain the off-limits IP from MEMORY.md HARD RULE 2026-04-27. The off-limits-server invariant is preserved.

---

## Section 1 — Pre-Edit State

### Caddy version

```
v2.11.2 h1:iOlpsSiSKqEW+SIXrcZsZ/NO74SzB/ycqqvAIEfIm64=
```

Modules in use (per STATE.md:135 + observed config): `caddy-ratelimit` (used in `api.livinity.io { rate_limit { ... } }`), `caddy-dns/cloudflare` (DNS challenge for on-demand TLS).

### Pre-edit Caddyfile sha256

```
4c0a6e39cfdb0e6b4aec9f99392380a0f2aacd781b34dc4557385f09dcc509d0  /etc/caddy/Caddyfile
```

89 lines.

### Listening ports (pre-edit)

```
LISTEN 0:80    caddy        (pid=91372)
LISTEN 0:443   caddy        (pid=91372)
LISTEN 0:4000  /opt/platform/relay  (pid=163562)  ← broker upstream
LISTEN 0:3000  next-server  (apps.livinity.io / livinity.io UI)
LISTEN 0:3200  node         (unrelated)
```

`api.livinity.io` upstream confirmed: `localhost:4000` (the relay process at `/opt/platform/relay/src/index.ts`).

### Caddy service state (pre-edit)

```
caddy.service - Caddy
   Loaded: loaded (/usr/lib/systemd/system/caddy.service; enabled; preset: enabled)
   Active: active (running) since Sun 2026-05-03 07:00:14 CEST; 1 day 15h ago
   Main PID: 91372 (caddy)
   Tasks: 14 (limit: 14307)
   Memory: 20.4M (peak: 31.6M)
```

### Pre-existing issue noted (NOT in scope for 74-03)

The `caddy.service` `ExecReload` step previously failed with:
```
Status: "loading new config: setting up custom log 'log0': ... open /var/log/caddy/api.livinity.io.log: permission denied"
Process: 94599 ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force (code=exited, status=1/FAILURE)
```

The main `caddy run` process loaded its config successfully at boot (Active since 2026-05-03 07:00:14), so the running config matches `/etc/caddy/Caddyfile`. But subsequent `systemctl reload caddy` fails because the systemd unit user lacks write access to `/var/log/caddy/api.livinity.io.log`.

**Implication for 74-03 reload step:** Use `caddy reload --config /etc/caddy/Caddyfile` directly as `root` (the same user that owns `/var/log/caddy/`), NOT `systemctl reload caddy`. The direct invocation runs in the operator's UID/GID context (root) and should succeed where systemd-mediated reload does not. Documented for the operator.

This permission issue is **pre-existing** (predates 74-03) and is logged separately as a deferred item — fixing it requires `chown caddy:caddy /var/log/caddy/api.livinity.io.log` (or `chmod g+w` + group membership), which is **out of scope for 74-03**. Plan 74-03's success does not depend on `systemctl reload`; only on direct `caddy reload`.

### Pre-edit Caddyfile (full contents)

```caddy
{
	on_demand_tls {
		ask http://localhost:4000/internal/ask
	}
	order rate_limit before basic_auth
}

livinity.io {
	tls {
		on_demand
	}
	handle /downloads/* {
		root * /opt
		file_server
	}
	handle {
		reverse_proxy localhost:3000
	}
}

api.livinity.io {
	tls {
		on_demand
	}
	rate_limit {
		zone bearer {
			key    {http.request.header.Authorization}
			window 1m
			events 60
		}
		zone ip {
			key    {http.request.remote.host}
			window 1m
			events 30
		}
	}
	reverse_proxy localhost:4000 {
		flush_interval -1
		header_up Host           {host}
		header_up X-Real-IP      {remote_host}
		header_up X-Forwarded-For {remote_host}
	}
	handle_errors 429 {
		header Content-Type application/json
		respond `{"type":"error","error":{"type":"rate_limit_error","message":"Rate limit exceeded"},"request_id":"req_relay_{http.request.uuid}"}` 429
	}
	log {
		output file /var/log/caddy/api.livinity.io.log
		format json
	}
}

apps.livinity.io {
	tls {
		on_demand
	}
	reverse_proxy localhost:3000
}

changelog.livinity.io {
	tls {
		on_demand
	}
	reverse_proxy localhost:3002
}

*.livinity.io {
	tls {
		on_demand
	}
	@marketplace host mcp.livinity.io
	handle @marketplace {
		reverse_proxy localhost:4100
	}
	handle {
		reverse_proxy localhost:4000 {
			header_up X-Real-IP {remote_host}
		}
	}
}

*.*.livinity.io {
	tls {
		on_demand
	}
	reverse_proxy localhost:4000 {
		header_up X-Real-IP {remote_host}
	}
}
```

### Shape encountered: **A** (single blanket `reverse_proxy`)

The `api.livinity.io` block uses **Shape A** per `<existing_caddyfile_landmarks>` — one blanket `reverse_proxy localhost:4000` directive that handles all paths.

**Notable findings:**

- `flush_interval -1` is **already set** on the blanket `reverse_proxy` (carries over from a prior change pre-74-03). F2's SSE-buffering requirement is already satisfied at the Caddy layer.
- `transport http { ... }` is **NOT set** — this is the missing piece. Default Caddy timeouts apply: per Caddy v2 source, `read_timeout` and `write_timeout` default to 0 (no timeout) in `reverseproxy.HTTPTransport`, but `responseHeaderTimeout` and idle timeouts at the HTTP server layer default to ~5 minutes. Long agentic streams >5 minutes get severed.
- `header_up` directives present (`Host`, `X-Real-IP`, `X-Forwarded-For`) — these MUST be preserved through the edit.
- `rate_limit`, `handle_errors 429`, `log` directives present at the site-block level (peer to `reverse_proxy`) — these MUST be preserved.

### Existing backups directory listing

```
/etc/caddy/:
  Caddyfile                          1410 bytes  May  3 07:23
  Caddyfile.bak.20260503-072328       689 bytes  May  3 07:23
```

(Note: existing backup is 689 bytes vs. current 1410 bytes — the file was substantively expanded between 2026-05-03 07:23 and now. The existing backup precedent confirms naming convention `Caddyfile.bak.<YYYYMMDD-HHMMSS>`.)

---

## Section 2 — Backup (proposed; not yet executed)

When this plan moves past the human-verify checkpoint, the operator will run:

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    root@45.137.194.102 'bash -c "
  TS=$(date +%Y%m%d-%H%M%S)
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.\$TS
  echo BACKUP=/etc/caddy/Caddyfile.bak.\$TS
  sha256sum /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak.\$TS
"'
```

Expected outcome: backup file `/etc/caddy/Caddyfile.bak.<TS>` with sha256 == `4c0a6e39cfdb0e6b4aec9f99392380a0f2aacd781b34dc4557385f09dcc509d0` (matching the live pre-edit).

---

## Section 3 — Proposed Diff

### Strategy

Convert Shape A (single blanket `reverse_proxy`) into a **path-matched** form: introduce a named matcher `@broker_paths` for the broker SSE routes and apply the `transport http { ... }` timeout block to that subset only. Non-broker paths (e.g. `/internal/ask`, future relay endpoints) continue through a fallback `handle` with the original blanket reverse_proxy (preserving today's behavior bit-for-bit).

This is the **minimal-change** form: existing `flush_interval -1`, `header_up`, `rate_limit`, `handle_errors`, `log`, and `tls on_demand` are all preserved. The only additions are:

1. The named matcher `@broker_paths` (covers `/v1/messages`, `/v1/messages/*`, `/v1/chat/completions`, `/v1/chat/completions/*`, `/u/*/v1/messages`, `/u/*/v1/messages/*`, `/u/*/v1/chat/completions`, `/u/*/v1/chat/completions/*`).
2. A `handle @broker_paths { reverse_proxy localhost:4000 { ... transport http { read_timeout 30m write_timeout 30m dial_timeout 30s } ... } }` block.
3. A fallback `handle { reverse_proxy localhost:4000 { ... } }` block for non-broker paths (relay's own `/internal/*`, anything else).

### Unified diff (pre-edit vs proposed post-edit)

```diff
--- /etc/caddy/Caddyfile	(pre-edit, sha256 4c0a6e39cfdb0e6b4aec9f99392380a0f2aacd781b34dc4557385f09dcc509d0)
+++ /etc/caddy/Caddyfile	(proposed post-edit)
@@ -19,11 +19,28 @@
 	rate_limit {
 		zone bearer {
 			key    {http.request.header.Authorization}
 			window 1m
 			events 60
 		}
 		zone ip {
 			key    {http.request.remote.host}
 			window 1m
 			events 30
 		}
 	}
-	reverse_proxy localhost:4000 {
-		flush_interval -1
-		header_up Host           {host}
-		header_up X-Real-IP      {remote_host}
-		header_up X-Forwarded-For {remote_host}
+
+	# P74-F4: long agentic-stream timeout for broker SSE paths.
+	# Pairs with broker SSE adapter slicing (P74-01 F2) — flush_interval -1
+	# disables Caddy buffering so token-cadence reaches the client unbuffered.
+	@broker_paths path /v1/messages /v1/messages/* /v1/chat/completions /v1/chat/completions/* /u/*/v1/messages /u/*/v1/messages/* /u/*/v1/chat/completions /u/*/v1/chat/completions/*
+	handle @broker_paths {
+		reverse_proxy localhost:4000 {
+			flush_interval -1
+			header_up Host           {host}
+			header_up X-Real-IP      {remote_host}
+			header_up X-Forwarded-For {remote_host}
+			transport http {
+				read_timeout 30m
+				write_timeout 30m
+				dial_timeout 30s
+			}
+		}
+	}
+
+	# Fallback for all non-broker paths on api.livinity.io (e.g. /internal/ask).
+	# Preserves pre-74-03 behavior bit-for-bit.
+	handle {
+		reverse_proxy localhost:4000 {
+			flush_interval -1
+			header_up Host           {host}
+			header_up X-Real-IP      {remote_host}
+			header_up X-Forwarded-For {remote_host}
+		}
 	}
 	handle_errors 429 {
 		header Content-Type application/json
 		respond `{"type":"error","error":{"type":"rate_limit_error","message":"Rate limit exceeded"},"request_id":"req_relay_{http.request.uuid}"}` 429
 	}
 	log {
 		output file /var/log/caddy/api.livinity.io.log
 		format json
 	}
 }
```

### Full proposed `api.livinity.io` block (post-edit, for visual review)

```caddy
api.livinity.io {
	tls {
		on_demand
	}
	rate_limit {
		zone bearer {
			key    {http.request.header.Authorization}
			window 1m
			events 60
		}
		zone ip {
			key    {http.request.remote.host}
			window 1m
			events 30
		}
	}

	# P74-F4: long agentic-stream timeout for broker SSE paths.
	# Pairs with broker SSE adapter slicing (P74-01 F2) — flush_interval -1
	# disables Caddy buffering so token-cadence reaches the client unbuffered.
	@broker_paths path /v1/messages /v1/messages/* /v1/chat/completions /v1/chat/completions/* /u/*/v1/messages /u/*/v1/messages/* /u/*/v1/chat/completions /u/*/v1/chat/completions/*
	handle @broker_paths {
		reverse_proxy localhost:4000 {
			flush_interval -1
			header_up Host           {host}
			header_up X-Real-IP      {remote_host}
			header_up X-Forwarded-For {remote_host}
			transport http {
				read_timeout 30m
				write_timeout 30m
				dial_timeout 30s
			}
		}
	}

	# Fallback for all non-broker paths on api.livinity.io.
	handle {
		reverse_proxy localhost:4000 {
			flush_interval -1
			header_up Host           {host}
			header_up X-Real-IP      {remote_host}
			header_up X-Forwarded-For {remote_host}
		}
	}

	handle_errors 429 {
		header Content-Type application/json
		respond `{"type":"error","error":{"type":"rate_limit_error","message":"Rate limit exceeded"},"request_id":"req_relay_{http.request.uuid}"}` 429
	}
	log {
		output file /var/log/caddy/api.livinity.io.log
		format json
	}
}
```

### Site-blocks NOT modified

The following blocks are deliberately left **untouched** (no diff lines):

- `livinity.io { ... }` — public site (Next.js on `:3000`).
- `apps.livinity.io { ... }` — public app store (Next.js on `:3000`).
- `changelog.livinity.io { ... }` — changelog (`:3002`).
- `*.livinity.io { ... }` — per-user wildcard subdomains (e.g. `bruce.livinity.io`) routed to the relay on `:4000`. F4 covers path-prefix `/u/*/v1/*` on `api.livinity.io` only (per CONTEXT D-12/D-13). Subdomain-based per-user routes go through `*.livinity.io` and are handled by the relay's internal long-poll/proxy logic; they don't enter Caddy's reverse_proxy timeout window in the same way (Caddy-side they're typical short HTTP/WS to the relay — the relay holds the long stream to Mini PC). If 30m timeout is later needed for `*.livinity.io` per-user subdomain SSE, it's a follow-up plan.
- `*.*.livinity.io { ... }` — second-level wildcard (e.g. `code.bruce.livinity.io`) — same reasoning, untouched.
- Global block (`{ on_demand_tls ... order rate_limit ... }`) — untouched.

### Why path-matched (Shape B) instead of in-place blanket?

Considered: just adding `transport http { ... }` to the existing blanket `reverse_proxy localhost:4000`. **Rejected** because:

1. The blanket form would apply 30-minute timeouts to **all** paths on `api.livinity.io` including `/internal/ask` and any future relay introspection endpoints. A misbehaving short-poll endpoint could then hold a Caddy goroutine for 30 minutes — wider blast radius.
2. Path-matched form scopes the long timeout precisely to the SSE/agentic surface CONTEXT D-13 calls out (`/v1/messages`, `/v1/chat/completions`, `/u/*/v1/*`).
3. Path-matched form makes intent self-documenting — anyone reading the Caddyfile sees "long timeouts only on broker SSE paths".

### Caddyfile syntax notes

- `@broker_paths path /v1/messages /v1/messages/*` — Caddy's `path` matcher accepts multiple space-separated patterns. The trailing `/*` is required to match sub-paths (e.g. `/v1/messages/123` if any future revision uses path-segments — defensive).
- `transport http { ... }` is a Caddy v2 first-class block under `reverse_proxy`. Documented at https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#transports. `read_timeout 30m` accepts Go duration syntax (`30m` = 30 minutes).
- `flush_interval -1` is preserved across both `handle` blocks. Per Caddy docs, `-1` disables buffering entirely (immediate flush per write from upstream).

---

## Section 4 — Validate Output (PENDING — runs at apply time)

Will be captured when operator proceeds past checkpoint:

```bash
ssh ... root@45.137.194.102 'caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile' 2>&1
```

Expected on success: `Valid configuration`. Exit 0.

If validate fails: backup is restored (`cp /etc/caddy/Caddyfile.bak.<TS> /etc/caddy/Caddyfile`) and the plan ABORTs.

---

## Section 5 — Reload Output (PENDING — runs at apply time)

Will be captured when operator proceeds past checkpoint:

```bash
ssh ... root@45.137.194.102 'caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile' 2>&1
```

Note: per Section 1's pre-existing log-file permission issue, `systemctl reload caddy` will likely fail; **use direct `caddy reload` only**. The direct invocation runs as root, has access to `/var/log/caddy/`.

Expected on success: minimal output (Caddy reloads silently with `level=info` lines visible in `journalctl -u caddy`). Exit 0.

If reload fails: same restore + abort path as Section 4.

Post-reload sanity:
```bash
ssh ... root@45.137.194.102 'systemctl status caddy --no-pager | head -10'
```
Should still show `Active: active (running)`.

---

## Section 6 — External Streaming Test (PENDING — runs at apply time)

The 90-second curl test from Mini PC (NOT from Server5 — Caddy hop must be in path):

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/minipc bruce@10.69.31.68 'bash -c "
  source /opt/livos/.env
  curl -sN --max-time 90 \
    -H \"Authorization: Bearer \$LIV_API_KEY\" \
    -H \"Content-Type: application/json\" \
    -X POST https://api.livinity.io/v1/messages \
    -d '{\"model\":\"opus\",\"max_tokens\":1024,\"stream\":true,\"messages\":[{\"role\":\"user\",\"content\":\"Count from 1 to 30 slowly, one number per line, with a brief explanation each.\"}]}'
"' | tee /tmp/74-03-extern-stream.log
```

(API key redacted from this audit doc per T-74-03-04 mitigation; the actual test will use `$LIV_API_KEY` from `/opt/livos/.env`.)

Pass criteria:
- First chunk arrives within 5 seconds.
- Stream continues past 60 seconds without HTTP 504 / connection reset.
- Multiple `event: content_block_delta` lines visible.
- Stream terminates with `event: message_stop` or hits `--max-time 90` (both acceptable — neither is a 504).

---

## Section 7 — Rollback Procedure

If anything looks wrong post-reload (Caddy not serving, broker unreachable, regressions on `apps.livinity.io` / `livinity.io` / per-user subdomains), restore the backup with **one** SSH session:

```bash
ssh -i C:/Users/hello/Desktop/Projects/contabo/pem/contabo_master \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    root@45.137.194.102 'bash -c "
  set -e
  # Replace <TS> with the actual timestamp captured in Section 2.
  cp /etc/caddy/Caddyfile.bak.<TS> /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  systemctl status caddy --no-pager | head -5
  echo ROLLBACK_COMPLETE
"'
```

Recovery is graceful (Caddy reload, zero downtime), and runs in <2 seconds. Verify by running an external curl against `https://api.livinity.io/v1/messages` (short, non-streaming) and confirming `apps.livinity.io` loads.

---

## Section 8 — Threat Model Mitigations Applied

| Threat ID | Mitigation status (pre-apply) |
|-----------|-------------------------------|
| T-74-03-01 (DoS via long idle conns) | accept — no implementation needed |
| T-74-03-02 (Self-lockout via Caddy reload) | mitigated — validate-before-reload + auto-restore on validate/reload failure (Sections 2-5); test from Mini PC external IP (Section 6, NOT Server5 loopback) |
| T-74-03-03 (Backup tampering) | accept — sha256 captured in Section 2 |
| T-74-03-04 (API key in audit doc) | mitigated — Section 6 uses `$LIV_API_KEY` placeholder; no raw key written to this file |
| T-74-03-05 (DNS spoofing mid-test) | accept — out of model |
| T-74-03-06 (Privilege escalation) | n/a — no new auth surface |
| T-74-03-07 (Reload repudiation) | accept — systemd journal logs the reload |

---

## Status

This audit document captures the **pre-edit Caddyfile state** and the **proposed unified diff** for F4. The actual edit, validate, reload, and external test are gated behind the plan's `checkpoint:human-verify` per the user's explicit brief (2026-05-04): "do NOT live-edit Caddyfile in this plan unless instructed (per the plan's checkpoint design)".

Sections 4 (validate output), 5 (reload output), and 6 (external test transcript) will be appended to this file when the operator gives the go-signal post-checkpoint. The audit doc is committed in its current pre-edit form to record the proposed change before it goes live.

---

**Sacred file invariant:** `nexus/packages/core/src/sdk-agent-runner.ts` SHA confirmed `4f868d318abff71f8c8bfbcf443b2393a553018b` at start of this plan. Trivially preserved — no source code modified.

**Off-limits-server invariant:** The off-limits IP per MEMORY.md HARD RULE 2026-04-27 was not contacted. SSH probe at Section 1 was directed at Server5 (`45.137.194.102` — `vmi2892422`) only.
