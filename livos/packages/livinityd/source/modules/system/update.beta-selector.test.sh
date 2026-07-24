#!/bin/bash
# update.beta-selector.test.sh — Phase 311 CR-01 shell-side proof (NON-destructive)
#
# Proves that update.sh's BETA-channel "latest tag" selector picks the same tag
# that the TS pickMaxReleaseTag selector picks, for a shared input set — closing
# the two-sided-consistency gap the code review surfaced (UPDSAFE-01 / CR-01).
#
# The headline case: a beta cut that is later promoted to its own final release.
# Raw `sort -V` is NOT semver-prerelease-aware and would pick the OLDER beta
# (a perpetual, non-actionable "update available" nag). update.sh maps the
# prerelease separator "-" to a Debian "~" (which GNU `sort -V` sorts BEFORE
# the release) so it correctly resolves the final.
#
# SemVer migration hardening (v1.1.1-beta.1 cut, 2026-07-24): the pipeline now
# FIRST filters to strict 3-part vMAJOR.MINOR.PATCH[-prerelease] tags. Legacy
# 2-part tags (v45.30, v45.31-beta.11) are dropped — under sort -V they outrank
# the entire v1.x line forever, so a post-migration beta could never be selected
# and a beta-channel box would re-deploy the stale legacy prerelease.
#
# This is a PURE, offline, side-effect-free test: it only pipes strings through
# the exact pipeline used in update.sh. Safe to run in CI / the 311-05 gate.
# Requires GNU coreutils `sort` (the `~` semantics are GNU/Debian-specific).

set -euo pipefail

# EXACT mirror of update.sh's beta-branch pipeline (both the jq + non-jq paths
# use the identical filter + `sed 's/-/~/' | sort -V | tail -1 | sed 's/~/-/'`).
# `|| true` on the grep: an all-legacy input yields an empty selection (graceful
# no-update), not a pipefail death.
beta_select() {
    { grep -E '^v?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$' || true; } \
        | sed 's/-/~/' | sort -V | tail -1 | sed 's/~/-/'
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
        echo "PASS  $name: [$tags] -> '$got'"
    else
        echo "FAIL  $name: [$tags] -> got '$got', expected '$expected'" >&2
        return 1
    fi
}

fail=0
# The promotion bug (was resolving the OLDER beta before the CR-01 fix):
run_case "promotion"       "v1.1.0
v1.1.1-beta.1
v1.1.1"        "v1.1.1"        || fail=1
# Order-independence (GitHub returns created_at DESC = final first):
run_case "reversed-order"  "v1.1.1
v1.1.1-beta.1
v1.1.0"        "v1.1.1"        || fail=1
# Beta only on the channel -> the beta is correctly the newest:
run_case "beta-only"       "v1.1.0
v1.1.1-beta.1"               "v1.1.1-beta.1" || fail=1
# Stable-shaped tags only -> unaffected by the mapping:
run_case "stable-only"     "v1.1.0
v1.1.1"                      "v1.1.1"        || fail=1
# Numeric prerelease ordering (beta.10 > beta.2 > beta.1, not lexical):
run_case "numeric-beta"    "v1.1.1-beta.1
v1.1.1-beta.2
v1.1.1-beta.10"              "v1.1.1-beta.10" || fail=1
# SemVer migration: legacy 2-part tags are DROPPED, the v1.x beta wins:
run_case "legacy-dropped"  "v45.31-beta.11
v45.30
v1.1.1-beta.1"               "v1.1.1-beta.1" || fail=1
# All-legacy input -> empty selection (graceful no-update), not a crash:
run_case "all-legacy-empty" "v45.30
v45.31-beta.11"              ""              || fail=1

if [[ "$fail" == "0" ]]; then
    echo "ALL PASS — update.sh beta selector agrees with pickMaxReleaseTag (CR-01 + SemVer migration)."
    exit 0
else
    echo "FAILURES — update.sh beta selector disagrees with pickMaxReleaseTag." >&2
    exit 1
fi
