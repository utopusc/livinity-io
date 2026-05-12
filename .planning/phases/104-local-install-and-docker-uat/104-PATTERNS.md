# Phase 104: One-shot Local Install + Docker Ubuntu GUI UAT — Pattern Map

**Mapped:** 2026-05-11
**Files analyzed:** 17 new / 3 edited = 20 files classified
**Analogs found:** 18 / 20 (2 punt to RESEARCH.md code-example sections)

---

## Sacred SHA invariant (D-104)

`liv/packages/core/src/sdk-agent-runner.ts` MUST equal
`f3538e1d811992b782a9bb057d1b7f0a0189f95f` after every Phase 104 commit.
Pre-commit hook (Phase 100-01) enforces. **No Phase 104 file in this map
touches that path.** The closest the work gets to `liv/` is via the
`update.sh` mode-detect carryover (Pitfall 5 in RESEARCH.md), which only
reads Redis and never edits any `liv/` source.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `docker/local-uat/Dockerfile` | config (container build) | build-time | `docker/livos-chrome/Dockerfile` | exact (Dockerfile, Ubuntu 24.04 base, KasmVNC/X stack) |
| `docker/local-uat/docker-compose.yml` | config (orchestration) | build-time | `docker/docker-compose.postgres.yml` | role-match (compose v3.8, single service, container mapping) |
| `docker/local-uat/entrypoint.sh` | utility (container init) | event-driven (PID 1) | `livos/install.sh` `main()` prologue + RESEARCH §Example 3 | partial (no in-repo container-init analog; install.sh sets the bash style) |
| `docker/local-uat/README.md` | docs | static | `docker/build-images.sh` header comments | partial (no in-repo README analog for docker/) |
| `docker/local-uat/uat-driver/walk.mjs` | test (e2e harness) | event-driven | none in repo — RESEARCH §Example 4 | NO ANALOG (new pattern; uses `chrome-devtools-mcp` from outside the JS workspace) |
| `docker/local-uat/scripts/test-install-idempotency.sh` | test (integration shell) | request-response | `scripts/verify-sacred-sha.sh` | partial (shell test idiom; sets `-euo pipefail`, exit codes for CI) |
| `docker/cloud-regression/` (Dockerfile + compose + entrypoint + scripts) | config + test | build-time | mirror of `docker/local-uat/` (this same map) | exact (sister directory by design) |
| `scripts/install.sh` | utility (user-facing install) | request-response | `livos/install.sh` | exact role-match; new top-level wrapper that dispatches to mode-helpers |
| `scripts/install/mode-cloud.sh` | utility (sourced helper) | request-response | extracted from `livos/install.sh` `configure_caddy()` + `install_cloudflared()` | exact (factored existing functions) |
| `scripts/install/mode-local-lan.sh` | utility (sourced helper) | request-response | RESEARCH §Example 1 (Code Examples) | role-match (idempotent install-helper pattern from `livos/install.sh:487-499`) |
| `scripts/install/mode-hybrid.sh` | utility (sourced helper) | request-response | `livos/install.sh` `install_caddy()` + ACME DNS-01 fragments | role-match |
| `livos/packages/livinityd/source/modules/local-dns/` (directory) | module (config + service + routes + tests) | CRUD + event-driven | `livos/packages/livinityd/source/modules/computer-use/` | exact (sibling module — multiple service files + routes.ts + tests + index.ts) |
| `local-dns/dnsmasq-config.ts` | service (file-writer) | file-I/O | `livos/packages/livinityd/source/modules/domain/caddy.ts` | exact (file-writer + reload pattern) |
| `local-dns/pki.ts` | service (constants + helpers) | file-I/O | `livos/packages/livinityd/source/modules/apps/native-app-config.ts` (constants + zod schema half) | role-match |
| `local-dns/routes.ts` | controller (tRPC router) | request-response | `livos/packages/livinityd/source/modules/domain/routes.ts` | exact (`domain` is the closest namesake) |
| `local-dns/*.test.ts` | test | unit | `livos/packages/livinityd/source/modules/apps/native-app-config.test.ts` | exact (vitest + describe/it + fake Redis Map) |
| `livos/packages/livinityd/source/modules/domain/caddy.ts` | service (EDIT) | file-I/O | itself — already in scope; extend `generateFullCaddyfile` neighbor functions | EDIT — exact |
| `livos/packages/livinityd/source/modules/domain/caddy.test.ts` | test (NEW for an existing module) | unit | `livos/packages/livinityd/source/modules/apps/native-app-config.test.ts` | exact (vitest pure-function tests — no Redis needed for caddy.ts) |
| `livos/packages/livinityd/source/modules/server/index.ts` | controller (EDIT) | request-response | `app.get('/manager-api/v1/system/update-status', ...)` at line 1138 | exact (unauthenticated Express GET on `this.app`) |
| `livos/packages/ui/src/features/local-setup/` (LocalSetupWizard.tsx, QrCodeStep.tsx, PlatformInstructions.tsx) | component (multi-step wizard) | request-response (UI ↔ tRPC) | `livos/packages/ui/src/routes/settings/domain-setup.tsx` (WizardStep state-machine pattern) **and** `livos/packages/ui/src/features/backups/components/setup-wizard.tsx` (feature-folder wizard with sub-components) | exact (domain-setup is the named-sibling wizard; backups/setup-wizard is the features/ layout sibling) |

---

## Pattern Assignments

### `docker/local-uat/Dockerfile` (config, build-time)

**Analog:** `docker/livos-chrome/Dockerfile` (113 lines — read in full)

**Imports / base pattern** (`docker/livos-chrome/Dockerfile:1-23`):

```dockerfile
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:1 \
    HOME=/config \
    CHROME_FLAGS="" \
    TZ=Europe/Istanbul

# Base deps + KasmVNC + Google Chrome
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg2 ca-certificates curl locales xfonts-base xfonts-100dpi xfonts-75dpi \
    dbus-x11 libgbm1 libnss3 libatk-bridge2.0-0 libgtk-3-0 libx11-xcb1 \
    libxcomposite1 libxdamage1 libxrandr2 libasound2t64 libpangocairo-1.0-0 \
    libatspi2.0-0 libcups2 libdrm2 libxshmfence1 fonts-liberation fonts-noto-color-emoji \
    procps && \
    locale-gen en_US.UTF-8 && \
    wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && \
    echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main' > /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && apt-get install -y --no-install-recommends google-chrome-stable && \
    ...
```

**Heredoc inline-files pattern** (`docker/livos-chrome/Dockerfile:30-48`, `:54-106`):

```dockerfile
# KasmVNC config
COPY <<EOF /etc/kasmvnc/kasmvnc.yaml
desktop:
  resolution:
    width: 1920
    height: 1080
  ...
EOF

# Startup script — creates xstartup at runtime (after volume mount)
COPY <<'START' /start.sh
#!/bin/bash
...
START
RUN chmod +x /start.sh

VOLUME /config
EXPOSE 3000 9222
CMD ["/start.sh"]
```

**Chrome remote-debug flag pattern (KEY for D-104-UAT-CDP-BIND)** (`docker/livos-chrome/Dockerfile:82-83`):

```dockerfile
  --remote-debugging-port=9222 \
  --remote-debugging-address=0.0.0.0 \
```

The existing chrome container already uses `--remote-debugging-address=0.0.0.0` — this is the same fix RESEARCH §Pitfall 3 / D-104-UAT-CDP-BIND requires. **The local-uat Dockerfile should use port 9223 (not 9222) to avoid collision with any pre-existing 9222-bound chrome on the host.**

**Differences to expect:**
- Same: Ubuntu 24.04 base, `DEBIAN_FRONTEND=noninteractive`, multi-package apt-get with `--no-install-recommends`, Google Chrome install incantation, heredoc-inlined config files, `EXPOSE` + `CMD`, Chrome with `--remote-debugging-address=0.0.0.0`.
- New: Base FROM is `trfore/docker-ubuntu2404-systemd:latest` (per D-104-UAT-IMAGE), NOT `ubuntu:24.04`. `ENTRYPOINT ["/sbin/init"]` (NOT a custom `CMD`). Adds `xvfb fluxbox x11vnc websockify novnc` packages (livos-chrome uses KasmVNC instead). EXPOSE `80 443 53/udp 6080 9223`. Port 9223 not 9222 (collision avoidance).
- Risk: KasmVNC vs noVNC pick — RESEARCH §Don't Hand-Roll explicitly picks **noVNC + websockify** (apt-shipped). Do NOT reuse KasmVNC from `livos-chrome/Dockerfile` — research §"State of the Art" deprecates it for the UAT use case.

**Read order for executor:**
1. `docker/livos-chrome/Dockerfile` (113 lines) — for ENV/apt/heredoc/EXPOSE style.
2. `.planning/phases/104-local-install-and-docker-uat/104-RESEARCH.md:117-129` — exact Dockerfile skeleton to copy.
3. `.planning/phases/104-local-install-and-docker-uat/104-RESEARCH.md:781-826` — entrypoint.sh that pairs with the Dockerfile.

---

### `docker/local-uat/docker-compose.yml` (config, orchestration)

**Analog:** `docker/docker-compose.postgres.yml` (22 lines — read in full)

**Compose layout pattern** (`docker/docker-compose.postgres.yml:1-22`):

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: livos-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: livos
      POSTGRES_PASSWORD: LivPostgres2024!
      POSTGRES_DB: livos
    ports:
      - '127.0.0.1:5432:5432'
    volumes:
      - /opt/livos/data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U livos -d livos']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
```

**Differences to expect:**
- Same: `version: '3.8'`, single-service block, named `container_name`, explicit `ports:` mapping with quoted strings, `environment:` block, `healthcheck:` block.
- New: `build: .` instead of `image:` (we build locally from sibling Dockerfile). `privileged: true`, `cgroup: host` (or `cgroupns_mode: host` for older clients), `tmpfs: [/run, /tmp, /run/lock]`, `volumes: - /sys/fs/cgroup:/sys/fs/cgroup:rw`, `stop_signal: SIGRTMIN+3` — all per D-104-UAT-IMAGE. **No** `restart: unless-stopped` (UAT containers are ephemeral, `--rm` style; restart loops on systemd failure would mask bugs).
- Risk: The bind-mount of `/sys/fs/cgroup:rw` is **specific to cgroup v2 on Linux hosts and WSL2 ≥2.5.1**. Add an entrypoint.sh pre-flight check (already in RESEARCH §Example 3) that fails loudly if the host is on cgroup v1.

**Read order for executor:**
1. `docker/docker-compose.postgres.yml` (22 lines) — compose layout idiom.
2. `.planning/phases/104-local-install-and-docker-uat/104-RESEARCH.md:384-410` — exact compose skeleton for UAT.

---

### `docker/local-uat/entrypoint.sh` (utility, container PID-1 init)

**Analog (primary):** `.planning/phases/104-local-install-and-docker-uat/104-RESEARCH.md:781-826` (research has the verbatim spec — no in-repo container-init script to copy from).

**Analog (secondary, for bash style):** `livos/install.sh:7-50` for `set -euo pipefail` + helper functions + ERR trap.

**Bash safety harness pattern** (`livos/install.sh:7-47`):

```bash
main() {
    set -euo pipefail

    # ── Colors ────────────────────────────────────────────────
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    NC='\033[0m'

    # ── Helper functions ──────────────────────────────────────
    info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
    ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
    warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
    fail()  { echo -e "${RED}[FAIL]${NC}  $*"; cleanup_on_error; exit 1; }
    step()  { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

    # ── Setup ERR trap ────────────────────────────────────────
    trap 'cleanup_on_error $LINENO' ERR
```

**Differences to expect:**
- Same: `set -euo pipefail`, info/ok/warn/fail color helpers (or import them via shared sourced file), ERR trap.
- New: Runs INSIDE container (not on host). Pre-flight `grep -q '^0::' /proc/self/cgroup` cgroup-v2 check. Starts Xvfb/fluxbox/x11vnc/websockify (NOT in livos/install.sh — that runs on real hosts). Runs `bash scripts/install.sh --mode "${LIVOS_UAT_MODE:-local-lan}"` (which is the SUBJECT-UNDER-TEST). Launches Chrome with `--remote-debugging-port=9223 --remote-debugging-address=0.0.0.0`.
- Risk: The entrypoint must NOT use `main()` function-wrapping style of livos/install.sh — Docker PID 1 expects `exec` semantics. Use a flat script with `wait` at the end so systemd stays PID 1.

---

### `docker/local-uat/README.md` (docs)

**No close in-repo analog.** Repo has no README under `docker/`. Use the comment-header style of `docker/build-images.sh:1-3`:

```bash
#!/usr/bin/env bash
# Build LivOS Docker images from Umbrel sources
# Usage: ./build-images.sh [push]
```

**Content shape (NEW pattern):** Short README with: prerequisites (WSL ≥2.5.1, Docker Desktop, cgroup v2 verification command), one-command run (`docker compose up --build`), expected ports, where to find UAT artifacts after run (screenshots dir), known limitations (macOS gap from RESEARCH §Q3-RESOLVED), troubleshooting (Pitfall 3 / Pitfall 7).

---

### `docker/local-uat/uat-driver/walk.mjs` (test, e2e harness)

**No in-repo analog.** This is the first Chrome-DevTools-MCP-driven test in the repo. Source pattern: RESEARCH §Example 4 (lines 830-853).

```javascript
// docker/local-uat/uat-driver/walk.mjs (NEW — research provides the skeleton)
import { spawn } from 'node:child_process';

const mcp = spawn('npx', [
    'chrome-devtools-mcp@latest',
    '--browserUrl', 'http://localhost:9223',
]);
// ... navigate + screenshot + assert per AC-104-9 / AC-104-10
```

**Read order:** RESEARCH lines 830-853 first; then `livos/packages/livinityd/source/modules/server/ws-stream.test.ts` for any in-repo Node-test idiom (vitest is the standard in livinityd; node:test is fine for an out-of-workspace harness).

---

### `docker/local-uat/scripts/test-install-idempotency.sh` (test, integration shell)

**Analog:** `scripts/verify-sacred-sha.sh` — the closest existing shell-test idiom in the repo.

```bash
# scripts/verify-sacred-sha.sh — read first 30 lines for style
```

(Path: `C:\Users\hello\Desktop\Projects\contabo\livinity-io\scripts\verify-sacred-sha.sh`)

**Differences to expect:**
- Same: `set -euo pipefail`, explicit exit codes, prints PASS/FAIL with color, exits 1 on failure (CI-consumable).
- New: Test methodology is "run install.sh twice, diff before/after state" — different from sacred-sha's "compute hash and compare." The state diff covers: `systemctl is-active livos liv-core liv-worker`, contents of `/etc/caddy/Caddyfile`, contents of `/etc/dnsmasq.d/livinity.conf`, `redis-cli get livos:domain:local_mode`.

---

### `docker/cloud-regression/` (parallel UAT container for `--mode cloud` regression)

**Analog:** Mirror of `docker/local-uat/` — same Dockerfile shape, same compose shape, different entrypoint (runs `--mode cloud` and asserts byte-equivalence to the Mini PC `dab261cc` services).

**Specifically:** entrypoint compares (a) systemd unit file SHAs against the Mini PC baseline (captured as fixture), (b) `/etc/caddy/Caddyfile` shape (Caddy uses Cloudflare DNS-01 with the same syntax as Mini PC `dab261cc`), (c) Redis `livos:domain:config` JSON shape.

**Risk:** Cloudflare DNS-01 challenge needs real DNS access — UAT container will NOT be able to mint a real cert. **Mitigation per RESEARCH §Pitfall 6 + §Assumption A5:** assert on Caddy *config validity* (`caddy validate`) rather than on cert issuance. Real cert flow stays a manual user-walk on a fresh DigitalOcean droplet or against the Mini PC.

---

### `scripts/install.sh` (user-facing one-shot)

**Analog:** `livos/install.sh` (1725 lines — the existing one-shot, single-mode).

**Argument-parsing pattern** (`livos/install.sh:10-17`):

```bash
# ── Parse arguments ──────────────────────────────────────
PLATFORM_API_KEY=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --api-key) PLATFORM_API_KEY="$2"; shift 2 ;;
        *) shift ;;
    esac
done
```

**Constants + OS detection pattern** (`livos/install.sh:19-71`):

```bash
# ── Constants ─────────────────────────────────────────────
LIVOS_DIR="/opt/livos"
LIV_DIR="/opt/liv"
REPO_URL="https://github.com/utopusc/livinity-io.git"

# ── OS/Arch variables (set by detect_os/detect_arch) ──────
OS_ID=""
OS_VERSION_ID=""
...

# ── Detection functions ───────────────────────────────────
detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS_ID="${ID:-unknown}"
        ...
    fi
    case "$OS_ID" in
        ubuntu|debian)
            ok "Detected: $OS_PRETTY_NAME"
            ;;
        *)
            warn "OS '$OS_ID' not officially supported. Continuing anyway..."
            ;;
    esac
}
```

**Caddy install pattern** (`livos/install.sh:487-499`):

```bash
install_caddy() {
    if command -v caddy &>/dev/null; then
        ok "Caddy already installed"
        return 0
    fi
    info "Installing Caddy..."
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
    ok "Caddy installed"
}
```

**Caddy configure pattern** (`livos/install.sh:1271-1295`):

```bash
configure_caddy() {
    step "Configuring Caddy"
    local domain="${CONFIG_DOMAIN:-localhost}"
    local use_https="${CONFIG_USE_HTTPS:-false}"

    if [[ "$use_https" == "true" ]] && [[ "$domain" != "localhost" ]]; then
        cat > /etc/caddy/Caddyfile << CADDYFILE
${domain} {
    reverse_proxy localhost:8080
}
CADDYFILE
        ok "Caddy configured: ${domain} with auto-TLS → localhost:8080"
    else
        cat > /etc/caddy/Caddyfile << 'CADDYFILE'
:80 {
    reverse_proxy localhost:8080
}
CADDYFILE
        ok "Caddy configured: :80 → localhost:8080 (HTTP only)"
    fi

    systemctl enable caddy
    systemctl restart caddy
}
```

**Differences to expect:**
- Same: `main()` wrapper, `set -euo pipefail`, ANSI color helpers, ERR trap, `detect_os` + `detect_arch`, all the existing `install_*` functions for Node/Redis/Postgres/Docker/Caddy/Chrome.
- New (per D-104-INSTALL-MODES): `--mode {cloud|local-lan|hybrid}` flag with default = `hybrid`. Validates mode against a whitelist; exits 64 on invalid. Sources mode-specific helpers via RESEARCH §Pattern 5 (Sentry-style).
- Critical: **The existing `livos/install.sh` MUST keep working as-is on the Mini PC** (D-104-NO-PROD-IMPACT). The NEW `scripts/install.sh` at repo root is a NEW file; the existing `livos/install.sh` stays unchanged. Two scripts coexist; `update.sh` continues to use whatever path it currently uses (verify in plan 104-06 cloud-regression).

**Read order for executor:**
1. `livos/install.sh:1-100` — main() wrapper + helpers + detect functions.
2. `livos/install.sh:487-499` — install_caddy() idiom.
3. `livos/install.sh:1271-1295` — configure_caddy() heredoc pattern.
4. RESEARCH §Pattern 5 (lines 446-491) — full --mode dispatch skeleton from Sentry self-hosted.

---

### `scripts/install/mode-cloud.sh` (helper, sourced)

**Analog:** Extracted from `livos/install.sh` `configure_caddy()` (lines 1271-1295) + `install_cloudflared()` (502-513).

**Differences to expect:**
- Same: All existing cloud-path logic — Cloudflare DNS challenge config, `cloudflared` install, `livos:domain:config` Redis key shape.
- New: Refactored into a sourced helper (no `main()` wrapper, no shebang). Reads `${LIVINITY_CLOUDFLARE_API_TOKEN}` from env (non-interactive — per D-104-DEFAULT-MODE wave 2 brief). Writes `livos:domain:local_mode=cloud` to Redis (this is the marker that mode-detect-at-update reads — RESEARCH §Pitfall 5).

---

### `scripts/install/mode-local-lan.sh` (helper, sourced)

**Analog (primary):** RESEARCH §Example 1 (lines 634-717) — verbatim helper skeleton.
**Analog (style):** `livos/install.sh:487-499` (Caddy install idempotency idiom).

```bash
# scripts/install/mode-local-lan.sh — copy verbatim from RESEARCH 634-717
install_dnsmasq_local_lan() {
    # ── 1. Free port 53 from systemd-resolved (idempotent) ──
    mkdir -p /etc/systemd/resolved.conf.d
    local stub_drop="/etc/systemd/resolved.conf.d/no-stub.conf"
    if ! grep -qF "DNSStubListener=no" "$stub_drop" 2>/dev/null; then
        cat > "$stub_drop" <<'EOF'
[Resolve]
DNSStubListener=no
EOF
        systemctl restart systemd-resolved
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
address=/.${user_tld}/${host_ip}
local=/${user_tld}/
no-resolv
server=1.1.1.1
server=1.0.0.1
bind-dynamic
EOF
    mv -f "$tmp" "$conf"

    systemctl enable --now dnsmasq
    set_livos_redis_key "livos:domain:local_mode" "local-lan"
    set_livos_redis_key "livos:domain:local_tld" "$user_tld"
    set_livos_redis_key "livos:domain:host_ip" "$host_ip"
}

install_caddy_local_pki() {
    local pki_conf="/etc/caddy/pki-global.conf"
    if ! grep -qF "ca liv-local" "$pki_conf" 2>/dev/null; then
        cat > "$pki_conf" <<'EOF'
{
    pki {
        ca liv-local {
            name "LivOS Local CA"
            root_cn "LivOS Local Root"
        }
    }
}
EOF
    fi
}
```

**Differences to expect from RESEARCH §Example 1:**
- The example assumes `set_livos_redis_key` and `info`/`ok`/`fail` helpers exist — they DO in `livos/install.sh:40-43`, but mode-local-lan.sh is SOURCED by scripts/install.sh so the helpers must be sourced earlier (per RESEARCH §Pattern 5 dispatch order: `_logging.sh` before mode-*.sh).
- Critical (D-104-CADDY-PKI-IMPORT): `pki-global.conf` MUST be in its own file at `/etc/caddy/pki-global.conf` so livinityd's `generateLocalCaddyfile()` can emit `import /etc/caddy/pki-global.conf` at the top. Do NOT inline this block into the generated Caddyfile body.

---

### `scripts/install/mode-hybrid.sh` (helper, sourced)

**Analog:** No direct in-repo analog (Caddy DNS-01 challenge is currently driven by Caddy's runtime ACME, not by install.sh — `livos/install.sh:1271-1295` configure_caddy() just writes a simple Caddyfile and lets Caddy auto-issue).

**Read order for executor:**
1. `livos/install.sh:487-499` for install_caddy() idiom (reuse — both modes need Caddy installed).
2. RESEARCH §Q3-RESOLVED Option A (lines 553-575) for hybrid flow shape: user enters Cloudflare API token → install.sh provisions `<random>.home.livinity.io` via Server5 control-plane (one-time API call) → writes Caddy DNS-01 config.

**Differences to expect:**
- New: Cloudflare DNS-01 plugin needs `caddy-dns/cloudflare` module — Caddy from official repo may not include it; mode-hybrid.sh may need `xcaddy build` step. Verify in plan; flagged as RESEARCH §Tertiary Source (single-source claim).
- New: A control-plane call to Server5 to mint `<random>.home.livinity.io` (per D-104-RELAY-ZERO-DATA-PLANE — this is one of the three acceptable Server5 touches).

---

### `livos/packages/livinityd/source/modules/local-dns/` (NEW module directory)

**Analog:** `livos/packages/livinityd/source/modules/computer-use/`

**Module shape** (`ls computer-use/`):

```
computer-use/
  index.ts                          (barrel; module entry)
  routes.ts                          (tRPC router)
  routes.test.ts                     (router tests)
  container-manager.ts               (service)
  container-manager.test.ts          (service tests)
  desktop-gateway.ts                 (service)
  desktop-gateway.test.ts            (service tests)
  luse-mcp-config.ts                 (config helper)
  luse-mcp-config.test.ts            (config helper tests)
  ...
```

**Differences to expect:**
- Same: `index.ts` barrel + `routes.ts` + service files + sibling `*.test.ts` next to each service. Vitest auto-discovers `**/*.test.ts`.
- New: `local-dns/` is smaller in scope — 3 service files (dnsmasq-config.ts, pki.ts) + routes.ts + tests. No `index.ts` is strictly required (none of the existing module dirs that ship as named imports — e.g. `domain/` — have one).

**Read order:**
1. `livos/packages/livinityd/source/modules/computer-use/routes.ts` — full pattern for tRPC + helpers + privateProcedure usage.
2. `livos/packages/livinityd/source/modules/domain/routes.ts` (374 lines) — same domain (literally), and shows the `domain.activate` / `domain.getStatus` / `domain.remove` shape that `local.activate` / `local.getStatus` / `local.getCaCert` should mirror.

---

### `local-dns/dnsmasq-config.ts` (service)

**Analog:** `livos/packages/livinityd/source/modules/domain/caddy.ts`

**File-writer + reload pattern** (`caddy.ts:1-9`, `:140-153`):

```typescript
import {writeFile} from 'node:fs/promises'
import {exec} from 'node:child_process'
import {promisify} from 'node:util'
import fse from 'fs-extra'
import {$} from 'execa'
import {ensureFirewallPorts} from './firewall.js'

const execAsync = promisify(exec)

const CADDYFILE_PATH = '/etc/caddy/Caddyfile'

/**
 * Write content to the Caddyfile on disk.
 */
export async function writeCaddyfile(content: string): Promise<void> {
    await writeFile(CADDYFILE_PATH, content, 'utf-8')
}

/**
 * Reload Caddy to pick up Caddyfile changes.
 * Uses `caddy reload` which applies changes without downtime.
 */
export async function reloadCaddy(): Promise<void> {
    await execAsync(`caddy reload --config ${CADDYFILE_PATH}`)
}
```

**Generator function pattern** (`caddy.ts:53-115`):

```typescript
export function generateFullCaddyfile(
    config: CaddyConfig,
    multiUser = false,
    tunnel = false,
    nativeApps: Array<{...}> = [],
): string {
    const blocks: string[] = []
    if (!config.mainDomain || tunnel) {
        blocks.push(`:80 {
    reverse_proxy 127.0.0.1:8080
}`)
        return blocks.join('\n\n') + '\n'
    }
    blocks.push(`${config.mainDomain} {
    reverse_proxy 127.0.0.1:8080
}`)
    ...
    return blocks.join('\n\n') + '\n'
}
```

**Differences to expect:**
- Same: Pure-function generator returning a string; separate async writer; separate reload via `execAsync`. `validateDomain` / `validateSubdomain` regex helpers (extend with `validateLocalTld` per RESEARCH §Security Domain V5).
- New: Generates dnsmasq.conf content (RESEARCH §Pattern 2 lines 326-353), writes to `/etc/dnsmasq.d/livinity.conf` (NOT `/etc/dnsmasq.conf`), reloads via `systemctl reload dnsmasq` (NOT `dnsmasq reload`).

---

### `local-dns/pki.ts` (service)

**Analog (constants + helpers):** `livos/packages/livinityd/source/modules/apps/native-app-config.ts` (constants block style at lines 30-58).

**Constants block style** (`native-app-config.ts:42-58`):

```typescript
/**
 * Absolute-path regex. Must begin with `/`. Allowed characters: ...
 */
const ABSOLUTE_PATH_RE = /^\/[a-zA-Z0-9_\-./]+$/

/**
 * Shell-metachar blocklist for argv entries. ...
 */
const SHELL_METACHAR_RE = /^[^;&|`$<>(){}\\]*$/
```

**Differences to expect:**
- pki.ts is mostly **constants + a single read-the-root-cert-from-disk function**:
  - `CADDY_PKI_AUTHORITY_DIR = '/var/lib/caddy/.local/share/caddy/pki/authorities/liv-local'`
  - `CADDY_PKI_ROOT_CRT = path.join(CADDY_PKI_AUTHORITY_DIR, 'root.crt')`
  - `async function readRootCert(): Promise<string>` — `fs.readFile` PEM, return as utf-8 string.
- Per RESEARCH §Tertiary Sources, the exact Caddy storage path **must be verified post-install** via `find /var/lib/caddy -name root.crt -type f` — pki.ts should expose a `findRootCertPath()` fallback.

---

### `local-dns/routes.ts` (controller, tRPC)

**Analog:** `livos/packages/livinityd/source/modules/domain/routes.ts` (374 lines)

**Imports pattern** (`domain/routes.ts:1-13`):

```typescript
import {z} from 'zod'
import type {Redis} from 'ioredis'
import {router, privateProcedure} from '../server/trpc/trpc.js'
import {getPublicIp, verifyDns} from './dns-check.js'
import {
    applyCaddyConfig,
    removeDomain,
    validateSubdomain,
    type CaddyConfig,
    type SubdomainConfig,
} from './caddy.js'
import platform from '../platform/routes.js'

const REDIS_KEY = 'livos:domain:config'
const REDIS_SUBDOMAINS_KEY = 'livos:domain:subdomains'
```

**Redis-backed config read/write pattern** (`domain/routes.ts:33-51`):

```typescript
async function getConfig(redis: Redis): Promise<DomainConfig | null> {
    const raw = await redis.get(REDIS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as DomainConfig
}

async function setConfig(redis: Redis, config: DomainConfig): Promise<void> {
    await redis.set(REDIS_KEY, JSON.stringify(config))
}
```

**tRPC router shape** (`domain/routes.ts:77-103`, `:163-181`):

```typescript
const domain = router({
    getStatus: privateProcedure.query(async ({ctx}) => {
        const config = await getConfig(ctx.livinityd.ai.redis)
        ...
        return { configured: true, domain: config.domain, active: config.active, ... }
    }),

    activate: privateProcedure.mutation(async ({ctx}) => {
        const config = await getConfig(ctx.livinityd.ai.redis)
        if (!config?.domain) {
            throw new Error('No domain configured')
        }
        config.active = true
        config.activatedAt = Date.now()
        await setConfig(ctx.livinityd.ai.redis, config)
        const {firewallResult} = await rebuildCaddy(ctx.livinityd.ai.redis)
        return { success: true, domain: config.domain, firewall: firewallResult }
    }),
    ...
})

export default domain
```

**Differences to expect:**
- Same: `import {z}`, `import {router, privateProcedure} from '../server/trpc/trpc.js'`, Redis-backed config helpers, tRPC procedures returning `{success: true, ...}`, default-export the router.
- New procedures:
  - `local.activate` (mutation) — accepts `{tld: string, hostIp: string}`, writes Redis keys, calls `applyLocalDnsConfig()` and `generateLocalCaddyfile()`.
  - `local.getStatus` (query) — returns `{mode, tld, hostIp, caCertAvailable}`.
  - `local.getCaCert` (query) — returns `{pem: string}` reading from pki.ts.
- New Redis keys (per RESEARCH §Runtime State Inventory): `livos:domain:local_mode`, `livos:domain:local_tld`, `livos:domain:host_ip`. **NEVER touch the existing `livos:domain:config` key** unless mode='cloud' (preserves D-104-NO-PROD-IMPACT).

**httpOnlyPaths registration** (`livos/packages/livinityd/source/modules/server/trpc/common.ts:65-74`): must add `local.activate`, `local.getStatus`, `local.getCaCert` to the `httpOnlyPaths` array — these mutations may take 1-5 seconds (systemctl reload) and must survive WS reconnect (per X-04 pitfall).

**Router registration** (`server/trpc/index.ts:19,146`): add `import localDns from '../../local-dns/routes.js'` near line 19 and `local: localDns,` near line 146.

---

### `local-dns/*.test.ts` (vitest)

**Analog:** `livos/packages/livinityd/source/modules/apps/native-app-config.test.ts`

**Fake Redis pattern** (`native-app-config.test.ts:24-60`):

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect, vi} from 'vitest'
import {randomUUID} from 'node:crypto'

import {
    nativeAppConfigSchema,
    NativeAppConfigStore,
    type NativeAppConfig,
} from './native-app-config.js'

// ─── Map-backed fake Redis (mirrors seed-builtin-tools.test.ts pattern) ─────
function makeFakeRedis() {
    const store = new Map<string, string>()
    const publishes: Array<{channel: string; message: string}> = []
    const redis = {
        async set(key: string, value: string) {
            store.set(key, value)
            return 'OK'
        },
        async get(key: string) {
            return store.get(key) ?? null
        },
        async del(key: string) {
            const had = store.has(key)
            store.delete(key)
            return had ? 1 : 0
        },
        ...
    }
    return {redis, publishes, store}
}
```

**Differences to expect:**
- Same: vitest `describe`/`it`/`expect`, file naming `*.test.ts` next to source file (vitest config picks up via existing glob — no config edits needed). `npm test` runs with `--testTimeout 180000 --maxConcurrency 1 --poolOptions.threads.singleThread true` per `livos/packages/livinityd/package.json`.
- New: dnsmasq-config.test.ts is **mostly pure-function tests** of the config generator (no Redis needed — same pattern as caddy.test.ts). pki.test.ts can use vitest's `vi.mock('node:fs/promises')` for the readFile call.

---

### EDIT: `livos/packages/livinityd/source/modules/domain/caddy.ts`

**Edit scope (per CONTEXT.md "Post-research refinements" + D-104-CADDY-PKI-IMPORT):**
- Add `generateLocalCaddyfile(localDomain, hostIp, subdomains, multiUser)` function — see RESEARCH §Example 2 (lines 720-777).
- Add `generateHybridCaddyfile(hybridDomain, cfApiToken)` function (uses `acme_dns cloudflare {env.CLOUDFLARE_API_TOKEN}` block).
- **DO NOT modify** `generateFullCaddyfile()` — preserves cloud-mode behavior byte-for-byte (D-104-NO-PROD-IMPACT).

**Where to add functions** (`caddy.ts:115`): immediately after `generateFullCaddyfile()` closes (line 115) and before `generateCaddyfile()` (line 120). Keep alphabetical-by-purpose grouping.

**Critical: import preservation** — per Pitfall 1 + D-104-CADDY-PKI-IMPORT, the first line of `generateLocalCaddyfile()` output MUST be `import /etc/caddy/pki-global.conf`. Test in caddy.test.ts asserts this with `expect(result.split('\n')[0]).toMatch(/^import \/etc\/caddy\/pki-global\.conf/)`.

**Read order:**
1. `caddy.ts` (207 lines — read in full; small file).
2. RESEARCH §Example 2 (lines 720-777) — verbatim generateLocalCaddyfile().

---

### EDIT: `livos/packages/livinityd/source/server/index.ts`

**Edit scope:** Add public unauthenticated GET `/api/local/ca.crt` endpoint.

**Analog:** `server/index.ts:1138-1140` — the existing public `/manager-api/v1/system/update-status` GET, the only other unauth-public-Express-GET in this file:

```typescript
// This is needed for legacy reasons when 0.5.x users OTA update to 1.0.
// 0.5.x polls this endpoint during update to know when it's completed.
this.app.get('/manager-api/v1/system/update-status', (request, response) => {
    response.json({state: 'success', progress: 100, description: '', updateTo: ''})
})
```

**Where to add** (`server/index.ts:1138`): immediately after the existing legacy update-status handler (line 1138-1140), before the `/api/mcp` proxy at line 1143. This keeps all the "public unauthenticated" routes in one neighborhood. Order is fine because more-specific paths win in Express, and `/api/local/ca.crt` doesn't overlap with `/api/mcp`.

**Pattern to copy:**

```typescript
// Phase 104 — Local-mode CA root certificate. Public (unauthenticated)
// because devices need to download the CA BEFORE they can trust HTTPS
// from livinityd. Only serves when local-lan mode is active (Redis
// flag check); otherwise 404. Path is intentionally exact-match —
// not a path prefix — to prevent leaking other endpoints.
this.app.get('/api/local/ca.crt', async (_request, response) => {
    const mode = await this.livinityd.ai.redis.get('livos:domain:local_mode').catch(() => null)
    if (mode !== 'local-lan') {
        return response.status(404).json({error: 'local-lan mode not active'})
    }
    try {
        const {readRootCert} = await import('../local-dns/pki.js')
        const pem = await readRootCert()
        response.setHeader('Content-Type', 'application/x-x509-ca-cert')
        response.setHeader('Content-Disposition', 'attachment; filename="livos-local-ca.crt"')
        response.send(pem)
    } catch (err) {
        this.logger.error(err)
        response.status(500).json({error: 'failed to read CA cert'})
    }
})
```

**Differences to expect:**
- Same: `this.app.get(path, handler)` style, no auth middleware wrapping (matches `/manager-api/v1/system/update-status` shape), error handled inline.
- New: Reads Redis for mode-gate (the existing legacy endpoint is unconditional). Returns binary cert with explicit `Content-Type` + `Content-Disposition`. Uses dynamic `import()` (deferred so cold-start doesn't require local-dns module to load).
- Security (RESEARCH §V13): Use exact path `/api/local/ca.crt` (NOT `/api/local/*`) — Pitfall: path-prefix wildcards would leak other endpoints.

**Risk:** middleware order matters — this MUST be registered BEFORE the `this.app.get('*', ...)` catch-all at line 1506, which is true if added at line 1141.

---

### EDIT: `livos/packages/livinityd/source/modules/domain/caddy.test.ts` (NEW file, but next to existing module)

**Analog:** `livos/packages/livinityd/source/modules/apps/native-app-config.test.ts` (pure-function test idiom — no Redis fake needed since caddy.ts functions are pure string generators).

**Test cases required by RESEARCH §Pitfall 1 / D-104-CADDY-PKI-IMPORT:**

```typescript
import {describe, it, expect} from 'vitest'
import {
    generateLocalCaddyfile,
    generateHybridCaddyfile,
    generateFullCaddyfile,
} from './caddy.js'

describe('generateLocalCaddyfile', () => {
    it('emits import /etc/caddy/pki-global.conf as the first non-blank line', () => {
        const out = generateLocalCaddyfile('bruce.livinity.local', '192.168.1.100', [], true)
        const firstNonBlank = out.split('\n').find((l) => l.trim().length > 0)
        expect(firstNonBlank).toMatch(/^import \/etc\/caddy\/pki-global\.conf$/)
    })

    it('contains the wildcard *.bruce.livinity.local block', () => {
        const out = generateLocalCaddyfile('bruce.livinity.local', '192.168.1.100', [], true)
        expect(out).toContain('*.bruce.livinity.local {')
    })

    it('contains HTTP-only block for CA cert download by IP and by name', () => {
        const out = generateLocalCaddyfile('bruce.livinity.local', '192.168.1.100', [], true)
        expect(out).toContain('http://bruce.livinity.local, http://192.168.1.100')
        expect(out).toContain('handle /api/local/ca.crt')
    })
})

describe('generateFullCaddyfile (regression — cloud mode untouched)', () => {
    it('does NOT emit any pki or import directive in cloud mode', () => {
        const out = generateFullCaddyfile(
            {mainDomain: 'bruce.livinity.io', subdomains: []},
            false, false, []
        )
        expect(out).not.toContain('import /etc/caddy/pki-global.conf')
        expect(out).not.toContain('pki {')
        expect(out).not.toContain('ca liv-local')
    })
})
```

---

### `livos/packages/ui/src/features/local-setup/` (NEW UI feature directory)

**Analog (state-machine + step components — named sibling):**
`livos/packages/ui/src/routes/settings/domain-setup.tsx` (the existing domain wizard — closest by name and by problem-shape).

**Analog (features/ folder layout):**
`livos/packages/ui/src/features/backups/components/setup-wizard.tsx` (the existing feature-folder wizard with sub-components).

**Wizard step state-machine pattern** (`domain-setup.tsx:25-33`):

```typescript
type ConnectionMethod = 'tunnel' | 'direct'
type WizardStep = 'domain' | 'method' | 'tunnel' | 'dns-records' | 'verify' | 'activate' | 'done'

// Steps for direct path: domain → method → dns-records → verify → activate → done
// Steps for tunnel path: domain → method → tunnel → done
// The indicator labels adapt based on selected method
const DIRECT_STEPS: WizardStep[] = ['domain', 'method', 'dns-records', 'verify', 'activate', 'done']
const TUNNEL_STEPS: WizardStep[] = ['domain', 'method', 'tunnel', 'done']
```

**Step component signature** (`domain-setup.tsx:58-64`):

```tsx
function StepMethod({
    onSelectMethod,
    onBack,
}: {
    onSelectMethod: (method: ConnectionMethod) => void
    onBack: () => void
}) {
    return (
        <div className='space-y-5'>
            <div>
                <h3 className='text-body-lg font-semibold text-text-primary'>Choose connection method</h3>
                ...
```

**tRPC mutation usage in a step** (`domain-setup.tsx:146`):

```typescript
const configureTunnelM = trpcReact.domain.tunnel.configure.useMutation()

const handleConnect = async () => {
    setError('')
    try {
        await configureTunnelM.mutateAsync({token, domain})
        onNext()
    } catch (err: any) {
        setError(err.message || 'Failed to configure tunnel')
    }
}
```

**Imports / icons / layout shell pattern** (`domain-setup.tsx:1-21`):

```typescript
import {useCallback, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {
    IconGlobe, IconLoader2, IconCheck, IconCopy, IconAlertCircle, IconLock,
    IconExternalLink, IconArrowRight, IconArrowLeft, IconRefresh, IconTrash,
} from '@tabler/icons-react'
import {TbCloud, TbWorldWww} from 'react-icons/tb'

import {trpcReact} from '@/trpc/trpc'
import {cn} from '@/shadcn-lib/utils'

import {SettingsPageLayout} from './_components/settings-page-layout'
```

**Differences to expect:**
- Same: `WizardStep` discriminated union, sub-component-per-step pattern (StepMethod, StepTunnel, etc.), `useState<WizardStep>` for state machine, `trpcReact.X.useMutation()` for async actions, `@tabler/icons-react` for icons, `SettingsPageLayout` shell.
- New: The new wizard lives in `features/local-setup/` (NOT `routes/settings/`). Sub-components are siblings: `LocalSetupWizard.tsx` (root), `QrCodeStep.tsx`, `PlatformInstructions.tsx`. Per CONTEXT.md, also: `HybridDnsSetup.tsx` (Cloudflare TXT walkthrough — RESEARCH file tree line 259).
- Wizard step list mirrors D-104-INSTALL-MODES: `'mode-pick' → 'local-lan' branch (qr + platform-instructions) | 'hybrid' branch (cloudflare-txt + verify) → 'done'`.
- tRPC mutation paths: `trpcReact.local.activate.useMutation()`, `trpcReact.local.getStatus.useQuery()`, `trpcReact.local.getCaCert.useQuery()`.
- **Where the feature mounts into the Settings panel:** Add a new file `livos/packages/ui/src/routes/settings/local-access.tsx` that imports `LocalSetupWizard` from `@/features/local-setup/LocalSetupWizard` and renders inside `<SettingsPageLayout>`. Route registration is implicit (`routes/settings/` is convention-based — peers like `domain-setup.tsx`, `chrome-master.tsx`, `gmail.tsx` mount as `/settings/{filename}` via the existing router. Verify in plan by reading `livos/packages/ui/src/router.tsx`).

**Read order for executor:**
1. `livos/packages/ui/src/routes/settings/domain-setup.tsx` (read first 250 lines for full wizard idiom).
2. `livos/packages/ui/src/features/backups/components/setup-wizard.tsx` (read first 60 lines — shows feature-folder layout with sub-components in same dir).
3. `livos/packages/ui/src/routes/settings/_components/settings-page-layout.tsx` (read full — the wrapper component all settings pages use).

---

## Shared Patterns

### Authentication: privateProcedure on all new tRPC routes

**Source:** `livos/packages/livinityd/source/modules/server/trpc/trpc.ts` (provides `privateProcedure`, `publicProcedure`, `adminProcedure`).
**Apply to:** All procedures in `local-dns/routes.ts` use `privateProcedure` (matches `domain/routes.ts`).

```typescript
import {router, privateProcedure} from '../server/trpc/trpc.js'

const local = router({
    getStatus: privateProcedure.query(async ({ctx}) => { /* ... */ }),
    activate: privateProcedure.mutation(async ({ctx, input}) => { /* ... */ }),
})
```

**Exception:** The `GET /api/local/ca.crt` Express endpoint is INTENTIONALLY public (RESEARCH §V13) — devices need it before they can trust HTTPS. Gate by Redis `livos:domain:local_mode === 'local-lan'` instead of by auth.

### Idempotency: shell-helper grep-and-write pattern

**Source:** `livos/install.sh:487-499` + RESEARCH §Example 1 (lines 634-687).
**Apply to:** All `scripts/install/mode-*.sh` helpers.

```bash
if ! grep -qF "DNSStubListener=no" "$stub_drop" 2>/dev/null; then
    cat > "$stub_drop" <<'EOF'
[Resolve]
DNSStubListener=no
EOF
    systemctl restart systemd-resolved
fi

# Same pattern for command existence:
if command -v caddy &>/dev/null; then
    ok "Caddy already installed"
    return 0
fi
```

### Error handling: tRPC routes throw, Express endpoints respond with status

**Source:** `livos/packages/livinityd/source/modules/domain/routes.ts:163-181` (tRPC) and `livos/packages/livinityd/source/modules/server/index.ts:1138-1140` (Express).
**Apply to:** Mirror the existing convention. tRPC: throw `new Error('message')` for validation, throw `new TRPCError(...)` for typed codes. Express: `response.status(N).json({error: 'msg'})`.

### Redis namespace: `livos:domain:*` (NOT `liv:*`)

**Source:** `livos/packages/livinityd/source/modules/domain/routes.ts:24-25` (`livos:domain:config`, `livos:domain:subdomains`).
**Apply to:** All new local-dns Redis keys MUST live under `livos:domain:` namespace (not a new `livos:local-dns:` namespace) so the mode-detect logic in `update.sh` (RESEARCH §Pitfall 5) and the existing `domain/routes.ts` consumers see a single source of truth.

New keys:
- `livos:domain:local_mode` — value: `'cloud' | 'local-lan' | 'hybrid'`
- `livos:domain:local_tld` — value: e.g. `'livinity.local'`
- `livos:domain:host_ip` — value: e.g. `'192.168.1.100'`

### httpOnlyPaths registration (mandatory for new tRPC mutations)

**Source:** `livos/packages/livinityd/source/modules/server/trpc/common.ts:65-90`.
**Apply to:** Any new mutation that does I/O slower than ~200ms (systemctl reload, file write, ACME). Add the procedure name string to `httpOnlyPaths` so the React client routes it through HTTP (survives WS reconnect after `systemctl restart livos`).

```typescript
// common.ts:65-74
'domain.tunnel.getStatus',
'domain.tunnel.configure',
'domain.tunnel.remove',
// ... ADD:
'local.activate',
'local.getStatus',
'local.getCaCert',
```

### UI feature folder layout: `features/<name>/` + a thin route at `routes/settings/<name>.tsx`

**Source:** `livos/packages/ui/src/features/backups/` (feature dir) + `livos/packages/ui/src/routes/settings/` (route entries).
**Apply to:** `features/local-setup/` (the new wizard) + `routes/settings/local-access.tsx` (the route entry that imports + renders the wizard).

---

## No Analog Found

| File | Role | Data Flow | Reason / Action |
|------|------|-----------|-----------------|
| `docker/local-uat/uat-driver/walk.mjs` | test (e2e Chrome DevTools MCP) | event-driven | First Chrome-DevTools-MCP-driven test harness in repo. Use RESEARCH §Example 4 verbatim. No existing analog — this is a new test pattern (the MCP client lives outside the JS workspaces). |
| `scripts/install/mode-hybrid.sh` | utility (sourced helper) | request-response | Caddy DNS-01 plugin (caddy-dns/cloudflare) is not currently in `livos/install.sh`'s install_caddy() — needs `xcaddy build` step. Tertiary-source-rated in RESEARCH; plan must verify in a sandbox before locking the exact apt/xcaddy incantation. |

---

## Read-First Cheat Sheet (one-screen executor reference)

If the executor reads in this order, they hit every pattern in <30 minutes:

1. **`docker/livos-chrome/Dockerfile`** (113 lines) — Dockerfile + Chrome `--remote-debugging-address=0.0.0.0` idiom.
2. **`docker/docker-compose.postgres.yml`** (22 lines) — compose v3.8 layout.
3. **`livos/install.sh:1-100`** + `:487-499` + `:1271-1295` — main(), helpers, install_caddy(), configure_caddy().
4. **`livos/packages/livinityd/source/modules/domain/caddy.ts`** (207 lines — full file) — Caddyfile generator idiom + the EDIT surface.
5. **`livos/packages/livinityd/source/modules/domain/routes.ts`** (374 lines) — tRPC router for the domain namespace (`local.*` should mirror).
6. **`livos/packages/livinityd/source/modules/computer-use/routes.ts`** (first 60 lines) — modern tRPC router with httpOnlyPaths header comment.
7. **`livos/packages/livinityd/source/modules/server/index.ts:1138-1167`** — public unauthenticated Express endpoint at line 1138 + the `/api/mcp` neighbor at 1143 for context.
8. **`livos/packages/livinityd/source/modules/server/trpc/index.ts:1-70` + `:130-170`** — where `domain` is registered; same registration site needed for `local`.
9. **`livos/packages/livinityd/source/modules/server/trpc/common.ts:55-90`** — `httpOnlyPaths` array; add `local.*` entries.
10. **`livos/packages/livinityd/source/modules/apps/native-app-config.test.ts:1-60`** — vitest + fake Redis idiom for routes.test.ts.
11. **`livos/packages/ui/src/routes/settings/domain-setup.tsx`** (first 250 lines) — WizardStep state machine + step components + trpcReact.X.useMutation().
12. **`livos/packages/ui/src/features/backups/components/setup-wizard.tsx`** (first 60 lines) — features/ folder layout shape.
13. **`RESEARCH.md §Example 1` (lines 634-718)**, **§Example 2 (lines 720-778)**, **§Example 3 (lines 781-826)**, **§Example 4 (lines 830-853)** — verbatim skeletons to paste.

---

## Metadata

**Analog search scope:** `docker/`, `scripts/`, `livos/packages/livinityd/source/modules/`, `livos/packages/ui/src/`. Tertiary glob in `livos/install.sh` for shell idioms.
**Files scanned:** 17 explicitly read; ~25 listed via `ls`/`grep`.
**Pattern extraction date:** 2026-05-11
**Confidence:** HIGH on tRPC + caddy.ts + server/index.ts patterns (direct read); HIGH on UI wizard pattern (direct read of domain-setup.tsx + setup-wizard.tsx); MEDIUM on the docker/local-uat/Dockerfile shape (livos-chrome is `ubuntu:24.04` with KasmVNC; UAT image is `trfore/...-systemd` with noVNC — base differs but apt-install + heredoc + Chrome flags transfer cleanly).
