#!/usr/bin/env bash
# scripts/__tests__/test-check-sacred-v38.sh
# Phase 173-03 — verify the JSON-driven sacred SHA check passes on HEAD
# AND correctly fails when a registered file is mutated or missing.
# CI-safe — uses a per-test sandbox copy of the registry.
# Platform-aware: handles Windows Git-Bash path translation via cygpath.

set -uo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
HOOK="$REPO_ROOT/scripts/check-sacred.sh"
REGISTRY="$REPO_ROOT/scripts/sacred-shas-v38.json"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass_count=0
fail_count=0
pass() { echo -e "${GREEN}PASS${NC}: $*"; pass_count=$((pass_count + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $*"; fail_count=$((fail_count + 1)); }
info() { echo -e "${YELLOW}INFO${NC}: $*"; }

# Path normalizer: when running under Git-Bash on Windows, Node interprets
# POSIX paths like /c/... or /tmp/... as Windows-relative (C:\c\..., C:\tmp\...)
# and fails with ENOENT. Use cygpath -w to translate when available; otherwise
# pass through unchanged for Linux/macOS CI.
npath() {
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -w "$1"
    else
        printf '%s' "$1"
    fi
}

# Pre-compute Windows-safe path for the canonical registry (used by Node calls).
REGISTRY_NPATH=$(npath "$REGISTRY")

# ── AC-173-03-1: shape — hook + registry exist, sh -n clean ──────────────────
info "AC-173-03-1: shape"
[[ -f "$HOOK" ]] && pass "check-sacred.sh exists" || fail "check-sacred.sh missing"
[[ -f "$REGISTRY" ]] && pass "registry exists" || fail "registry missing"
sh -n "$HOOK" 2>/dev/null && pass "sh -n clean" || fail "sh -n failed"

# ── AC-173-03-2: registry is valid JSON array with required keys ─────────────
info "AC-173-03-2: registry JSON shape"
if node -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));if(!Array.isArray(r))process.exit(1);for(const e of r){if(!e.path||!e.expected_sha||!e.frozen_in_phase)process.exit(1);if(!/^[0-9a-f]{40}\$/.test(e.expected_sha))process.exit(1)}" "$REGISTRY_NPATH" 2>/dev/null; then
    pass "registry parses with required keys"
else
    fail "registry shape invalid"
fi

# ── AC-173-03-3: registry contains the sacred sdk-agent-runner entry ─────────
info "AC-173-03-3: sdk-agent-runner pin present"
if grep -qF "f3538e1d811992b782a9bb057d1b7f0a0189f95f" "$REGISTRY"; then
    pass "sdk-agent-runner SHA pinned"
else
    fail "sdk-agent-runner SHA missing from registry"
fi

# ── AC-173-03-4: hook PASSes on current HEAD ─────────────────────────────────
info "AC-173-03-4: PASS path on HEAD"
cd "$REPO_ROOT"
out=$(sh "$HOOK" 2>&1); rc=$?
if [[ $rc -eq 0 ]]; then pass "hook exited 0 on HEAD"; else fail "hook exited $rc on HEAD (expected 0); output=$out"; fi
if echo "$out" | grep -qE "PASS: [0-9]+ files verified"; then pass "hook printed PASS summary"; else fail "hook missing PASS summary"; fi

# ── AC-173-03-5: hook FAILs when a registered file is mutated ────────────────
info "AC-173-03-5: FAIL path on mutated file"
# Build a sandbox copy of the registry under scripts/ (so the relative path
# inside the hook resolves consistently on every platform), then patch the
# sandbox hook to point at it.
SANDBOX="$REPO_ROOT/scripts/__sandbox_173_03_5__"
rm -rf "$SANDBOX"
mkdir -p "$SANDBOX"
SANDBOX_REGISTRY="$SANDBOX/registry.json"
SANDBOX_HOOK="$SANDBOX/check-sacred.sh"
cp "$REGISTRY" "$SANDBOX_REGISTRY"
# Rewrite the hook to read from the sandbox registry (relative to repo root).
sed "s|scripts/sacred-shas-v38\\.json|scripts/__sandbox_173_03_5__/registry.json|g" "$HOOK" > "$SANDBOX_HOOK"
chmod +x "$SANDBOX_HOOK"
# Capture the legitimate SHA of the first registered file BEFORE corruption.
TARGET=$(node -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(r[0].path)" "$(npath "$SANDBOX_REGISTRY")")
ORIG_SHA=$(git hash-object "$TARGET")
# Corrupt the expected_sha for the first entry.
node -e "
const fs=require('fs');
const p=process.argv[1];
const r=JSON.parse(fs.readFileSync(p,'utf8'));
r[0].expected_sha='0000000000000000000000000000000000000000';
fs.writeFileSync(p,JSON.stringify(r,null,2));
" "$(npath "$SANDBOX_REGISTRY")"
out2=$(cd "$REPO_ROOT" && sh "$SANDBOX_HOOK" 2>&1); rc2=$?
if [[ $rc2 -ne 0 ]]; then pass "mutated registry → hook exited $rc2 (non-zero)"; else fail "mutated registry → hook exited 0 (expected non-zero); output=$out2"; fi
if echo "$out2" | grep -qF "D-100-SACRED violated"; then pass "hook printed D-100-SACRED message"; else fail "hook missing D-100-SACRED message"; fi
if echo "$out2" | grep -qF "$ORIG_SHA"; then pass "hook printed actual SHA"; else fail "hook missing actual SHA"; fi
rm -rf "$SANDBOX"

# ── AC-173-03-6: hook FAILs when a registered file is missing ────────────────
info "AC-173-03-6: FAIL path on missing file"
SANDBOX="$REPO_ROOT/scripts/__sandbox_173_03_6__"
rm -rf "$SANDBOX"
mkdir -p "$SANDBOX"
SANDBOX_REGISTRY="$SANDBOX/registry.json"
SANDBOX_HOOK="$SANDBOX/check-sacred.sh"
cp "$REGISTRY" "$SANDBOX_REGISTRY"
sed "s|scripts/sacred-shas-v38\\.json|scripts/__sandbox_173_03_6__/registry.json|g" "$HOOK" > "$SANDBOX_HOOK"
chmod +x "$SANDBOX_HOOK"
node -e "
const fs=require('fs');
const p=process.argv[1];
const r=JSON.parse(fs.readFileSync(p,'utf8'));
r[0].path='no/such/file-does-not-exist.ts';
fs.writeFileSync(p,JSON.stringify(r,null,2));
" "$(npath "$SANDBOX_REGISTRY")"
out3=$(cd "$REPO_ROOT" && sh "$SANDBOX_HOOK" 2>&1); rc3=$?
if [[ $rc3 -ne 0 ]]; then pass "missing file → hook exited $rc3 (non-zero)"; else fail "missing file → hook exited 0 (expected non-zero); output=$out3"; fi
if echo "$out3" | grep -qF "file not found"; then pass "hook printed file-not-found message"; else fail "hook missing file-not-found message"; fi
rm -rf "$SANDBOX"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────"
echo "PASS: $pass_count   FAIL: $fail_count"
echo "─────────────────────────────────────────"
[[ $fail_count -eq 0 ]] && exit 0 || exit 1
