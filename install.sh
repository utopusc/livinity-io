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
