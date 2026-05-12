---
phase: 104
title: One-shot local install (install.sh) + Docker Ubuntu GUI UAT
parent_research: .planning/research/local-livinity-setup.md
phase_research: .planning/phases/104-local-install-and-docker-uat/104-RESEARCH.md
created: 2026-05-11
status: ready-for-planning (post-research refinements locked 2026-05-11)
upstream_milestone: v33.0
---

# Phase 104 — Local Install + Docker Ubuntu GUI UAT

## Goal

Make it possible for any user to install LivOS fully locally on their own
machine with a **single `install.sh` invocation** and access the system via
`<username>.livinity.local` from any device on their LAN — no cloud domain,
no port-forward, no Cloudflare account required.

The install path must be **self-testable inside a GUI-enabled Ubuntu Docker
container** on the developer's Windows machine, so we can prove the install
works end-to-end before shipping to any real hardware.

## Non-goals (HARD)

- **Must NOT break the existing cloud `<username>.livinity.io` deploy path.**
  The Mini PC's current `update.sh`-driven flow + Caddy + Cloudflare DNS
  challenge must keep working byte-for-byte. Production users on
  `bruce.livinity.io` should not notice this work.
- Must NOT touch `liv/packages/core/src/sdk-agent-runner.ts` — sacred SHA
  `f3538e1d811992b782a9bb057d1b7f0a0189f95f` is preserved.
- Remote access from outside the LAN is **out of scope**. Users who want
  that can layer Tailscale / WireGuard on top later.

## Two install variants — decision deferred to /gsd-discuss-phase 104

The user has flagged that "iki farkli indirme olabilir" — two parallel
download paths are acceptable. Options for the discuss phase to choose:

| Option | Shape | Pros | Cons |
|--------|-------|------|------|
| **A** | Single `install.sh --mode local\|cloud` | Single artifact, single docs page | More branching in one script; higher risk of mode regressions |
| **B** | Two scripts: `install-local.sh` + `install-cloud.sh` | Each script is dead-simple, mode is implicit | Two URLs to maintain, doc duplication |
| **C** | Single `install.sh` that detects `LOCAL=1` env (and otherwise defaults to cloud) | Single artifact, both modes share boilerplate, easy to script | env-detection is less self-documenting than a flag |

Recommendation to discuss: **A** (`--mode` flag) — explicit, testable, and a
single CI artifact. But B is also defensible if cloud and local diverge a
lot in dependencies.

## Acceptance criteria

A reasonable engineer should be able to:

1. `curl -fsSL https://livinity.io/install.sh | bash -s -- --mode local` on a
   fresh Ubuntu 24.04 box (no manual prereqs).
2. Watch the script:
   - Install dnsmasq, Caddy, PostgreSQL, Redis, Node, build deps
   - Generate the local CA root + Caddyfile with wildcard
     `*.livinity.local` and `tls internal { issuer { ca liv-local } }`
   - Configure dnsmasq with `address=/.livinity.local/<host-ip>`
   - Bootstrap the master user + master Chrome dir with correct perms
   - Start `livos`, `liv-core`, `liv-worker`, `liv-memory` services
   - Print a "next step" URL: `https://livinity.local/setup` (or similar)
     with one-click CA cert download + per-platform trust instructions
3. Visit `https://bruce.livinity.local` from a LAN client whose DNS points
   at the install host (or `/etc/hosts` override for the first test) → see
   the LivOS UI rendered, TLS green after CA cert install.
4. The cloud path is untouched: `bash /opt/livos/update.sh` on the existing
   Mini PC still works exactly as it does at deployed SHA `dab261cc...`.

## Docker UAT — the test methodology

The success bar is that THE ORCHESTRATOR (Claude) can run the install
end-to-end inside a Docker container on the developer's Windows machine,
take a screenshot of the working `https://bruce.livinity.local` UI, and
verify the dnsmasq + Caddy + livinityd stack is healthy — all without
touching the real Mini PC.

Container shape (subject to /gsd-plan-phase refinement):

- Base: `ubuntu:24.04` with systemd-in-docker (`--cgroupns=host
  --tmpfs /tmp --tmpfs /run --tmpfs /run/lock -v
  /sys/fs/cgroup:/sys/fs/cgroup:ro`) so livinityd's systemd units boot.
- GUI: Xvfb + fluxbox + x11vnc + noVNC inside the container so Claude can
  drive a browser via Chrome DevTools MCP against
  `http://localhost:6080/?host=...&port=...` from the host.
- Network: bridge mode, host-port-forwarded `:80, :443, :53/udp, :6080,
  :5900` so the host can reach the local LAN endpoints and DNS.
- Cleanup: idempotent rebuild via `docker compose down -v && docker compose
  up --build`.

Container artifacts (proposed):
- `docker/local-uat/Dockerfile`
- `docker/local-uat/docker-compose.yml`
- `docker/local-uat/entrypoint.sh` (clones repo, runs install.sh --mode local)
- `docker/local-uat/README.md` (developer "how to run the UAT")

## Building blocks — already designed in the research doc

The technical approach is fully specified in
`.planning/research/local-livinity-setup.md` (490 lines, committed
`e5864b2b`). Highlights:

- **DNS:** dnsmasq with one line `address=/.livinity.local/<host-ip>` →
  wildcard for every `<username>.livinity.local`.
- **TLS:** Caddy built-in `tls internal` issuer with named custom CA
  (`LivOS Local CA`). Root cert served at
  `http://<host>:80/api/local/ca.crt` so users can one-click install.
- **Caddy routing:** new `generateLocalCaddyfile(localDomain)` function that
  emits the `pki { ca liv-local { ... } }` global block + a wildcard
  `*.livinity.local` virtual host pointing at livinityd `:8080`.
- **Mode persistence:** Redis key `livos:domain:local_mode=true` so
  livinityd boot path knows to skip ACME / Cloudflare DNS challenge.

The research doc breaks this into 7 sub-phases (104–110); `/gsd-plan-phase
104` should consolidate or split them as fits the plan budget. Open
questions Q1–Q5 in the research doc (Android system CA, dnsmasq DHCP
option 6, macOS/iOS mDNS interception of `.local`, etc.) should be
answered or explicitly punted before the plan locks.

## Locked decisions (sourced from this conversation)

- **D-104-LOCAL-DOMAIN:** Local TLD is `.livinity.local` (mirrors the
  cloud `.livinity.io` pattern; user explicitly proposed
  `{username.livinity.local}` shape).
  - Open question Q3 from research doc may force a flip to `.livos.home`
    or `.internal` if macOS/iOS unicast-DNS interception of `.local` blocks
    the address record from reaching the OS resolver. To validate during
    /gsd-plan-phase.
- **D-104-INSTALL-ENTRY:** Single `install.sh` is the user-facing entry
  point. Local-mode vs cloud-mode resolution is a /gsd-discuss-phase
  decision (Options A/B/C above).
- **D-104-NO-PROD-IMPACT:** The cloud Mini PC deploy at SHA `dab261cc` must
  continue to function unchanged. CI gate: a regression test that runs
  `update.sh` against a Mini-PC-like container after every install.sh
  change and asserts services come up healthy.
- **D-104-DOCKER-UAT-FIRST:** The Docker container UAT is the GO/NO-GO
  gate for the install.sh. No "ship to Mini PC" until the Docker UAT is
  green end-to-end.

## Suggested wave layout (for /gsd-plan-phase)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 104-01 | `docker/local-uat/` scaffolding — Dockerfile, compose, entrypoint, noVNC bridge. Sanity: `docker compose up` boots Ubuntu with systemd + noVNC. |
| 2 | 104-02, 104-03 | `install.sh` skeleton + dnsmasq install/config block + livinityd `LOCAL_MODE` bootstrap |
| 3 | 104-04, 104-05 | Caddy `pki` block + wildcard virtual host (the `generateLocalCaddyfile` function from research doc); CA cert export endpoint |
| 4 | 104-06 | Enrollment wizard UI (Settings → Local Access tab) — QR code, per-platform trust instructions |
| 5 | 104-07 | Cloud-mode regression test — install.sh `--mode cloud` reproduces the existing Mini PC behavior byte-for-byte against a second container |
| 6 | 104-08 | Docker UAT end-to-end run — Claude drives the noVNC bridge, signs into a fake user, confirms wildcard subdomain routing |

## What lands in the repo (rough file tree)

```
docker/local-uat/                       NEW
  Dockerfile
  docker-compose.yml
  entrypoint.sh
  README.md

scripts/
  install.sh                            NEW (the user-facing one-shot)
  install-local-bootstrap.sh            NEW (helper, sourced by install.sh)
  install-cloud-bootstrap.sh            NEW (helper, sourced by install.sh)

livos/packages/livinityd/source/modules/
  local-dns/                            NEW
    dnsmasq-config.ts
    pki.ts
    routes.ts                           (local.activate, local.getStatus)

  domain/
    caddy.ts                            EDIT — new generateLocalCaddyfile()

  server/index.ts                       EDIT — public GET /api/local/ca.crt

livos/packages/ui/src/features/
  local-setup/                          NEW
    LocalSetupWizard.tsx
    QrCodeStep.tsx
    PlatformInstructions.tsx

.planning/phases/104-local-install-and-docker-uat/
  104-CONTEXT.md                        this file
  (more artifacts will land via /gsd-plan-phase)
```

## Next step for the orchestrator after `/clear`

The user wants to start the next session by running the GSD pipeline. After
`/clear`, the suggested command sequence is:

```
/gsd-discuss-phase 104       # surface gray-area decisions (Option A vs B vs C, .local vs .livos.home, etc.)
/gsd-plan-phase 104          # build the wave plans
/gsd-execute-phase 104       # Wave 1+2 autonomous; Wave 5+ user-walked or autonomous-with-Docker-checkpoint
```

If the user prefers to skip discuss and go directly to planning, they can
run `/gsd-plan-phase 104` immediately — this CONTEXT.md provides enough
locked-decision surface for the planner to draft sensible plans without
asking redundant questions.

## Sacred SHA invariant

`liv/packages/core/src/sdk-agent-runner.ts` MUST equal
`f3538e1d811992b782a9bb057d1b7f0a0189f95f` after every Phase 104 commit.
The pre-commit hook installed in Phase 100-01 enforces this; no Phase 104
plan should touch that file.

---

## Post-research refinements (2026-05-11 — after 104-RESEARCH.md `6bac9e31`)

These supersede the gray-area / open-question entries above. The planner
MUST treat the following as **LOCKED**:

### D-104-INSTALL-ENTRY (resolved) — single `install.sh` with `--mode` flag

User decision 2026-05-11: **Option A** — one `install.sh` artifact, mode
resolved via `--mode {cloud|local-lan|hybrid}` flag (Options B/C from the
matrix above are retired).

### D-104-INSTALL-MODES (NEW, locked) — three modes

| Mode | TLD | DNS | TLS | Apple LAN clients | Server5 relay traffic |
|------|-----|-----|-----|--------------------|----------------------|
| `cloud` | `*.livinity.io` | Cloudflare DNS-only → Server5 → tunnel → Mini PC | Let's Encrypt DNS-01 (Cloudflare API token) | ✅ | YES (existing Mini PC at `dab261cc` — unchanged) |
| `local-lan` | `*.livinity.local` | dnsmasq → host LAN IP | Caddy `tls internal` named-CA `LivOS Local CA` | ❌ macOS/iOS broken (RFC 6762 + macOS 26 mDNS interception) — documented air-gap mode | NONE |
| **`hybrid` (DEFAULT)** | `*.<random>.home.livinity.io` (LivOS-provisioned) OR `*.home.<user-domain>` | Public DNS A-record → LAN IP `192.168.x.y` | Let's Encrypt DNS-01 (Cloudflare API token; LivOS holds the apex zone for `home.livinity.io`) | ✅ All Apple devices work | NONE (DNS is the only Server5 touch; traffic goes LAN-direct) |

### D-104-DEFAULT-MODE (NEW, locked) — `hybrid`

`install.sh` without an explicit `--mode` argument defaults to `hybrid`.
Wizard step 1 confirms before proceeding. Reasoning: covers iPhone/iPad/Mac
users (largest LAN-client segment), zero relay traffic, only requires LivOS
to host one apex DNS zone (`home.livinity.io`) on Server5.

### D-104-LOCAL-DOMAIN (revised) — TLD per mode (was `.livinity.local` only)

The original `.livinity.local` lock is RETIRED. Research 6bac9e31 §Q3-RESOLVED
proves it is broken on every Apple client (RFC 6762 §3 mDNS interception)
AND macOS 26 extends interception to ALL custom TLDs (`.internal`,
`.home.arpa`, `.lan`, `.test`). Per-mode TLDs are now D-104-INSTALL-MODES
above.

### D-104-RELAY-ZERO-DATA-PLANE (NEW, locked) — minimize Server5 traffic

User strategic concern 2026-05-11: "cogu sey livintiy de relay kullaniyor bu
cok can sikici" — relay traffic on Server5 is actively painful. Phase 104
LOCKS this principle: `local-lan` and `hybrid` modes MUST NOT route any
user data-plane traffic through Server5. Acceptable Server5 touches in
these modes: (a) apex DNS zone hosting for `home.livinity.io`, (b)
Let's Encrypt ACME DNS-01 challenges (periodic, control-plane), (c)
optional one-time invite redemption. Anything else MUST go LAN-direct or
direct-to-Cloudflare. (Separate audit phase will map cloud-mode relay
paths post 104 — `.planning/research/server5-relay-audit.md` in flight.)

### D-104-CADDY-PKI-IMPORT (NEW, locked) — global block pattern

For `local-lan` mode, the `pki { ca liv-local { ... } }` global block lives
in `/etc/caddy/pki-global.conf`, provisioned once by install.sh. livinityd's
`generateLocalCaddyfile()` emits an `import /etc/caddy/pki-global.conf`
line at the top — it NEVER inlines or regenerates the pki block. This
prevents the "named CA disappears on Caddyfile regeneration" pitfall
(research 6bac9e31 §Pitfall 1). For `hybrid` mode, Caddy uses Cloudflare
DNS-01 (no pki block needed — Let's Encrypt issues directly).

### D-104-UAT-IMAGE (NEW, locked) — base Docker image

Docker UAT base: `trfore/docker-ubuntu2404-systemd:latest`. Run flags:
`--privileged --cgroupns=host --tmpfs /run --tmpfs /tmp -v /sys/fs/cgroup:rw`.
WSL 2.5.1+ required on Windows hosts for cgroup v2 default (developer
runs Windows — verify before Docker UAT plan ships).

### D-104-UAT-CDP-BIND (NEW, locked) — Chrome DevTools MCP gotcha

Chrome inside the UAT container MUST launch with BOTH
`--remote-debugging-port=9223` AND `--remote-debugging-address=0.0.0.0`.
Default 127.0.0.1 bind silently breaks host→container CDP — the host's
`chrome-devtools-mcp --browserUrl http://127.0.0.1:9223` connects but
every command times out. This is the single most-likely UAT failure mode
to mis-diagnose.

### Q1–Q5 status after research

- **Q1 (Android CA trust):** PUNTED — stock Chrome on Android 14+ cannot
  trust user-installed CAs. Recommendation: ship Firefox-on-Android
  instructions for `local-lan`; `hybrid` mode sidesteps the problem
  entirely (real Let's Encrypt cert).
- **Q2 (dnsmasq DHCP option 6):** RESOLVED — local-lan provisions a single
  `address=/.livinity.local/<host-ip>` rule; DHCP option 6 is the user's
  router responsibility (documented in wizard, not automated by install.sh).
- **Q3 (.local on macOS/iOS):** RESOLVED — broken on all Apple, see
  D-104-INSTALL-MODES above.
- **Q4 (multi-NIC host IP):** RESOLVED — install.sh prompts for host IP
  with `hostname -I | awk '{print $1}'` as a default; user confirms or
  overrides.
- **Q5 (Caddy `tls internal` cert lifetime / rotation):** RESOLVED — default
  12 hours intermediate, 90 days root, automated rotation. Root CA cert
  download endpoint serves the current root; if rotation happens, all
  existing trust stores need re-enrollment. Acceptable for `local-lan`
  (typically homelabs with low device churn); not a concern for `hybrid`
  (real LE certs).

### Suggested wave layout (revised — overrides "Suggested wave layout" above)

| Wave | Plans | What it builds |
|------|-------|----------------|
| 1 | 104-01 | `docker/local-uat/` scaffolding — Dockerfile from `trfore/docker-ubuntu2404-systemd:latest`, compose, entrypoint, noVNC bridge, Chrome with `--remote-debugging-address=0.0.0.0`. Sanity: `docker compose up` boots Ubuntu with systemd + noVNC + browsable Chrome from host. |
| 2 | 104-02 | `install.sh` skeleton with `--mode {cloud,local-lan,hybrid}` flag dispatch + shared helpers (`scripts/install/mode-*.sh`); idempotent system-package install; host-IP detection; non-interactive Cloudflare API token capture. |
| 3 | 104-03 | `local-lan` mode: dnsmasq install/config + `import /etc/caddy/pki-global.conf` provision + `generateLocalCaddyfile()` in livinityd. |
| 3 | 104-04 | `hybrid` mode: Cloudflare DNS-01 via existing Caddy module + LivOS-provisioned `<random>.home.livinity.io` apex zone delegation; wizard step that mints the random subdomain via Server5 (one-time control-plane API call). |
| 4 | 104-05 | Enrollment wizard UI (`Settings → Local Access` tab) — mode picker, QR code, per-platform trust instructions, CA cert download (local-lan only). |
| 5 | 104-06 | `cloud` mode regression test: install.sh `--mode cloud` runs inside a second UAT container and reproduces Mini PC `dab261cc` services byte-for-byte (livinityd, liv-core, liv-worker, liv-memory all healthy; Caddy uses Cloudflare DNS-01). |
| 6 | 104-07 | Docker UAT end-to-end run for `hybrid` (default): Claude drives noVNC, signs into a fake user, confirms wildcard subdomain routing, screenshots green padlock on Mac-equivalent Chrome. |

Plan count: 7 (was 6 in initial CONTEXT.md). Wave 3 has two parallel plans
(local-lan vs hybrid backends).

### What changes about non-goals

The "Remote access from outside the LAN is OUT OF SCOPE" non-goal stands.
The "Must NOT break cloud Mini PC deploy" non-goal stands and is now
testable via 104-06's `--mode cloud` regression test. The "Must NOT touch
sacred sdk-agent-runner.ts" non-goal stands.

NEW non-goal: Migrating an existing `cloud`-mode Mini PC to `hybrid` is
OUT OF SCOPE for Phase 104. A `--migrate-from cloud-to-hybrid` flag may
ship in a follow-up; Phase 104 only handles greenfield installs.


