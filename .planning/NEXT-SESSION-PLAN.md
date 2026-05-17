# Next Session Plan — Fresh Install + Outstanding Phases

**Written:** 2026-05-17 (end of session, context ~%80 full)
**Last pushed commit:** `51f2d533` — multi-user toggle UI-disable

## Mini PC current state — TABULA RASA

The Mini PC at `bruce@100.112.68.1` (Tailscale) / `bruce@10.69.31.68` (ZeroTier) was factory-wiped at end of this session. Everything below is GONE:

- `/opt/livos`, `/opt/liv`, `/opt/livinity` (source trees)
- All Docker containers + volumes + images (36.46GB reclaimed)
- All Docker networks
- PostgreSQL `livos` database + `livos` user
- Redis FLUSHALL (every key — apps, broker, MCP, capabilities, all)
- `/etc/caddy/Caddyfile` + `/var/lib/caddy` (certs, ACME state)
- `/etc/cloudflared` + `/root/.cloudflared` (tunnel token + config)
- Claude/Anthropic credentials at `/root/.config/anthropic`, `/root/.claude`, `/home/bruce/.config/anthropic`, `/home/bruce/.claude`
- systemd units: `livos`, `liv-core`, `liv-worker`, `liv-memory`, `cloudflared`

The Mini PC still has: apt-installed PostgreSQL daemon, Redis daemon, Docker daemon, Caddy binary, cloudflared binary. The install.sh will reuse these.

## Step 1 — User obtains install code

User registers fresh on `https://livinity.io`, gets the install one-liner from the dashboard (looks like):

```
curl -fsSL https://livinity.io/install.sh | sudo bash -s -- \
  --mode hybrid \
  --domain <new-subdomain>.livinity.live \
  --api-key liv_k_<new-key> \
  --cf-tunnel-token <new-token>
```

User will hand over this command in the next session.

## Step 2 — Run fresh install

SSH to Mini PC + run the install. Watch for:

- Phase 134 fix (commit `5af9c593`) emits `http://` prefix on Caddyfile blocks → no more redirect loops on CF Tunnel
- Phase 135 onboarding (commits `061e5613..bfd241eb`) is live by default — fresh first-run will see:
  - 6-step wizard (Welcome / Account / Wallpaper / Personalize / Connect AI / Done)
  - Mandatory 2FA enrollment in AccountStep (port of Settings 2FA)
  - Real Settings wallpaper system in WallpaperStep
  - Honest "Claude is connected" static panel (Phase 136 PTY pipe is the outstanding work)
- Phase 137 backend wiring (commits `4544c35a..587906a1`) is live — system.info query + preferences persist + backend resume
- Phase 139 hardening (commits `163bfb45..c76a17dd`) is live — contrast / ARIA / mobile / reduced-motion
- Multi-user toggle is DISABLED in UI (commit `51f2d533`) — don't try to click it.

## Step 3 — Post-install smoke walk

After install lands:

```bash
ssh bruce@100.112.68.1 'cat /opt/livos/.deployed-sha; sudo systemctl is-active livos liv-core caddy cloudflared'
curl -s https://<new-domain>.livinity.live/ -o /dev/null -w "HTTP %{http_code}\n"
curl -s https://<new-domain>.livinity.live/trpc/user.exists
```

Then operator-walk:
1. Open `https://<new-domain>.livinity.live` in incognito.
2. Welcome → spec card should show real Mini PC hardware (~16 cores Intel + 31GB + ~899GB disk).
3. Account: name + password + confirm → "Create account" → automatic transition to 2FA enrollment view.
4. Scan QR with Authy/1Password/Google Auth on phone, type 6-digit code into PinInput.
5. Wallpaper: 1 tile (Fluid) since LivOS only has fluid registered.
6. Personalize: pick role/style/tone/memory/use-cases.
7. Connect AI: static "Claude is connected" panel + Continue.
8. Done: confetti + summary card + Enter Dashboard → desktop.

## Outstanding phases (not started)

Drafted in `.planning/phases/`:

- **136 — Real `claude /login` PTY pipe** (highest-impact)
  Replace the static "Claude is connected" panel with a live PTY pipe (node-pty + tRPC subscription + xterm.js). 6 sub-plans, ~900 LOC est. See `.planning/phases/136-claude-login-pty-pipe/`.

- **138 — Real TOTP 2FA** (SUPERSEDED — Phase 135-F port already wired the real Settings 2FA flow into AccountStep; the Phase 138 plan is now historical. The 138 dir can be archived in a cleanup pass.)

- **139-01 — i18n** (mechanical translation work)
  ~85 keys × 5 langs (en/tr/de/fr/es). Most other 139 work (a11y/mobile/perf/reduced-motion) is shipped. See `.planning/phases/139-onboarding-hardening/`.

## Outstanding system architecture work

- **Multi-user mode re-enable** — currently UI-disabled. To re-enable safely:
  1. Auto-provision wildcard DNS (`*.${mainDomain}` CNAME) via CF API on toggle-on
  2. Auto-provision wildcard CF Tunnel public hostname (`*.${mainDomain}` → `http://localhost:80`) via CF API
  3. Gate the toggle's UI on "prerequisites met" check
  4. Surface a confirmation dialog ("This will create N Cloudflare resources")
  Estimate: 1 phase, ~400 LOC, mostly backend + CF API wiring.

- **App subdomain external access** — `n8n.<host>.livinity.live`-style URLs require CF Tunnel ingress per app (or wildcard). After fresh install, n8n still opens as a LivOS window — external subdomain URL only works after wildcard CF Tunnel setup. Reference: existing Caddyfile-writer now correctly emits `http://app.host { ... }` (commit `5af9c593`).

## What got shipped this session — chronological commit log

```
51f2d533 fix(135/settings-users): temporarily disable Multi-User Mode toggle
5af9c593 fix(134/caddy): emit http:// prefix for all blocks when CF Tunnel is active
bfd241eb fix(135/onboarding+settings): real wallpaper system + honest Connect AI + 2FA button label
cab37667 fix(135-F/onboarding-2fa): QR stuck on Loading — route 2FA endpoints via HTTP
9a139a66 feat(135-F/onboarding): port Settings 2FA flow into AccountStep — mandatory enrollment
e7df83cf fix(135-F/onboarding): disable 2FA toggle + gate preferences.set on JWT
17444e8f docs(autonomous-2026-05-17): mark Phase 137 + 139-partial CODE-COMPLETE
c76a17dd feat(139-04+05/onboarding): perf orb-gating + prefers-reduced-motion respect
7c802e7d feat(139-03/onboarding): mobile responsive overrides
163bfb45 feat(139-02/onboarding): a11y contrast fix + ARIA labels on wizard chrome
587906a1 feat(137-05/onboarding): DoneStep clears backend resume key on Enter Dashboard
62fc9e65 feat(137-04/onboarding): backend resume via user_preferences.onboarding_state
d3f9ba16 feat(137-03/onboarding): persist Wallpaper + Personalize choices to preferences
e8412e50 feat(137-02/onboarding): WelcomeStep consumes live system.info query
4544c35a feat(137-01/onboarding): backend system.info query for WelcomeStep spec card
```

15 commits, all pushed to `origin/master`. Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` preserved 15/15.

## Resume protocol on /clear

```
1. Read this file (NEXT-SESSION-PLAN.md) first.
2. Wait for user to paste the new install command from livinity.io.
3. SSH to Mini PC and run the install.
4. Watch the install log for errors. Common gotcha: cloudflared service may
   need a token-refresh if the user re-used an existing tunnel.
5. After install completes, operator walks the onboarding (steps above).
6. If a regression is found, debug + commit + push + run update.sh.
7. If smooth: discuss Phase 136 (real claude /login PTY pipe) as the next
   major feature.
```

## SSH cheat sheet

```bash
# Tailscale (preferred — ZT is unstable per memory):
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -i /c/Users/hello/Desktop/Projects/contabo/pem/minipc \
  bruce@100.112.68.1

# To run a one-shot script:
ssh -i ... bruce@100.112.68.1 'bash -s' <<'REMOTE'
  ...commands...
REMOTE
```
