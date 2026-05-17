# 132-06 — Caddy reset+start with active-wait (Bug #7)

**Status:** CODE-COMPLETE 2026-05-17

## Bug #7 reproduction (UAT 2026-05-16)

After install completes on a box where Caddy was previously failed
(prior partial install attempts left the unit in failed-state),
Caddy is left in `failed` — TLS + DNS-01 wildcard cert acquired,
Caddyfile valid, but Caddy daemon isn't running → port 443 unbound
→ `https://<domain>` returns HTTP 000.

```
$ caddy validate --config /etc/caddy/Caddyfile
Valid configuration

$ systemctl is-active caddy
failed

$ curl -ks https://bruce.livinity.live/ -o /dev/null -w "%{http_code}\n"
000
```

## Root cause

The pre-fix block at `scripts/install/deploy-livinityd.sh:1460-1463`
was:

```bash
# Reload Caddy (graceful — no restart)
systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null || \
    warn "Caddy reload/restart failed; check journalctl -u caddy -n 20"
ok "Caddy reloaded"
```

Three problems:

1. **No `reset-failed`** — `systemctl reload` and `systemctl restart`
   silently no-op when a unit is in `failed` state. The `||` chain
   masks this because both calls "succeed" (exit 0 with stderr
   redirected to `/dev/null`).
2. **No active-wait** — even if restart succeeds, LE DNS-01 first
   cert acquisition can take 5-20s; the next install step proceeds
   while Caddy is still initializing.
3. **Banner lies** — `ok "Caddy reloaded"` always prints regardless
   of whether Caddy is actually up.

## Fix design

Insert the proper systemctl dance at the same site:

```bash
info "Ensuring Caddy is started and reachable"
systemctl reset-failed caddy 2>/dev/null || true   # NEW — pop out of failed
systemctl daemon-reload                            # pick up any drop-in updates
systemctl enable caddy 2>/dev/null || true         # idempotent
systemctl restart caddy 2>/dev/null || \
    warn "Caddy restart failed; check journalctl -u caddy -n 20"

# Wait up to 30s for Caddy to come active
for caddy_wait_i in $(seq 1 30); do
    if systemctl is-active --quiet caddy; then
        ok "Caddy active after ${caddy_wait_i}s"
        break
    fi
    sleep 1
done

if ! systemctl is-active --quiet caddy; then
    warn "Caddy did not reach active state in 30s. Tail logs:"
    warn "  journalctl -u caddy --no-pager -n 50"
    warn "Install will continue but HTTPS may be down until Caddy starts."
fi
```

## Why `reset-failed` is mandatory

systemd's failed-state is sticky. From `man systemd.unit`:

> A failed unit changes back to inactive only when `systemctl
> reset-failed` is called or the unit is restarted explicitly
> with `systemctl restart`. A `reload` against a failed unit is a
> no-op (logged at debug level only).

The pre-fix block called `reload` first (no-op against failed Caddy)
then fell through to `restart` — but the `2>/dev/null` redirect hid
any error and `|| warn ...` never triggered because the previous
"successful" no-op exited 0. Net effect: silent failure with a
misleading `ok "Caddy reloaded"` log line.

## Why wait-for-active (LE timing)

On a brand-new domain, Caddy's first run does:

1. ACME registration with LE staging or prod
2. DNS-01 challenge via the cloudflare provider (`_acme-challenge.<domain>` TXT record write + wait for propagation)
3. Certificate issuance + write to `/var/lib/caddy/.local/share/caddy/certificates/...`
4. Bind 0.0.0.0:443 + serve

The DNS propagation wait alone can be 5-20s on Cloudflare's free tier.
Without the wait-for-active loop, the install continues + the post-
install banner fires before Caddy is actually serving HTTPS — the
operator sees `install complete` but their browser returns
ERR_CONNECTION_REFUSED for the first 10-20s.

## CADDY_AUTO_START_VERIFIED

Static checks pass:

```
$ bash -n scripts/install/deploy-livinityd.sh
(no output — syntax OK)

$ grep -c "reset-failed caddy" scripts/install/deploy-livinityd.sh
1   (new pattern present)

$ grep -n "Caddy active after" scripts/install/deploy-livinityd.sh
(line within the new block — confirms wait-for-active loop present)
```

Live verification on a failed-state Caddy box requires the operator-
walked Plan 132-07 fresh-VPS UAT. On a fresh VPS (Caddy never failed
before), the new block behaves identically to the old one (reset-failed
is a no-op, restart starts Caddy, active-wait exits on iteration 1).

## What we still don't auto-fix

- **LE rate limit** (50 certs/registered-domain/week prod, 30,000/week
  staging) — if hit, Caddy starts but cert acquisition fails;
  HTTPS still down. The new wait-for-active loop will time out at
  30s and warn the operator. Out of scope for this plan; v35+ work
  could add a `caddy validate-config + LE-status check` precheck.
- **DNS misconfiguration** (CF API token wrong scope, zone ID mismatch)
  — caught earlier in `mode-hybrid.sh` Caddyfile generation, but a
  belt-and-braces "wait then dig the TXT record" would be more
  defensive. Tracked as v35+ hardening.

## Scope decision: deploy-livinityd.sh, not mode-hybrid.sh

The plan suggested either site. Chose `deploy-livinityd.sh` because
the existing reload was already there — one-site replacement keeps
the diff minimal and the new block runs in ALL modes (cloud, local,
hybrid, tunnel) without per-mode duplication. `mode-hybrid.sh`
already runs BEFORE this site to write the Caddyfile + acquire the
cert; this fix handles the unit-state finalization for every mode.

## Sacred SHA

`f3538e1d811992b782a9bb057d1b7f0a0189f95f` on
`liv/packages/core/src/sdk-agent-runner.ts` — preserved (this plan
only edits `scripts/install/deploy-livinityd.sh`).
