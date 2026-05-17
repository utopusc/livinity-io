# Post-Deploy Operator Playbook

**Audience:** Bruce + ops team
**Scope:** Cloudflare-fronted livinity.io tunnels (Phase 134/140+). Covers cache
behavior, redirect loops, and the small set of recipes you actually reach for
after a Mini PC deploy.

---

## TL;DR

After every `bash /opt/livos/update.sh` on a Mini PC:

```bash
# Apex + at least one app subdomain — all three should return 200.
curl -s -o /dev/null -w "  apex            %{http_code}\n" --max-time 5 https://${USER}.livinity.io
curl -s -o /dev/null -w "  trpc            %{http_code}\n" --max-time 5 https://${USER}.livinity.io/trpc/system.status
curl -s -o /dev/null -w "  app             %{http_code}\n" --max-time 5 https://n8n-${USER}.livinity.io   # or whatever app is installed
```

If any URL returns **308** → fix the Caddyfile prefix discipline (§3).
If any URL returns **530** → fix cloudflared tunnel token (§4).

---

## 1. Browser cache stickiness

CF Tunnel + Caddy + browser HSTS form a stacked cache. After a misconfigured
deploy, a redirect loop ([308 → 308 → 308 …]) gets pinned in the browser's
disk cache. Subsequent loads use the cached redirect chain even after the
server is fixed.

**Recipe for a stuck browser** (give to the user):

1. Open Chrome DevTools (`F12`) → Application tab → Storage → "Clear site data"
   (check every box) → click "Clear site data". Reload.
2. If still stuck: open `chrome://net-internals/#sockets` → "Flush socket pools".
   This kills the HSTS cache (HSTS itself is fine; the issue is cached redirects
   tied to the HSTS-enforced HTTPS leg).
3. Still stuck? Open the URL in an incognito window. If it works there, the
   issue is purely client-side cache; the user needs steps 1–2.

**Operator-side prevention** is in §3: never emit a 308 from a livinity.io
zone in the first place.

---

## 2. HSTS notes

Cloudflare adds HSTS headers to proxied HTTPS responses (browsers cache the
HSTS preload on first visit). HSTS itself is correct and you should NOT try
to defeat it. The cache problem comes from layering 308 redirects ON TOP of
HSTS — once a browser learns "force HTTPS" + "redirects to X", it caches that
path even after the server stops emitting it.

**Don't:** try to clear HSTS by changing the domain (won't help, browser keys
HSTS per host).

**Do:** keep the Caddy + CF Tunnel chain redirect-free (§3).

---

## 3. Caddy `http://` prefix discipline

Cloudflare Tunnel terminates TLS at CF's edge and forwards plain HTTP to the
Mini PC. Caddy on the Mini PC defaults to HTTPS-on-everything and emits a 308
redirect to upgrade. CF's edge follows the 308, hits the Mini PC again, gets
another 308 — infinite loop.

The fix is to prefix every Caddyfile host block with `http://` so Caddy serves
plain HTTP on that block and doesn't try to upgrade:

```
http://socinity.livinity.io {
    reverse_proxy 127.0.0.1:8080 {
        flush_interval -1
        transport http {
            versions 1.1
        }
    }
}
```

Phase 141-03 wires this into `generateFullCaddyfile` so livinityd's
`rebuildCaddy()` always emits the prefix when `livos:domain:local_mode` is
`hybrid` or `tunnel`. If the value is empty (Phase 141-01 bug pre-fix), the
prefix logic falls through and you get bare blocks → loops.

**Recovery if you find an unprefixed Caddyfile** (e.g., after a manual edit):

```bash
ssh -i .../pem/minipc bruce@10.69.31.68 'sudo python3 -c "
import re
p = \"/etc/caddy/Caddyfile\"
with open(p) as f: src = f.read()
new = re.sub(r\"^([a-z][a-z0-9.-]+\\.livinity\\.io)\\s*\\{\", r\"http://\\1 {\", src, flags=re.MULTILINE)
with open(p, \"w\") as f: f.write(new)
print(\"prefixed\")
" && sudo systemctl reload caddy'
```

Then re-trigger `livinityd`'s next rebuild (any install/uninstall, or
`sudo systemctl restart livos`) to make the prefix stick.

**Sanity check** (should be ≥3 for a healthy tunnel install with at least
one app):

```bash
sudo grep -c "^http://" /etc/caddy/Caddyfile
```

---

## 4. cloudflared systemd unit token

`/etc/systemd/system/cloudflared.service` carries the JWT-encoded tunnel
token in the `ExecStart` line:

```
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate run --token <JWT>
```

After a fresh install on a previously-used Mini PC, the stage-dir cache
`/tmp/livos-install-stage` skips re-writing this unit if it already exists.
Result: the new user's token sits in `/etc/livos/secrets/cf-tunnel-token`
but the systemd unit still has the OLD user's token. cloudflared connects
to the WRONG tunnel → app subdomain returns 530 "Tunnel origin unreachable"
even though the CF API ingress, DNS, livinityd, and Caddy are all happy.

Phase 141-09 fixes install.sh to always rewrite the unit. Until that fix is
deployed, the manual recipe (also documented in
`feedback_install_sh_systemd_token_cache_bug` memory):

```bash
# 1. Get the correct token via api-key
CORRECT_TOKEN=$(curl -s -H "X-API-Key: liv_k_xxx" https://livinity.io/api/me/tunnel-token \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

# 2. Rewrite the systemd unit
sudo sed -i "s|--token [A-Za-z0-9_=-]*|--token $CORRECT_TOKEN|" /etc/systemd/system/cloudflared.service

# 3. Ensure the secrets file matches (defensive — usually already correct)
sudo bash -c "echo \"$CORRECT_TOKEN\" > /etc/livos/secrets/cf-tunnel-token"
sudo chmod 600 /etc/livos/secrets/cf-tunnel-token

# 4. Reload + restart
sudo systemctl daemon-reload && sudo systemctl restart cloudflared

# 5. Verify (should show tunnelID + "Updated to new configuration")
sudo journalctl -u cloudflared --since '30 sec ago' --no-pager \
  | grep -E "tunnelID=|Updated to new configuration"
```

---

## 5. The `livos:domain:local_mode` Redis key

This key is the authoritative signal for "is this Mini PC behind a CF
Tunnel?" — `apps.ts:rebuildCaddy` reads it (Phase 140-08.2) to decide whether
to emit the `http://` prefix. If empty, the prefix logic falls through and
you get the 308 loop from §3.

install.sh seeds this via `set_livos_redis_key`, which writes to Redis if
reachable, otherwise queues to `/var/lib/livos/install-pending-redis-keys.txt`
for livinityd to apply on boot. Phase 141-01 added the boot-side drainer.

**Sanity check on the live box:**

```bash
ssh -i .../pem/minipc bruce@10.69.31.68 '
  REDIS_PASS=$(sudo grep -oP "REDIS_URL=redis://[^:]*:\K[^@]+" /opt/livos/.env | head -1)
  sudo redis-cli -a "$REDIS_PASS" --no-auth-warning get livos:domain:local_mode
'
```

Expected: `hybrid` (or `tunnel`). Empty means the boot drainer didn't run, or
the queue file was never written. Re-run install.sh OR manually set:

```bash
sudo redis-cli -a "$REDIS_PASS" --no-auth-warning set livos:domain:local_mode hybrid
sudo systemctl restart livos   # triggers rebuildCaddy on next install/uninstall
```

---

## 6. Dashboard "Online · ready when you are" check

`/api/dashboard` on Server5 reports per-user online status. Phase 141-07
swapped this from the relay WebSocket signal (which Phase 134+ livinityd
doesn't open) to a live CF Tunnel API connection count check.

**Expected behavior:** within ~30s of livinityd starting (boot,
`systemctl restart livos`, or `update.sh`), the dashboard shows "Online" with
the user's URL link. If it shows "asleep":

1. **Check cloudflared has connections:**
   ```bash
   ssh -i .../pem/minipc bruce@10.69.31.68 'sudo journalctl -u cloudflared --since "5 min ago" --no-pager | grep -E "Registered tunnel connection|tunnelID="'
   ```
   Should show 4 lines of "Registered tunnel connection" within the last few
   minutes.

2. **Check the CF API side directly:**
   ```bash
   curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/connections" \
     | python3 -m json.tool | grep -c '"id":'
   ```
   Should be 4.

3. **If both pass but dashboard still says "asleep":** the 30s cache (Phase
   141-07) on Server5 is stale. Wait 30s and refresh, OR restart pm2 web:
   ```bash
   ssh root@45.137.194.102 'cd /opt/platform/web && pm2 reload ecosystem.config.cjs --only web --update-env && pm2 save'
   ```

---

## 7. Server5 pm2 reload incantation (every time)

After editing env vars in `/opt/platform/web/ecosystem.config.cjs`:

```bash
cd /opt/platform/web && pm2 reload ecosystem.config.cjs --only web --update-env && pm2 save
```

NOT `pm2 reload web --update-env` — that doesn't re-read the ecosystem file
and silently keeps the old env. See `feedback_pm2_reload_ecosystem` memory.

Verify env actually landed:

```bash
tr "\0" "\n" < /proc/$(pm2 pid web | head -1)/environ | grep VARNAME
```

---

## 8. Standard post-deploy curl trio

For convenience, the smoke-test loop you run after every deploy
(replace `socinity` with the test user; replace `n8n` with whatever app):

```bash
USER=socinity
APP=n8n
for url in \
  https://$USER.livinity.io \
  https://$USER.livinity.io/trpc/system.status \
  https://$APP-$USER.livinity.io; do
  printf "%-60s " "$url"
  curl -s -o /dev/null -w "%{http_code}\n" --max-time 5 "$url"
done
```

All three should return **200**.

| Status | What it usually means |
|---|---|
| 200 | Healthy. |
| 308 | Caddyfile missing `http://` prefix (§3). |
| 530 | cloudflared on Mini PC is offline or connected to wrong tunnel (§4). |
| 502 | App container not running or port mismatch between docker_compose and manifest. |
| 404 | App subdomain not provisioned on Server5 (CF ingress missing); or Phase 141-03 hyphen-pattern wasn't captured at install time. |
| timeout | CF edge can't reach cloudflared at all; Mini PC offline or network blocked. |

---

## 9. Where things live

| Box | Path | What it does |
|---|---|---|
| Server5 (`45.137.194.102`) | `/opt/platform/web/` | Next.js, `apps.livinity.io`, dashboard, all `/api/*` |
| Server5 | `/opt/landing/livinity.io/` | Static HTML for `/`, `/dashboard/install`, `/verify` |
| Server5 | `/etc/caddy/Caddyfile` | Server5 reverse proxy + landing |
| Mini PC (`10.69.31.68`) | `/opt/livos/` | livinityd source + data |
| Mini PC | `/opt/liv/` | liv-core (formerly nexus) — agent runtime |
| Mini PC | `/etc/caddy/Caddyfile` | Per-app subdomain reverse proxy |
| Mini PC | `/etc/livos/secrets/` | api-key, cf-tunnel-token, jwt |
| Mini PC | `/etc/systemd/system/cloudflared.service` | CF Tunnel connector |
| Mini PC | `/var/lib/livos/install-pending-redis-keys.txt` | install.sh's queue (drained on livinityd boot since Phase 141-01) |

---

## 10. Don't break list

Memorize these:

- **Sacred SHA** `f3538e1d811992b782a9bb057d1b7f0a0189f95f` must appear in
  every commit body. The pre-commit hook enforces this; never `--no-verify`.
- **Email-verify gate** at `/api/dashboard` POST line for `generate-key` is
  load-bearing. Don't disable it for "testing" — unverified accounts can
  mint API keys, which voids the abuse model.
- **LIV_SECRET_KEY** in Server5's ecosystem.config.cjs is the encryption key
  for tunnel tokens. Losing it orphans every encrypted token in the DB.
  Back it up before any infra rebuild.
- **Server5 `/opt/platform/web` is NOT a git repo.** `git pull` is a no-op.
  Deploy via scp + `npm install` + `npm run build` + pm2 reload (with the
  explicit ecosystem path from §7).
- **`*.livinity.io` Universal SSL covers ONE level deep** on the Free plan.
  All app subdomains MUST use the flat `{app}-{user}.livinity.io` pattern,
  not `{app}.{user}.livinity.io`. Phase 140 locked this; Phase 141-03 made
  sure Caddy + UI honor it.
