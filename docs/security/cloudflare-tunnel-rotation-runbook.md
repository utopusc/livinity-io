# Cloudflare Tunnel — Security Architecture & Rotation Runbook

**Audience:** LivOS operators / platform maintainers
**Last updated:** 2026-06-03
**Why this exists:** A per-user home-server platform must contain the blast radius of a stolen tunnel credential. This documents the two-token model, how to rotate ONE tenant without touching others, and how to protect the account-wide provisioning credential.

---

## The two-token model (read this first)

There is no single "the Cloudflare token". There are TWO very different credentials with very different blast radii:

| Credential | Lives on | Scope if stolen | Blast radius |
|---|---|---|---|
| **Per-user tunnel token** (`cloudflared --token …`) | each user's device only | one tunnel (that user's hostnames) | **1 user** |
| **Central CF API token** (provisioning) | the signup/provisioning backend ONLY (Vercel/server) — NEVER on user devices | create/delete/manage ALL tunnels + DNS in the account | **whole account** |

**Design rule:** a user-device compromise must NEVER leak the central API token. The provisioning backend mints a *fresh per-user tunnel* at signup and hands the device only its own tunnel token. Stealing that = one user, revocable in isolation.

A tunnel token decodes to `{"a":<accountTag>,"t":<tunnelID>,"s":<tunnelSecret>}`. Rotating a tunnel = generating a new `s` (secret) for the same `t` (tunnel ID) → the tunnel ID and all DNS CNAMEs stay the same, so the user's hostnames keep working; the old token (e.g. one leaked into git) stops working.

---

## Runbook A — Rotate ONE user's tunnel token (e.g. a leak, a compromised device)

> Goal: invalidate the old token, keep `<user>.livinity.io` working, zero impact on other users.
> Requires: the central CF API token (Tunnel:Edit) on the provisioning backend, OR the CF Zero Trust dashboard.

**Inputs:** account tag `A`, tunnel ID `T` (decode from the device's current token, or look it up in the dashboard).

### Option 1 — CF API (scriptable, preferred)
```bash
# 1. New 32-byte secret
NEW_SECRET=$(openssl rand -base64 32)
# 2. Rotate the secret on the SAME tunnel (tunnel ID + DNS unchanged)
curl -sS -X PATCH "https://api.cloudflare.com/client/v4/accounts/$A/cfd_tunnel/$T" \
  -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  -d "{\"tunnel_secret\":\"$NEW_SECRET\"}" | jq '.success'
# 3. Fetch the NEW connector token (base64 of {a,t,s:new})
NEW_TOKEN=$(curl -sS "https://api.cloudflare.com/client/v4/accounts/$A/cfd_tunnel/$T/token" \
  -H "Authorization: Bearer $CF_API_TOKEN" | jq -r '.result')
# 4. Apply on the user's device (see apply step below), restart, verify.
```

### Option 2 — Dashboard (no API token handy)
Cloudflare Zero Trust → **Networks → Tunnels** → pick the tunnel → **Configure → Refresh token** (or delete + recreate; if recreated, the tunnel ID changes → update the device token AND re-point the DNS CNAMEs to the new tunnel). Copy the new connector token.

### Apply the new token on the device (Mini PC / user box)
The token is baked into the systemd unit `ExecStart` at `/etc/systemd/system/cloudflared.service`:
```bash
sudo bash /opt/livos/scripts/ops/apply-cf-tunnel-token.sh "<NEW_TOKEN>"
# (updates ExecStart, daemon-reload, restart cloudflared, verifies the tunnel reconnects)
```
Then verify externally: `curl -s -o /dev/null -w '%{http_code}' https://<user>.livinity.io/` → `200`.
The OLD token is now dead — any rogue connector using it is rejected.

**Other users are untouched** — their tunnels have different `T`/`s`.

---

## Runbook B — Protect the central CF API (provisioning) token

This is the crown jewel. If it leaks, the whole account is exposed.

1. **Scope it minimally** — a Cloudflare *scoped API token* (NOT the Global API Key) with only: `Account › Cloudflare Tunnel › Edit` + `Zone › DNS › Edit` for the `livinity.io` zone. Nothing else.
2. **Store it server-side only** — in the provisioning backend's secrets manager (Vercel env var / Vault / cloud secret store). **Never** in git, never in a user-facing file, never shipped to a device.
3. **Rotate periodically** — create a new scoped token, deploy to the backend, then revoke the old one in the CF dashboard. Zero user impact (it's only used at signup-time provisioning).
4. **Add an IP allowlist** on the token (CF supports per-token IP filtering) restricted to the provisioning backend's egress IPs.
5. **Alert on use** — log every tunnel-create/delete the backend performs; alert on unexpected volume.

---

## Runbook C — Never let a token reach git (the failure that happened)

A tunnel token was once committed inside `dashboard-install.html` instructional content (public repo → permanently exposed → must rotate, see Runbook A).

**Prevention:**
- The per-user install command must fetch the device's tunnel token from an **authenticated HTTPS endpoint at install time**, never bake it into a committed file or static HTML.
- Add a CI secret-scan (gitleaks / trufflehog) that BLOCKS a push containing `eyJhIjoi…` (CF tunnel token), `CLOUDFLARE_API_TOKEN=<real>`, private keys, etc. (placeholders like `dummy-token-for-syntax-validation-only` are fine).
- Because the repo is public, treat ANY secret that ever landed in history as compromised → rotate it; removing from HEAD does nothing.

---

## Quick reference — blast radius cheat sheet

- Stolen **user tunnel token** → 1 user → rotate that one tunnel (Runbook A). Others unaffected.
- Stolen **central API token** → whole account → revoke + reissue scoped token (Runbook B), then rotate any tunnels you believe were touched.
- Per-app **login gate** (`forward_auth /auth/verify`, Phase 256-04) is a second layer: even a hijacked tunnel hits the login wall — but a hijacker can MITM the login, so tunnel integrity still matters. Per-user isolation is the primary control.
