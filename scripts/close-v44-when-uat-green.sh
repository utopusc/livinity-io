#!/usr/bin/env bash
#
# close-v44-when-uat-green.sh
#
# Operator-run milestone-close script for v44.0 — Liv AI Tooling Depth.
#
# This script archives v44.0 to .planning/milestones/v44/ AFTER the operator
# has walked .planning/v44-OPERATOR-WALK.md and ticked every mandatory row in
# .planning/v44-UAT-CONSOLIDATED.md to [x] (or [~] N/A where allowed —
# Phase 248 item F only, for single-tenant Mini PC).
#
# It MUST NOT be invoked from the executor / planner / verifier — only the
# human operator runs it. Per project memory feedback_milestone_uat_gate.md:
# "Never declare milestone passed without UAT" — this is the gate.
#
# Behavior (ordered):
#   1. Sanity banner + 5-second Enter-to-continue confirmation.
#   2. Pre-check 1: repo root contains .planning/v44-UAT-CONSOLIDATED.md.
#   3. Pre-check 2: sacred repo blob SHA (D-V44-SACRED) matches expected.
#   4. Pre-check 3: zero mandatory '[ ]' rows remain in v44-UAT-CONSOLIDATED.md.
#   5. Pre-check 4: Mini PC AionUi binary sha256 matches (skipped if no SSH).
#   6. Action 1:    mkdir .planning/milestones/v44.
#   7. Action 2:    cp v44 phase SUMMARYs + consolidated/walk into archive.
#   8. Action 3:    generate .planning/milestones/v44/v44-MILESTONE-CLOSED.md.
#   9. Action 4:    print next manual step (operator runs /gsd-complete-milestone v44.0).
#
# Exit codes:
#   0 success
#   2 .planning/v44-UAT-CONSOLIDATED.md missing
#   3 sacred SHA mismatch (D-V44-SACRED violated)
#   4 mandatory UAT items still unticked
#   5 Mini PC AionUi binary sha256 mismatch (D-V44-SACRED violated)
#
set -euo pipefail

# -----------------------------------------------------------------------------
# Locked invariants — D-V44-SACRED
# -----------------------------------------------------------------------------
EXPECTED_SHA="f3538e1d811992b782a9bb057d1b7f0a0189f95f"
EXPECTED_BIN_SHA="293a49927b408a264660a1136087c05cdf39c4c63a4dd68aa5fdfe30c53fb04b"
MINI_PC_HOST="bruce@10.69.31.68"

# -----------------------------------------------------------------------------
# Banner + confirmation
# -----------------------------------------------------------------------------
cat <<'BANNER'

================================================================
v44.0 — Liv AI Tooling Depth: MILESTONE CLOSE SCRIPT
================================================================

This script archives v44.0 to .planning/milestones/v44/.

ONLY run it AFTER:
  1. You have walked .planning/v44-OPERATOR-WALK.md end-to-end.
  2. Every mandatory item in .planning/v44-UAT-CONSOLIDATED.md is [x]
     (or [~] N/A for Phase 248 item F on single-tenant Mini PC).
  3. The §10 audit trail at the bottom of v44-UAT-CONSOLIDATED.md
     is filled in with operator name + date + Mini PC SHA.

Per feedback_milestone_uat_gate.md ("Never declare milestone passed
without UAT — v29.4 shipped broken after 4× human_needed deferrals"),
this script REFUSES to run if any mandatory UAT row is still unticked.

================================================================
BANNER

# 5-second soft-confirm gate (Ctrl-C to abort). Defaults to "continue".
# read -t may exit non-zero if timeout expires; tolerate that under set -e.
set +e
read -t 5 -p "Press Enter to continue or Ctrl-C to abort: " _REPLY
set -e
echo ""

# -----------------------------------------------------------------------------
# Pre-check 1: repo root
# -----------------------------------------------------------------------------
if [ ! -f ".planning/v44-UAT-CONSOLIDATED.md" ]; then
  echo "FATAL: .planning/v44-UAT-CONSOLIDATED.md not found." >&2
  echo "       Run this script from the repo root (the directory that contains" >&2
  echo "       the .planning/ tree)." >&2
  exit 2
fi
echo "[ok] .planning/v44-UAT-CONSOLIDATED.md present."

# -----------------------------------------------------------------------------
# Pre-check 2: sacred repo blob SHA (D-V44-SACRED)
# -----------------------------------------------------------------------------
ACTUAL_SHA=$(git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts)
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
  echo "FATAL: sacred SHA mismatch on liv/packages/core/src/sdk-agent-runner.ts." >&2
  echo "       Expected: $EXPECTED_SHA" >&2
  echo "       Actual:   $ACTUAL_SHA" >&2
  echo "       D-V44-SACRED VIOLATED. Do NOT close v44." >&2
  exit 3
fi
echo "[ok] sacred repo blob SHA verified: $EXPECTED_SHA"

# -----------------------------------------------------------------------------
# Pre-check 3: UAT mandatory tick gate
#   - Counts lines matching: '^- \[ \] \*\*(UAT-[1-7]|[A-G]\.)'
#   - '[~] N/A ...' satisfies mandatory (Phase 248 item F may be N/A).
# -----------------------------------------------------------------------------
UNTICKED=$(grep -cE '^- \[ \] \*\*(UAT-[1-7]|[A-G]\.)' .planning/v44-UAT-CONSOLIDATED.md || true)
if [ "$UNTICKED" -gt 0 ]; then
  echo "FATAL: $UNTICKED mandatory UAT items still unticked in" >&2
  echo "       .planning/v44-UAT-CONSOLIDATED.md." >&2
  echo "" >&2
  echo "Unticked items:" >&2
  grep -nE '^- \[ \] \*\*(UAT-[1-7]|[A-G]\.)' .planning/v44-UAT-CONSOLIDATED.md >&2 || true
  echo "" >&2
  echo "Walk .planning/v44-OPERATOR-WALK.md to complete the UAT first." >&2
  exit 4
fi
echo "[ok] all mandatory UAT items ticked (or [~] N/A where allowed)."

# -----------------------------------------------------------------------------
# Pre-check 4: Mini PC binary sacred sha256 (optional — skipped if no SSH)
# -----------------------------------------------------------------------------
if ssh -o ConnectTimeout=5 -o BatchMode=yes "$MINI_PC_HOST" true 2>/dev/null; then
  ACTUAL_BIN_SHA=$(ssh "$MINI_PC_HOST" 'sha256sum /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore' | awk '{print $1}')
  if [ "$ACTUAL_BIN_SHA" != "$EXPECTED_BIN_SHA" ]; then
    echo "FATAL: AionUi binary sha256 mismatch on Mini PC." >&2
    echo "       Expected: $EXPECTED_BIN_SHA" >&2
    echo "       Actual:   $ACTUAL_BIN_SHA" >&2
    echo "       D-V44-SACRED VIOLATED. Do NOT close v44." >&2
    exit 5
  fi
  echo "[ok] Mini PC AionUi binary sha256 verified: $EXPECTED_BIN_SHA"
else
  echo "[warn] No SSH reachability to $MINI_PC_HOST — skipping binary sha256 check."
  echo "       Operator MUST verify manually before flipping ROADMAP:"
  echo "         ssh $MINI_PC_HOST 'sha256sum /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore'"
  echo "         expected: $EXPECTED_BIN_SHA"
fi

# -----------------------------------------------------------------------------
# Action 1: create milestone archive dir
# -----------------------------------------------------------------------------
mkdir -p .planning/milestones/v44
echo "[ok] created .planning/milestones/v44/"

# -----------------------------------------------------------------------------
# Action 2: copy v44 phase SUMMARYs + consolidated + walk into archive
# -----------------------------------------------------------------------------
for PHASE_DIR in 246-terminal-v2-multi-session 247-luse-skill-v2-docs 248-luse-display-lifecycle 249-v44-e2e-uat-close; do
  # ${PHASE_DIR%%-*} extracts the leading number (246, 247, 248, 249)
  PHASE_NUM="${PHASE_DIR%%-*}"
  SRC=".planning/phases/${PHASE_DIR}/${PHASE_NUM}-SUMMARY.md"
  if [ -f "$SRC" ]; then
    cp "$SRC" ".planning/milestones/v44/${PHASE_NUM}-SUMMARY.md"
    echo "[ok] archived $SRC"
  else
    echo "[warn] $SRC not found — skipping (this may indicate an incomplete phase)."
  fi
done

cp .planning/v44-UAT-CONSOLIDATED.md .planning/milestones/v44/v44-UAT-CONSOLIDATED.md
cp .planning/v44-OPERATOR-WALK.md .planning/milestones/v44/v44-OPERATOR-WALK.md
echo "[ok] archived v44-UAT-CONSOLIDATED.md + v44-OPERATOR-WALK.md"

# -----------------------------------------------------------------------------
# Action 3: generate v44-MILESTONE-CLOSED.md (mirrors v43 precedent)
# -----------------------------------------------------------------------------
CLOSED_DATE=$(date +%F)
HEAD_SHA=$(git rev-parse --short HEAD)

cat > .planning/milestones/v44/v44-MILESTONE-CLOSED.md <<MDEND
---
milestone: v44.0
name: Liv AI Tooling Depth
opened: 2026-05-28
closed: ${CLOSED_DATE}
status: closed (operator-walked v44 UAT GREEN on ${CLOSED_DATE})
phases_shipped: 4
git_tag: v44.0
sacred_sha_preserved: ${EXPECTED_SHA}
sacred_aionui_sha256: ${EXPECTED_BIN_SHA}
closed_at_head: ${HEAD_SHA}
locked_invariants:
  - D-V44-SACRED
  - D-V44-MINI-PC-ONLY
  - D-V44-CADDY-REUSE-226-04
  - D-V44-NO-ROOT-PTY
  - D-V44-DISPLAY-XEPHYR-DEFAULT
  - D-V44-DISPLAY-OWNER-SCOPED
  - D-V44-TERMINAL-SCROLLBACK-RING
---

# v44.0 — Liv AI Tooling Depth — CLOSED

**Opened:** 2026-05-28
**Closed:** ${CLOSED_DATE}
**Phases shipped:** 4 (P246, P247, P248, P249)
**Git tag:** v44.0
**HEAD at close:** ${HEAD_SHA}

## Headline accomplishments

- **Terminal v2 (P246):** Multi-session PTY with browser-local reattach via Redis scrollback ring (10000 lines), 24h idle TTL GC, admin "Active terminals" panel with Kill button, gated by \`livos:v43:terminal_panel\` flag.
- **Luse skill set v2 (P247):** 848 lines of production reference docs (PATTERNS / ANTI-PATTERNS / CHEAT-SHEET / TROUBLESHOOTING / INTEGRATION-RECIPES / KNOWN-LIMITS) propagated to all 4 shimmed CLI agents via idempotent sync script.
- **Luse display lifecycle (P248):** Xephyr/Xvfb nested-X-server spawn + owner-scoped kill + 4 new MCP tools (create / list / kill / launch_app_in_display) + computer_application gains display arg, gated by D-V44-DISPLAY-OWNER-SCOPED.

## Phase inventory

| Phase | Name                                  | Plans | Status              |
| ----- | ------------------------------------- | ----- | ------------------- |
| 246   | Terminal v2 multi-session             | 6/6   | SHIPPED (UAT GREEN) |
| 247   | Luse skill v2 docs                    | 2/2   | SHIPPED             |
| 248   | Luse display lifecycle                | 5/5   | SHIPPED (UAT GREEN) |
| 249   | v44 E2E UAT + milestone close         | 1/1   | SHIPPED             |

## Locked invariants (preserved end-to-end)

- **D-V44-SACRED** — \`liv/packages/core/src/sdk-agent-runner.ts\` SHA = \`${EXPECTED_SHA}\` (verified at close).
- **D-V44-MINI-PC-ONLY** — Only deployment target is \`${MINI_PC_HOST}\`; no other hosts touched (HARD RULE 2026-04-27).
- **D-V44-CADDY-REUSE-226-04** — \`caddy.ts\` unchanged across all v44 commits.
- **D-V44-NO-ROOT-PTY** — All v44 PTY work runs as \`bruce\`, not root.
- **D-V44-DISPLAY-XEPHYR-DEFAULT** — \`computer_create_display\` defaults to mode='xephyr'.
- **D-V44-DISPLAY-OWNER-SCOPED** — Only the creator session can kill its own displays.
- **D-V44-TERMINAL-SCROLLBACK-RING** — \`SCROLLBACK_MAX_LINES = 10000\` drift-locked.

## Sacred-SHA verification at close

\`\`\`
git rev-parse HEAD:liv/packages/core/src/sdk-agent-runner.ts
# Expected: ${EXPECTED_SHA}
sha256sum /opt/liv-assistant/current/bundled-aioncore/linux-x64/aioncore
# Expected: ${EXPECTED_BIN_SHA}
\`\`\`

## Artifacts archived in this directory

- \`246-SUMMARY.md\` — Phase 246 aggregate
- \`247-SUMMARY.md\` — Phase 247 aggregate
- \`248-SUMMARY.md\` — Phase 248 aggregate
- \`249-SUMMARY.md\` — Phase 249 aggregate
- \`v44-UAT-CONSOLIDATED.md\` — Operator UAT index with audit trail
- \`v44-OPERATOR-WALK.md\` — Sequenced browser walk
- \`v44-MILESTONE-CLOSED.md\` — This file

## Operator notes

(Fill in any notable observations from the UAT walk — especially around
rename-revert (UAT-3 → UAT-4), PTY-survives-close semantics (UAT-7),
display singleton path (E), or item F's single-tenant N/A status.)
MDEND
echo "[ok] generated .planning/milestones/v44/v44-MILESTONE-CLOSED.md"

# -----------------------------------------------------------------------------
# Action 4: print next manual step (do NOT auto-invoke /gsd-complete-milestone)
# -----------------------------------------------------------------------------
echo ""
echo "================================================================"
echo "v44.0 milestone artifacts archived to .planning/milestones/v44/"
echo ""
echo "Next manual steps:"
echo "  1. Review .planning/milestones/v44/v44-MILESTONE-CLOSED.md"
echo "     (fill in operator notes if any)."
echo "  2. In Claude Code, run: /gsd-complete-milestone v44.0"
echo "  3. After GSD completes, commit and tag:"
echo "       git add .planning/ scripts/close-v44-when-uat-green.sh"
echo "       git commit -m \"docs(v44): close milestone — operator UAT GREEN\""
echo "       git tag v44.0"
echo "================================================================"

exit 0
