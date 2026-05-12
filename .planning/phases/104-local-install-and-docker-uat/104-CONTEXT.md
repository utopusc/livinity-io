---
phase: 104
title: One-shot local install (install.sh) + Docker Ubuntu GUI UAT
parent_research: .planning/research/local-livinity-setup.md
created: 2026-05-11
status: draft (awaiting /gsd-plan-phase 104)
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
