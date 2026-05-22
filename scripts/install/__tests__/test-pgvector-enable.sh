#!/usr/bin/env bash
# Phase 197-03 — Test harness for pgvector-enable.sh.
#
# Asserts:
#   - script exists + bash -n passes (no syntax errors)
#   - script contains the load-bearing literals (CREATE EXTENSION IF NOT EXISTS vector,
#     dpkg -s postgresql-16-pgvector)
#   - script contains zero DROP statements (T-197-03-01)
#   - re-run path (shim apt-get + dpkg + sudo + psql) — second invocation skips
#     apt-get install
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/install/pgvector-enable.sh"

PASS=0
FAIL=0

assert() {
    local label="$1" expected="$2" actual="$3"
    if [[ "$expected" == "$actual" ]]; then
        echo "  PASS  $label"
        PASS=$((PASS + 1))
    else
        echo "  FAIL  $label (expected '$expected', got '$actual')"
        FAIL=$((FAIL + 1))
    fi
}

# 1. Script exists
[[ -f "$SCRIPT" ]] && assert "script exists" "yes" "yes" || assert "script exists" "yes" "no"

# 2. bash -n passes
if bash -n "$SCRIPT" 2>/dev/null; then assert "bash -n" "yes" "yes"; else assert "bash -n" "yes" "no"; fi

# 3. Contains CREATE EXTENSION IF NOT EXISTS vector
count=$(grep -c "CREATE EXTENSION IF NOT EXISTS vector" "$SCRIPT" || true)
assert "CREATE EXTENSION literal" "1" "$count"

# 4. Contains dpkg -s postgresql-16-pgvector
count=$(grep -c "dpkg -s postgresql-16-pgvector" "$SCRIPT" || true)
assert "dpkg -s guard" "1" "$count"

# 5. Contains zero DROP statements (T-197-03-01)
count=$(grep -cE "\bDROP\b" "$SCRIPT" || true)
assert "zero DROP statements" "0" "$count"

# 6. Contains Phase 197-03 markers (≥ 2)
count=$(grep -c "Phase 197-03" "$SCRIPT" || true)
if [[ "$count" -ge 2 ]]; then assert "≥2 Phase 197-03 markers" "yes" "yes"; else assert "≥2 Phase 197-03 markers" "yes" "no($count)"; fi

# 7. Re-run idempotency — shim apt/dpkg/psql/sudo in tmpdir + PATH override.
TMPDIR_RUN="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_RUN"' EXIT

# Build shims that record invocations
mkdir -p "$TMPDIR_RUN/bin"
cat > "$TMPDIR_RUN/bin/dpkg" <<'EOF'
#!/usr/bin/env bash
echo "dpkg $*" >> "${TMPDIR_RUN}/calls.log"
# Args: -s postgresql-16-pgvector
# Behavior controlled by /tmp/livos-pgvector-installed flag
if [[ "$1 $2" == "-s postgresql-16-pgvector" ]]; then
    if [[ -f "${TMPDIR_RUN}/already-installed" ]]; then
        echo "installed"
        exit 0
    else
        exit 1
    fi
fi
exit 0
EOF
cat > "$TMPDIR_RUN/bin/apt-get" <<'EOF'
#!/usr/bin/env bash
echo "apt-get $*" >> "${TMPDIR_RUN}/calls.log"
# Mark as installed after install runs
touch "${TMPDIR_RUN}/already-installed"
exit 0
EOF
cat > "$TMPDIR_RUN/bin/psql" <<'EOF'
#!/usr/bin/env bash
echo "psql $*" >> "${TMPDIR_RUN}/calls.log"
exit 0
EOF
cat > "$TMPDIR_RUN/bin/sudo" <<'EOF'
#!/usr/bin/env bash
echo "sudo $*" >> "${TMPDIR_RUN}/calls.log"
# Exec the remaining args (e.g. sudo -u postgres psql ...)
shift_to_cmd() {
    while [[ "$1" == -* ]]; do
        case "$1" in
            -u) shift 2 ;;
            -E|-H|-n|-S|-i) shift ;;
            *) break ;;
        esac
    done
    "$@"
}
shift_to_cmd "$@"
EOF
chmod +x "$TMPDIR_RUN/bin/"*
export PATH="$TMPDIR_RUN/bin:$PATH"
export TMPDIR_RUN

# First run — apt-get install should fire
rm -f "$TMPDIR_RUN/already-installed" "$TMPDIR_RUN/calls.log"
if bash "$SCRIPT" >/dev/null 2>&1; then
    apt_calls=$(grep -c "^apt-get install" "$TMPDIR_RUN/calls.log" || true)
    psql_calls=$(grep -c "psql.*CREATE EXTENSION" "$TMPDIR_RUN/calls.log" || true)
    assert "first run — apt-get install fires" "1" "$apt_calls"
    if [[ "$psql_calls" -ge 1 ]]; then assert "first run — psql CREATE EXTENSION fires" "yes" "yes"; else assert "first run — psql CREATE EXTENSION fires" "yes" "no($psql_calls)"; fi
else
    assert "first run — exit 0" "yes" "no"
fi

# Second run — apt-get install should NOT fire (dpkg returns 0)
rm -f "$TMPDIR_RUN/calls.log"
touch "$TMPDIR_RUN/already-installed"
if bash "$SCRIPT" >/dev/null 2>&1; then
    apt_calls=$(grep -c "^apt-get install" "$TMPDIR_RUN/calls.log" || true)
    psql_calls=$(grep -c "psql.*CREATE EXTENSION" "$TMPDIR_RUN/calls.log" || true)
    assert "second run — apt-get install SKIPPED" "0" "$apt_calls"
    if [[ "$psql_calls" -ge 1 ]]; then assert "second run — psql still fires (idempotent SQL)" "yes" "yes"; else assert "second run — psql still fires" "yes" "no($psql_calls)"; fi
else
    assert "second run — exit 0" "yes" "no"
fi

echo ""
echo "Phase 197-03 pgvector-enable harness: PASS=$PASS FAIL=$FAIL"
if [[ "$FAIL" -gt 0 ]]; then
    exit 1
fi
echo "ALL PASS"
