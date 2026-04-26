#!/bin/bash
set -euo pipefail

# Phase 30 UPD-03 patch for /opt/livos/update.sh
# Inserts a "Recording deployed SHA" step BEFORE "Step 9: Cleanup".

UPDATE_SH="/opt/livos/update.sh"

if grep -q 'Recording deployed SHA' "$UPDATE_SH"; then
    echo "ALREADY-PATCHED: $UPDATE_SH already contains 'Recording deployed SHA'"
    exit 0
fi

# Locate the cleanup-step marker line
TARGET_LINE=$(grep -n '^# ── Step 9: Cleanup' "$UPDATE_SH" | head -1 | cut -d: -f1)
if [[ -z "$TARGET_LINE" ]]; then
    echo "ERROR: could not find '# ── Step 9: Cleanup' marker in $UPDATE_SH"
    exit 1
fi

INSERT_AT=$((TARGET_LINE - 1))
echo "Inserting Phase 30 UPD-03 patch BEFORE line $TARGET_LINE (Step 9: Cleanup) of $UPDATE_SH"

# Build the patch block in a temp file
PATCH_BLOCK=$(mktemp)
cat <<'EOPATCH' > "$PATCH_BLOCK"
# ── Phase 30 UPD-03: Record deployed SHA ──────────────────
step "Recording deployed SHA"
if [[ -d "$TEMP_DIR/.git" ]]; then
    if git -C "$TEMP_DIR" rev-parse HEAD > /opt/livos/.deployed-sha 2>/dev/null; then
        chmod 644 /opt/livos/.deployed-sha 2>/dev/null || true
        ok "Deployed SHA recorded: $(cat /opt/livos/.deployed-sha | cut -c1-7)"
    else
        warn "Could not record deployed SHA (livinityd update notifications may be inaccurate)"
    fi
else
    warn "TEMP_DIR/.git not found; skipping .deployed-sha write"
fi

EOPATCH

# Use sed to insert PATCH_BLOCK BEFORE the cleanup-step marker
# Method: read patch block as a file, insert via sed 'r' then move
# Simpler: use awk to splice
awk -v line="$TARGET_LINE" -v patchfile="$PATCH_BLOCK" '
    BEGIN {
        while ((getline pl < patchfile) > 0) patch = patch pl ORS
    }
    NR == line { printf "%s", patch }
    { print }
' "$UPDATE_SH" > "$UPDATE_SH.new"

mv "$UPDATE_SH.new" "$UPDATE_SH"
chmod +x "$UPDATE_SH"
rm -f "$PATCH_BLOCK"

echo "PATCH-OK: $UPDATE_SH patched. Verifying..."
grep -n -A 12 'Recording deployed SHA' "$UPDATE_SH" | head -20
