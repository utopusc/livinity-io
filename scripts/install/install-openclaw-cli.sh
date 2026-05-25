#!/usr/bin/env bash
# scripts/install/install-openclaw-cli.sh
# Phase 208-03 — openclaw CLI installer (R2 mitigation).
#
# Installs the openclaw CLI binary to /opt/livos/bin/openclaw as a symlink
# (or shebang shim) into the workspace's resolved openclaw package. Idempotent.
#
# Source: Phase 208 R2 — "openclaw CLI binary not on PATH" repro doc at
#   .planning/phases/208-luseMCP-toolchain-audit/208-SPEC.md
#
# Called by:
#   - update.sh on Mini PC (Plan 208-03 Task 2)
#   - install.sh self-bootstrap (only if INSTALL_OPENCLAW_CLI=1)
#
# Idempotency contract:
#   - If /opt/livos/bin/openclaw is already a symlink to a working binary
#     (`--version` exits 0), log "already installed" and exit 0 without touching it.
#   - Otherwise resolve the pnpm-stored openclaw package, locate its bin entry,
#     create /opt/livos/bin/openclaw (or a wrapper shim if the entry has no shebang),
#     and re-verify with --version. Exit non-zero on any unrecoverable failure.

set -euo pipefail

# Optional logging helpers (sourced if available; safe no-op stubs if not).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_logging.sh
if [[ -f "${SCRIPT_DIR}/_logging.sh" ]]; then
    # shellcheck disable=SC1091
    source "${SCRIPT_DIR}/_logging.sh"
else
    info() { echo "[INFO]  $*" >&2; }
    ok()   { echo "[OK]    $*" >&2; }
    warn() { echo "[WARN]  $*" >&2; }
    fail() { echo "[FAIL]  $*" >&2; exit "${2:-1}"; }
    step() { echo "=== $* ===" >&2; }
fi

OPENCLAW_VERSION="${OPENCLAW_VERSION:-2026.5.20}"
LIVOS_ROOT="${LIVOS_ROOT:-/opt/livos}"
TARGET_BIN="${LIVOS_ROOT}/bin/openclaw"

step "Phase 208-03 — installing openclaw CLI shim at ${TARGET_BIN}"

# ── Idempotency guard ────────────────────────────────────────────────────────
# If a symlink already points at a working binary, skip the rest.
if [[ -L "$TARGET_BIN" ]]; then
    _resolved="$(readlink -f "$TARGET_BIN" 2>/dev/null || true)"
    if [[ -n "$_resolved" ]] && [[ -x "$_resolved" ]]; then
        if "$TARGET_BIN" --version >/dev/null 2>&1; then
            ok "openclaw already installed: $TARGET_BIN -> $_resolved"
            info "✓ install-openclaw-cli complete (no-op)"
            exit 0
        fi
    fi
fi

mkdir -p "${LIVOS_ROOT}/bin"

# ── Resolve openclaw pnpm package directory ──────────────────────────────────
# pnpm hoists packages under node_modules/.pnpm/<name>@<ver>_<peerhash>/node_modules/<name>
# Match the pinned version first; fall back to ANY openclaw@* dir.
PKG_DIR=""
if [[ -d "${LIVOS_ROOT}/node_modules/.pnpm" ]]; then
    PKG_DIR="$(find "${LIVOS_ROOT}/node_modules/.pnpm" -maxdepth 1 -type d -name "openclaw@${OPENCLAW_VERSION}*" 2>/dev/null | head -1)"
    if [[ -z "$PKG_DIR" ]]; then
        PKG_DIR="$(find "${LIVOS_ROOT}/node_modules/.pnpm" -maxdepth 1 -type d -name "openclaw@*" 2>/dev/null | head -1)"
    fi
fi

if [[ -z "$PKG_DIR" ]]; then
    fail "openclaw package not found in ${LIVOS_ROOT}/node_modules/.pnpm (expected pnpm hoist dir openclaw@${OPENCLAW_VERSION}*). Run pnpm install at ${LIVOS_ROOT} first." 2
fi

OPENCLAW_PKG_ROOT="${PKG_DIR}/node_modules/openclaw"
if [[ ! -f "${OPENCLAW_PKG_ROOT}/package.json" ]]; then
    fail "openclaw package.json not found at ${OPENCLAW_PKG_ROOT}/package.json — pnpm-store layout drift?" 2
fi

# ── Locate bin entry from package.json ───────────────────────────────────────
# "bin" can be a string (single bin) or an object (multiple bins). Prefer the
# "openclaw" key if present; otherwise take the first value.
BIN_FROM_PKG_JSON=""
if command -v node >/dev/null 2>&1; then
    BIN_FROM_PKG_JSON="$(node -e "
        try {
            const p = require('${OPENCLAW_PKG_ROOT}/package.json');
            const b = p.bin;
            if (!b) { process.exit(3); }
            const out = typeof b === 'string' ? b : (b.openclaw || Object.values(b)[0]);
            if (!out) { process.exit(3); }
            process.stdout.write(out);
        } catch (e) { process.exit(3); }
    " 2>/dev/null || echo '')"
fi

TARGET_SOURCE=""
if [[ -n "$BIN_FROM_PKG_JSON" ]]; then
    TARGET_SOURCE="${OPENCLAW_PKG_ROOT}/${BIN_FROM_PKG_JSON}"
fi

# Fallback: common entry locations if package.json had no bin or node missing.
if [[ -z "$TARGET_SOURCE" ]] || [[ ! -f "$TARGET_SOURCE" ]]; then
    for cand in dist/cli.js dist/index.js bin/openclaw.js bin/openclaw.mjs; do
        if [[ -f "${OPENCLAW_PKG_ROOT}/${cand}" ]]; then
            TARGET_SOURCE="${OPENCLAW_PKG_ROOT}/${cand}"
            break
        fi
    done
fi

if [[ -z "${TARGET_SOURCE:-}" ]] || [[ ! -f "$TARGET_SOURCE" ]]; then
    fail "could not resolve openclaw entry point in ${OPENCLAW_PKG_ROOT} (tried package.json bin + common dist/cli.js / dist/index.js fallbacks)" 4
fi

# ── Symlink (or wrapper if shebang missing) ──────────────────────────────────
chmod +x "$TARGET_SOURCE" 2>/dev/null || true

if head -c 2 "$TARGET_SOURCE" 2>/dev/null | grep -q '^#!'; then
    # Has shebang — direct symlink is safe.
    ln -sf "$TARGET_SOURCE" "$TARGET_BIN"
    info "linked: $TARGET_BIN -> $TARGET_SOURCE"
else
    # No shebang — write a wrapper that execs node on it.
    WRAPPER="${LIVOS_ROOT}/bin/openclaw-wrapper.sh"
    cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
# Auto-generated by scripts/install/install-openclaw-cli.sh — Phase 208-03.
exec node "$TARGET_SOURCE" "\$@"
EOF
    chmod +x "$WRAPPER"
    ln -sf "$WRAPPER" "$TARGET_BIN"
    info "wrapped (no shebang on entry): $TARGET_BIN -> $WRAPPER -> $TARGET_SOURCE"
fi

# ── Post-install smoke test ──────────────────────────────────────────────────
# Some openclaw versions don't honour --version; accept --help as a fallback so
# the install isn't blocked by a missing flag. Both should print SOMETHING.
if "$TARGET_BIN" --version >/dev/null 2>&1; then
    _v="$("$TARGET_BIN" --version 2>/dev/null | head -1)"
    ok "openclaw installed at $TARGET_BIN (version: ${_v:-unknown})"
elif "$TARGET_BIN" --help >/dev/null 2>&1; then
    warn "openclaw --version returned non-zero but --help succeeded — accepting"
    ok "openclaw installed at $TARGET_BIN (--help smoke test passed)"
else
    fail "post-install smoke test failed: neither --version nor --help worked at $TARGET_BIN" 5
fi

info "✓ install-openclaw-cli complete"
