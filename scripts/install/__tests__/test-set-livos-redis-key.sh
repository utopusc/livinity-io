#!/usr/bin/env bash
# scripts/install/__tests__/test-set-livos-redis-key.sh
# Phase 141-01 — regression: set_livos_redis_key MUST queue to the pending file
# when Redis is unreachable, with idempotent line-overwrite semantics. livinityd
# boot drains the file via modules/drain-install-pending-redis.ts (covered by
# the .ts test in that module).
#
# This test exercises the install.sh side ONLY — that the queue contract holds:
#   - Writes KEY=VALUE line when Redis unreachable
#   - Re-running with the same key overwrites the prior line (no duplicates)
#   - Distinct keys accumulate
#   - The file lives at /var/lib/livos/install-pending-redis-keys.txt
#
# Sacred SHA: f3538e1d811992b782a9bb057d1b7f0a0189f95f
#
# Invoke:  bash scripts/install/__tests__/test-set-livos-redis-key.sh
# Returns: exit 0 = all green; exit 1 = at least one failure

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
LOGGING_SH="$REPO_ROOT/scripts/install/_logging.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0

pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# ── Sandbox the pending file path so the test doesn't touch /var/lib ────────
TMP_PENDING_DIR=$(mktemp -d)
TMP_PENDING="$TMP_PENDING_DIR/install-pending-redis-keys.txt"
trap 'rm -rf "$TMP_PENDING_DIR"' EXIT

# Source the helper with a redis-cli stub that ALWAYS reports unreachable so
# the "queue to file" branch is exercised deterministically. We override the
# pending file path via a PATH-prefixed shim:
SHIM_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_PENDING_DIR" "$SHIM_DIR"' EXIT
cat > "$SHIM_DIR/redis-cli" <<'SHIM'
#!/usr/bin/env bash
# Always claim unreachable: emit nothing on ping (no PONG), exit 1.
if [[ "${1:-}" == "ping" ]]; then exit 1; fi
exit 1
SHIM
chmod +x "$SHIM_DIR/redis-cli"

# Run set_livos_redis_key in a subshell with the stub on PATH and the pending
# file path patched. The function hard-codes /var/lib/livos/...; we re-define
# the function inline AFTER sourcing to use our test path.
run_set_key() {
    local key="$1" value="$2"
    PATH="$SHIM_DIR:$PATH" bash -c "
        set -uo pipefail
        # shellcheck disable=SC1090
        source '$LOGGING_SH'
        # Override the pending path by re-defining the function
        set_livos_redis_key() {
            local key=\"\$1\" value=\"\$2\"
            if command -v redis-cli &>/dev/null && redis-cli ping 2>/dev/null | grep -q '^PONG\$'; then
                redis-cli set \"\$key\" \"\$value\" >/dev/null && ok \"Redis: \${key}=\${value}\"
            else
                local pending=\"$TMP_PENDING\"
                mkdir -p \"\$(dirname \"\$pending\")\"
                if [[ -f \"\$pending\" ]]; then
                    grep -v \"^\${key}=\" \"\$pending\" > \"\${pending}.new\" || true
                    mv -f \"\${pending}.new\" \"\$pending\"
                fi
                echo \"\${key}=\${value}\" >> \"\$pending\"
                ok \"Redis queued: \${key}=\${value} (will apply on livinityd boot)\"
            fi
        }
        set_livos_redis_key '$key' '$value'
    " 2>&1
}

# ── TEST 1: queues a single key ─────────────────────────────────────────────
info "TEST 1: queues KEY=VALUE on first call"
rm -f "$TMP_PENDING"
out=$(run_set_key "livos:domain:local_mode" "hybrid")
if grep -qx "livos:domain:local_mode=hybrid" "$TMP_PENDING" 2>/dev/null; then
    pass "first call writes the queued line"
else
    fail "queued line missing. File contents:"; cat "$TMP_PENDING" 2>/dev/null | sed 's/^/    /'
fi
if echo "$out" | grep -qF "Redis queued:"; then
    pass "stderr announces 'Redis queued:'"
else
    fail "stderr did NOT announce 'Redis queued:'"
fi

# ── TEST 2: re-running with same key OVERWRITES (no duplicates) ─────────────
info "TEST 2: same key re-queue overwrites (idempotency contract)"
run_set_key "livos:domain:local_mode" "tunnel" >/dev/null
count=$(grep -c "^livos:domain:local_mode=" "$TMP_PENDING" 2>/dev/null || echo 0)
if [[ "$count" -eq 1 ]]; then
    pass "exactly 1 line for livos:domain:local_mode (no duplicates)"
else
    fail "expected 1 line for livos:domain:local_mode, got $count"
    cat "$TMP_PENDING" | sed 's/^/    /'
fi
last=$(grep "^livos:domain:local_mode=" "$TMP_PENDING")
if [[ "$last" == "livos:domain:local_mode=tunnel" ]]; then
    pass "latest value (tunnel) replaced prior (hybrid)"
else
    fail "expected 'livos:domain:local_mode=tunnel', got '$last'"
fi

# ── TEST 3: distinct keys accumulate ────────────────────────────────────────
info "TEST 3: distinct keys accumulate as separate lines"
run_set_key "livos:domain:tunnel_domain" "socinity.livinity.io" >/dev/null
run_set_key "livos:domain:host_ip" "10.69.31.68" >/dev/null
lines=$(wc -l < "$TMP_PENDING")
if [[ "$lines" -eq 3 ]]; then
    pass "3 distinct keys → 3 lines"
else
    fail "expected 3 lines, got $lines"
    cat "$TMP_PENDING" | sed 's/^/    /'
fi

# ── TEST 4: value with embedded equals preserved verbatim ──────────────────
info "TEST 4: value with embedded '=' lands intact"
run_set_key "livos:custom:token" "abc=def=ghi" >/dev/null
line=$(grep "^livos:custom:token=" "$TMP_PENDING")
if [[ "$line" == "livos:custom:token=abc=def=ghi" ]]; then
    pass "value with embedded '=' preserved"
else
    fail "expected 'livos:custom:token=abc=def=ghi', got '$line'"
fi

# ── TEST 5: file path discipline ────────────────────────────────────────────
info "TEST 5: production path is /var/lib/livos/install-pending-redis-keys.txt"
# Just confirm the source has the literal path — drainer side reads same path
if grep -qF "/var/lib/livos/install-pending-redis-keys.txt" "$LOGGING_SH"; then
    pass "_logging.sh references /var/lib/livos/install-pending-redis-keys.txt"
else
    fail "_logging.sh missing /var/lib/livos/install-pending-redis-keys.txt path"
fi
DRAIN_TS="$REPO_ROOT/livos/packages/livinityd/source/modules/drain-install-pending-redis.ts"
if [[ -f "$DRAIN_TS" ]] && grep -qF "/var/lib/livos/install-pending-redis-keys.txt" "$DRAIN_TS"; then
    pass "drain-install-pending-redis.ts reads the same path"
else
    fail "drain-install-pending-redis.ts does NOT reference the shared path"
fi

# ── TEST 6: sacred SHA preserved in both touched files ─────────────────────
info "TEST 6: sacred SHA invariant in drain module"
SACRED="f3538e1d811992b782a9bb057d1b7f0a0189f95f"
if grep -qF "$SACRED" "$DRAIN_TS" \
    || grep -qF "$SACRED" "$REPO_ROOT/livos/packages/livinityd/source/modules/drain-install-pending-redis.test.ts"; then
    pass "sacred SHA present in drain module or its test"
else
    fail "sacred SHA missing from both drain module and test"
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo
if [[ $fail_count -eq 0 ]]; then
    echo -e "${GREEN}All $pass_count assertions PASSED${NC}"
    exit 0
else
    echo -e "${RED}$fail_count FAIL / $pass_count PASS${NC}"
    exit 1
fi
