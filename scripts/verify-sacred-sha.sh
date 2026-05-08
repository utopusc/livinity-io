#!/usr/bin/env bash
#
# Phase 97-03 — Sacred-SHA verification harness.
#
# The file `liv/packages/core/src/sdk-agent-runner.ts` is the LivOS SDK
# agent runner — its content has been intentionally locked to a specific
# git blob SHA so wrapper extensions (LivAgentRunner, mcp-client-manager,
# etc.) cannot drift into accidental edits of the runner itself.
#
# This script computes the working-tree blob SHA of the sacred file and
# compares it against the locked constant. Exits 0 on PASS, non-zero on
# FAIL with a clear message that names the constraint and points at the
# phase context for diagnosis.
#
# Reference: .planning/phases/97-auto-mode/97-CONTEXT.md (Sacred constraints).
#
# Usage:
#   bash scripts/verify-sacred-sha.sh
#
# Returns:
#   0 — PASS, sacred file unchanged.
#   1 — FAIL, sacred file SHA differs from locked constant.
#   2 — Setup error (missing git, missing file, etc).

set -eu

LOCKED_SHA="f3538e1d811992b782a9bb057d1b7f0a0189f95f"
SACRED_FILE="liv/packages/core/src/sdk-agent-runner.ts"

# Locate repo root by walking up to the directory containing .git.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ ! -d "$REPO_ROOT/.git" ]; then
	echo "[verify-sacred-sha] FAIL: not in a git working tree (REPO_ROOT=$REPO_ROOT)" >&2
	exit 2
fi

if [ ! -f "$REPO_ROOT/$SACRED_FILE" ]; then
	echo "[verify-sacred-sha] FAIL: sacred file missing: $SACRED_FILE" >&2
	echo "[verify-sacred-sha]       phase context: .planning/phases/97-auto-mode/97-CONTEXT.md" >&2
	exit 2
fi

if ! command -v git >/dev/null 2>&1; then
	echo "[verify-sacred-sha] FAIL: git not on PATH" >&2
	exit 2
fi

CURRENT_SHA="$(cd "$REPO_ROOT" && git hash-object "$SACRED_FILE")"

if [ "$CURRENT_SHA" = "$LOCKED_SHA" ]; then
	echo "[verify-sacred-sha] PASS: $SACRED_FILE = $LOCKED_SHA"
	exit 0
fi

cat >&2 <<EOF
[verify-sacred-sha] FAIL: sacred file SHA mismatch.

  file        : $SACRED_FILE
  locked SHA  : $LOCKED_SHA
  current SHA : $CURRENT_SHA

The LivOS SDK agent runner is locked. All extensions go through wrappers
(liv-agent-runner.ts and mcp-client-manager.ts), NOT through the runner
itself. If this check fails, the runner has been mutated — either revert
the changes or escalate before continuing.

Phase context: .planning/phases/97-auto-mode/97-CONTEXT.md
EOF
exit 1
