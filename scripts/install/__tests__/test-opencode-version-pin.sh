#!/usr/bin/env bash
# scripts/install/__tests__/test-opencode-version-pin.sh
# Phase 196-02 — verify update.sh's opencode-pin block emits the expected
# warning when opencode --version is below 1.15.0.
#
# Strategy: PATH-prepend a fake `opencode` shim that prints "opencode 1.14.0"
# then extract the 5-line pin block from update.sh and run it. Assert the
# warning string fires.
#
# CI-safe: no root, no apt, no real opencode required.

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
UPDATE_SH="$REPO_ROOT/update.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0
pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── AC-196-02-PIN-1: shape — update.sh contains the pin block ───────────────
info "AC-196-02-PIN-1: update.sh has OPENCODE_MIN_VERSION assignment"
if grep -q "^OPENCODE_MIN_VERSION=" "$UPDATE_SH"; then
    pass "OPENCODE_MIN_VERSION assignment present"
else
    fail "OPENCODE_MIN_VERSION assignment missing"
    exit 1
fi

info "AC-196-02-PIN-2: pin block references opencode --version + sort -V"
grep -q "opencode --version" "$UPDATE_SH" && pass "opencode --version invocation present" || fail "opencode --version missing"
grep -q "sort -V" "$UPDATE_SH" && pass "sort -V semver compare present" || fail "sort -V missing"

# ── AC-196-02-PIN-3: extract block and run with low-version shim ────────────
info "AC-196-02-PIN-3: shim opencode=1.14.0 → block prints warning"
SHIM_DIR=$(mktemp -d "${TMPDIR:-/tmp}/opencode-pin-test.XXXXXX")
trap 'rm -rf "$SHIM_DIR"' EXIT

cat > "$SHIM_DIR/opencode" <<'SHIM'
#!/usr/bin/env bash
echo "opencode 1.14.0"
SHIM
chmod +x "$SHIM_DIR/opencode"

# Extract the pin block: lines from "Phase 196-02 — opencode CLI version-pin"
# down to the matching closing `fi`. We grep with -A so the harness is robust
# against minor formatting drift inside the block.
BLOCK=$(awk '
    /Phase 196-02 — opencode CLI version-pin warning/ { capture = 1 }
    capture { print }
    capture && /^fi$/ { fi_count++; if (fi_count == 2) exit }
' "$UPDATE_SH")

if [[ -z "$BLOCK" ]]; then
    fail "could not extract pin block from update.sh"
    exit 1
fi

# Run the block with the shim on PATH; redirect to capture both stdout + stderr.
OUTPUT=$(PATH="$SHIM_DIR:$PATH" bash -c "
    set +e  # the block contains 'sleep 5'; we want fast assertion, override
    sleep() { :; }
    export -f sleep
    $BLOCK
" 2>&1)

# Assert the warning string fires.
if echo "$OUTPUT" | grep -q "Phase 196-02 — opencode 1.14.0 < required 1.15.0"; then
    pass "warning fires for opencode 1.14.0"
else
    fail "warning did NOT fire — captured output:"
    echo "----- captured -----"
    echo "$OUTPUT"
    echo "----- /captured -----"
fi

# ── AC-196-02-PIN-4: shim opencode=1.15.0 → block prints NO warning ─────────
info "AC-196-02-PIN-4: shim opencode=1.15.0 → no warning"
cat > "$SHIM_DIR/opencode" <<'SHIM'
#!/usr/bin/env bash
echo "opencode 1.15.0"
SHIM
chmod +x "$SHIM_DIR/opencode"

OUTPUT2=$(PATH="$SHIM_DIR:$PATH" bash -c "
    sleep() { :; }
    export -f sleep
    $BLOCK
" 2>&1)

if echo "$OUTPUT2" | grep -q "Phase 196-02 — opencode"; then
    fail "warning fired for in-spec opencode 1.15.0 — false positive"
    echo "$OUTPUT2"
else
    pass "no warning for in-spec opencode 1.15.0"
fi

# ── AC-196-02-PIN-5: missing opencode → 'not found' warning ─────────────────
info "AC-196-02-PIN-5: opencode missing → 'not found' warning"
EMPTY_DIR=$(mktemp -d "${TMPDIR:-/tmp}/opencode-pin-empty.XXXXXX")
trap 'rm -rf "$SHIM_DIR" "$EMPTY_DIR"' EXIT
# Use a real bash on a curated PATH that has the bash binary but NO opencode.
# /usr/bin is fine because Linux/macOS hosts have /usr/bin/bash but no
# /usr/bin/opencode by default in CI. We additionally put EMPTY_DIR FIRST so
# any pre-installed opencode is masked by the (non-existent) shim.
BASH_BIN=$(command -v bash)
OUTPUT3=$(PATH="$EMPTY_DIR:/usr/bin:/bin" "$BASH_BIN" -c "
    sleep() { :; }
    export -f sleep
    $BLOCK
" 2>&1)

if echo "$OUTPUT3" | grep -q "opencode CLI not found in PATH"; then
    pass "'not found' warning fires when opencode absent"
else
    fail "'not found' warning did NOT fire — captured output:"
    echo "$OUTPUT3"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
echo "PASS: $pass_count   FAIL: $fail_count"
echo "─────────────────────────────────────────"
[[ $fail_count -eq 0 ]] && exit 0 || exit 1
