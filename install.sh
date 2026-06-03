#!/usr/bin/env bash
# install.sh — LivOS first-run installer (Phase 196-02)
#
# Single-entry idempotent bootstrap. Orchestrates seven phase scripts under
# scripts/install/, runs the inline build step, and hands off to update.sh for
# the day-2 deploy gate (deployed-sha pin, etc.). Every phase is
# detect-then-skip; re-running on a healthy box exits 0 without mutating state.
#
# Usage:
#   sudo bash install.sh
#
# Env:
#   LIVOS_INSTALL_SKIP_UPDATE=1   Skip the final hand-off to update.sh.
#   LIVOS_INSTALL_SKIP_BUILD=1    Skip the inline pnpm/tsc build phase (CI smoke).
#   LIVOS_INSTALL_DRY_RUN=1       Parse + log only; no destructive operations.
#
# Sacred contract (Phase 196-02):
#   - This file MUST NEVER edit liv/packages/core/src/sdk-agent-runner.ts
#     (sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f).
#   - This file MUST NEVER edit scripts/install/sudoers.d/livinityd
#     (sacred SHA 568e4403bd71b25fba44609aec47967a9babec08 — Phase 192-01
#     security boundary; only Plan 196-05 may re-pin).

set -euo pipefail

# ── v29.0-hotpatch parity: cgroup escape ONLY when invoked from systemd ─────
# Phase 196-02: install.sh is normally run interactively from an SSH shell, so
# the cgroup escape is a no-op. But when reached via `systemctl restart livos
# && systemctl start install` style patterns (LXC test rigs occasionally do
# this), we must escape to a transient scope so livos.service restart later
# does not kill us mid-flight. Mirrors update.sh lines 23-29 idiom.
if [[ -n "${INVOCATION_ID:-}" ]] \
        && [[ -z "${LIVOS_INSTALL_SCOPED:-}" ]] \
        && command -v systemd-run >/dev/null 2>&1 \
        && [[ $EUID -eq 0 ]]; then
    export LIVOS_INSTALL_SCOPED=1
    exec systemd-run --scope --collect --quiet \
        --unit="livos-install-$$-$(date +%s)" \
        --description="LivOS first-run install (Phase 196-02 cgroup-escaped)" \
        -- "$0" "$@"
fi
trap '' PIPE

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHASE_DIR="${SCRIPT_DIR}/scripts/install"

# ── Source shared helpers (Phase 196-02 phase scripts use these too) ──────
# shellcheck source=scripts/install/_logging.sh
if [[ -f "${PHASE_DIR}/_logging.sh" ]]; then
    source "${PHASE_DIR}/_logging.sh"
else
    # Minimal fallbacks so install.sh still emits sensible output if the
    # helper is missing for any reason.
    info() { echo "[INFO]  $*" >&2; }
    ok()   { echo "[OK]    $*" >&2; }
    warn() { echo "[WARN]  $*" >&2; }
    fail() { echo "[FAIL]  $*" >&2; exit "${2:-1}"; }
    step() { echo ""; echo "━━━ $* ━━━"; }
fi

# ── Per-deploy log ─────────────────────────────────────────────────────────
LOG_FILE="/tmp/livinity-install-$(date -u +%Y-%m-%dT%H-%M-%SZ)-$$.log"
exec > >(tee -a "$LOG_FILE") 2>&1
info "Logging to ${LOG_FILE}"

# ── Banner ─────────────────────────────────────────────────────────────────
HEAD_SHA=$(git -C "$SCRIPT_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo ""
echo "================================================================"
echo "  LivOS first-run installer (Phase 196-02)"
echo "  Commit: ${HEAD_SHA}"
echo "  Log:    ${LOG_FILE}"
echo "================================================================"
echo ""

# ── Root check ─────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    fail "install.sh must run as root (use: sudo bash install.sh)" 77
fi

# ── Optional self-clone (curl-pipe-bash one-liner support) ─────────────────
# If install.sh is run from a directory that does NOT look like a LivOS repo
# checkout (no livos/ subdir AND no .git), assume it was curl'd directly and
# clone the repo into /tmp before continuing. Phase 196-02 docs intentionally
# point operators at `git clone` over `curl|bash` (spoofing T-196-02-06) but
# we honour the curl path defensively.
if [[ ! -d "${SCRIPT_DIR}/livos" ]] && [[ ! -d "${SCRIPT_DIR}/.git" ]]; then
    _clone_dir="/tmp/livinity-install-$$-src"
    info "install.sh not in a checkout — cloning utopusc/livinity-io to ${_clone_dir}"
    git clone --depth 1 https://github.com/utopusc/livinity-io.git "$_clone_dir"
    cd "$_clone_dir"
    SCRIPT_DIR="$_clone_dir"
    PHASE_DIR="${SCRIPT_DIR}/scripts/install"

    # ── Phase 257-01 WS-B (LIVOS-026): verify the cloned tree before re-exec ───
    # The curl|bash one-liner runs whatever the remote serves AS ROOT. Before we
    # re-exec the cloned entry script, log its sha256 (so the operator can record
    # /compare it) and — when pin material is provided — refuse a mismatch.
    # OPT-IN-STRICT: warn + proceed when no pin is set (no install regression);
    # set LIVOS_INSTALL_EXPECTED_SHA or ship scripts/install/EXPECTED_RELEASE to
    # enforce fail-closed.
    _clone_head=$(git -C "$_clone_dir" rev-parse HEAD 2>/dev/null || echo "")
    _entry_script="${SCRIPT_DIR}/install.sh"
    _entry_sha256=$(sha256sum "$_entry_script" 2>/dev/null | awk '{print $1}')
    info "install.sh: cloned HEAD ${_clone_head:-unknown}; entry sha256 ${_entry_sha256:-unknown}"

    _expected_sha=""
    _expected_src=""
    if [[ -n "${LIVOS_INSTALL_EXPECTED_SHA:-}" ]]; then
        _expected_sha="${LIVOS_INSTALL_EXPECTED_SHA}"
        _expected_src="env LIVOS_INSTALL_EXPECTED_SHA"
    elif [[ -f "${SCRIPT_DIR}/scripts/install/EXPECTED_RELEASE" ]]; then
        _expected_sha=$(grep -vE '^\s*(#|$)' "${SCRIPT_DIR}/scripts/install/EXPECTED_RELEASE" 2>/dev/null | head -1 | tr -d '[:space:]')
        _expected_src="pin file scripts/install/EXPECTED_RELEASE"
    fi

    if [[ -n "$_expected_sha" ]]; then
        if [[ "$_clone_head" != "$_expected_sha" ]]; then
            fail "install.sh: refusing to run — cloned HEAD ${_clone_head} does not match the expected pinned ref ${_expected_sha} (source: ${_expected_src})" 90
        fi
        info "install.sh: cloned HEAD matches the expected pinned ref (source: ${_expected_src})"
    else
        warn "install.sh: running unverified HEAD ${_clone_head} — set LIVOS_INSTALL_EXPECTED_SHA to pin"
    fi

    info "Re-execing from cloned checkout"
    exec bash "${SCRIPT_DIR}/install.sh" "$@"
fi

# ── DRY_RUN short-circuit ──────────────────────────────────────────────────
if [[ "${LIVOS_INSTALL_DRY_RUN:-0}" == "1" ]]; then
    info "LIVOS_INSTALL_DRY_RUN=1 — exiting after preflight + log setup"
    exit 0
fi

# ── Phase dispatch helper ──────────────────────────────────────────────────
# Runs a phase script with a banner; bubbles exit code up via set -e.
_run_phase() {
    local _label="$1" _script="$2"
    step "${_label}"
    if [[ ! -x "${PHASE_DIR}/${_script}" ]] && [[ -f "${PHASE_DIR}/${_script}" ]]; then
        chmod +x "${PHASE_DIR}/${_script}" || true
    fi
    bash "${PHASE_DIR}/${_script}"
}

# ━━━ Pre-flight checks ━━━ → scripts/install/preflight.sh
_run_phase "Pre-flight checks" preflight.sh

# ━━━ System dependencies ━━━ → scripts/install/system-deps.sh
_run_phase "System dependencies" system-deps.sh

# ━━━ Installing opencode CLI ━━━ → scripts/install/opencode-install.sh
# (Phase 196-02 — closes Phase 195 HUMAN-UAT #2)
_run_phase "Installing opencode CLI" opencode-install.sh

# ━━━ Bruce user + sudoers ━━━ → scripts/install/bruce-user-bootstrap.sh
# (Phase 192-01 sacred fragment copy)
_run_phase "Bruce user + sudoers" bruce-user-bootstrap.sh

# ━━━ Systemd units ━━━ → scripts/install/systemd-units-install.sh
_run_phase "Systemd units" systemd-units-install.sh

# ━━━ Bootstrapping per-user openclaw config ━━━
# Phase 203 Hot-fix G part 3 2026-05-24 — per-host openclaw config bootstrap.
#
# liv-claw-gateway runs with OPENCLAW_STATE_DIR=/opt/livos/data/openclaw and
# reads openclaw.json from that root. Production needs a baseline file with:
#   - gateway.auth.{mode=token, token=<64-hex random, per-host>} so claw-client
#     WS auth succeeds out of the box (Hot-fix F2 master-token mechanism)
#   - gateway.controlUi.allowedOrigins matching the operator's actual FQDN
#     PLUS the loopback origin (Hot-fix G part 1 — claw-client connects
#     direct to ws://localhost:18789/...)
#
# Strategy: idempotent, per-host bootstrap.
#   - dir created with bruce ownership + 700 perms (gateway runs as bruce)
#   - openssl rand -hex 32 generates a fresh token PER INSTALL — NOT a
#     hardcoded secret in the repo
#   - operator FQDN resolved via hostname -f (NOT hardcoded bruce.livinity.io)
#   - file written only if missing — re-running install.sh on an existing
#     host preserves the operator's customisations + token (rotating it
#     would invalidate every browser tab's cached creds)
#   - update.sh's Hot-fix F2 jq-merge still runs day-2 and tops up
#     allowedOrigins if needed
step "Bootstrapping per-host openclaw config"
_OPENCLAW_STATE_DIR="/opt/livos/data/openclaw"
_OPENCLAW_CFG="${_OPENCLAW_STATE_DIR}/openclaw.json"
mkdir -p "$_OPENCLAW_STATE_DIR"
if id bruce >/dev/null 2>&1; then
    chown bruce:bruce "$_OPENCLAW_STATE_DIR" 2>/dev/null || true
    chmod 700 "$_OPENCLAW_STATE_DIR" 2>/dev/null || true
fi

if [[ -f "$_OPENCLAW_CFG" ]]; then
    info "openclaw config already exists at ${_OPENCLAW_CFG} — preserving operator customisations (update.sh will jq-merge any missing allowedOrigins)"
else
    # Resolve per-host operator FQDN. Order of preference:
    #   1) hostname -f (DNS-resolvable FQDN)
    #   2) hostname (short name, fallback for hosts w/o reverse DNS)
    #   3) "localhost" (last-resort placeholder — gateway still works via
    #      loopback even if no public FQDN is set yet)
    _OPERATOR_FQDN=$(hostname -f 2>/dev/null || true)
    [[ -z "$_OPERATOR_FQDN" ]] && _OPERATOR_FQDN=$(hostname 2>/dev/null || true)
    [[ -z "$_OPERATOR_FQDN" ]] && _OPERATOR_FQDN="localhost"

    # Random 64-char hex master token. Prefer openssl; fall back to /dev/urandom
    # via xxd. Both produce cryptographic-quality output per Hot-fix F2.
    if command -v openssl >/dev/null 2>&1; then
        _OPENCLAW_TOKEN=$(openssl rand -hex 32)
    elif command -v xxd >/dev/null 2>&1; then
        _OPENCLAW_TOKEN=$(head -c 32 /dev/urandom | xxd -p -c 32)
    else
        _OPENCLAW_TOKEN=""
        warn "neither openssl nor xxd available — openclaw.json will be written WITHOUT a master token; update.sh Hot-fix F2 will backfill it on first day-2 deploy"
    fi

    _OPENCLAW_BOOTSTRAP=$(mktemp)
    cat > "$_OPENCLAW_BOOTSTRAP" <<JSON
{
  "gateway": {
    "controlUi": {
      "allowedOrigins": [
        "https://${_OPERATOR_FQDN}",
        "http://${_OPERATOR_FQDN}",
        "wss://${_OPERATOR_FQDN}",
        "http://localhost:18789",
        "http://127.0.0.1:18789",
        "https://livinity.io"
      ]
    },
    "auth": {
      "mode": "token",
      "token": "${_OPENCLAW_TOKEN}"
    }
  }
}
JSON
    install -m 0600 "$_OPENCLAW_BOOTSTRAP" "$_OPENCLAW_CFG"
    rm -f "$_OPENCLAW_BOOTSTRAP"
    if id bruce >/dev/null 2>&1; then
        chown bruce:bruce "$_OPENCLAW_CFG" 2>/dev/null || true
    fi
    _TOKEN_PREVIEW="${_OPENCLAW_TOKEN:0:8}"
    ok "openclaw config bootstrapped at ${_OPENCLAW_CFG} (operator=${_OPERATOR_FQDN}, token=${_TOKEN_PREVIEW:-<missing>}…)"
fi

# ━━━ Initial build + seed ━━━
step "Initial build + seed"
if [[ "${LIVOS_INSTALL_SKIP_BUILD:-0}" == "1" ]]; then
    warn "LIVOS_INSTALL_SKIP_BUILD=1 — skipping pnpm/npm/tsc build stage"
else
    if [[ -d "${SCRIPT_DIR}/livos" ]] && [[ -d "${SCRIPT_DIR}/liv" ]]; then
        info "pnpm install --frozen-lockfile (workspace root: ${SCRIPT_DIR}/livos)"
        ( cd "${SCRIPT_DIR}/livos" && pnpm install --frozen-lockfile ) || fail "pnpm install failed" 75

        info "pnpm --filter @livos/config build"
        ( cd "${SCRIPT_DIR}/livos" && pnpm --filter @livos/config build ) || fail "@livos/config build failed" 75

        info "pnpm --filter ui build"
        ( cd "${SCRIPT_DIR}/livos" && pnpm --filter ui build ) || fail "ui build failed" 75

        info "npm install + tsc in liv packages"
        for _pkg in core worker mcp-server memory; do
            if [[ -d "${SCRIPT_DIR}/liv/packages/${_pkg}" ]]; then
                info "  liv/packages/${_pkg}"
                ( cd "${SCRIPT_DIR}/liv/packages/${_pkg}" && npm install --no-audit --no-fund && npx tsc -p . ) \
                    || warn "  liv/packages/${_pkg} tsc returned non-zero (continuing)"
            fi
        done
    else
        warn "Source workspaces not co-located with install.sh — skipping build stage"
    fi
fi
# Then: scripts/install/env-seed.sh writes /opt/livos/.env + JWT secret.
_run_phase "Env + secrets seed" env-seed.sh

# ━━━ Service start ━━━ → scripts/install/service-up.sh
_run_phase "Service start" service-up.sh

# ━━━ Handing off to update.sh ━━━
step "Handing off to update.sh"
if [[ "${LIVOS_INSTALL_SKIP_UPDATE:-0}" == "1" ]]; then
    info "LIVOS_INSTALL_SKIP_UPDATE=1 — skipping update.sh handoff"
elif [[ -x "${SCRIPT_DIR}/update.sh" ]] || [[ -f "${SCRIPT_DIR}/update.sh" ]]; then
    info "Invoking ${SCRIPT_DIR}/update.sh for day-2 deploy gate"
    bash "${SCRIPT_DIR}/update.sh" || warn "update.sh returned non-zero — install.sh continuing to completion banner"
else
    warn "update.sh not found at ${SCRIPT_DIR}/update.sh — skipping hand-off"
fi

# ━━━ Done ━━━
step "Done"
_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "================================================================"
echo "  LivOS install complete (Phase 196-02)"
echo "  Onboarding: http://${_ip:-<lan-ip>}:8080"
echo "  Log:        ${LOG_FILE}"
echo "================================================================"
echo ""
