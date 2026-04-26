#!/bin/bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# Phase 31 patch for /opt/livos/update.sh
#
# Delivers the three remediations from .planning/phases/31-update-sh-build-pipeline-integrity/:
#
#   BUILD-01: verify_build() helper invoked after every pnpm/npm build, plus
#             cleanup of worker/mcp-server "2>/dev/null && cd ... || cd ..."
#             exit-code masking (Plan 01 remediation item #5).
#
#   BUILD-02: dist-copy loop over ALL @nexus+core* pnpm-store dirs (replaces
#             the single-target `find ... | head -1` bug — BACKLOG 999.5b
#             verbatim, Plan 01 remediation item #4).
#
#   BUILD-03: Per Plan 01 (31-ROOT-CAUSE.md), the headline trigger for the
#             "[OK] @livos/config built" silent-success lie is INCONCLUSIVE
#             (single deterministic root cause could not be pinned without a
#             controlled live repro — out of scope for Phase 31). The
#             BUILD-01 fail-loud guard is therefore the safety net per the
#             Phase 31 CONTEXT decision. This patch's BUILD-03 block:
#               - Records the inconclusive verdict as an idempotency marker
#                 inside update.sh so future agents understand the design.
#               - Verifies `set -euo pipefail` is present (it is, line 8 on
#                 both hosts — H6 ruled out for headline symptom). If a
#                 future host's update.sh ever lacks it, this patch injects
#                 it as the first non-comment, non-shebang line.
#               - Injects the missing memory-build block on Server4
#                 (Plan 01 remediation item #6 — Mini PC has it, Server4 does
#                 not). Uses `grep -q "Building Nexus memory"` for detection.
#
# Idempotent: re-runs detect markers and exit 0 with ALREADY-PATCHED.
# Apply via:  ssh <host> 'sudo bash -s' < phase31-update-sh-patch.sh
#
# Backup safety: writes /opt/livos/update.sh.pre-phase31 before any change,
# runs `bash -n` on the patched output, restores from backup if syntax fails.
# ──────────────────────────────────────────────────────────────────────────────

UPDATE_SH="/opt/livos/update.sh"
MARKER_VERIFY="# ── Phase 31 BUILD-01: verify_build helper ──"
MARKER_LOOP="# ── Phase 31 BUILD-02: multi-dir dist-copy loop ──"
MARKER_RC="# ── Phase 31 BUILD-03: root-cause fix ──"
MARKER_MEMORY="# ── Phase 31 BUILD-03: memory-build injection ──"

if [[ ! -f "$UPDATE_SH" ]]; then
    echo "ERROR: $UPDATE_SH not found on this host" >&2
    exit 1
fi

# ── Snapshot original (Phase 30 precedent — keep .pre-phaseNN backup) ─────
if [[ ! -f "$UPDATE_SH.pre-phase31" ]]; then
    cp "$UPDATE_SH" "$UPDATE_SH.pre-phase31"
    echo "Backup written: $UPDATE_SH.pre-phase31"
else
    echo "Backup already exists: $UPDATE_SH.pre-phase31 (re-run safe)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Patch 1/4: BUILD-01 — insert verify_build() helper after the fail() helper
# ─────────────────────────────────────────────────────────────────────────────
if grep -qF "$MARKER_VERIFY" "$UPDATE_SH"; then
    echo "ALREADY-PATCHED (BUILD-01): verify_build helper present"
else
    # Anchor: line right after the existing fail() helper definition.
    # Helpers are single-line on Mini PC + Server4 — no closing `}` line.
    # Splice immediately AFTER the `fail()` line.
    ANCHOR_LINE=$(grep -n '^fail()' "$UPDATE_SH" | head -1 | cut -d: -f1)
    if [[ -z "$ANCHOR_LINE" ]]; then
        echo "ERROR: cannot find fail() helper to anchor verify_build insertion" >&2
        exit 1
    fi
    INSERT_AT=$((ANCHOR_LINE + 1))

    PATCH_BLOCK=$(mktemp)
    cat <<'EOPATCH' > "$PATCH_BLOCK"
# ── Phase 31 BUILD-01: verify_build helper ──
# Asserts that a build produced non-empty output. Call AFTER every build
# invocation. Failure prints `BUILD-FAIL: <pkg> produced empty <dir>` to stderr
# and exits 1 — kills the silent-success lie that BACKLOG 999.5 tracked.
# Usage: verify_build "@livos/config" "/opt/livos/packages/config/dist"
verify_build() {
    local pkg="$1"
    local outdir="$2"
    if [[ ! -d "$outdir" ]] || [[ -z "$(find "$outdir" -type f 2>/dev/null | head -1)" ]]; then
        echo "BUILD-FAIL: $pkg produced empty $outdir" >&2
        exit 1
    fi
    echo "[VERIFY] $pkg dist OK ($outdir)"
}

EOPATCH

    awk -v line="$INSERT_AT" -v patchfile="$PATCH_BLOCK" '
        BEGIN { while ((getline pl < patchfile) > 0) patch = patch pl ORS }
        NR == line { printf "%s", patch }
        { print }
    ' "$UPDATE_SH" > "$UPDATE_SH.new"
    mv "$UPDATE_SH.new" "$UPDATE_SH"
    chmod +x "$UPDATE_SH"
    rm -f "$PATCH_BLOCK"
    echo "PATCH-OK (BUILD-01): verify_build helper inserted at line $INSERT_AT"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Patch 2/4: BUILD-01 calls — wire verify_build after every build invocation
# ─────────────────────────────────────────────────────────────────────────────
# Each entry: "<grep-pattern-of-build-line>|<outdir>|<pkg-label>"
# We use the build-invocation line (not the "ok ... built" line) as the anchor
# because it's stable across both hosts.
BUILD_VERIFICATIONS=(
    "pnpm --filter @livos/config build|/opt/livos/packages/config/dist|@livos/config"
    "pnpm --filter ui build|/opt/livos/packages/ui/dist|@livos/ui"
    "npm run build --workspace=packages/core|/opt/nexus/packages/core/dist|@nexus/core"
    "npm run build --workspace=packages/worker|/opt/nexus/packages/worker/dist|@nexus/worker"
    "npm run build --workspace=packages/mcp-server|/opt/nexus/packages/mcp-server/dist|@nexus/mcp-server"
)

# Also verify the legacy `npx tsc` invocation form (Mini PC + Server4 use this
# instead of npm-workspace form for some packages — see Plan 01 snapshot).
LEGACY_BUILD_VERIFICATIONS=(
    "cd \"\$LIVOS_DIR/packages/config\"|/opt/livos/packages/config/dist|@livos/config"
    "cd \"\$LIVOS_DIR/packages/ui\"|/opt/livos/packages/ui/dist|@livos/ui"
    "cd \"\$NEXUS_DIR/packages/core\" && npx tsc|/opt/nexus/packages/core/dist|@nexus/core"
    "cd \"\$NEXUS_DIR/packages/worker\" && npx tsc|/opt/nexus/packages/worker/dist|@nexus/worker"
    "cd \"\$NEXUS_DIR/packages/mcp-server\" && npx tsc|/opt/nexus/packages/mcp-server/dist|@nexus/mcp-server"
)

wire_verify_call() {
    local build_pat="$1"
    local outdir="$2"
    local pkg="$3"
    local verify_call="verify_build \"$pkg\" \"$outdir\""

    if grep -qF "$verify_call" "$UPDATE_SH"; then
        echo "ALREADY-PATCHED (BUILD-01 call): $pkg verify already wired"
        return 0
    fi

    # Find last non-comment occurrence of the build-invocation pattern.
    local build_line
    build_line=$(grep -nF "$build_pat" "$UPDATE_SH" | grep -v ':[[:space:]]*#' | tail -1 | cut -d: -f1 || true)
    if [[ -z "$build_line" ]]; then
        echo "INFO: build invocation matching '$build_pat' not found — skipping verify wiring for $pkg"
        return 0
    fi

    local insert_at=$((build_line + 1))
    # Use awk to insert; sed -i's `i\` syntax is fragile across BSD/GNU sed
    awk -v line="$insert_at" -v call="$verify_call" '
        NR == line { print call }
        { print }
    ' "$UPDATE_SH" > "$UPDATE_SH.new"
    mv "$UPDATE_SH.new" "$UPDATE_SH"
    chmod +x "$UPDATE_SH"
    echo "PATCH-OK (BUILD-01 call): wired verify_build for $pkg after line $build_line"
}

for entry in "${BUILD_VERIFICATIONS[@]}"; do
    IFS='|' read -r build_pat outdir pkg <<< "$entry"
    wire_verify_call "$build_pat" "$outdir" "$pkg"
done

for entry in "${LEGACY_BUILD_VERIFICATIONS[@]}"; do
    IFS='|' read -r build_pat outdir pkg <<< "$entry"
    wire_verify_call "$build_pat" "$outdir" "$pkg"
done

# ─────────────────────────────────────────────────────────────────────────────
# Patch 3/4: BUILD-02 — replace single-target dist-copy with a loop over ALL
#                       @nexus+core* pnpm-store resolution dirs
# ─────────────────────────────────────────────────────────────────────────────
if grep -qF "$MARKER_LOOP" "$UPDATE_SH"; then
    echo "ALREADY-PATCHED (BUILD-02): multi-dir dist-copy loop present"
else
    # Anchor: existing single-target find line (BACKLOG 999.5b verbatim).
    OLD_FIND_LINE=$(grep -n '@nexus+core\*' "$UPDATE_SH" | grep -F 'head -1' | head -1 | cut -d: -f1 || true)
    if [[ -z "$OLD_FIND_LINE" ]]; then
        # Fallback: any line referencing @nexus+core* assignment
        OLD_FIND_LINE=$(grep -n 'local_pnpm_nexus=' "$UPDATE_SH" | head -1 | cut -d: -f1 || true)
    fi
    if [[ -z "$OLD_FIND_LINE" ]]; then
        echo "WARN: cannot find @nexus+core* dist-copy anchor — skipping BUILD-02 (already removed?)"
    else
        # Find end of the existing dist-copy block — heuristic:
        #   The block is `local_pnpm_nexus=$(find ...); if [[ -n ... ]]; then cp -r ...; ok ...; fi`
        #   End = the line containing `fi` after the `if` opener, OR the `ok "Nexus dist linked"` line + 1.
        END_LINE=$(awk -v start="$OLD_FIND_LINE" '
            NR > start && /^[[:space:]]*fi[[:space:]]*$/ { print NR + 1; exit }
        ' "$UPDATE_SH" || true)
        if [[ -z "$END_LINE" ]]; then
            # Fallback: stop after 6 lines (the original block is 5 lines)
            END_LINE=$((OLD_FIND_LINE + 6))
        fi

        REPLACEMENT=$(mktemp)
        cat <<'EOLOOP' > "$REPLACEMENT"
    # ── Phase 31 BUILD-02: multi-dir dist-copy loop ──
    # Replaces the `find ... | head -1` single-target bug (BACKLOG 999.5b).
    # Copies @nexus/core dist into ALL pnpm-store resolution dirs so livinityd
    # always picks up fresh dist regardless of which dir its symlink resolves to.
    NEXUS_CORE_DIST_SRC="$NEXUS_DIR/packages/core/dist"
    if [[ ! -d "$NEXUS_CORE_DIST_SRC" ]] || [[ -z "$(find "$NEXUS_CORE_DIST_SRC" -type f 2>/dev/null | head -1)" ]]; then
        echo "DIST-COPY-FAIL: source $NEXUS_CORE_DIST_SRC is empty — nexus core build did not emit" >&2
        exit 1
    fi
    COPY_COUNT=0
    for store_dir in /opt/livos/node_modules/.pnpm/@nexus+core*/; do
        [[ -d "$store_dir" ]] || continue
        target_parent="${store_dir}node_modules/@nexus/core"
        target="${target_parent}/dist"
        mkdir -p "$target_parent"
        rm -rf "$target"
        cp -r "$NEXUS_CORE_DIST_SRC" "$target"
        if [[ -z "$(find "$target" -type f 2>/dev/null | head -1)" ]]; then
            echo "DIST-COPY-FAIL: post-copy target $target is empty" >&2
            exit 1
        fi
        COPY_COUNT=$((COPY_COUNT + 1))
        echo "[VERIFY] nexus core dist copied to $store_dir"
    done
    if [[ "$COPY_COUNT" -eq 0 ]]; then
        echo "DIST-COPY-FAIL: no @nexus+core* dirs found under /opt/livos/node_modules/.pnpm/" >&2
        exit 1
    fi
    ok "Nexus dist linked to $COPY_COUNT pnpm-store resolution dir(s)"
EOLOOP

        # Splice: keep [1..OLD_FIND_LINE-1], insert REPLACEMENT, keep [END_LINE..end]
        head -n $((OLD_FIND_LINE - 1)) "$UPDATE_SH" > "$UPDATE_SH.new"
        cat "$REPLACEMENT" >> "$UPDATE_SH.new"
        tail -n +"$END_LINE" "$UPDATE_SH" >> "$UPDATE_SH.new"
        mv "$UPDATE_SH.new" "$UPDATE_SH"
        chmod +x "$UPDATE_SH"
        rm -f "$REPLACEMENT"
        echo "PATCH-OK (BUILD-02): dist-copy loop spliced (replaced lines $OLD_FIND_LINE..$((END_LINE - 1)))"
    fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Patch 4/4: BUILD-03 — root-cause-specific cleanup
# ─────────────────────────────────────────────────────────────────────────────
# Per Plan 01 (31-ROOT-CAUSE.md "Verdict" + "Recommended Remediation"):
#   - Headline trigger is INCONCLUSIVE (no controlled live repro available).
#   - `set -euo pipefail` is already present (line 8) on both hosts — H6 ruled
#     out for headline symptom. If a future host lacks it, inject it.
#   - Worker/mcp-server `2>/dev/null && cd ... || cd ...` exit-code masking IS
#     a confirmed bug by code reading (item #5) — strip it so failures bubble.
#   - Memory-build block is missing on Server4 (incidental finding from host
#     diff, item #6) — inject if absent.
#
# This block is a no-op on already-patched scripts (marker short-circuit).
if grep -qF "$MARKER_RC" "$UPDATE_SH"; then
    echo "ALREADY-PATCHED (BUILD-03): root-cause marker present"
else
    # Sub-step (a): ensure `set -euo pipefail` is present near the top.
    if ! head -15 "$UPDATE_SH" | grep -qF 'set -euo pipefail'; then
        # Inject as line 2 (after shebang). Use awk to keep portable.
        awk 'NR == 1 { print; print "set -euo pipefail"; next } { print }' \
            "$UPDATE_SH" > "$UPDATE_SH.new"
        mv "$UPDATE_SH.new" "$UPDATE_SH"
        chmod +x "$UPDATE_SH"
        echo "PATCH-OK (BUILD-03 sub-a): set -euo pipefail injected at line 2"
    else
        echo "INFO (BUILD-03 sub-a): set -euo pipefail already present (no action)"
    fi

    # Sub-step (b): strip worker/mcp-server `2>/dev/null && cd ... || cd ...`
    # exit-code masking. Replace with bare `cd ... && npx tsc && cd ...`.
    # Pattern matches both worker and mcp-server lines from Plan 01 snapshot.
    if grep -qE 'cd "\$NEXUS_DIR/packages/(worker|mcp-server)" && npx tsc 2>/dev/null && cd "\$NEXUS_DIR" \|\| cd "\$NEXUS_DIR"' "$UPDATE_SH"; then
        # Use awk for portable in-place edit (sed -i differs BSD vs GNU)
        awk '
            {
                gsub(/cd "\$NEXUS_DIR\/packages\/worker" && npx tsc 2>\/dev\/null && cd "\$NEXUS_DIR" \|\| cd "\$NEXUS_DIR"/,
                     "cd \"$NEXUS_DIR/packages/worker\" && npx tsc && cd \"$NEXUS_DIR\"")
                gsub(/cd "\$NEXUS_DIR\/packages\/mcp-server" && npx tsc 2>\/dev\/null && cd "\$NEXUS_DIR" \|\| cd "\$NEXUS_DIR"/,
                     "cd \"$NEXUS_DIR/packages/mcp-server\" && npx tsc && cd \"$NEXUS_DIR\"")
                print
            }
        ' "$UPDATE_SH" > "$UPDATE_SH.new"
        mv "$UPDATE_SH.new" "$UPDATE_SH"
        chmod +x "$UPDATE_SH"
        echo "PATCH-OK (BUILD-03 sub-b): stripped worker/mcp-server exit-code masking"
    else
        echo "INFO (BUILD-03 sub-b): worker/mcp-server masking already removed (no action)"
    fi

    # Sub-step (c): inject memory-build block on Server4 if missing.
    # Detection: Mini PC has `Building Nexus memory` echo; Server4 does not.
    if ! grep -qF 'Building Nexus memory' "$UPDATE_SH"; then
        # Anchor: insert AFTER the `ok "Nexus core built"` line (or its
        # verify_build wiring). Use the `ok "Nexus core built"` line itself
        # as the anchor — present on both hosts.
        CORE_OK_LINE=$(grep -n 'ok "Nexus core built"' "$UPDATE_SH" | head -1 | cut -d: -f1 || true)
        if [[ -z "$CORE_OK_LINE" ]]; then
            echo "WARN (BUILD-03 sub-c): cannot find 'ok \"Nexus core built\"' anchor — skipping memory-block injection"
        else
            INSERT_AT=$((CORE_OK_LINE + 1))
            MEMORY_BLOCK=$(mktemp)
            cat <<'EOMEM' > "$MEMORY_BLOCK"

    # ── Phase 31 BUILD-03: memory-build injection ──
    # Server4 originally lacked a memory-build step (Mini PC has it). This
    # block aligns both hosts so liv-memory.service no longer crash-loops on
    # a missing dist after update.sh runs on Server4.
    if [[ -d "$NEXUS_DIR/packages/memory" ]]; then
        info "Building Nexus memory..."
        cd "$NEXUS_DIR/packages/memory"
        npm run build 2>&1 | tail -3
        cd "$NEXUS_DIR"
        verify_build "@nexus/memory" "/opt/nexus/packages/memory/dist"
        ok "Nexus memory built"
    fi
EOMEM
            awk -v line="$INSERT_AT" -v patchfile="$MEMORY_BLOCK" '
                BEGIN { while ((getline pl < patchfile) > 0) patch = patch pl ORS }
                NR == line { printf "%s", patch }
                { print }
            ' "$UPDATE_SH" > "$UPDATE_SH.new"
            mv "$UPDATE_SH.new" "$UPDATE_SH"
            chmod +x "$UPDATE_SH"
            rm -f "$MEMORY_BLOCK"
            echo "PATCH-OK (BUILD-03 sub-c): memory-build block injected after line $CORE_OK_LINE"
        fi
    else
        echo "INFO (BUILD-03 sub-c): memory-build block already present (no action — Mini PC config)"
    fi

    # Final BUILD-03: drop the verdict marker so re-runs short-circuit.
    # Insert a single comment line near the top documenting the inconclusive
    # verdict + safety-net design. This is the BUILD-03 idempotency anchor.
    awk -v marker="$MARKER_RC" '
        NR == 2 && !done {
            print
            print marker
            print "# Trigger root cause: INCONCLUSIVE per 31-ROOT-CAUSE.md (no controlled repro)."
            print "# BUILD-01 verify_build guard above is the safety net — if it ever fires"
            print "# in production, OBS-01 update-history will pin which contributing factor"
            print "# (H4 lockfile fallback / H5 race / unknown) was active that run."
            done = 1
            next
        }
        { print }
    ' "$UPDATE_SH" > "$UPDATE_SH.new"
    mv "$UPDATE_SH.new" "$UPDATE_SH"
    chmod +x "$UPDATE_SH"
    echo "PATCH-OK (BUILD-03): verdict marker recorded near top of script"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Final safety net: bash syntax check on the patched script
# ─────────────────────────────────────────────────────────────────────────────
if ! bash -n "$UPDATE_SH"; then
    echo "FATAL: patched $UPDATE_SH failed bash syntax check — restoring backup" >&2
    cp "$UPDATE_SH.pre-phase31" "$UPDATE_SH"
    chmod +x "$UPDATE_SH"
    echo "RESTORED: $UPDATE_SH reverted to pre-phase31 backup" >&2
    exit 1
fi

echo
echo "=== PHASE 31 PATCH COMPLETE ==="
echo "Backup:  $UPDATE_SH.pre-phase31"
echo "Patched: $UPDATE_SH"
echo "Markers present:"
grep -n -E "Phase 31 BUILD-(01|02|03)" "$UPDATE_SH" | head -20 || true
echo
echo "verify_build call sites:"
grep -n 'verify_build "' "$UPDATE_SH" | head -20 || true
