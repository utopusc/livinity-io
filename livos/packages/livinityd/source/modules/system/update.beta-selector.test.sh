#!/bin/bash
# update.beta-selector.test.sh — Phase 311 CR-01 shell-side proof (NON-destructive)
#
# Proves that update.sh's BETA-channel "latest tag" selector picks the same tag
# that the TS pickMaxReleaseTag selector picks, for a shared input set — closing
# the two-sided-consistency gap the code review surfaced (UPDSAFE-01 / CR-01).
#
# The headline case: a beta cut (v44.2-beta.1) that is later promoted to its own
# final release (v44.2). Raw `sort -V` is NOT semver-prerelease-aware and would
# pick the OLDER v44.2-beta.1 (a perpetual, non-actionable "update available"
# nag). update.sh maps the prerelease separator "-" to a Debian "~" (which GNU
# `sort -V` sorts BEFORE the release) so it now correctly resolves v44.2.
#
# This is a PURE, offline, side-effect-free test: it only pipes strings through
# the exact pipeline used in update.sh. Safe to run in CI / the 311-05 gate.
# Requires GNU coreutils `sort` (the `~` semantics are GNU/Debian-specific).

set -euo pipefail

# EXACT mirror of update.sh's beta-branch pipeline (both the jq + non-jq paths
# use the identical `sed 's/-/~/' | sort -V | tail -1 | sed 's/~/-/'`).
beta_select() {
    sed 's/-/~/' | sort -V | tail -1 | sed 's/~/-/'
}

# Guard: this proof is only meaningful on a GNU sort (matches the Ubuntu box).
if ! sort --version 2>/dev/null | grep -qi coreutils; then
    echo "SKIP: GNU coreutils sort not found — the ~-before-release semantics are GNU-specific." >&2
    exit 0
fi

# Shared input set — MUST agree with CROSS_SELECTOR_CASES in update.beta.unit.test.ts
# and with pickMaxReleaseTag in update.ts.
#   tags (newline-separated) | expected winner
run_case() {
    local name="$1" tags="$2" expected="$3"
    local got
    got=$(printf '%s\n' "$tags" | beta_select)
    if [[ "$got" == "$expected" ]]; then
        echo "PASS  $name: [$tags] -> $got"
    else
        echo "FAIL  $name: [$tags] -> got '$got', expected '$expected'" >&2
        return 1
    fi
}

fail=0
# The promotion bug (was resolving the OLDER beta before the fix):
run_case "promotion"       "v44.1
v44.2-beta.1
v44.2"        "v44.2"        || fail=1
# Order-independence (GitHub returns created_at DESC = final first):
run_case "reversed-order"  "v44.2
v44.2-beta.1
v44.1"        "v44.2"        || fail=1
# Beta only on the channel -> the beta is correctly the newest:
run_case "beta-only"       "v44.1
v44.2-beta.1"               "v44.2-beta.1" || fail=1
# Stable-shaped tags only -> unaffected by the mapping:
run_case "stable-only"     "v44.1
v44.2"                      "v44.2"        || fail=1
# Numeric prerelease ordering (beta.10 > beta.2 > beta.1, not lexical):
run_case "numeric-beta"    "v44.2-beta.1
v44.2-beta.2
v44.2-beta.10"              "v44.2-beta.10" || fail=1

if [[ "$fail" == "0" ]]; then
    echo "ALL PASS — update.sh beta selector agrees with pickMaxReleaseTag (CR-01 closed)."
    exit 0
else
    echo "FAILURES — update.sh beta selector disagrees with pickMaxReleaseTag." >&2
    exit 1
fi
