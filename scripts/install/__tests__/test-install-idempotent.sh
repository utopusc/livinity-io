#!/usr/bin/env bash
# scripts/install/__tests__/test-install-idempotent.sh
# Phase 196-02 — assert that install.sh and its seven phase scripts are
# idempotent in shape: re-running on an "already-installed" host records ZERO
# destructive operations (no apt-get install, no useradd, no systemctl start).
#
# Strategy: PATH-prepend fake binary shims that record every invocation to a
# log file, then bash-parse-check install.sh + grep its source for the
# detect-then-skip pattern. We do NOT execute install.sh end-to-end (that
# requires real /opt/livos + a live systemd) — instead we lock the static
# guarantees that idempotency rests on.
#
# CI-safe: no root, no real /opt/livos, no live apt.

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
INSTALL_SH="$REPO_ROOT/install.sh"
PHASE_DIR="$REPO_ROOT/scripts/install"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0
pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── AC-196-02-IDEM-1: shape — install.sh exists + bash -n clean ─────────────
info "AC-196-02-IDEM-1: install.sh shape"
if [[ -f "$INSTALL_SH" ]]; then
    pass "install.sh exists"
else
    fail "install.sh missing"
    exit 1
fi
if bash -n "$INSTALL_SH" 2>/dev/null; then
    pass "bash -n clean"
else
    fail "bash -n failed on install.sh"
fi

# ── AC-196-02-IDEM-2: install.sh references every Phase 196-02 phase script ─
info "AC-196-02-IDEM-2: install.sh wires all 7 phase scripts"
_phases=(preflight.sh opencode-install.sh system-deps.sh bruce-user-bootstrap.sh systemd-units-install.sh env-seed.sh service-up.sh)
for _ph in "${_phases[@]}"; do
    if grep -q "$_ph" "$INSTALL_SH"; then
        pass "install.sh references $_ph"
    else
        fail "install.sh does NOT reference $_ph"
    fi
done

# Count scripts/install/ paths — must be >= 7 per plan AC.
_install_refs=$(grep -c "scripts/install" "$INSTALL_SH" || true)
if [[ "${_install_refs:-0}" -ge 7 ]]; then
    pass "install.sh contains >= 7 scripts/install/ references (actual: ${_install_refs})"
else
    fail "install.sh has only ${_install_refs} scripts/install/ references (need >= 7)"
fi

# Plan AC: `grep -c "Phase 196-02" install.sh` >= 3
_phase_refs=$(grep -c "Phase 196-02" "$INSTALL_SH" || true)
if [[ "${_phase_refs:-0}" -ge 3 ]]; then
    pass "install.sh contains >= 3 'Phase 196-02' references (actual: ${_phase_refs})"
else
    fail "install.sh has only ${_phase_refs} 'Phase 196-02' references (need >= 3)"
fi

# ── AC-196-02-IDEM-3: every phase script bash -n clean ──────────────────────
info "AC-196-02-IDEM-3: all 7 phase scripts bash -n clean"
for _ph in "${_phases[@]}"; do
    if bash -n "$PHASE_DIR/$_ph" 2>/dev/null; then
        pass "bash -n: $_ph"
    else
        fail "bash -n: $_ph"
    fi
done

# ── AC-196-02-IDEM-4: detect-then-skip — every phase has guard keyword ──────
info "AC-196-02-IDEM-4: detect-then-skip guard count >= 7"
_guard_total=$(grep -hcE "already (configured|installed|present)" \
    "$PHASE_DIR/preflight.sh" \
    "$PHASE_DIR/opencode-install.sh" \
    "$PHASE_DIR/system-deps.sh" \
    "$PHASE_DIR/bruce-user-bootstrap.sh" \
    "$PHASE_DIR/systemd-units-install.sh" \
    "$PHASE_DIR/env-seed.sh" \
    "$PHASE_DIR/service-up.sh" | awk '{s+=$1} END {print s}')
if (( _guard_total >= 7 )); then
    pass "detect-then-skip guards: ${_guard_total} (need >= 7)"
else
    fail "detect-then-skip guards: ${_guard_total} (need >= 7)"
fi

# ── AC-196-02-IDEM-5: NO destructive ops with unguarded prefix ─────────────
# Every `apt-get install`, `useradd`, `systemctl start`, `install -m 0440` MUST
# appear AFTER a guard line (dpkg -s / id -u / is-active / cmp). We check by
# requiring that each destructive verb co-occurs with its guard verb in the
# same script.
info "AC-196-02-IDEM-5: destructive ops are guarded"
_check_guarded() {
    local script="$1" destructive="$2" guard="$3"
    local has_dest has_guard
    # `--` separator stops grep from treating regex leading dashes as options.
    has_dest=$(grep -c -E -- "$destructive" "$script" 2>/dev/null || echo 0)
    has_guard=$(grep -c -E -- "$guard" "$script" 2>/dev/null || echo 0)
    if (( has_dest == 0 )); then
        return 0  # no destructive op — vacuously guarded
    fi
    if (( has_guard >= 1 )); then
        pass "$script: '$destructive' is guarded by '$guard'"
    else
        fail "$script: '$destructive' present WITHOUT '$guard' guard"
    fi
}

_check_guarded "$PHASE_DIR/system-deps.sh"           "apt-get install"     "dpkg -s|command -v"
_check_guarded "$PHASE_DIR/bruce-user-bootstrap.sh"  "useradd"             "id -u bruce"
_check_guarded "$PHASE_DIR/bruce-user-bootstrap.sh"  "install -m 0440"     "cmp -s"
_check_guarded "$PHASE_DIR/service-up.sh"            "systemctl start"     "is-active"
_check_guarded "$PHASE_DIR/systemd-units-install.sh" "install -m 0644"     "cmp -s"
_check_guarded "$PHASE_DIR/env-seed.sh"              "head -c 64 /dev/urandom" "-s.*jwt"

# ── AC-196-02-IDEM-6: shim drill — simulate second invocation with PATH shims ─
info "AC-196-02-IDEM-6: shim PATH drill for opencode-install.sh"
SHIM_DIR=$(mktemp -d "${TMPDIR:-/tmp}/install-idem.XXXXXX")
LOG_FILE="$SHIM_DIR/calls.log"
trap 'rm -rf "$SHIM_DIR"' EXIT

# opencode shim that reports a sufficient version → opencode-install.sh must
# detect and skip without ever calling curl.
cat > "$SHIM_DIR/opencode" <<'SHIM'
#!/usr/bin/env bash
echo "opencode 1.15.0"
SHIM
chmod +x "$SHIM_DIR/opencode"

# curl shim that records its own invocation. If opencode-install.sh follows
# detect-then-skip, this shim must NEVER fire for the upstream installer URL.
cat > "$SHIM_DIR/curl" <<SHIM
#!/usr/bin/env bash
echo "curl \$*" >> "$LOG_FILE"
exec /usr/bin/curl "\$@"
SHIM
chmod +x "$SHIM_DIR/curl"

# Run opencode-install.sh under PATH shim; capture stdout/stderr.
DRILL_OUTPUT=$(PATH="$SHIM_DIR:$PATH" bash "$PHASE_DIR/opencode-install.sh" 2>&1 || true)

if grep -q "opencode.ai/install" "$LOG_FILE" 2>/dev/null; then
    fail "opencode-install.sh re-fetched upstream installer despite in-spec opencode 1.15.0 on PATH"
    echo "$DRILL_OUTPUT"
else
    pass "opencode-install.sh did NOT call curl https://opencode.ai/install (already-installed path honoured)"
fi

if echo "$DRILL_OUTPUT" | grep -q "already installed"; then
    pass "opencode-install.sh logged 'already installed' for in-spec shim"
else
    fail "opencode-install.sh did not log 'already installed' — captured:"
    echo "$DRILL_OUTPUT"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
echo "PASS: $pass_count   FAIL: $fail_count"
echo "─────────────────────────────────────────"
[[ $fail_count -eq 0 ]] && exit 0 || exit 1
