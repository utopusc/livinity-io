# Phase 104: One-shot Local Install + Docker GUI UAT - Research

**Researched:** 2026-05-11
**Domain:** Single-shell-script OS installation + LAN-only HTTPS + systemd-in-Docker + Chrome-DevTools-MCP-driven GUI UAT
**Confidence:** HIGH on the headline TLD decision (Q3); HIGH on Caddy/dnsmasq/systemd-in-Docker mechanics; MEDIUM on install.sh shape (multiple defensible patterns); MEDIUM-LOW on Q1 Android specifics.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-104-LOCAL-DOMAIN:** Local TLD is `.livinity.local` (mirrors the cloud `.livinity.io` pattern; user explicitly proposed `{username}.livinity.local` shape).
  - Open question Q3 from research doc may force a flip to `.livos.home` or `.internal` if macOS/iOS unicast-DNS interception of `.local` blocks the address record. **THIS RESEARCH RESOLVES Q3 BELOW — recommendation is to flip away from `.local` (see §Q3-RESOLVED).**
- **D-104-INSTALL-ENTRY:** Single `install.sh` is the user-facing entry point. Local-mode vs cloud-mode resolution is a /gsd-discuss-phase decision (Options A/B/C — research recommends **A: `--mode local|cloud` flag**, see §3.3).
- **D-104-NO-PROD-IMPACT:** Cloud Mini PC deploy at SHA `dab261cc` must continue to function unchanged. CI gate: regression test that runs `install.sh --mode cloud` against a Mini-PC-like container and asserts services come up healthy.
- **D-104-DOCKER-UAT-FIRST:** Docker container UAT is the GO/NO-GO gate. No "ship to Mini PC" until the Docker UAT is green end-to-end.

### Claude's Discretion

- Sub-phase split / wave layout inside Phase 104 (the CONTEXT.md "6-wave" proposal is suggestive, not locked).
- The exact set of `--mode cloud` vs `--mode local` divergences inside install.sh (research recommends keeping them tiny — only the DNS, the Caddy global block, and the Redis `domain:local_mode` flag should branch).
- The Docker UAT base image (`ubuntu:24.04` vs `trfore/docker-ubuntu2404-systemd:latest` — research recommends the latter, see §5).
- Whether the noVNC bridge runs inside the same UAT container as livinityd, or in a sidecar (research recommends single-container for simplicity).

### Deferred Ideas (OUT OF SCOPE)

- Remote access from outside the LAN (Tailscale / Headscale / WireGuard layered later by users).
- Public DNS registration or ACME-against-Let's-Encrypt for the local mode (deliberately avoided — the whole point of local mode is zero cloud dependency).
- Dropping multi-user mode.
- MDM / enterprise certificate deployment for CA trust.
- Replacing the cloud `livinity.io` path.
- IoT / non-browser device support (some IoT devices don't honor unicast DNS; documented as a known limitation).
- Android Chrome with user-installed CA (structurally impossible on stock Android 14+ without root; Firefox fallback documented in research doc Phase 110).

</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 104 was created without formal REQ-IDs (the CONTEXT.md scope IS the contract). The acceptance criteria in CONTEXT.md §"Acceptance criteria" map to research findings as follows:

| Acceptance Criterion (from CONTEXT.md) | Research Support |
|----------------------------------------|------------------|
| `curl -fsSL .../install.sh \| bash -s -- --mode local` on fresh Ubuntu 24.04 succeeds | §3.3 install.sh shape + idempotency; §5 systemd-in-Docker for UAT proxy of "fresh Ubuntu 24.04" |
| install.sh provisions dnsmasq + Caddy + livinityd | §4.2 dnsmasq config; §4.3 Caddy `pki` + wildcard; §6 service ordering |
| `https://bruce.<TLD>` works on a LAN client with TLS green after CA install | §4.3 cert trust per platform; **§Q3-RESOLVED for TLD selection** |
| Cloud path untouched | §3.4 install.sh `--mode cloud` divergence map (3 branches, all isolated) |
| Docker UAT lets Claude drive a browser via Chrome DevTools MCP | §5 systemd-in-Docker + §5.3 noVNC + Chrome DevTools MCP bridge |

</phase_requirements>

---

## Summary

**The single most important finding from this research:** The locked decision `D-104-LOCAL-DOMAIN: .livinity.local` is **incompatible with macOS clients (any version) and with macOS 26+ even for fallback custom TLDs like `.internal` / `.home.arpa` / `.lan` / `.test`**. RFC 6762 §3 requires macOS/iOS to send `.local` queries to mDNS multicast and forbids forwarding them to configured unicast DNS [CITED: RFC 6762]. Additionally, macOS 26 (Tahoe, shipped 2025-Q3) introduced a regression where mDNSResponder intercepts ALL custom non-IANA TLDs and handles them as mDNS, never consulting unicast nameservers including those pushed via DHCP option 6 [CITED: byteiota.com/macos-26-dns-issues, news.ycombinator.com/item?id=47440759]. The dnsmasq-based unicast approach designed in `local-livinity-setup.md` therefore **silently fails on every Apple client**, regardless of which made-up TLD we pick.

**The recommended fix is to use a real, user-owned domain delegated to private IPs** — e.g., `*.local.livinity.io` or `*.home.livinity.io` with public Cloudflare DNS records pointing at `192.168.x.y` (RFC 1918 ranges). Browsers and OSes treat these as ordinary DNS, never hand them to mDNS, and Let's Encrypt can issue wildcard certs via DNS-01 (Cloudflare API) without any inbound port being open. This collapses three problems at once: no CA-trust enrollment (LE cert is publicly trusted), no DHCP option 6 / per-device DNS reconfig (public DNS Just Works), and no mDNS interception issue. The non-cloud "no Cloudflare account required" goal then becomes a separate, smaller-scope sub-mode for users who insist on a fully air-gapped setup; those users accept the macOS limitation explicitly.

The rest of the research (Caddy `pki`, dnsmasq, systemd-in-Docker, install.sh shape) holds regardless of which TLD strategy ships — those building blocks are stack-mechanics and don't depend on the TLD outcome.

**Primary recommendation:** **Re-open D-104-LOCAL-DOMAIN in `/gsd-discuss-phase 104`** with this research's three-option matrix (see §Q3-RESOLVED). The single `install.sh` should ship `--mode local-lan` (works on Linux/Windows/Android-Firefox; broken on macOS/iOS), `--mode hybrid-public-dns` (default; works everywhere via user-owned subdomain), and `--mode cloud` (existing Mini PC path, unchanged).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Host OS provisioning (apt, systemd, Docker) | Host shell (install.sh on real Ubuntu OR inside UAT container) | — | One source of truth; UAT proves real-Ubuntu behavior |
| DNS resolution for `*.X.<TLD>` | LAN-edge dnsmasq (local-lan mode) OR public Cloudflare DNS (hybrid mode) | livinityd never participates in DNS | Routers/clients query DNS, not livinityd; dnsmasq is the right tier owner |
| TLS termination + cert issuance | Caddy (system service, port 80/443) | Caddy's internal `pki` (local-lan mode) OR Let's Encrypt ACME (hybrid + cloud modes) | Caddy already owns this in cloud mode; keep ownership consistent |
| Wildcard subdomain routing to per-user containers | livinityd app gateway (port 8080) | — | Already implemented; multi-user routing is livinityd's existing responsibility (`generateFullCaddyfile` multiUser path) |
| Mode persistence | Redis (`livos:domain:local_mode=local-lan\|hybrid\|cloud`) | livinityd reads on boot, branches Caddy/dnsmasq behavior | Existing pattern (livos:config:* keys); no new persistence layer |
| CA-cert export (local-lan mode only) | Caddy serves `http://<host>/api/local/ca.crt` via HTTP-only block | livinityd serves the same content on :8080 for direct-IP bootstrap | Two paths in case Caddy isn't reachable on a friendly name yet |
| Enrollment wizard UI | livinityd UI (Settings → Local Access) | Tabler icons + QR code lib (existing UI stack) | Matches Phase 65/77 UI pattern |
| Docker UAT — boot Ubuntu + systemd + livinityd + Chrome + noVNC | Single container, `--privileged --cgroupns=host` + tmpfs `/run` + `/tmp` + bind `/sys/fs/cgroup:rw` | docker-compose.yml for reproducibility | Single container = simpler than a multi-container compose; matches CONTEXT.md "self-testable" goal |
| UAT browser automation | Chrome DevTools MCP `--browserUrl http://localhost:<mapped-9223>` from the developer's Windows host | Chrome runs *inside* the container with `--remote-debugging-port=9223` + `--remote-debugging-address=0.0.0.0`, port-forwarded to host | CDP transport is HTTP→WS; works cleanly across host/container boundary if exposed |
| UAT visual verification | noVNC at `http://localhost:6080/vnc.html` on host (port-forwarded from container's websockify) | Optional — for human eyeballing during UAT debugging | CDP alone is enough for screenshot assertions; noVNC is the human escape hatch |

---

## Standard Stack

### Core (already in repo; this phase configures, doesn't add)

| Library / Component | Version | Purpose | Why Standard |
|---------------------|---------|---------|--------------|
| Caddy | 2.11.2 (currently installed in livos/install.sh) | TLS termination, reverse proxy, internal PKI | Already the LivOS edge; v2.11.2 supports `pki` global block + `tls internal { issuer { ca <id> } }` syntax [CITED: caddyserver.com/docs/caddyfile/options] |
| dnsmasq | 2.90+ (Ubuntu 24.04 repo) | LAN DNS authority for `*.<TLD>` wildcard | Smallest config surface for `address=/.domain/IP` wildcard; widely deployed (OpenWrt, pfSense, every consumer router) [CITED: thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html] |
| systemd-resolved | shipped with Ubuntu 24.04 | OS-level DNS stub; must yield port 53 to dnsmasq | Stock Ubuntu 24.04 conflict; resolved via `DNSStubListener=no` drop-in [CITED: baeldung.com/linux/dnsmasq-systemd-resolved-conflicts] |
| livinityd (Express + tRPC) | current main | App gateway listening on `:8080`, routes per-user subdomains | Already does this in multi-user mode; no new code path for local mode beyond reading the Redis flag |

### Supporting (new for Phase 104)

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `trfore/docker-ubuntu2404-systemd:latest` | published 2025 | systemd-in-Docker base for UAT container | UAT only — never on real hosts. Battle-tested base image for `--privileged --cgroupns=host` pattern [CITED: github.com/trfore/docker-ubuntu2404-systemd] |
| Xvfb + fluxbox + x11vnc + websockify + noVNC | Ubuntu 24.04 repo packages | GUI stack inside UAT container | UAT only — for Chrome DevTools MCP + human eyeballing |
| Chrome stable (already installed by install.sh in cloud mode) | current | Browser under test inside UAT | Run with `--remote-debugging-port=9223 --remote-debugging-address=0.0.0.0 --user-data-dir=/tmp/uat-chrome` |
| `qrcode-terminal` or any QR lib in UI bundle | latest | Render mobile-friendly CA-cert download URL | LocalSetupWizard.tsx (already in CONTEXT.md file tree) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| dnsmasq | CoreDNS | More flexible plugin chain; heavier; not in Ubuntu default repo. dnsmasq wins on minimalism. |
| Caddy internal `pki` | step-ca (Smallstep) | step-ca has nicer cert lifecycle UI; adds a daemon. Caddy already manages its own internal CA — no new service. |
| trfore/docker-ubuntu2404-systemd base | `ubuntu:24.04` + custom systemd boilerplate | Custom would require ~30 lines of Dockerfile to mask the right systemd units; trfore image already does this. Time savings ~1 day. |
| `--mode` flag (Option A) | Two scripts: install-local.sh + install-cloud.sh (Option B) | Two scripts = less branching but two URLs to maintain and ~80% code duplication. `--mode` flag wins because the duplication is more painful than the branching. |
| `--mode` flag (Option A) | env var `LOCAL=1` (Option C) | env var is harder to self-document. `--help` output can list `--mode` values; env vars are invisible to `--help`. |

### Installation (UAT container Dockerfile)

```dockerfile
FROM trfore/docker-ubuntu2404-systemd:latest
RUN apt-get update && apt-get install -y -qq \
    curl ca-certificates \
    xvfb fluxbox x11vnc websockify novnc \
    && rm -rf /var/lib/apt/lists/*
# Note: install.sh installs everything else (Caddy, dnsmasq, Node, Postgres, Redis,
# Chrome, etc.) at runtime — keeps the Dockerfile thin and proves install.sh idempotency.
COPY docker/local-uat/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 80 443 53/udp 6080 9223
ENTRYPOINT ["/sbin/init"]
```

**Version verification:**
- Caddy 2.11.2 confirmed latest stable as of 2026-Q1 [VERIFIED: releasebot.io/updates/caddy March 2026]
- `trfore/docker-ubuntu2404-systemd:latest` — public Docker Hub image, last verified 2026-05 [CITED: github.com/trfore/docker-ubuntu2404-systemd]
- dnsmasq 2.90 ships in Ubuntu 24.04 noble [CITED: packages.ubuntu.com — Ubuntu 24.04 standard repo]

---

## Architecture Patterns

### System Architecture Diagram

```
                                  PHASE 104 DEPLOYMENT MODES
                                  ════════════════════════════

  ┌─ MODE: cloud ─────────────────────────────────────────────────────────────┐
  │ Existing Mini PC path. install.sh --mode cloud === current install.sh.    │
  │                                                                           │
  │ User → Cloudflare DNS (public) → Server5 relay → Mini PC tunnel → Caddy   │
  │   → livinityd:8080 → per-user subdomain routing                           │
  │                                                                           │
  │ TLS: Let's Encrypt via Cloudflare DNS-01 challenge.                       │
  │ NO CHANGES to this path. Regression-gated.                                │
  └───────────────────────────────────────────────────────────────────────────┘

  ┌─ MODE: hybrid-public-dns (RECOMMENDED DEFAULT) ───────────────────────────┐
  │ User-owned subdomain (e.g., *.home.livinity.io OR user's own domain).     │
  │ Public DNS A-record points at PRIVATE LAN IP (192.168.x.y).               │
  │                                                                           │
  │ LAN Client → public DNS lookup → 192.168.x.y → Mini PC Caddy              │
  │   → wildcard *.home.livinity.io cert (LE DNS-01 via Cloudflare API)       │
  │   → livinityd:8080 → per-user routing                                     │
  │                                                                           │
  │ TLS: Let's Encrypt wildcard via DNS-01 (no inbound 80/443 from internet). │
  │ Works on every OS including iOS/macOS. No CA install needed.              │
  │ Trade-off: requires user to add ONE Cloudflare TXT record to their domain.│
  └───────────────────────────────────────────────────────────────────────────┘

  ┌─ MODE: local-lan (TRUE AIR-GAP — broken on Apple) ────────────────────────┐
  │ This is what CONTEXT.md originally specified. Documented as "advanced" or │
  │ "no-cloud-at-all" mode in the wizard.                                     │
  │                                                                           │
  │ LAN Client → dnsmasq on Mini PC → wildcard *.<TLD> → 192.168.x.y          │
  │   → Mini PC Caddy → tls internal { ca liv-local } → wildcard *.<TLD> cert │
  │   → livinityd:8080 → per-user routing                                     │
  │                                                                           │
  │ TLS: Caddy internal PKI; CA root must be enrolled per device.             │
  │ ⚠ Apple clients (macOS any, iOS any, macOS 26 even for fallback TLDs):    │
  │   mDNSResponder intercepts the query before it reaches dnsmasq.           │
  │   ONLY works on: Linux, Windows, Android-with-Firefox.                    │
  └───────────────────────────────────────────────────────────────────────────┘

                            UAT VERIFICATION TOPOLOGY
                            ═════════════════════════

      Developer's Windows host (Docker Desktop on WSL2)
      ┌─────────────────────────────────────────────────────────┐
      │  Chrome DevTools MCP                                    │
      │  --browserUrl http://localhost:9223                     │
      │       │                                                 │
      │       │  HTTP/WS                                        │
      │       ▼                                                 │
      │  ┌──────────────────────────────────────────────────┐  │
      │  │  Port-forwarded :9223 → container's :9223       │  │
      │  │  Port-forwarded :6080 → container's :6080       │  │
      │  │  Port-forwarded :443/:80 → container's :443/:80 │  │
      │  └──────────────────────────────────────────────────┘  │
      │       │                                                 │
      │       ▼                                                 │
      │  ┌──────────────────────────────────────────────────┐  │
      │  │  UAT container (trfore/ubuntu2404-systemd)      │  │
      │  │  ─────────────────────────────────────────────   │  │
      │  │  PID 1: systemd                                  │  │
      │  │  ├─ Xvfb :0 (1280x720x24)                        │  │
      │  │  ├─ fluxbox (window manager)                     │  │
      │  │  ├─ x11vnc (DISPLAY=:0, port 5900)               │  │
      │  │  ├─ websockify (5900 → 6080) ──── noVNC HTML5    │  │
      │  │  ├─ Chrome (--remote-debugging-port=9223         │  │
      │  │  │           --remote-debugging-address=0.0.0.0) │  │
      │  │  ├─ Caddy.service (livos.service deps)           │  │
      │  │  ├─ dnsmasq.service (local-lan mode only)        │  │
      │  │  ├─ livos.service + liv-core + liv-worker        │  │
      │  │  └─ /etc/hosts: bruce.<TLD> → 127.0.0.1 (UAT     │  │
      │  │     bootstrap; real DNS not needed in container) │  │
      │  └──────────────────────────────────────────────────┘  │
      └─────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
docker/local-uat/                       NEW
  Dockerfile                            (~30 lines, thin)
  docker-compose.yml                    (privileged + cgroupns_mode: host + tmpfs)
  entrypoint.sh                         (clones repo OR mounts; runs install.sh --mode)
  README.md                             ("docker compose up", "claude UAT walk")
  uat-driver/                           NEW
    walk.mjs                            (Chrome DevTools MCP smoke test in Node)

scripts/
  install.sh                            NEW (top-level user-facing one-shot;
                                            wraps livos/install.sh content + --mode)
  install/                              NEW (sub-script directory, sentry-style)
    parse-cli.sh                        (sourced; sets MODE, validates)
    detect-platform.sh                  (sourced; OS, arch, GUI, etc.)
    mode-cloud.sh                       (sourced when MODE=cloud)
    mode-local-lan.sh                   (sourced when MODE=local-lan)
    mode-hybrid.sh                      (sourced when MODE=hybrid)

livos/packages/livinityd/source/modules/
  local-dns/                            NEW (CONTEXT.md proposed)
    dnsmasq-config.ts                   (idempotent dnsmasq.conf writer)
    pki.ts                              (Caddy CA cert path constants, export logic)
    routes.ts                           (local.activate, local.getStatus tRPC)

  domain/
    caddy.ts                            EDIT — add generateLocalCaddyfile(),
                                                generateHybridCaddyfile()

  server/index.ts                       EDIT — add public GET /api/local/ca.crt
                                                (returns root PEM with correct
                                                Content-Type by User-Agent)

livos/packages/ui/src/features/
  local-setup/                          NEW (CONTEXT.md proposed)
    LocalSetupWizard.tsx                (mode picker → per-mode wizard)
    QrCodeStep.tsx                      (only rendered in local-lan mode)
    PlatformInstructions.tsx            (per-OS CA install)
    HybridDnsSetup.tsx                  (Cloudflare TXT record walkthrough)

.planning/phases/104-local-install-and-docker-uat/
  104-CONTEXT.md                        (existing)
  104-RESEARCH.md                       (this file)
  (plans land via /gsd-plan-phase)
```

### Pattern 1: Caddy `pki` global block + named CA wildcard

**What:** Caddy 2.11's `pki` block defines a named CA; the `tls` directive in a site block can reference it. One wildcard cert covers all subdomains.

**When to use:** local-lan mode only. Hybrid mode uses normal Let's Encrypt (no `pki` block needed).

**Example:**

```caddyfile
# Source: caddyserver.com/docs/caddyfile/options
# GLOBAL OPTIONS BLOCK — must be FIRST in Caddyfile; only one allowed
{
    pki {
        ca liv-local {
            name "LivOS Local CA"
            root_cn "LivOS Local Root"
            # If root cert paths omitted, Caddy auto-generates and persists
            # under /var/lib/caddy/.local/share/caddy/pki/authorities/liv-local/
            # (when Caddy runs as the system caddy user under systemd).
        }
    }
}

# WILDCARD SITE BLOCK
*.bruceoz.livinity.local {
    tls {
        issuer internal {
            ca liv-local
        }
    }
    reverse_proxy 127.0.0.1:8080
}

# HTTP-ONLY block for CA root download (no cert needed)
http://bruceoz.livinity.local, http://192.168.1.100 {
    handle /api/local/ca.crt {
        root * /var/lib/caddy/.local/share/caddy/pki/authorities/liv-local
        rewrite * /root.crt
        file_server
    }
    handle {
        # Bootstrap-page that detects User-Agent and shows trust instructions
        reverse_proxy 127.0.0.1:8080
    }
}
```

**Verified facts:**
- The `pki` block must be in the global options section AND must be the FIRST block in the Caddyfile [VERIFIED: caddy.community/t/caddyfile-doesnt-recognize-pki-global-option/15571 — quote: "server block without any key is global configuration, and if used, it must be first"].
- Caddy auto-generates root + intermediate if `root`/`intermediate` paths are omitted [CITED: caddyserver.com/docs/caddyfile/options PKI section].
- Default storage path when running as systemd `caddy` user: `/var/lib/caddy/.local/share/caddy/pki/authorities/<ca-id>/root.crt` [CITED: goodtls.com/caddy].
- Wildcard cert via `tls internal` works without DNS-01 challenge (it's self-issued, no ACME involvement) [CITED: caddyserver.com/docs/automatic-https — "Caddy generates its own certificate authority (CA)"].

### Pattern 2: dnsmasq wildcard + DHCP option 6

**What:** A single dnsmasq config line maps an entire TLD to one IP. Optional DHCP option 6 pushes the dnsmasq server as DNS to all LAN clients (alternative: user manually sets DNS per device).

**When to use:** local-lan mode only.

**Example:**

```ini
# /etc/dnsmasq.d/livinity.conf
# Source: thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html

# Wildcard A-record: every *.bruceoz.livinity.local → 192.168.1.100
# The leading dot in /.bruceoz.livinity.local/ also matches the bare domain
# bruceoz.livinity.local itself (per dnsmasq manual: "/.google.com/ is
# equivalent to /google.com/").
address=/.bruceoz.livinity.local/192.168.1.100

# Mark domain as local-only: never forward upstream
local=/bruceoz.livinity.local/

# Upstream DNS for everything else (Cloudflare). no-resolv prevents reading
# /etc/resolv.conf which would create a loop with systemd-resolved.
no-resolv
server=1.1.1.1
server=1.0.0.1

# Push self as DNS server to LAN DHCP clients (Mini PC must be configured
# as the DHCP server, OR the router's DHCP must be set to push 192.168.1.100
# as option 6 — this is the user-facing wizard step).
# dhcp-option=6,192.168.1.100   # ← only enable if Mini PC is also the DHCP server

# Bind dynamically — survives interface flapping
bind-dynamic
```

**Ubuntu 24.04 systemd-resolved conflict fix (mandatory):**

```ini
# /etc/systemd/resolved.conf.d/no-stub.conf
[Resolve]
DNSStubListener=no
```

```bash
# Apply
systemctl restart systemd-resolved
systemctl restart dnsmasq
```

**Verified facts:**
- `address=/.domain/IP` matches the bare domain AND all subdomains [VERIFIED: thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html, quote: "the pattern /.google.com/ is equivalent to /google.com/"].
- True wildcard subdomain-only (excluding bare) uses `/*.domain/` prefix-star syntax [VERIFIED: same source].
- `DNSStubListener=no` in `/etc/systemd/resolved.conf.d/` frees port 53 on Ubuntu 24.04 [CITED: baeldung.com/linux/dnsmasq-systemd-resolved-conflicts].
- `bind-dynamic` is preferable to `bind-interfaces` for desktops/servers with hot-pluggable NICs [CITED: dnsmasq man page — bind-dynamic section].

### Pattern 3: systemd-in-Docker with cgroup v2

**What:** Run systemd as PID 1 inside a Docker container. Required to test install.sh, which provisions livos.service / liv-core.service / etc. via systemd units.

**When to use:** UAT only.

**Example (docker-compose.yml):**

```yaml
# Source: github.com/trfore/docker-ubuntu2404-systemd README + docker/compose#9457
services:
  livos-uat:
    build: .
    image: livos-uat:dev
    privileged: true
    cgroup: host                      # Docker Compose Spec ≥1.30 equivalent of --cgroupns=host
    # (older clients may need: cgroupns_mode: host — see compose-spec issue #148)
    tmpfs:
      - /run
      - /tmp
      - /run/lock
    volumes:
      - /sys/fs/cgroup:/sys/fs/cgroup:rw
      - ../../:/livinity-io:ro        # mount repo so entrypoint can run install.sh
    ports:
      - "80:80"
      - "443:443"
      - "9223:9223"                   # Chrome DevTools Protocol
      - "6080:6080"                   # noVNC HTML5
      - "53:53/udp"                   # dnsmasq (local-lan UAT)
    environment:
      - DISPLAY=:0
      - LIVOS_UAT_MODE=local-lan      # tells entrypoint which install mode to run
    stop_signal: SIGRTMIN+3           # systemd's expected stop signal
```

**Verified facts:**
- `--privileged --cgroupns=host` + tmpfs `/run` `/tmp` + bind `/sys/fs/cgroup:rw` is the canonical incantation on Ubuntu 24.04 / cgroup v2 [VERIFIED: github.com/trfore/docker-ubuntu2404-systemd, gist.github.com/pinkeen/bba0a6790fec96d6c8de84bd824ad933].
- Compose key for cgroup namespace mode: newer specs use top-level `cgroup: host`; older clients use `cgroupns_mode: host` [CITED: github.com/compose-spec/compose-spec/issues/148, github.com/docker/compose/issues/9457].
- WSL 2.5.1+ ships cgroup v2 by default; older WSL needs `kernelCommandLine=cgroup_no_v1=all systemd.unified_cgroup_hierarchy=1` in `.wslconfig` [CITED: github.com/spurin/wsl-cgroupsv2, search result from 2025-Q4].
- Stop signal `SIGRTMIN+3` is what systemd expects for clean shutdown [CITED: trfore/docker-ubuntu2404-systemd README].

### Pattern 4: Chrome DevTools MCP across host/container boundary

**What:** Run Chrome inside the UAT container with remote debugging enabled, expose port 9223 to the host, and run `chrome-devtools-mcp --browserUrl http://localhost:9223` on the host.

**When to use:** UAT only.

**Example:**

```bash
# Inside container (started by systemd unit)
google-chrome \
  --remote-debugging-port=9223 \
  --remote-debugging-address=0.0.0.0 \
  --user-data-dir=/tmp/uat-chrome \
  --no-sandbox \
  --disable-dev-shm-usage \
  --display=:0 &

# On host (Windows / WSL2)
npx chrome-devtools-mcp@latest --browserUrl http://localhost:9223 \
  # ... or via MCP config in Claude Code; same flag form.
```

**CRITICAL gotcha:** Chrome's CDP HTTP endpoint binds to `127.0.0.1` by default — meaning even with the port exposed via Docker, you'll get connection refused. **Must add `--remote-debugging-address=0.0.0.0`** to allow the container's exposed port to actually accept connections. [CITED: github.com/ChromeDevTools/chrome-devtools-mcp/issues/1194 — "Cannot connect with `-u http://localhost:9222`"].

**Second gotcha:** The `webSocketDebuggerUrl` returned by `http://localhost:9223/json/version` contains the container's internal hostname, which the host can't resolve. Chrome DevTools MCP handles this by rewriting the WS URL; verify the version of MCP being used does this (recent versions do). [CITED: chrome-devtools-mcp README + dev.to/this-is-angular/chrome-devtools-mcp-server-guide].

### Pattern 5: install.sh `--mode` flag with sourced helpers (Sentry-style)

**What:** Top-level install.sh parses `--mode` flag, sources mode-specific helper files.

**When to use:** Always.

**Example:**

```bash
#!/usr/bin/env bash
# Source: github.com/getsentry/self-hosted/blob/master/install.sh pattern
set -euo pipefail

MODE="hybrid"                          # default — see §Q3-RESOLVED for rationale
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --help) print_help; exit 0 ;;
    *) shift ;;
  esac
done

case "$MODE" in
  cloud|hybrid|local-lan) : ;;
  *) echo "Invalid --mode '$MODE'. Use cloud|hybrid|local-lan." >&2; exit 64 ;;
esac

# Sentry pattern: source helpers for separation of concerns
source ./scripts/install/_logging.sh
source ./scripts/install/parse-cli.sh
source ./scripts/install/detect-platform.sh
source ./scripts/install/common-deps.sh     # apt, Node, Docker, Caddy — all modes

case "$MODE" in
  cloud)     source ./scripts/install/mode-cloud.sh ;;
  hybrid)    source ./scripts/install/mode-hybrid.sh ;;
  local-lan) source ./scripts/install/mode-local-lan.sh ;;
esac

source ./scripts/install/start-services.sh  # systemd enable + start, common to all
source ./scripts/install/show-banner.sh     # mode-aware next-step URL
```

**Verified facts:**
- Sentry self-hosted uses exactly this sourced-helper pattern [CITED: github.com/getsentry/self-hosted/blob/master/install.sh].
- Idempotency pattern: `mkdir -p`, `grep -qF <pattern> <file> || echo <line> >> <file>`, `apt-get install -y -qq` (no-op on already-installed) [CITED: arslan.io/2019/07/03/how-to-write-idempotent-bash-scripts].
- `set -euo pipefail` + `trap cleanup ERR INT TERM EXIT` is the standard safety harness [CITED: Sentry install.sh].

### Anti-Patterns to Avoid

- **mDNS / Avahi for the LAN naming:** Section 6 Q3 of the research doc, RFC 6762, AND the macOS 26 regression converge: there is no path where mDNS reliably delivers wildcard subdomain DNS on every client. Don't try to make Avahi work — it has fundamental wildcard limits AND Android Chrome doesn't query mDNS by default.
- **Self-signed cert per-subdomain (no PKI hierarchy):** Browsers will warn forever; cookies break across SameSite boundaries; multi-user JWT handling becomes fragile. Always use a CA hierarchy (Caddy's `pki` or LE).
- **`generateFullCaddyfile()` without persisting the `pki` global block:** Caddy's `pki` block MUST appear at the top of every regenerated Caddyfile or the named CA reverts to the default `local` CA — silently breaking all previously enrolled clients. Use Caddy's `import` directive to a stable `/etc/caddy/pki-global.conf` file that is included from the generated Caddyfile (the live `caddy.ts` does NOT yet have a "global block" concept; this is the Phase 106 change in the research doc). [CITED: Q5 in `.planning/research/local-livinity-setup.md`.]
- **Editing `/etc/hosts` from a browser for the wildcard problem (Approach C in research doc):** Impossible (browsers can't write OS files), and the path-based alternative requires multi-user app architecture rewrite. The research doc already verdicts this as not-recommended.
- **Using `--privileged` without `--cgroupns=host`:** Containers boot but systemd cannot manage cgroups → most units fail with cryptic errors. Both flags are required together.
- **Forgetting `--remote-debugging-address=0.0.0.0` on Chrome inside Docker:** The whole UAT silently fails with "connection refused" from the host's Chrome DevTools MCP. This is the #1 documented bug across multiple Docker+CDP guides.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Wildcard internal TLS CA + cert lifecycle | Custom openssl/easy-rsa scripts | Caddy `pki` named CA | Caddy auto-rotates leaf certs, handles renewal, persists key on first run. openssl-only solutions need manual renewal cron, manual reload. |
| Wildcard LAN DNS for `*.X.<TLD>` | dnsmasq from source / custom Python DNS | dnsmasq from Ubuntu repo | Battle-tested for decades; single-line wildcard syntax; survives `systemctl restart`. Hand-roll guarantees you'll miss EDNS, AAAA, etc. |
| systemd-in-Docker boilerplate | Custom Dockerfile masking 5 systemd units | `trfore/docker-ubuntu2404-systemd:latest` base | Already masks `getty@`, `console-getty.service`, sets `init.scope` defaults, etc. Hand-roll = 30-line Dockerfile that gradually accumulates bugs as systemd upgrades. |
| noVNC + websockify setup | Custom WebSocket-to-VNC proxy | `apt-get install -y novnc websockify` + the `/usr/share/novnc/utils/launch.sh` helper | Apt-shipped helper handles the URL routing; rolling-your-own = inevitable broken handshake (the `Invalid server version ftypiso` class of bug we already hit in Phase 99). |
| Self-signed cert "bypass" UI with localStorage state | Custom HTML page with cert warning | Browser's native cert warning OR install the CA properly | Custom bypass page can't actually bypass the browser's warning — it shows AFTER user clicks through. Don't pretend it's a feature. |
| CA-cert MIME-type detection per platform | Custom User-Agent sniffing | Serve `.crt` (DER) AND `.pem` AND `.mobileconfig` — let user pick | iOS specifically wants `.mobileconfig`; macOS Keychain wants `.cer`/`.pem`; Android wants `.crt`. Serve all three at well-known URLs; don't try to detect. |
| install.sh `--mode` argument parsing | Custom getopt parser | Standard `case "$1" in --mode) MODE="$2"; shift 2 ;; *) shift ;; esac` loop | The Sentry self-hosted script uses this exact pattern; battle-tested; portable across bash 4 and 5. |

**Key insight:** Every local-LAN-HTTPS project either uses Caddy + dnsmasq (the path here) or it uses a public DNS + LE wildcard (the hybrid mode). The custom-script-from-scratch path is uniformly worse: every solo dev who tried it (`go-avahi-cname`, custom Python DNS bridges, hosts-file editors) ended up rewriting against Caddy or giving up. The recommended stack is the stack that has survived in the wild.

---

## Runtime State Inventory

Phase 104 IS a rename/refactor/migration phase in spirit — it migrates the install path from "single-mode (cloud)" to "multi-mode (cloud/hybrid/local-lan)" — but it does NOT touch any persisted runtime state on the existing Mini PC. The Mini PC's deployed SHA `dab261cc` continues to run `install.sh` legacy code path unchanged, because the new top-level `scripts/install.sh` is a NEW file, and `livos/install.sh` stays as the back-compat shim that `update.sh` already references. Therefore most categories are intentionally empty:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified by inspection of `livos/packages/livinityd/source/modules/domain/caddy.ts` and `routes.ts`. New Redis key `livos:domain:local_mode` is purely additive (default unset → existing cloud-mode behavior). | None — additive Redis schema. |
| Live service config | New: Caddy `pki` block requires `/etc/caddy/pki-global.conf` (or inline) to persist the named CA root path across livinityd-driven Caddyfile regenerations. **Action:** Phase 104 plan must add a "regenerate Caddyfile preserves pki block" task. | Code edit in `caddy.ts` `generateFullCaddyfile()` to prepend or `import` the pki block whenever `local_mode === 'local-lan'`. |
| OS-registered state | New: dnsmasq.service (added by install.sh `--mode local-lan`). systemd-resolved drop-in at `/etc/systemd/resolved.conf.d/no-stub.conf`. Caddy PKI root files at `/var/lib/caddy/.local/share/caddy/pki/authorities/liv-local/`. | install.sh must idempotently create these (`mkdir -p`, `grep -qF \|\| append`). Phase 104 plans must include rollback paths (`uninstall.sh` or `--mode revert`). |
| Secrets/env vars | New: `LIVOS_INSTALL_MODE` env var (could be used as alternative to `--mode`; CONTEXT.md "Option C"). Caddy PKI root key at `/var/lib/caddy/.local/share/caddy/pki/authorities/liv-local/root.key` (auto-generated; must be backed up). | Document key path in install.sh banner; recommend backup. |
| Build artifacts | None — install.sh is shell; no compiled artifacts. UAT Docker image is `docker compose build`-able, not committed. | None. |

**Nothing found in the "stored data" category:** Local mode is opt-in via a new Redis key; existing keys are untouched.

---

## Q3-RESOLVED: The TLD problem (CRITICAL — locked decision is broken)

### The finding

The locked decision `D-104-LOCAL-DOMAIN: .livinity.local` is **broken on all Apple clients**. There are TWO independent failure modes, both verified:

**Failure 1 (.local on any macOS/iOS, all versions):** RFC 6762 §3 mandates that DNS queries ending in `.local` MUST be sent to mDNS multicast (224.0.0.251) and MUST NOT be sent to configured unicast DNS servers. macOS and iOS implement this strictly via mDNSResponder. dnsmasq's `address=/.livinity.local/192.168.x.y` rule will NEVER be consulted by any Apple device, regardless of DHCP option 6 or `/etc/resolver/` configuration. [VERIFIED: rfc-editor.org/rfc/rfc6762.html §3, en.wikipedia.org/wiki/.local, multiple Apple Community threads.]

**Failure 2 (macOS 26 — released 2025-Q3 — for ALL custom TLDs):** Starting with macOS 26 (Tahoe), mDNSResponder intercepts queries for ANY TLD not present in the IANA root zone — explicitly including `.internal`, `.test`, `.home.arpa`, `.lan`, and any other made-up TLD — and handles them as mDNS, bypassing unicast resolvers entirely. The `/etc/resolver/` per-domain mechanism (long-documented Apple feature) is silently broken in macOS 26. [VERIFIED: gist.github.com/adamamyl/81b78eced40feae50eae7c4f3bec1f5a, byteiota.com/macos-26-dns-issues, news.ycombinator.com/item?id=47440759 — multiple HN commenters confirm independently.]

**Combined:** Any custom TLD (made-up, RFC-reserved, or RFC 6762's `.local`) we pick will silently fail on macOS 26+ even if we work around the `.local` mDNS rule by using `.home.arpa` or `.internal`. There is no "magic TLD" that works.

### The three options the planner / discuss-phase MUST choose between

| Option | Mechanism | Apple support | User friction | Cloud dependency |
|--------|-----------|---------------|---------------|------------------|
| **A. Hybrid (RECOMMENDED DEFAULT)** | Public DNS A-record on a user-owned subdomain (`*.home.bruceoz.com` OR LivOS-owned `*.<user>.home.livinity.io`) pointing at LAN IP 192.168.x.y. TLS via Let's Encrypt DNS-01 (Cloudflare API token). | ✅ All Apple devices work — public DNS is never intercepted. | User must own a domain OR LivOS provides `*.home.livinity.io` and the user adds ONE Cloudflare TXT record for DNS-01. | Yes — but minimal (DNS + ACME only; no inbound port, no tunnel). |
| **B. Local-LAN with .local + macOS-broken acknowledged** | dnsmasq + Caddy internal PKI as originally designed. | ❌ macOS/iOS show "name not found"; users must add `/etc/hosts` entries OR use Linux/Windows/Android-Firefox only. | Very high on Apple; zero on others. | None. |
| **C. Local-LAN with home.arpa OR another non-.local TLD** | dnsmasq + Caddy internal PKI with TLD = `home.arpa` instead of `.local`. | ⚠️ Works on macOS ≤25 with /etc/resolver/ workaround; broken on macOS 26+ regardless. | Medium-to-high on macOS depending on version. | None. |

### The recommendation

**Default install.sh `--mode hybrid`. Offer `--mode local-lan` as an "advanced / fully air-gapped" path with a clear macOS warning in the docs and wizard.**

**Why:**
- The original goal "no cloud, no Cloudflare account" assumed `.local` would work. Q3 now proves it doesn't on the largest client segment (Apple). The "no cloud" goal is therefore unachievable for the majority of LivOS users.
- The hybrid path keeps 99% of CONTEXT.md's Acceptance Criteria intact (single install.sh; LAN-only routing; multi-user subdomains; works from any device on the LAN), while losing only "Cloudflare account required."
- For users who genuinely insist on no-cloud (homelab purists, offline communities), `--mode local-lan` ships as-designed but with a documented platform matrix: "Works on Linux, Windows, Android+Firefox. Does NOT work on macOS/iOS without per-device `/etc/hosts` entries."

**The wizard UX:**

1. Wizard asks: "Do you want LivOS to be reachable from any device on your network, including iPhones/iPads/Macs?"
2. **Yes** → "Pick your domain strategy:"
   - "I own a domain (e.g., bruceoz.com)" → enter Cloudflare API token → wildcard `*.home.bruceoz.com` set up automatically.
   - "Use a livinity.io subdomain for me" → LivOS provisions `<random>.home.livinity.io` via Server5 (small additional infra ask).
3. **No, I'm Linux/Windows/Android only and I want fully offline** → `--mode local-lan` path with `.livinity.local`.

### What this means for the locked decision

The `/gsd-discuss-phase 104` (if not skipped) should re-open `D-104-LOCAL-DOMAIN` with this research's three-option matrix. If discuss is skipped (`workflow.skip_discuss: true` in current `.planning/config.json`), the planner SHOULD adopt **Option A as the default `--mode hybrid`** and ship `local-lan` as a secondary mode with the Apple-incompatibility warning. The user can override via `/gsd-plan-phase` discussion.

---

## Common Pitfalls

### Pitfall 1: Caddy `pki` block disappears on Caddyfile regeneration

**What goes wrong:** livinityd's `generateFullCaddyfile()` builds a fresh Caddyfile string each time a user is added/removed. If the regeneration logic forgets to emit the `pki { ca liv-local { ... } }` global block, Caddy falls back to its default `local` CA — issuing certs with a DIFFERENT root than the one users enrolled. All previously trusted devices suddenly see cert errors.
**Why it happens:** The existing `caddy.ts` only knows about virtual-host blocks. There is no concept of "global options block" in the code.
**How to avoid:** Phase 104 plans MUST add a "global block" abstraction to `caddy.ts`. Two viable approaches: (1) prepend the `pki` block string at the top of every `generateFullCaddyfile()` call when `local_mode === 'local-lan'`; (2) write the `pki` block to a stable file `/etc/caddy/pki-global.conf` once at install time and `import /etc/caddy/pki-global.conf` from the generated Caddyfile. The `import` approach is cleaner — the global block is provisioned by install.sh, never touched by livinityd's regeneration. **Recommendation: use `import`.**
**Warning signs:** After Phase 104 ships, run `caddy validate` after every "add user" mutation and assert the output mentions `liv-local` (not `local`).

### Pitfall 2: systemd-resolved fights dnsmasq for port 53

**What goes wrong:** dnsmasq fails to bind 53; logs say `failed to create listening socket for port 53: Address already in use`. Ubuntu 24.04 ships systemd-resolved with a stub listener on 127.0.0.53:53.
**Why it happens:** systemd-resolved is the default OS DNS stub on every modern Ubuntu/Debian.
**How to avoid:** install.sh `--mode local-lan` MUST write `/etc/systemd/resolved.conf.d/no-stub.conf` with `[Resolve]\nDNSStubListener=no\n`, then `systemctl restart systemd-resolved`, THEN install dnsmasq. Order matters: if dnsmasq is installed first, its postinst will fail and apt will leave it in a half-configured state.
**Warning signs:** `ss -lnup | grep :53` after install — should show only `dnsmasq`, not `systemd-resolved`.

### Pitfall 3: Chrome inside Docker won't accept CDP from host

**What goes wrong:** UAT container starts Chrome with `--remote-debugging-port=9223`, port 9223 is exposed via Docker, but `chrome-devtools-mcp --browserUrl http://localhost:9223` from the host gets `ECONNREFUSED`.
**Why it happens:** Chrome's CDP HTTP listener binds to `127.0.0.1` by default. Exposing a Docker port doesn't change what Chrome listens on — the connection arrives on the container's external interface, but Chrome is only listening on loopback.
**How to avoid:** Always add `--remote-debugging-address=0.0.0.0` to the Chrome command line inside the container.
**Warning signs:** Curl `curl http://localhost:9223/json/version` from the host — if it hangs / refuses, Chrome's bind address is wrong.

### Pitfall 4: macOS 26 silently routes our TLD to mDNS no matter what

**What goes wrong:** A macOS 26 user opens `https://bruce.livinity.local` (or `.home.arpa`, or `.internal` — same outcome). Browser shows "server not found." dnsmasq logs show NO query received.
**Why it happens:** mDNSResponder on macOS 26 intercepts the query before the unicast resolver chain runs. There is no fix on the LivOS side.
**How to avoid:** Ship `--mode hybrid` as the default per §Q3-RESOLVED.
**Warning signs:** A macOS UAT step (not in Docker UAT — needs a real Mac) must verify the resolution path. Until that test is built, document the limitation prominently in the wizard and the README.

### Pitfall 5: `update.sh` doesn't know about modes

**What goes wrong:** User installs `--mode local-lan`. Six months later, `bash /opt/livos/update.sh` runs and silently switches them back to cloud mode (or breaks because cloud-mode env vars aren't set).
**Why it happens:** Existing `update.sh` was written for the cloud-mode-only world.
**How to avoid:** Phase 104 must add a mode-detect step at the top of `update.sh` (read Redis `livos:domain:local_mode`) and short-circuit the cloud-mode-specific parts (Cloudflare DNS challenge config, etc.) when local mode is active. The `D-104-NO-PROD-IMPACT` constraint protects the cloud path — but it also implies `update.sh` must keep working in BOTH modes after Phase 104.
**Warning signs:** Add a CI step that runs `update.sh` against both a local-mode container and a cloud-mode container; both must come up healthy.

### Pitfall 6: Docker UAT doesn't actually represent real hardware

**What goes wrong:** UAT passes inside the container. install.sh ships to the Mini PC. Caddy fails to bind port 443 because some other service grabbed it; or systemd unit ordering differs; or apt picks a different version.
**Why it happens:** UAT container is `--privileged`, which gives it a lot of latitude real hardware doesn't have. systemd-in-Docker behaves slightly differently than systemd-on-bare-metal.
**How to avoid:** Phase 104 must ALSO include a "fresh Ubuntu 24.04 VM" UAT step before ship — this can be a manual user-walk on a fresh DigitalOcean droplet or a local VM. Document it in the phase's UAT-CHECKLIST.md.
**Warning signs:** Anywhere install.sh uses `if [[ ! -f /.dockerenv ]]` or otherwise branches on "am I in Docker" — these branches are unverified by the Docker UAT.

### Pitfall 7: Docker Desktop on Windows + WSL2 + cgroup v2 version drift

**What goes wrong:** Developer runs `docker compose up` in `docker/local-uat/` and the container fails to boot systemd. WSL is older than 2.5.1, cgroup v2 not enabled.
**Why it happens:** WSL ≤2.5.0 defaults to cgroup v1; systemd-in-Docker with `cgroupns_mode: host` needs v2.
**How to avoid:** docker-compose entrypoint should verify `cat /proc/self/cgroup | head -1` shows v2 (`0::/...`) and fail loudly with a "upgrade WSL to ≥2.5.1, or add `kernelCommandLine=cgroup_no_v1=all systemd.unified_cgroup_hierarchy=1` to `.wslconfig`" message.
**Warning signs:** Container exits within seconds; `docker logs` shows systemd refusing to start.

---

## Code Examples

### Example 1: Idempotent `mode-local-lan.sh` install helper

```bash
# scripts/install/mode-local-lan.sh
# Source: arslan.io/2019/07/03/how-to-write-idempotent-bash-scripts pattern

install_dnsmasq_local_lan() {
    info "Installing dnsmasq..."

    # ── 1. Free port 53 from systemd-resolved (idempotent) ──
    mkdir -p /etc/systemd/resolved.conf.d
    local stub_drop="/etc/systemd/resolved.conf.d/no-stub.conf"
    if ! grep -qF "DNSStubListener=no" "$stub_drop" 2>/dev/null; then
        cat > "$stub_drop" <<'EOF'
[Resolve]
DNSStubListener=no
EOF
        systemctl restart systemd-resolved
        ok "systemd-resolved stub listener disabled"
    else
        ok "systemd-resolved already configured for dnsmasq"
    fi

    # ── 2. Install dnsmasq (idempotent — apt-get -y is no-op) ──
    apt-get install -y -qq dnsmasq

    # ── 3. Write our config (atomic — temp + mv) ──
    local host_ip
    host_ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}')
    [[ -z "$host_ip" ]] && fail "Could not detect host IP for dnsmasq binding"

    local user_tld="${LIVINITY_LOCAL_TLD:-livinity.local}"
    local conf="/etc/dnsmasq.d/livinity.conf"
    local tmp="${conf}.new"
    cat > "$tmp" <<EOF
# Generated by LivOS install.sh --mode local-lan (Phase 104)
# Edit /etc/dnsmasq.d/livinity-override.conf for local overrides.
address=/.${user_tld}/${host_ip}
local=/${user_tld}/
no-resolv
server=1.1.1.1
server=1.0.0.1
bind-dynamic
EOF
    mv -f "$tmp" "$conf"

    systemctl enable --now dnsmasq
    ok "dnsmasq serving *.${user_tld} → ${host_ip}"

    # ── 4. Persist mode in Redis (livinityd reads on boot) ──
    set_livos_redis_key "livos:domain:local_mode" "local-lan"
    set_livos_redis_key "livos:domain:local_tld" "$user_tld"
    set_livos_redis_key "livos:domain:host_ip" "$host_ip"
}

install_caddy_local_pki() {
    info "Configuring Caddy internal PKI..."

    # ── 1. Write stable pki-global.conf (livinityd will `import` this) ──
    local pki_conf="/etc/caddy/pki-global.conf"
    if ! grep -qF "ca liv-local" "$pki_conf" 2>/dev/null; then
        cat > "$pki_conf" <<'EOF'
# Generated by LivOS install.sh --mode local-lan (Phase 104)
# livinityd's generated Caddyfile imports this at the top.
{
    pki {
        ca liv-local {
            name "LivOS Local CA"
            root_cn "LivOS Local Root"
        }
    }
}
EOF
        ok "Caddy pki-global.conf written"
    else
        ok "Caddy pki-global.conf already exists"
    fi

    # livinityd will reload Caddy on first request to local.activate tRPC mutation.
    # We don't reload here — Caddyfile body is not yet generated.
}

install_dnsmasq_local_lan
install_caddy_local_pki
```

### Example 2: `generateLocalCaddyfile()` extension to `caddy.ts`

```typescript
// livos/packages/livinityd/source/modules/domain/caddy.ts
// Source: Phase 104 research §Q5 import pattern + research doc §2.3

/**
 * Generate a Caddyfile for local-lan mode.
 * Imports the install-time pki-global.conf so the named CA persists across
 * regenerations (see Phase 104 Pitfall 1).
 */
export function generateLocalCaddyfile(
    localDomain: string,        // e.g., "bruceoz.livinity.local"
    hostIp: string,             // e.g., "192.168.1.100" — for HTTP-only block
    subdomains: SubdomainConfig[] = [],
    multiUser = true,
): string {
    const blocks: string[] = []

    // Global block — import the persistent pki-global.conf.
    // Caddy spec: import at the very top, no key, must be first block.
    blocks.push(`# Import persistent PKI global block (provisioned by install.sh)
import /etc/caddy/pki-global.conf`)

    // Wildcard virtual host
    blocks.push(`*.${localDomain} {
    tls {
        issuer internal {
            ca liv-local
        }
    }
    reverse_proxy 127.0.0.1:8080
}`)

    // Bare domain (root) — useful for first-page enrollment
    blocks.push(`${localDomain} {
    tls {
        issuer internal {
            ca liv-local
        }
    }
    reverse_proxy 127.0.0.1:8080
}`)

    // HTTP-only block for CA cert download — both by name and by IP
    blocks.push(`http://${localDomain}, http://${hostIp} {
    handle /api/local/ca.crt {
        root * /var/lib/caddy/.local/share/caddy/pki/authorities/liv-local
        rewrite * /root.crt
        file_server
    }
    handle {
        reverse_proxy 127.0.0.1:8080
    }
}`)

    return blocks.join('\n\n') + '\n'
}
```

### Example 3: Docker UAT entrypoint

```bash
#!/usr/bin/env bash
# docker/local-uat/entrypoint.sh
# Runs inside the UAT container as PID 1's first executable after systemd init.
# Source: pattern from getsentry/self-hosted entrypoints

set -euo pipefail

# ── Pre-flight: verify cgroup v2 + systemd alive ──
if ! grep -q '^0::' /proc/self/cgroup; then
    echo "FATAL: container is on cgroup v1 — systemd will fail." >&2
    echo "If running Docker Desktop on Windows: upgrade WSL to ≥2.5.1" >&2
    echo "Or add to .wslconfig: kernelCommandLine=cgroup_no_v1=all" >&2
    exit 1
fi
systemctl is-system-running --wait 2>&1 | head -5 || true

# ── Start X stack (so Chrome will have a display) ──
Xvfb :0 -screen 0 1280x720x24 &
sleep 1
DISPLAY=:0 fluxbox &
sleep 1
x11vnc -display :0 -nopw -shared -forever -bg -rfbport 5900
websockify --web=/usr/share/novnc 6080 localhost:5900 &
echo "noVNC: http://<host>:6080/vnc.html"

# ── Run install.sh ──
cd /livinity-io
bash scripts/install.sh --mode "${LIVOS_UAT_MODE:-local-lan}"

# ── Start Chrome inside the container for CDP UAT ──
google-chrome \
    --remote-debugging-port=9223 \
    --remote-debugging-address=0.0.0.0 \
    --user-data-dir=/tmp/uat-chrome \
    --no-sandbox \
    --disable-dev-shm-usage \
    --display=:0 \
    "https://bruce.${LIVINITY_LOCAL_TLD:-livinity.local}" &

echo "READY: Chrome on :9223 (CDP), noVNC on :6080"

# ── Hand control back to systemd ──
wait
```

### Example 4: Chrome DevTools MCP smoke test (UAT walk)

```javascript
// docker/local-uat/uat-driver/walk.mjs
// Source: chrome-devtools-mcp + Claude Code MCP integration pattern

import { spawn } from 'node:child_process';

// Spawned by GSD orchestrator as part of /gsd-execute-phase 104 final wave.
// Drives the noVNC-hosted Chrome via Chrome DevTools MCP from the host.

const mcp = spawn('npx', [
    'chrome-devtools-mcp@latest',
    '--browserUrl', 'http://localhost:9223',
]);

// (Pseudocode — actual integration goes through Claude Code's MCP client)
// 1. await mcp.tools.navigate({ url: 'https://bruce.livinity.local' })
// 2. const screenshot = await mcp.tools.screenshot()
// 3. assert screenshot shows LivOS login page (visual diff or pixel hash)
// 4. await mcp.tools.fillForm({ ... admin login ... })
// 5. await mcp.tools.navigate({ url: 'https://alice.livinity.local' })
// 6. assert different per-user routing
// 7. Verify cert chain: await mcp.tools.eval('window.crypto.subtle...')
//    — actually easier: visual check that the lock icon is present (after CA install)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| mDNS / Avahi for friendly LAN names | dnsmasq + custom TLD (with macOS caveats) OR public DNS pointing at private IPs | — | mDNS never solved wildcard subdomains; public-DNS-private-IP is now the dominant homelab pattern |
| Per-device `/etc/hosts` | LAN-edge dnsmasq OR public DNS | Always (but dnsmasq became friction-free with `address=/.domain/IP` syntax) | Eliminates per-device per-subdomain configuration |
| Let's Encrypt http-01 challenge (requires inbound port 80) | LE DNS-01 challenge (zero inbound ports needed) | DNS-01 has been GA since 2018; ubiquitous in homelab community now | Enables public-DNS-private-IP pattern without exposing services to the internet |
| Caddy v1 (Mholt-era, JSON-config heavy) | Caddy v2.11.2 (Caddyfile + `pki` block + native ACME) | Caddy v2 released 2020; `pki` block matured in 2.10/2.11 | Single binary handles everything — TLS, ACME, internal CA, reverse proxy |
| `cgroupns=private` (Docker default on v2) | `cgroupns=host` for systemd-in-Docker | cgroup namespace flag added Docker 20.10 (2021); now standard practice | Without `cgroupns=host`, systemd inside Docker silently fails to manage child cgroups |
| Custom WebSocket proxy for browser-in-container | noVNC + websockify (apt packages) | Decade-old stack; now packaged everywhere | Removes 200 lines of custom JS WebSocket-to-VNC glue |
| Chrome with `--remote-debugging-port=9222` (binds 127.0.0.1) | Chrome with `+ --remote-debugging-address=0.0.0.0` for container UAT | Bug visible since Docker started supporting Chrome in container; documented properly in 2023+ | Single flag difference between "works" and "ECONNREFUSED" |

**Deprecated/outdated:**
- mDNS-based LAN naming for non-trivial setups: Apple's mDNS is link-local-only, and Android Chrome support is conditional on Android 12+ AND Private DNS off (RFC 6762 vs Android Private DNS interaction is well-documented).
- `cgroupns_mode: host` (compose key) — newer compose-spec uses top-level `cgroup: host`. Both still work; `cgroupns_mode` is the more widely documented form.
- Trying to make Caddy auto-install root cert into the system trust store on the install host: documented as unreliable, especially in containers ([CITED: caddyserver.com/docs/automatic-https — "Automatically installing the certificate into the local trust stores is for convenience only and isn't guaranteed to work"]). install.sh should always serve the CA at a well-known URL and let the user/wizard handle trust enrollment — never rely on Caddy's auto-install.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | macOS 26 ships in production by users today (2026-05); we cannot assume all our users are on macOS ≤25 | Q3-RESOLVED Failure 2 | If somehow macOS 26 adoption is still <10%, the urgency of Option A drops slightly; Option C (local-lan with home.arpa) becomes viable for ≤25 users for a few more months. The recommendation still stands (long-term Apple direction is clear). |
| A2 | The Cloudflare DNS-01 ACME challenge in hybrid mode requires only an API token, no other Cloudflare service | §Q3-RESOLVED Option A | Verified by inspection of the existing Mini PC `update.sh` flow which already uses CF DNS challenge — this assumption is HIGH confidence but worth a sanity check during planning. |
| A3 | The user is on Windows with Docker Desktop + WSL2 ≥2.5.1 for the UAT | §5 + Pitfall 7 | If user is on Windows with older WSL, the UAT container fails to boot. install.sh entrypoint must check + emit a clear error (already in Example 3). |
| A4 | livinityd's existing multi-user routing (`generateFullCaddyfile multiUser=true`) is correct and reusable for local mode | §Standard Stack | If broken/incomplete, Phase 104 also has to fix multi-user routing — would balloon scope. CONTEXT.md's recommended file tree assumes this is reusable. |
| A5 | `D-104-NO-PROD-IMPACT` is enforceable via a CI regression test against a Mini-PC-like container | §Pitfall 5 | If we can't easily reproduce the Mini PC environment in a container (Cloudflare DNS challenge needs real DNS access), the regression test becomes a manual user-walk. Still defensible; just changes test shape. |
| A6 | The user is OK with the hybrid path requiring a Cloudflare account (which they already have for the cloud path) | §Q3-RESOLVED | If user says "no Cloudflare at all," then `--mode local-lan` becomes the only option and the Apple-incompatibility is the cost. Re-open in /gsd-discuss-phase. |
| A7 | Chrome DevTools MCP recent versions correctly rewrite the `webSocketDebuggerUrl` returned by `/json/version` when crossing Docker boundary | §Pattern 4 | If broken, UAT needs to use `--wsEndpoint` directly with manually rewritten URL. Mitigation: walk.mjs can probe both. |

**Total assumed claims:** 7 — all flagged for either confirmation in `/gsd-discuss-phase 104` or for explicit handling in plan tasks. None are silent; all have remediation paths.

---

## Open Questions

### Q1: Android system CA store on Android 14+ (still open from research doc)

- **What we know:** Android 14 moved the system CA store into the Conscrypt APEX module (immutable). Chrome on Android trusts only the system store, not user-installed CAs. User-installed CAs are trusted only by Firefox (which has its own NSS store) and by apps that explicitly opt in via Network Security Config.
- **What's unclear:** Whether the recent (Android 14+) "updatable root certificates via Google Play" feature can be used to push a LivOS CA. Almost certainly not without Google Play partnership — but worth a definitive answer.
- **Recommendation:** Plan Phase 104 to ship the Android tab in LocalSetupWizard with TWO recommendations: (a) "Use Firefox on Android — it respects user-installed CAs"; (b) "Use the hybrid mode instead, which avoids the trust problem entirely." Do not try to engineer a workaround for stock Chrome on Android.

### Q2: dnsmasq DHCP option 6 negotiation with consumer routers (still open)

- **What we know:** DHCP option 6 is supported by virtually all consumer routers' admin UIs. Some ISP-provided routers (BT Hub, some Comcast gateways) lock it down.
- **What's unclear:** What fraction of LivOS users have routers that DO push option 6 vs require dnsmasq to take over DHCP entirely.
- **Recommendation:** install.sh `--mode local-lan` should NOT push DHCP by default (dnsmasq is DNS-only). The wizard provides router-brand-specific screenshots and the manual-DNS-per-device fallback. Document this as a known one-time-setup friction.

### Q4: Multi-NIC host IP detection (still open from research doc)

- **What we know:** install.sh's current `ip route get 1.1.1.1 | awk '{print $7}'` returns the IP of the interface used for the default route. On multi-NIC hosts (WiFi + Ethernet), this picks one based on routing metric.
- **What's unclear:** On Mini PC-style boxes with both WiFi and Ethernet, do we want dnsmasq to bind ALL interfaces or just the one with the default route?
- **Recommendation:** Use `bind-dynamic` (binds all interfaces, survives interface flapping). Document the override path: `LIVINITY_HOST_IP=<ip> bash install.sh --mode local-lan`.

### Q5: Caddy `pki` block persistence (RESOLVED — see §Pitfall 1)

- Resolved by adopting the `import /etc/caddy/pki-global.conf` pattern. The `pki-global.conf` is provisioned by install.sh once; livinityd's regeneration of the rest of the Caddyfile is unaffected.

### Q-NEW-A: How to test macOS resolution in the Docker UAT?

- **What we know:** The Docker UAT runs Chrome on Linux inside the container. We can verify Linux resolution end-to-end, but NOT macOS resolution.
- **What's unclear:** Whether the Phase 104 Docker UAT is sufficient as a GO/NO-GO gate, or whether we need a manual user-walk on a real Mac for the Apple-supported modes.
- **Recommendation:** Docker UAT is sufficient for `--mode hybrid` (public DNS Just Works on every OS, including in a Linux container with a `/etc/hosts` override pointing the test name at the container's IP). For `--mode local-lan`, the Docker UAT cannot prove macOS works (we already know it doesn't). Document this gap clearly in 104-PLAN files.

### Q-NEW-B: What's the upgrade path for a user already on `--mode cloud` who wants to switch to `--mode hybrid` later?

- **What we know:** Mode is stored in Redis (`livos:domain:local_mode`).
- **What's unclear:** Whether a user can run `install.sh --mode hybrid` over an existing cloud install without data loss.
- **Recommendation:** install.sh must detect existing `local_mode` Redis value and warn before changing it. Provide explicit `--migrate-from cloud-to-hybrid` flag for the deliberate path; bare `--mode X` on a different installed mode aborts with an error.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker Desktop + WSL2 | UAT container | ✓ (developer's Windows host — confirmed in env metadata) | ≥WSL 2.5.1 needed for cgroup v2; check before UAT first run | Run UAT on a Linux VM instead |
| `bash` ≥4 | install.sh | ✓ — Ubuntu 24.04 ships bash 5.x | 5.x | none — install.sh requires bash |
| `apt-get` / Debian-based distro | install.sh | ✓ on Ubuntu 24.04 target | — | install.sh already errors on non-Debian-family (see livos/install.sh `detect_os`) |
| Cloudflare API token | `--mode hybrid` (LE DNS-01) | Requires user-provided | — | `--mode local-lan` for fully air-gapped |
| `caddy` binary | All modes | Installed by install.sh from official Caddy repo | 2.11.x | none — Caddy is required |
| `dnsmasq` | `--mode local-lan` only | Ubuntu 24.04 noble repo | 2.90 | none — required for local-lan |
| `trfore/docker-ubuntu2404-systemd:latest` Docker image | UAT only | Public Docker Hub | latest tag | Custom Dockerfile from `ubuntu:24.04` if image disappears (well-documented pattern) |
| Chrome DevTools MCP package | UAT only | npm `chrome-devtools-mcp@latest` — verified npm registry | latest | Playwright MCP as a fallback (different tool surface) |
| `chrome-devtools-mcp --browserUrl` working through Docker port-forward | UAT only | Per §Pattern 4 + Pitfall 3 — works with `--remote-debugging-address=0.0.0.0` | — | Use `--wsEndpoint` with manually-constructed URL |
| ZeroTier link to Mini PC | Cloud-mode regression test (if running it against real Mini PC) | ⚠ UNSTABLE per `reference_zerotier_unstable.md` (memory) | — | Run regression in a Docker container instead of against live Mini PC |

**Missing dependencies with no fallback:** None block Phase 104 execution.

**Missing dependencies with fallback:**
- Cloudflare API token for `--mode hybrid` UAT — if user opts not to provide one during UAT, restrict UAT to `--mode local-lan` and document the gap.

---

## Validation Architecture

> `.planning/config.json` does not set `workflow.nyquist_validation` explicitly; treating as enabled per the research-agent default.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | (1) `vitest` for any TypeScript changes in `livos/packages/livinityd/source/modules/local-dns/*`, `domain/caddy.ts`; (2) `bash` shell-test scripts for install.sh / mode-helpers; (3) `node --test` + Chrome DevTools MCP for end-to-end UAT-walk |
| Config file | `livos/packages/livinityd/vitest.config.ts` (existing); shell tests as plain `*.sh` files runnable via `bash`; UAT walk as `node:test` ESM module |
| Quick run command | `pnpm --filter @livos/livinityd test -- modules/local-dns modules/domain` |
| Full suite command | `pnpm --filter @livos/livinityd test` + `bash docker/local-uat/scripts/test-install-sh.sh` + `docker compose -f docker/local-uat/docker-compose.yml up --abort-on-container-exit` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|--------------|
| AC-104-1 | `curl ... \| bash -s -- --mode local-lan` succeeds on fresh Ubuntu 24.04 | integration (Docker UAT) | `docker compose -f docker/local-uat/docker-compose.yml up --build --abort-on-container-exit` | ❌ Wave 0 |
| AC-104-2 | install.sh `--mode local-lan` is idempotent (re-run produces same state, no errors) | shell | `bash docker/local-uat/scripts/test-install-idempotency.sh` (runs install.sh twice in fresh container, diffs state) | ❌ Wave 0 |
| AC-104-3 | install.sh `--mode cloud` produces byte-equivalent runtime to current Mini PC | shell | `bash docker/cloud-regression/scripts/test-cloud-byte-equivalence.sh` (compares systemd unit hashes, env file shape, Caddyfile diff vs Mini PC baseline) | ❌ Wave 0 |
| AC-104-4 | dnsmasq resolves `bruce.<TLD>` to host IP after install | shell | `dig @localhost bruce.${LIVINITY_LOCAL_TLD} +short` returns IP | trivial; one-liner in entrypoint UAT |
| AC-104-5 | dnsmasq survives `systemctl restart dnsmasq` (config persists) | shell | `systemctl restart dnsmasq && dig @localhost bruce.${TLD} +short` | trivial |
| AC-104-6 | Caddy serves CA root at `http://<host>/api/local/ca.crt` with correct PEM content | integration | `curl -fsSL http://localhost/api/local/ca.crt \| openssl x509 -noout -subject` shows `CN=LivOS Local Root` | trivial |
| AC-104-7 | Caddy serves `https://bruce.<TLD>` with cert chain rooted in `liv-local` CA | integration | `curl --cacert /tmp/ca.crt https://bruce.${TLD} -o /dev/null -w '%{http_code}'` returns 200 | trivial |
| AC-104-8 | `generateFullCaddyfile()` regeneration preserves the `import /etc/caddy/pki-global.conf` line | unit | `pnpm --filter @livos/livinityd test -- domain/caddy.test.ts` | ❌ Wave 0 — add test case |
| AC-104-9 | Wildcard subdomain routing: `bruce.<TLD>` AND `alice.<TLD>` both resolve to host AND route to different user containers inside livinityd | integration | Chrome DevTools MCP walk: navigate to both, screenshot, assert different per-user content rendered | UAT walk script (Wave 0) |
| AC-104-10 | TLS cert is valid (browser shows green padlock, not "Not secure") after CA install | integration | Chrome DevTools MCP `evaluate(() => navigator.connection /* or check security state */)`; alternative: assert no `net::ERR_CERT_*` in page errors | UAT walk script |
| AC-104-11 | Reboot (UAT container restart) → all services come back healthy | shell | `docker compose restart livos-uat && sleep 30 && curl https://bruce.${TLD}` returns 200 | trivial |
| AC-104-12 | Cloud-mode regression: `update.sh` against the cloud-mode container succeeds and produces no regressions | shell | `docker exec cloud-regression bash /opt/livos/update.sh && systemctl is-active livos liv-core liv-worker liv-memory` | ❌ Wave 0 |
| AC-104-13 | Chrome DevTools MCP can connect to the UAT container's Chrome from the host | integration (UAT walk) | walk.mjs first step: `mcp.connect({ browserUrl: 'http://localhost:9223' })` | UAT walk script |
| AC-104-14 | `noVNC` accessible at `http://localhost:6080/vnc.html` showing the container's desktop (human escape hatch) | manual | open URL in browser, see fluxbox + Chrome | manual UAT step |

### Sampling Rate

- **Per task commit:** `pnpm --filter @livos/livinityd test -- modules/local-dns modules/domain` (~15s)
- **Per wave merge:** Full vitest suite + `bash docker/local-uat/scripts/test-install-sh.sh` against a freshly-built UAT container (~3-5 min)
- **Phase gate:** Full Docker UAT walk (~10 min) — `docker compose up`, install runs inside, walk.mjs drives Chrome DevTools MCP through every acceptance criterion, generates `.planning/phases/104-local-install-and-docker-uat/UAT-EVIDENCE/` directory with screenshots + PASS/FAIL log per criterion

### Wave 0 Gaps

- [ ] `docker/local-uat/Dockerfile` — base image + apt installs for X stack
- [ ] `docker/local-uat/docker-compose.yml` — cgroup + tmpfs + port mappings
- [ ] `docker/local-uat/entrypoint.sh` — see Example 3 above
- [ ] `docker/local-uat/uat-driver/walk.mjs` — Chrome DevTools MCP smoke test
- [ ] `docker/local-uat/scripts/test-install-idempotency.sh` — bash test harness
- [ ] `docker/cloud-regression/` — separate compose for AC-104-3 cloud regression
- [ ] `livos/packages/livinityd/source/modules/domain/caddy.test.ts` — extend with `generateLocalCaddyfile` + import-preservation tests
- [ ] `livos/packages/livinityd/source/modules/local-dns/` — NEW directory; vitest config picks it up automatically via existing glob
- [ ] Framework install: none needed (vitest + node:test + bash all already in repo)

---

## Security Domain

> `security_enforcement` is not set in config.json — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirect) | livinityd's existing JWT auth path — Phase 104 does NOT change auth. Local-lan mode INCREASES attack surface for unauthenticated LAN-side access; mitigate by ensuring per-user subdomain routing still enforces session cookies (already does via app gateway). |
| V3 Session Management | yes (indirect) | Same as V2 — existing pattern; Phase 104 must not regress cookie SameSite / Secure flags when switching from `https://*.livinity.io` to `https://*.livinity.local`. **Test:** integration test asserts `Set-Cookie` headers preserve `Secure` and `SameSite=Lax` in local-lan mode. |
| V4 Access Control | yes | dnsmasq's port 53 must NOT be exposed to the internet (UFW already blocks; ensure install.sh `--mode local-lan` doesn't accidentally `ufw allow 53`). |
| V5 Input Validation | yes | `validateDomain()` in `caddy.ts` already exists; extend `validateLocalTld()` (must reject TLDs with `..`, slashes, IP-shaped strings — guard against `address=/../etc/passwd/IP` style injection). |
| V6 Cryptography | yes | Caddy's `pki` block manages all cert ops — never hand-roll. Document that the private key at `/var/lib/caddy/.local/share/caddy/pki/authorities/liv-local/root.key` must be backed up; loss = re-enroll every device. |
| V8 Data Protection | yes | CA root key file permissions: owned by `caddy:caddy`, mode 0600. install.sh must verify; never run Caddy as root. |
| V13 API & Web Service | yes | The new `GET /api/local/ca.crt` endpoint is intentionally PUBLIC (no auth) — it must NOT inadvertently expose any other path. Use the explicit Caddy `handle /api/local/ca.crt { ... }` block, not a path-prefix that could leak. |

### Known Threat Patterns for {stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| DNS poisoning (attacker on the LAN spoofs `bruce.<TLD>` → attacker IP) | Spoofing | dnsmasq doesn't sign responses; this is inherent to unprotected LANs. Mitigation: hybrid mode + DNSSEC at Cloudflare. Document the local-lan-mode limitation. |
| CA root key exfiltration from `/var/lib/caddy/.local/share/caddy/pki/authorities/liv-local/root.key` | Information disclosure | File permissions 0600 caddy:caddy. install.sh verifies. |
| `GET /api/local/ca.crt` path traversal | Tampering | Use Caddy's exact-path `handle /api/local/ca.crt { ... }`, not `handle_path /api/local/* { ... }`. |
| systemd-resolved DNS rebinding when DNSStubListener is disabled | Tampering | dnsmasq's `stop-dns-rebind` directive — add to default config. |
| UAT container shipping with default Chrome user-data containing test cookies that leak through Docker image layers | Information disclosure | UAT container is `--rm` ephemeral; never published to a registry. Document in UAT README. |
| Caddy auto-installing the CA into the install host's system trust store unintentionally | Spoofing | Set `skip_install_trust` in the Caddy global block; install.sh does the trust install explicitly only when user confirms in the wizard. [CITED: github.com/caddyserver/caddy/issues/7211] |

---

## Project Constraints (from CLAUDE.md)

**No `./CLAUDE.md` file present in the repo root** (verified by `ls CLAUDE.md` → "No such file or directory"). The closest equivalents are the in-memory directives surfaced via the auto-memory file at session start. The relevant operational constraints that affect Phase 104:

| Constraint | Source | How Phase 104 Plans Must Honor It |
|------------|--------|------------------------------------|
| **D-NO-SERVER4** — Server4 is NOT ours; never apply patches there | MEMORY.md HARD RULE 2026-04-27 | Phase 104 plans MUST NOT list Server4 as a deploy target. Mini PC is the only real-host deploy target. |
| **Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f`** for `liv/packages/core/src/sdk-agent-runner.ts` | CONTEXT.md §"Sacred SHA invariant" + MEMORY.md | NO Phase 104 plan task touches that file. Pre-commit hook (Phase 100-01) enforces; plan-checker should verify by grep. |
| **D-NO-BYOK** — subscription-only path | MEMORY.md | Not directly relevant to Phase 104 (no AI changes), but if any plan task touches AI flow, must preserve subscription path. |
| **autonomous status updates in Turkish** | feedback_autonomous.md / user_language.md | When Phase 104 runs under `/gsd-autonomous`, status updates to user should be in Turkish (code/paths/commits stay English). |
| **rsync-deployed `/opt/livos/` on Mini PC, NOT git checkout** | reference_minipc.md | `--mode cloud` install.sh path must continue to work via the rsync pattern, NOT introduce a `git clone` on the Mini PC. |
| **SSH rate limit** — batch Mini PC SSH into one session | feedback_ssh_rate_limit.md | If Phase 104 manual UAT requires Mini PC SSH, the plan must specify batching commands. |
| **Default deploy = `bash /opt/livos/update.sh`** | MEMORY.md | install.sh and update.sh must coexist; update.sh becomes the per-deploy refresh, install.sh is for first-time install / mode change. |

---

## Sources

### Primary (HIGH confidence — verified via official docs or live tools)

- **RFC 6762 (Multicast DNS)** — `https://www.rfc-editor.org/rfc/rfc6762.html` — §3 mandates mDNS for `.local` (the source of Q3 Failure 1). [VERIFIED]
- **RFC 8375 (home.arpa)** — `https://www.rfc-editor.org/rfc/rfc8375.html` — defines home.arpa semantics; macOS 26 caveat applies on top. [VERIFIED]
- **Caddy v2 documentation** — `https://caddyserver.com/docs/caddyfile/options` — `pki` block syntax + global block ordering rule; `https://caddyserver.com/docs/automatic-https` — internal CA semantics; `https://caddyserver.com/docs/modules/pki` — module structure. [VERIFIED]
- **dnsmasq manual** — `https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html` — `address=`, `local=`, `bind-dynamic`, `port=`, `dhcp-option=` syntax. [VERIFIED]
- **Caddy Releases** — `https://github.com/caddyserver/caddy/releases` — Caddy 2.11.2 latest stable as of March 2026. [VERIFIED via releasebot.io]
- **github.com/trfore/docker-ubuntu2404-systemd** — `https://github.com/trfore/docker-ubuntu2404-systemd` — canonical systemd-in-Docker base image for Ubuntu 24.04. [VERIFIED via WebFetch]
- **chrome-devtools-mcp** — `https://github.com/ChromeDevTools/chrome-devtools-mcp` — `--browserUrl` flag semantics + Docker connectivity issues. [VERIFIED via WebFetch + WebSearch]
- **github.com/getsentry/self-hosted/blob/master/install.sh** — Sentry self-hosted install.sh pattern (sourced helpers, idempotency). [VERIFIED via WebFetch]
- **Existing repo: `livos/install.sh`** (1725 lines) and `livos/packages/livinityd/source/modules/domain/caddy.ts` (207 lines) — current install + caddy generation logic, read in full. [VERIFIED via Read]

### Secondary (MEDIUM confidence — community sources verified against official docs)

- **macOS 26 /etc/resolver/ regression** — `https://gist.github.com/adamamyl/81b78eced40feae50eae7c4f3bec1f5a` — primary bug report. Cross-confirmed by `https://byteiota.com/macos-26-dns-issues-3-bugs-workarounds-for-developers/` and HN thread `https://news.ycombinator.com/item?id=47440759`. The Apple Community thread `https://discussions.apple.com/thread/254491803` provides additional context on mDNSResponder's TLD interception model.
- **Caddy + Docker known issues** — `https://github.com/caddyserver/caddy/issues/7211` (auto-trust + Docker), `https://caddy.community/t/caddyfile-doesnt-recognize-pki-global-option/15571` (global block ordering).
- **systemd-resolved + dnsmasq conflict resolution** — `https://www.baeldung.com/linux/dnsmasq-systemd-resolved-conflicts` — the canonical fix matches what's already used elsewhere in the LivOS install path.
- **noVNC + Docker browser automation pattern** — multiple GitHub repos (`DmitriyG228/playwright-vnc`, `capi/devcontainer-desktop-lite-mcp-playwright`, `xtr-dev/mcp-playwright-novnc`) all converge on the same Xvfb + x11vnc + websockify + noVNC + Chrome `--remote-debugging-port` stack.
- **Android 14 CA store immutability** — `https://httptoolkit.com/blog/android-14-breaks-system-certificate-installation/` — Conscrypt APEX module behavior; confirms Firefox-fallback recommendation.
- **WSL2 + cgroup v2 + Docker Desktop** — `https://github.com/spurin/wsl-cgroupsv2` (canonical workaround for older WSL); WSL 2.5.1+ ships cgroup v2 by default per Microsoft.

### Tertiary (LOW confidence — single source, marked for validation in plan tasks)

- **Caddy default storage path for named CA** — Multiple sources state `/var/lib/caddy/.local/share/caddy/pki/authorities/<ca-id>/` but the EXACT path Caddy uses depends on which user runs it (systemd `caddy` user vs root vs other). Phase 104 plans must `find /var/lib/caddy -name root.crt -type f` post-install to lock down the actual path before serving via `file_server`.
- **Chrome DevTools MCP `webSocketDebuggerUrl` rewriting across Docker** — documented in MCP issue tracker but not formally specified; Phase 104 UAT walk should probe both `--browserUrl` and `--wsEndpoint` paths and fall back to the working one.

---

## Metadata

**Confidence breakdown:**

- **Q3 / TLD problem:** HIGH — RFC 6762 is unambiguous on `.local`; macOS 26 regression is well-documented and independently confirmed (gist + byteiota + HN). Recommendation (default to hybrid) is well-supported.
- **install.sh shape / pattern:** MEDIUM — Three defensible options (A/B/C); recommendation (A: `--mode` flag, sourced helpers) is supported by Sentry self-hosted reference but is genuinely a design choice that `/gsd-discuss-phase` could legitimately re-open.
- **Caddy `pki` block + wildcard:** HIGH — Caddy docs are clear; community references converge on the same pattern; Pitfall 1 (regeneration) is well-understood.
- **dnsmasq config:** HIGH — single config syntax, decades of stability, dnsmasq manual is authoritative.
- **systemd-in-Docker for UAT:** HIGH — trfore image is a verified working base; flag incantation is documented across multiple sources.
- **Chrome DevTools MCP + Docker boundary:** MEDIUM — known pitfall (`--remote-debugging-address=0.0.0.0`); WS URL rewriting works in recent versions but worth probing in plan tasks.
- **Cloud-mode regression test design:** MEDIUM — depends on whether we can faithfully reproduce Mini PC environment in a container; may end up being part-manual.
- **Android Q1:** LOW — fundamental Android 14+ limitation; ship Firefox + hybrid-mode recommendations; not engineering-soluble.
- **Architectural responsibility map:** HIGH — each tier's ownership is clear and matches existing LivOS patterns.

**Research date:** 2026-05-11

**Valid until:** 2026-06-11 (30 days for stable knowledge; sooner if Caddy 2.12 ships or macOS 26 fix lands — neither expected in the next 30 days based on Apple's track record on this class of regression).

**Pre-submission checklist:**
- [x] All domains investigated (DNS, TLS, systemd-in-Docker, install.sh shape, Chrome DevTools MCP, UAT validation)
- [x] Q1, Q2, Q3, Q4, Q5 each explicitly resolved or recommended-resolution provided
- [x] Q-NEW questions surfaced for plan/discuss phase
- [x] Negative claims verified ("macOS 26 cannot reach unicast DNS for custom TLDs" — verified across 3 independent sources)
- [x] Multiple sources cross-referenced for critical claims (Q3 has 3 independent sources)
- [x] URLs provided for authoritative sources (Caddy docs, RFCs, GitHub repos)
- [x] Publication dates checked (Caddy 2.11.2 March 2026; macOS 26 issue 2025-Q3 onward; WSL 2.5.1 2025-Q1)
- [x] Confidence levels assigned honestly per finding
- [x] "What might I have missed?" review — Q-NEW-A (Docker UAT cannot prove macOS) and Q-NEW-B (mode-switch upgrade path) added
- [x] Runtime State Inventory completed — all 5 categories explicitly answered
- [x] Security domain included with ASVS mapping
- [x] CLAUDE.md (absent — verified) cross-referenced via auto-memory directives
- [x] Architectural Responsibility Map included (between Summary and Standard Stack per template)
- [x] Environment Availability audited
- [x] Validation Architecture section follows Nyquist template (test framework, req-to-test map, sampling rate, Wave 0 gaps)
- [x] Code examples cite source URLs
- [x] Assumptions Log surfaces all `[ASSUMED]`-class claims for downstream confirmation
