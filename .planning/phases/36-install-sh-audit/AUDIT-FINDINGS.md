# install.sh Audit Findings — Phase 36

**Phase:** 36-install-sh-audit
**Milestone:** v29.2 Factory Reset
**Audit method:** Static analysis + curl fetch (read-only). No live execution per CONTEXT.md D-11.
**Audit date:** 2026-04-29
**Snapshot:** `.planning/phases/36-install-sh-audit/install.sh.snapshot`
**Primary consumer:** Phase 37 backend planner (per D-10)

> This document MUST be self-contained. Phase 37 should not need to consult external sources to design wipe + reinstall.

## Provenance

| Field | Value |
|-------|-------|
| Fetch URL | https://livinity.io/install.sh |
| Fetch timestamp (UTC) | 2026-04-29T04:12:32Z |
| HTTP status | 200 |
| Final URL after redirects | https://livinity.io/install.sh |
| Last-Modified | absent |
| ETag | absent |
| Content-Length | absent (Caddy + Next.js streamed body, no fixed-length header) |
| Server | absent (no `Server:` header; `Via: 1.1 Caddy` present, indicating Caddy-based relay) |
| Snapshot SHA-256 | `c00be0bf7e246878b3af2e470b138b2370ab498fc7aa80379945103273136437` |
| Snapshot byte size | 56494 |
| Snapshot line count | 1604 |
| Source provenance | live |

**Routing topology context:** `livinity.io` is DNS-only via Cloudflare; traffic resolves to the relay host (45.137.194.102) which forwards to the LivOS deployment. The relay sits between Cloudflare and the install.sh origin. If the relay is offline, the live URL fails and the audit must fall back to a cached copy on Mini PC. Cloudflare is **not** an HTTP tunnel — there is no Cloudflare tunneling daemon in this stack; Cloudflare's role is purely authoritative DNS for `*.livinity.io`.

**Caching note (FIX 2 reference, D-09):** At v29.2 audit time, the Mini PC cache at `/opt/livos/data/cache/install.sh.cached` is expected to be **absent** — the cache is populated by a future Phase 37 update.sh enhancement. `CACHE=missing` is the **expected** state for this audit run, not a defect. See `## Server5 Dependency Analysis` (Plan 03) for the complete fallback chain.

**Off-limits hosts (project memory hard rule, 2026-04-27):** Server4 (45.137.194.103) is not part of LivOS operations and is not referenced in this audit beyond this disclaimer. The audit's only operational target is the Mini PC (`bruce@10.69.31.68`). The relay host is examined only as the upstream of the install.sh URL.

**Source HTTP headers (verbatim, captured at audit time):**

```
HTTP/1.1 200 OK
Alt-Svc: h3=":443"; ma=2592000
Cache-Control: public, max-age=300
Content-Disposition: inline
Content-Type: text/plain; charset=utf-8
Date: Wed, 29 Apr 2026 04:12:32 GMT
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
Via: 1.1 Caddy
```

The full headers + provenance metadata are preserved at `install.sh.headers.txt` (sibling file). Note: `Last-Modified` and `ETag` are **not** emitted by the upstream Caddy + Next.js handler — version identity for this audit is therefore anchored on the SHA-256 hash above (not on HTTP cache validators).

## Raw Fetch

The fetched script is preserved verbatim at `install.sh.snapshot` (sibling file in this phase directory). It is referenced rather than embedded inline because the script is **1604 lines / 56494 bytes** — well above the ~200-line inlining threshold. Plans 02 and 03 will cite line ranges from `install.sh.snapshot` directly when filling in the static-analysis sections below.

To reproduce the exact bytes audited:

```
curl -sSL https://livinity.io/install.sh -o install.sh.snapshot
sha256sum install.sh.snapshot
# expected: c00be0bf7e246878b3af2e470b138b2370ab498fc7aa80379945103273136437
```

If the SHA-256 differs at re-fetch time, `livinity.io/install.sh` has drifted since this audit and Plans 02/03 findings must be re-validated against the new bytes.

## Argument Surface

Static analysis of `install.sh.snapshot` (line refs are to that file). install.sh was NOT executed.

### Flags

| Flag | line:N | Required | Default | Description |
|------|--------|----------|---------|-------------|
| `--api-key <value>` | line:14 | optional | `""` (empty) | Sets `PLATFORM_API_KEY` from `$2`. Two-arg form only (`--api-key=VALUE` is NOT supported — splits on space). LEAKS via `ps` — see API Key Transport section. |

**Unrecognized-flag handling:** line:16 `*) shift ;;` — any non-`--api-key` token (including `--help`, `--api-key-file`, `--resume`, `--force`, `--no-build`, `--version`, `--debug`, etc.) is **silently shifted off without warning or error**. install.sh accepts no other flags. There is no `getopts`, no `--help` text, no `--version` reporter. (Static evidence: `grep -E "case \"\\\$1\"|getopts" install.sh.snapshot` returns one `case "$1"` at line:13 only; no `getopts`.)

### Environment variables consumed

install.sh consumes very few environment variables — most LIV-namespaced env vars are *generated and written* into `/opt/livos/.env`, not read from the caller's environment. Distinction below: **read** vs. **written**.

| Variable | line:N | Required | Default | Description |
|----------|--------|----------|---------|-------------|
| `EUID` | line:164 | yes (implicit) | (shell-provided) | Root check — script aborts via `fail()` if `EUID -ne 0`. |
| `DEBIAN_FRONTEND` | line:1474 | no | (script *exports* `noninteractive` for itself) | Suppresses apt prompts during install. Set BY install.sh, not consumed FROM caller. Listed for completeness. |
| `DISPLAY` | line:568, 656 | no | unset | Used inside the embedded `livos-launch-chrome` and `livos-set-resolution` scripts written to `/usr/local/bin/`. Not consumed by install.sh's main flow. |
| `XAUTHORITY` / `HOME` | line:570, 658 | no | derived | Same — used in embedded user-side scripts only. |
| `REDIS_URL` | line:724, 1338, 1563 | no | (sourced from `/opt/livos/.env` after generation) | Re-read post-`write_env_file` to extract the redis password for `redis-cli` calls. Not a caller-supplied input. |
| (no `LIV_API_KEY` consumed) | n/a | — | — | `LIV_API_KEY` is **generated** (line:909) into `.env` but never read from the caller's env. |
| (no `KIMI_API_KEY` consumed) | n/a | — | — | Written empty (line:905) into `.env` for later configuration via UI; not consumed. |
| (no `JWT_SECRET` consumed) | n/a | — | — | Generated (line:861, 908). |

**Key finding:** install.sh consumes **only one user-supplied input** — `--api-key <value>` via argv. There is **no** `LIV_API_KEY=... bash install.sh` env-var path, **no** stdin password prompt for the platform API key, and **no** `--api-key-file` flag. (Verified by `grep -nE "\\\$\\{LIV_API_KEY|\\\$\\{API_KEY\\}|\\\$\\{PLATFORM_API_KEY:-|read.*API_KEY|--api-key-file" install.sh.snapshot` returning only the lines listed in this section, with no env-var read of the platform key.)

### Stdin behavior

install.sh **does not read the platform API key from stdin**. The `read -r/-rsp/-rp` calls that exist (line:103, 206, 224, 249, 252, 269) are confined to:

- **line:103** — `read -r u` inside an `awk | while` pipeline parsing `loginctl list-sessions` output (desktop-user detection). Unrelated to user input.
- **line:206** — `read -rp "$prompt [$default]: " value` inside `wizard_input()` — interactive TTY path for non-API-key prompts (domain, etc.).
- **line:224** — `read -rsp "$prompt: " value` inside `wizard_password()` — silent password prompt, used for **interactive wizard** dialogs but **not invoked for the platform API key** (no caller in the script invokes `wizard_password` against `PLATFORM_API_KEY`; the platform key only flows in via argv at line:14).
- **line:249, 252** — `read -rp` in `wizard_yesno()` — yes/no confirmations.
- **line:269** — `read -rp "Press Enter to continue..."` — pause for `wizard_msgbox()`.

**Conclusion:** install.sh does not read the platform API key from stdin. The wizard's `wizard_password` helper is dead code with respect to the platform key — it is only used for hypothetical future prompts, not the current `--api-key` path. (Verified: no `wizard_password.*PLATFORM_API_KEY` or `read.*API_KEY` line exists in the snapshot.)

### Positional arguments

install.sh accepts no positional arguments. The `while [[ $# -gt 0 ]]; do case "$1" in ... esac done` loop at line:12-17 only matches `--api-key`; everything else falls through to `*) shift ;;` (line:16) and is discarded. The script is invoked as `bash install.sh [--api-key VALUE]` and ignores any other tokens.

### Findings summary

- Total flags discovered: **1** (`--api-key <value>`)
- Total env vars consumed (caller-supplied path): **1** (`EUID`, implicit; `DEBIAN_FRONTEND` is set by the script itself, not consumed)
- Total env vars *generated* into `.env` and consumed thereafter via sourcing: **1** (`REDIS_URL` post-`write_env_file`)
- Stdin support for API key: **no**
- Positional args: **no**
- Argument-surface anomalies: **2**
  1. **Unknown flags silently ignored** — `*) shift ;;` (line:16) makes typos like `--api-key-file` no-ops without warning. Phase 37's wrapper must validate flag spelling.
  2. **`install_cloudflared()` present but obsolete** (line:502-513, called at line:1488) — install.sh installs `cloudflared` even though the live LivOS stack does not use it (per project memory: Cloudflare is DNS-only, traffic flows through the Server5 relay, not via a Cloudflare tunneling daemon). This is dead infrastructure carried over from an earlier deployment model. Documented as anomaly; **NOT a blocker** for v29.2 reset (the package gets installed but never started/used). Plan 03's Hardening Proposals may flag for removal.

## Idempotency Verdict

**Verdict:** `NOT-IDEMPOTENT`

Method per CONTEXT.md D-06: classify every side-effecting command in the snapshot. Read-only static analysis; install.sh was NOT executed.

### Side-effecting command classification

Commands are grouped by phase of the install flow. Lines reference `install.sh.snapshot`. Embedded heredoc payloads (e.g., the `iptables` rules inside `/etc/livos/docker-firewall.sh` at lines 1382-1388) are listed as a single row — those rules execute only when the generated script runs at boot, not during install.sh itself.

| line:N | Command (excerpt) | Classification | Reason |
|--------|-------------------|----------------|--------|
| line:276 | `apt-get install -y -qq build-essential git curl` | IDEMPOTENT_NATIVE | apt-get install is naturally re-runnable |
| line:281 | `command -v yq &>/dev/null && return` then `wget -qO /usr/local/bin/yq ...` | IDEMPOTENT_WITH_GUARD | `command -v yq` short-circuits on re-run |
| line:288 | `chmod +x /usr/local/bin/yq` | IDEMPOTENT_NATIVE | chmod is naturally re-runnable |
| line:295 | `command -v node` + version check, then NodeSource install | IDEMPOTENT_WITH_GUARD | Version-aware guard at line:298 (`current -ge required_version`) |
| line:308 | `mkdir -p /etc/apt/keyrings` | IDEMPOTENT_NATIVE | `mkdir -p` |
| line:310 | `gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg` | IDEMPOTENT_NATIVE | `-o` overwrites file |
| line:313 | `tee /etc/apt/sources.list.d/nodesource.list` | IDEMPOTENT_NATIVE | `tee` truncate-write equivalent (single-line input each time) |
| line:316 | `apt-get install -y -qq nodejs` | IDEMPOTENT_NATIVE | apt-get install |
| line:322, 328 | `command -v pnpm` guard + `npm install -g pnpm` | IDEMPOTENT_WITH_GUARD | guard at line:322 |
| line:333, 339 | `command -v pm2` guard + `npm install -g pm2` | IDEMPOTENT_WITH_GUARD | guard at line:333 |
| line:344, 350-351 | `command -v redis-server` guard + apt install + `systemctl enable redis-server` | IDEMPOTENT_WITH_GUARD | guard at line:344 |
| line:359-364 | `iptables --version | grep -q nf_tables` guard + `update-alternatives --set iptables` | IDEMPOTENT_WITH_GUARD | conditional switch only when on nftables backend |
| line:368-374 | `command -v docker && systemctl is-active docker` guard + `systemctl restart docker` | IDEMPOTENT_WITH_GUARD | restart is itself idempotent; gated to existing installs |
| line:377, 385-403 | `command -v docker` guard + `apt-get remove` + `apt-get install -y docker-ce ...` + `systemctl enable/start docker` | IDEMPOTENT_WITH_GUARD | early-return at line:377 prevents repeat install |
| line:385 | `apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true` | IDEMPOTENT_NATIVE | `|| true` swallows missing-package errors |
| line:391 | `curl ... -o /etc/apt/keyrings/docker.asc` | IDEMPOTENT_NATIVE | `-o` overwrites |
| line:422-433 | `docker image inspect "$dst" &>/dev/null` guard + `docker pull` + `docker tag` | IDEMPOTENT_WITH_GUARD | image-presence guard at line:422 |
| line:451, 454 | `mkdir -p "$data_dir/tor/data"`, `mkdir -p "$data_dir/app-data"` | IDEMPOTENT_NATIVE | `mkdir -p` |
| line:457-458 | `chown -R 1000:1000` on tor/data and app-data | IDEMPOTENT_NATIVE | chown is re-runnable |
| line:464, 470 | `command -v python3` guard + apt install | IDEMPOTENT_WITH_GUARD | guard at line:464 |
| line:475, 481-483 | `command -v psql` guard + apt install + systemctl enable/start | IDEMPOTENT_WITH_GUARD | guard at line:475 |
| line:488, 494-498 | `command -v caddy` guard + apt install | IDEMPOTENT_WITH_GUARD | guard at line:488 |
| line:503, 508-511 | `command -v cloudflared` guard + dpkg -i | IDEMPOTENT_WITH_GUARD | guard at line:503; dpkg -i overwrites by design |
| line:518, 521-522 | `command -v fail2ban-client` guard + apt install | IDEMPOTENT_WITH_GUARD | guard at line:518 |
| line:526-536 | `cat > /etc/fail2ban/jail.local << 'JAIL'` | IDEMPOTENT_NATIVE | static heredoc body; overwrite is fine. **Caveat:** if the operator has hand-edited `jail.local` between runs, those edits are lost. |
| line:538 | `systemctl enable --now fail2ban` | IDEMPOTENT_NATIVE | systemctl enable --now is idempotent |
| line:545, 554-560 | `command -v google-chrome` guard + wget + apt install | IDEMPOTENT_WITH_GUARD | guard at line:545 |
| line:566-580 | `cat > /usr/local/bin/livos-launch-chrome << 'LAUNCHER'` + chmod +x | IDEMPOTENT_NATIVE | static heredoc; overwrite-safe |
| line:591, 597 | `$HAS_GUI` guard + `apt-get install -y -qq x11vnc xdotool x11-xserver-utils` | IDEMPOTENT_WITH_GUARD | `$HAS_GUI` set in detect_gui at line:87-161 |
| line:621-643 | `cat > /etc/systemd/system/livos-hdmi-force.service << 'UNIT'` | IDEMPOTENT_NATIVE | static unit file; overwrite-safe |
| line:645-646 | `systemctl daemon-reload` + `systemctl enable --now livos-hdmi-force` | IDEMPOTENT_NATIVE | both idempotent |
| line:652-688 | `cat > /usr/local/bin/livos-set-resolution << 'SCRIPT'` | IDEMPOTENT_NATIVE | static script; overwrite-safe |
| line:689 | `chmod +x /usr/local/bin/livos-set-resolution` | IDEMPOTENT_NATIVE | chmod |
| line:695-715 | `cat > /etc/systemd/system/livos-x11vnc.service << UNIT` (note: unquoted heredoc — variable expansion happens) | IDEMPOTENT_NATIVE | content is parametric on `${desktop_user}` / `${desktop_uid}` but those are deterministic per host |
| line:717-718 | `systemctl daemon-reload` + `systemctl enable livos-x11vnc` | IDEMPOTENT_NATIVE | systemctl |
| line:727-729 | `redis-cli -a ... SET livos:desktop:gui_type|has_gui|user "$..."` | IDEMPOTENT_NATIVE | Redis SET is overwrite-by-key |
| line:735 | `systemctl start livos-x11vnc 2>/dev/null` | IDEMPOTENT_NATIVE | start is idempotent for already-active units |
| line:749, 752-754 | `mkdir -p /etc/ssh/sshd_config.d` + Include line append guard | IDEMPOTENT_WITH_GUARD | `grep -q "^Include..."` guard at line:752 prevents duplicate Include lines |
| line:767-773 | `cat > /etc/ssh/sshd_config.d/99-livos-hardening.conf << SSHCONF` | IDEMPOTENT_NATIVE | full overwrite |
| line:776 | `echo "PasswordAuthentication no" >> "$drop_in"` | NOT_IDEMPOTENT | `>>` append duplicates the line on each run when `$has_keys` becomes true. **However**, line:767's `cat >` truncates the file each run before this append, so the net effect is one PasswordAuthentication line. Reclassified: IDEMPOTENT_WITH_GUARD (truncate-then-append at line:767) |
| line:786 | `echo "# Disabled by LivOS — see 99-livos-hardening.conf" > "$cloud_init"` | IDEMPOTENT_NATIVE | `>` truncate-write |
| line:792 | `systemctl reload sshd 2>/dev/null || systemctl reload ssh 2>/dev/null || true` | IDEMPOTENT_NATIVE | reload is idempotent |
| line:861-864 | `openssl rand -hex 32/24/16` (generate_secrets) | NOT_IDEMPOTENT | **CRITICAL:** every run produces new random JWT, LIV_API_KEY, Redis password, PG password. Re-run regenerates secrets unconditionally. The downstream effect depends on whether `write_env_file` keeps or overwrites `/opt/livos/.env`. |
| line:879-893 | `[[ -f "$env_file" ]]` then TTY-conditional `wizard_yesno` overwrite-or-skip | IDEMPOTENT_WITH_GUARD | guard preserves existing .env in non-interactive mode (`return 0` at line:891) and on TTY-"no" (line:887). **However**, this guard only fires if .env exists, and `setup_repository` at line:971 `rm -rf "$LIVOS_DIR"` deletes /opt/livos including .env BEFORE write_env_file runs — so the guard is effectively bypassed during a normal install order. See "Failure modes" below. |
| line:897-942 | `cat > "$env_file" << ENVFILE` | IDEMPOTENT_NATIVE | overwrite-safe in isolation. **But:** combined with line:861-864, the contents differ each run → DATABASE_URL password drift vs. running PostgreSQL. |
| line:944 | `chmod 600 "$env_file"` | IDEMPOTENT_NATIVE | chmod |
| line:954-955 | `local temp_dir="/tmp/livinity-io-$$"` + `rm -rf "$temp_dir"` | IDEMPOTENT_NATIVE | $$ = PID, ensures fresh tmp each run |
| line:956 | `git clone --depth 1 "$REPO_URL" "$temp_dir"` | IDEMPOTENT_NATIVE | tmp dir is fresh per-PID |
| line:960-983 | save data/app-data → `rm -rf "$LIVOS_DIR"` → `mkdir -p` → `cp -a` → restore data/app-data | IDEMPOTENT_WITH_GUARD | data + app-data preserved; **but `.env` is NOT preserved** (lives at /opt/livos/.env, not under data/). On re-run .env is destroyed and re-generated with new secrets at line:861-864 → cascades into PG password mismatch (see Failure modes #1). |
| line:986-988 | `rm -rf /opt/nexus` + `mkdir -p /opt/nexus` + `cp -a "$temp_dir/nexus/." /opt/nexus/` | IDEMPOTENT_NATIVE | wholesale replace; nexus has no preserved subdirs by design |
| line:991 | `cp "$temp_dir/update.sh" "$LIVOS_DIR/update.sh"` | IDEMPOTENT_NATIVE | `cp` overwrite |
| line:994 | `rm -rf "$temp_dir"` | IDEMPOTENT_NATIVE | cleanup |
| line:1010 | `pnpm install --frozen-lockfile 2>/dev/null || pnpm install` | IDEMPOTENT_NATIVE | pnpm install is naturally re-runnable |
| line:1016 | `npx tsc` (in @livos/config) | IDEMPOTENT_NATIVE | tsc is deterministic on same source |
| line:1023 | `npm run build` (UI) | IDEMPOTENT_NATIVE | build is re-runnable |
| line:1032 | `npm install --production=false 2>/dev/null || npm install` (nexus) | IDEMPOTENT_NATIVE | npm install |
| line:1041, 1045, 1048, 1051 | `cd packages/{core,worker,mcp-server,memory} && npx tsc` | IDEMPOTENT_NATIVE | tsc per package |
| line:1060-1061 | `mkdir -p "$livinityd_nexus"` + `cp -r "$nexus_dir/packages/core/dist/"* "$livinityd_nexus/"` | IDEMPOTENT_NATIVE | mkdir -p + cp -r |
| line:1066, 1068 | `find ... -maxdepth 1 -name '@nexus+core*'` + `cp -r` | UNKNOWN_NEEDS_VERIFICATION | If pnpm has multiple `@nexus+core*` resolution dirs (e.g., from sharp drift, see project memory pitfall), `find ... | head -1` may copy to the WRONG dir, leaving livinityd's symlinked node_modules pointing at stale code. Idempotency claim: copies-something-each-run, but the copy may target a different dir each run depending on `find` order. Memory documents this as a known update.sh quirk. |
| line:1075 | `ln -sf /opt/livos/.env "$nexus_dir/.env"` | IDEMPOTENT_NATIVE | `-f` forces overwrite |
| line:1080-1082 | `mkdir -p` for logs, data, data/secrets | IDEMPOTENT_NATIVE | mkdir -p |
| line:1086 | `echo -n "$SECRET_JWT" > "$LIVOS_DIR/data/secrets/jwt"` | NOT_IDEMPOTENT | **CRITICAL:** writes a new JWT secret each run (because line:861 generates new $SECRET_JWT). Effect: existing user sessions invalidated on re-run; if .env JWT_SECRET drifts from /data/secrets/jwt, livinityd refuses to validate JWTs. (Note: install.sh writes both to the same value within one run, but that value differs across runs.) |
| line:1087 | `chmod 600 "$LIVOS_DIR/data/secrets/jwt"` | IDEMPOTENT_NATIVE | chmod |
| line:1092 | `chmod +x "$LIVOS_DIR/packages/livinityd/source/modules/apps/legacy-compat/app-script"` | IDEMPOTENT_NATIVE | chmod |
| line:1108-1112 | sed-or-append `requirepass` in /etc/redis/redis.conf | IDEMPOTENT_WITH_GUARD | `grep -q '^requirepass'` guard at line:1108; sed replaces in-place, else append. Net effect: one `requirepass` line, value updated per-run. |
| line:1115-1119 | sed-or-append `appendonly yes` in redis.conf | IDEMPOTENT_WITH_GUARD | same pattern as above; final state is `appendonly yes` |
| line:1121 | `systemctl restart redis-server` | IDEMPOTENT_NATIVE | restart |
| line:1125 | `redis-cli -a "$SECRET_REDIS" FLUSHALL 2>/dev/null || true` | NOT_IDEMPOTENT | **CRITICAL:** wipes ALL Redis data on re-run. Comment in script says "Clear old data for fresh install". Destroys: every `livos:platform:*`, `livos:desktop:*`, `livos:user:*`, session caches, kimi:authenticated flag, and all v22-era capability registry data. This is intentional destructive behavior — but it is destructive on every re-run. |
| line:1136-1137 | `psql -tc "SELECT 1 FROM pg_roles WHERE rolname='livos'" \| grep -q 1 \|\| psql -c "CREATE USER livos WITH PASSWORD '$SECRET_PG_PASS'"` | NOT_IDEMPOTENT | **CRITICAL:** guard skips CREATE USER if `livos` role exists, so PostgreSQL keeps the OLD password from the first install. Meanwhile line:912's regenerated `DATABASE_URL` carries the NEW password. Result: `password authentication failed for user "livos"` — exact pitfall documented in project memory. The script never runs `ALTER USER livos WITH PASSWORD ...` to reconcile. |
| line:1139-1140 | `psql -tc "SELECT 1 FROM pg_database ..." \|\| psql -c "CREATE DATABASE livos OWNER livos"` | IDEMPOTENT_WITH_GUARD | guard prevents duplicate-DB error |
| line:1142 | `psql -c "GRANT ALL PRIVILEGES ON DATABASE livos TO livos"` | IDEMPOTENT_NATIVE | GRANT is idempotent |
| line:1145 | `psql -d livos -c "GRANT ALL ON SCHEMA public TO livos" 2>/dev/null \|\| true` | IDEMPOTENT_NATIVE | GRANT |
| line:1157-1167 | `cat > /etc/caddy/Caddyfile << CADDYFILE` (two branches: HTTPS or :80) | IDEMPOTENT_NATIVE | overwrite |
| line:1172-1173 | `systemctl enable caddy` + `systemctl restart caddy` | IDEMPOTENT_NATIVE | systemctl |
| line:1182-1184 | `id -u livos &>/dev/null` guard + `useradd --system --create-home ... livos` | IDEMPOTENT_WITH_GUARD | guard at line:1182 |
| line:1188-1189 | `mkdir -p /home/livos` + `chown livos:livos /home/livos` | IDEMPOTENT_NATIVE | mkdir -p + chown |
| line:1192 | `usermod -aG docker livos 2>/dev/null \|\| true` | IDEMPOTENT_NATIVE | usermod -aG is idempotent (set semantics) |
| line:1195-1196 | `chown -R livos:livos "$LIVOS_DIR"` + `chown -R livos:livos /opt/nexus` | IDEMPOTENT_NATIVE | chown -R |
| line:1199-1219, 1223-1243, 1246-1272, 1275-1300 | 4× `cat > /etc/systemd/system/<unit>.service << 'UNIT'` for livos / liv-core / liv-memory / liv-worker | IDEMPOTENT_NATIVE | static unit bodies; overwrite-safe |
| line:1303-1304 | `systemctl daemon-reload` + `systemctl enable livos.service liv-core.service liv-memory.service liv-worker.service` | IDEMPOTENT_NATIVE | systemctl |
| line:1312-1315 | `systemctl start liv-memory|livos|liv-core|liv-worker` | IDEMPOTENT_NATIVE | start |
| line:1356-1366 | `command -v ufw` guard + apt install + `ufw default deny` + `ufw allow 22/80/443` + `ufw --force enable` + `ufw reload` | IDEMPOTENT_NATIVE | UFW commands are idempotent (rules de-duped by ufw itself) |
| line:1372-1389 | `mkdir -p /etc/livos` + `cat > /etc/livos/docker-firewall.sh << 'FWSCRIPT'` + `chmod +x` | IDEMPOTENT_NATIVE | overwrite |
| line:1393-1406 | `cat > /etc/systemd/system/livos-docker-firewall.service << 'FWSVC'` | IDEMPOTENT_NATIVE | overwrite |
| line:1408-1409 | `systemctl daemon-reload` + `systemctl enable livos-docker-firewall.service` | IDEMPOTENT_NATIVE | systemctl |
| line:1413 | `/etc/livos/docker-firewall.sh` (executes the just-written script — flush+rebuild iptables DOCKER-USER chain) | IDEMPOTENT_NATIVE | script does `iptables -F DOCKER-USER` first then re-adds rules |
| line:1516 | `ln -sf ../../.env "$liv_dir/.env"` | IDEMPOTENT_NATIVE | -sf forces overwrite |
| line:1528 | `bash "$NEXUS_DIR/scripts/install-kimi.sh"` (sub-script, optional) | UNKNOWN_NEEDS_VERIFICATION | install-kimi.sh body is outside snapshot scope; cannot statically classify. |
| line:1531-1532 | `ln -sf /root/.local/bin/kimi /usr/local/bin/kimi` (and kimi-code) | IDEMPOTENT_NATIVE | -sf |
| line:1565-1566 | `redis-cli SET livos:platform:api_key "$PLATFORM_API_KEY"` + `SET livos:platform:enabled "1"` | IDEMPOTENT_NATIVE | Redis SET overwrites by key |
| line:1569 | `systemctl restart livos` | IDEMPOTENT_NATIVE | restart |
| line:1585-1588 | `! grep -q 'chown.*1000.*app_data' "$app_script"` guard + `sed -i '/.../i\...'` injection | IDEMPOTENT_WITH_GUARD | guard prevents duplicate injection at line:1585 |

### Roll-up

- IDEMPOTENT_NATIVE count: **41**
- IDEMPOTENT_WITH_GUARD count: **27**
- NOT_IDEMPOTENT count: **4** (line:861-864 generate_secrets, line:1086 jwt secret-file write, line:1125 Redis FLUSHALL, line:1136-1137 PG CREATE USER guard mismatch)
- UNKNOWN_NEEDS_VERIFICATION count: **2** (line:1066-1068 multi-pnpm-store dist copy via `find ... | head -1`, line:1528 install-kimi.sh sub-script)
- Total rows: **74**

### Failure modes on re-run

install.sh re-run on a host with an existing LivOS install will **damage the running install in three independent ways**, each producing a hard error:

1. **PostgreSQL password mismatch (highest impact)** — line:861 generates a new `SECRET_PG_PASS`. Line:912 writes the new password into the regenerated `/opt/livos/.env`'s `DATABASE_URL`. But line:1136's `SELECT 1 FROM pg_roles WHERE rolname='livos'` guard sees the EXISTING `livos` role and skips `CREATE USER` — so PostgreSQL retains the OLD password. livinityd then attempts to connect with the NEW password from .env and fails with `password authentication failed for user "livos"`. Service ends up in restart loop. The script does NOT call `ALTER USER livos WITH PASSWORD '$SECRET_PG_PASS'` to reconcile. (This is the exact pitfall documented in project memory under "PostgreSQL password lives in `/opt/livos/.env` `DATABASE_URL`".)

2. **Redis FLUSHALL wipes runtime state (high impact)** — line:1125 unconditionally executes `redis-cli FLUSHALL` at the end of `configure_redis`. On re-run this destroys: per-user app-installation state, capability registry (v22.0 unified registry), kimi:authenticated flag, every `livos:platform:*` and `livos:desktop:*` key, all session JWTs, learning-loop streams, and the v23+ tool-call ring buffer. Comment at line:1124 acknowledges this is intentional ("Clear old data for fresh install") — but install.sh has no notion of "this is a re-run, don't flush." For Phase 37 this is actually *desired* behavior post-wipe; for an accidental `bash install.sh` re-run on a healthy host, it is destructive.

3. **JWT secret rotation invalidates all sessions (medium impact)** — line:1086 writes `echo -n "$SECRET_JWT" > /opt/livos/data/secrets/jwt`. Combined with the new `JWT_SECRET=` in .env at line:908, every existing user session token signed by the previous JWT becomes invalid. Users are logged out but can re-authenticate. (No data loss, but a visible disruption.)

4. **`install_cloudflared` runs on every re-run** — guard at line:503 (`command -v cloudflared`) protects against re-install, so this is benign on re-run. Listed for completeness — the guard works.

**Additional drift surface:** line:1066-1068 (UNKNOWN row) — pnpm store dist-copy targets the FIRST `@nexus+core*` dir matched by `find -maxdepth 1`. If pnpm has multiple resolution dirs (e.g., from sharp version drift documented in project memory), this can copy to the wrong dir and leave livinityd's symlinked node_modules pointing at stale code. This is a known update.sh class of bug; install.sh inherits the same pattern.

### Unknowns

- **line:1066-1068** — `find /opt/livos/node_modules/.pnpm -maxdepth 1 -name '@nexus+core*' -type d | head -1`: static analysis cannot determine which dir wins on a host with sharp version drift. Phase 37's wipe step makes this moot (fresh `node_modules`), so the unknown does not block the verdict.
- **line:1528** — `bash "$NEXUS_DIR/scripts/install-kimi.sh"`: the sub-script is fetched from the cloned repo (post line:988 `cp -a "$temp_dir/nexus/." /opt/nexus/`), so its body is checked into git but not part of `install.sh.snapshot`. Wrapped in `( … ) || warn` (line:1524, 1539) with all output piped to `tail -5 || true` — failure is non-blocking. Static analysis classifies the **boundary** as IDEMPOTENT_WITH_GUARD (subshell + `|| true` + `command -v kimi` guard at line:1526). The internal idempotency of install-kimi.sh is out-of-scope for this audit.

### Phase 37 implication

Verdict **NOT-IDEMPOTENT** drives Phase 37's wipe-then-reinstall ordering. install.sh **cannot be re-run safely on a populated host** — generate_secrets + Redis FLUSHALL + the PostgreSQL password-mismatch trap mean a re-run damages the running install before re-bootstrapping it. Therefore Phase 37 MUST execute its wipe step (`rm -rf /opt/livos /opt/nexus`, `systemctl stop livos liv-core liv-memory liv-worker`, `dropdb livos && dropuser livos` to clear the PG role so install.sh's CREATE USER guard does not skip, and `redis-cli FLUSHALL` redundantly to confirm a clean Redis) **BEFORE** invoking install.sh. The wipe is non-optional even for `preserveApiKey: true` semantics — the API key is restored after install.sh re-runs, by re-issuing `redis-cli SET livos:platform:api_key` post-install (or by passing it via `--api-key` so install.sh writes it at line:1565). The `tar -czf /tmp/livos-pre-reset-<ts>.tar.gz /opt/livos` snapshot from D-07 is therefore the recovery contract: if install.sh fails mid-flight, restore the tar and `systemctl restart livos liv-core liv-worker liv-memory`.

## API Key Transport

Method per CONTEXT.md D-08: read install.sh for `$1` / `${API_KEY}` consumption + grep for log leaks. Static analysis only — install.sh was NOT executed.

### Transport mechanism

**Primary transport:** `argv`

**Evidence:**

- **line:11** — `PLATFORM_API_KEY=""` — installs the variable as empty default; flag-driven population only.
- **line:13-14** — `case "$1" in --api-key) PLATFORM_API_KEY="$2"; shift 2 ;;` — the platform key is read from positional `$2` after the `--api-key` flag, two-arg form. `$2` is part of the process argv, visible to any user with access to `/proc/$PID/cmdline` (which on Linux means any unprivileged local user — `/proc/$PID/cmdline` is world-readable by default for processes owned by other users on most distros, and at minimum any user on the same host with `ps` privileges).
- **line:1558** — `if [[ -n "$PLATFORM_API_KEY" ]]; then` — gate: only acts on the key if non-empty (i.e., if `--api-key` was supplied).
- **line:1565** — `redis-cli -a "$redis_pass" SET livos:platform:api_key "$PLATFORM_API_KEY" 2>/dev/null` — the captured key is then passed as a positional argument to `redis-cli`, which itself launches a child process. The key is therefore visible TWICE in the process table during the brief redis-cli invocation: once as install.sh's `$2`, once as redis-cli's argv. (The `redis_pass` in `-a "$redis_pass"` is a separate argv-leak concern — it leaks the Redis admin password during the same window — but the request is to audit the *platform* API key; the redis_pass leak is noted in the leak-surface table for completeness.)
- **No alternative transport:** there is no `read -rsp ... PLATFORM_API_KEY`, no `${LIV_PLATFORM_API_KEY:-}` env-var read, no `--api-key-file <path>` flag handler. (Verified: `grep -nE "PLATFORM_API_KEY|API_KEY" install.sh.snapshot` returns only the lines listed above plus `LIV_API_KEY=${SECRET_API_KEY}` at line:909 — which is install.sh *generating* its own internal API key, unrelated to the platform key.)

### Leak surface

| Risk | Found at line:N | Severity | Notes |
|------|-----------------|----------|-------|
| argv exposure (visible to `ps`) | line:14 (install.sh's own argv as `$2`) | **high** | The command line `bash install.sh --api-key abcd1234...` is visible to any user with `ps` access for the duration of the install (potentially several minutes). On most Linux distros `/proc/$PID/cmdline` is readable by other unprivileged users for processes owned by the same user, and root processes' cmdline is world-readable by `ps -ef` for anyone with shell access. |
| echo / log statement leaking key | n/a | **none** | `grep -nE "echo.*PLATFORM_API_KEY\|echo.*api[-_]key\|info.*PLATFORM_API_KEY\|warn.*PLATFORM_API_KEY\|fail.*PLATFORM_API_KEY" install.sh.snapshot` returns 0 matches. install.sh never echoes, info()s, or fail()s with the key in a string. The closest line is "ok 'API key configured'" at line:1567 which contains no key value. |
| `set -x` + API_KEY in scope | n/a | **none** | install.sh sets `set -euo pipefail` at line:8 but never `set -x`. `grep -n "set -x\|set [+-][a-z]*x" install.sh.snapshot` returns 0 matches. xtrace would not leak the key at any point. |
| sub-process argv pass-through | line:1565 (`redis-cli -a "$redis_pass" SET livos:platform:api_key "$PLATFORM_API_KEY"`) | **medium** | The key value flows into `redis-cli`'s argv during the brief SET call. Window is small (single-shot redis-cli invocation), but the key is visible to `ps` for that interval. The `redis-cli` man page recommends `--no-auth-warning` and provides no stdin variant for `SET` value, so even a hardened wrapper would face the same constraint here without a per-call workaround (e.g., `redis-cli` from a heredoc-fed script, or piping a `SET` command via `redis-cli < <(echo "SET ... $key")` which still exposes the value via `/proc/.../fd/0` to the same audience). |
| env in `/proc/PID/environ` | n/a | **none** | install.sh does NOT `export PLATFORM_API_KEY`. The variable lives only in the function-local scope of `main()` (line:11 declares it inside `main`). It does not appear in any child process's environment. (Verified: `grep -n "export.*PLATFORM_API_KEY\|export.*API_KEY" install.sh.snapshot` returns 0 matches.) The Redis SET is the only outbound flow; `redis-cli` inherits whatever `main()` exported, which excludes PLATFORM_API_KEY. |

### FR-AUDIT-04 compliance

**Verdict:** FAIL

**Reasoning:** FR-AUDIT-04 mandates the API key flow into install.sh "via stdin or `--api-key-file <path>` flag — NOT via argv (visible in `ps`)". install.sh's only ingestion path is `--api-key <value>` on argv (line:14), which is precisely the prohibited pattern. The argv-exposure window covers the entire install (several minutes), during which any local user with shell access can capture the key via `ps -ef | grep install.sh`. The internal redis-cli sub-process call (line:1565) creates a second narrower window. The script does not log the key in cleartext to journal/stdout, and does not pollute `/proc/PID/environ` (set -x off, no export), so leak surface is contained to argv only — but argv-only IS the disqualifying condition. **Plan 03 must produce a wrapper proposal** per CONTEXT.md D-08: a `livos-install-wrap.sh` that reads the key from a file (or fd/3 / heredoc), exports it as an env var to install.sh's child shell only when needed, and invokes install.sh WITHOUT the `--api-key` flag — leaving install.sh to source `LIV_PLATFORM_API_KEY` from the wrapper-set env (requires a parallel hardening patch to install.sh itself: add an `${LIV_PLATFORM_API_KEY:-}` fallback at line:11 before the argv parse, gated so flag still wins for backward compat). For the redis-cli sub-call, the wrapper or hardened install.sh should switch to `redis-cli` heredoc-fed input or `--pipe` mode to avoid the argv re-exposure at line:1565.

### Phase 37 invocation hint

If Plan 03 ships the wrapper proposal and install.sh is patched to read `${LIV_PLATFORM_API_KEY:-}` as an env-var fallback, Phase 37 invokes:

```
LIV_PLATFORM_API_KEY="$(cat /tmp/livos-reset-apikey)" bash livos-install-wrap.sh
```

If Plan 03 ships the wrapper but install.sh is NOT yet patched (wrapper-only hardening), the wrapper itself absorbs the argv exposure (the wrapper passes `--api-key "$KEY"` to install.sh on argv internally) — this still leaks the key to local users for the install duration but contains the API surface to a single auditable wrapper path. Phase 37 then invokes:

```
bash livos-install-wrap.sh --api-key-file /tmp/livos-reset-apikey
```

**Until Plan 03's wrapper exists, the unhardened fallback is:**

```
bash /opt/livos/data/cache/install.sh.cached --api-key "$(cat /tmp/livos-reset-apikey)"
```

This is the literal command Phase 37 will use IF the v29.2 milestone ships before Plan 03's wrapper lands. It accepts the documented argv leak as a known risk for the v29.2 release window, with the wrapper as a follow-on hardening (tracked under D-08, FR-AUDIT-04 outstanding). Plan 03 will decide whether to gate v29.2 on the wrapper or accept the argv-leak as a known issue with a v29.2.1 follow-up. (Note: `/opt/livos/data/cache/install.sh.cached` is the path D-09 specifies; that cache is populated by a future Phase 37 update.sh enhancement per CONTEXT.md FIX 2 — at v29.2 ship time, Phase 37 may need to fall back to a fresh `curl` if cache is missing.)

## Recovery Model

*Populated by Plan 03. Will document either install.sh's native `--resume` or the pre-wipe-snapshot fallback per D-07.*

## Server5 Dependency Analysis

*Populated by Plan 03. Will document Cloudflare-DNS → relay → install.sh-origin chain and fallback options per D-09.*

## Hardening Proposals

*Populated by Plan 03 (only if static analysis surfaces gaps; otherwise this section will state "No hardening required — install.sh meets v29.2 requirements as-is").*

## Phase 37 Readiness

*Populated by Plan 03 (final gate per D-10). Will record four answers — reinstall command, recovery action, idempotency yes/no, API key transport — so Phase 37's backend planner can proceed without re-running this audit.*
