#!/usr/bin/env bash
#
# sync-luse-skills.sh — generate per-agent Luse skill shims from canonical docs.
#
# Phase 242: docs/luse/ is the single source of truth for Luse capability
# documentation. This script walks the canonical docs and writes/refreshes
# one shim per known agent skill format. Shims are AUTO-GENERATED — do not
# hand-edit. If a shim drifts, re-run this script.
#
# Idempotency strategy: every generated file carries a first-line marker
#   "# source-sha: <sha256-of-canonical-payload>"
# (placed inside a comment or HTML comment depending on file format). On
# re-run, the script computes the expected sha256 from the current canonical
# payload and compares to the marker in the existing shim. If equal, the
# file is left untouched (counted "unchanged"). Otherwise the file is
# rewritten ("updated") or freshly created ("new").
#
# Known agent skill locations:
#   .claude/skills/luse/SKILL.md + tool files (Claude Code skill format)
#   .aion/skills/luse.md         (Aion CLI — format unknown, generic MD placeholder)
#   .opencode/skills/luse.md     (OpenCode — format unknown, generic MD placeholder)
#   .openclaw/skills/luse.md     (OpenClaw — format unknown, generic MD placeholder)
#
# Gemini is SKIPPED — no known skill system. Gemini agents inside Liv AI
# discover Luse purely via MCP tool-discovery; the MCP server's tool
# descriptions reference docs/luse/tools/<name>.md for the canonical text.
#
# Usage: bash scripts/sync-luse-skills.sh
#
# Exit code: 0 on success (regardless of new/updated/unchanged counts),
# non-zero if a write fails or the canonical docs directory is missing.

set -euo pipefail

# Resolve repo root assuming script lives in scripts/.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CANONICAL_DIR="$REPO_ROOT/docs/luse"

if [ ! -d "$CANONICAL_DIR" ]; then
  echo "ERROR: canonical docs directory not found: $CANONICAL_DIR" >&2
  exit 1
fi

# Counters.
NEW=0
UPDATED=0
UNCHANGED=0

# --- helpers -------------------------------------------------------------

# Portable sha256: prefer sha256sum (Linux), fall back to shasum -a 256 (macOS / Git Bash).
sha256_of_string() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
  else
    echo "ERROR: neither sha256sum nor shasum available" >&2
    exit 1
  fi
}

# Read the first line of an existing file and return its "source-sha" value
# if present, else empty string. Looks for markers in any comment style.
read_existing_sha() {
  local file="$1"
  [ -f "$file" ] || { printf ''; return; }
  # Grab the first 5 lines (frontmatter or comment header) and find
  # "source-sha: <hex>".
  head -n 5 "$file" 2>/dev/null \
    | grep -Eo 'source-sha:[[:space:]]*[0-9a-f]{64}' \
    | head -n 1 \
    | awk -F: '{gsub(/[[:space:]]/, "", $2); print $2}'
}

# Write a shim file. Rewrites only if computed sha != stored sha.
# Args: target_path, payload (string)
write_shim() {
  local target="$1"
  local payload="$2"
  local payload_sha
  payload_sha="$(sha256_of_string "$payload")"
  local existing_sha
  existing_sha="$(read_existing_sha "$target")"

  if [ "$payload_sha" = "$existing_sha" ]; then
    UNCHANGED=$((UNCHANGED + 1))
    return 0
  fi

  mkdir -p "$(dirname "$target")"
  if [ -f "$target" ]; then
    UPDATED=$((UPDATED + 1))
  else
    NEW=$((NEW + 1))
  fi

  # The payload itself must carry the source-sha marker on its first
  # comment line so future runs can read it back. The caller is
  # responsible for embedding "${PAYLOAD_SHA_PLACEHOLDER}" — we resolve
  # it here.
  printf '%s' "${payload//__PAYLOAD_SHA__/$payload_sha}" > "$target"
}

# Read a canonical doc and return its content. Trailing newline preserved.
read_canonical() {
  local path="$1"
  if [ ! -f "$path" ]; then
    echo "ERROR: missing canonical file: $path" >&2
    exit 1
  fi
  cat "$path"
}

# --- canonical payloads --------------------------------------------------

LUSE_MD="$(read_canonical "$CANONICAL_DIR/LUSE.md")"
WORKFLOW_MD="$(read_canonical "$CANONICAL_DIR/LUSE-WORKFLOW.md")"
CLICK_MD="$(read_canonical "$CANONICAL_DIR/tools/click.md")"
TYPE_MD="$(read_canonical "$CANONICAL_DIR/tools/type.md")"
SCREENSHOT_MD="$(read_canonical "$CANONICAL_DIR/tools/screenshot.md")"
KEY_MD="$(read_canonical "$CANONICAL_DIR/tools/key.md")"
SCROLL_MD="$(read_canonical "$CANONICAL_DIR/tools/scroll.md")"

# Phase 247 v2 canonical reference docs — production patterns + diagnostics.
# Six top-level docs under docs/luse/ that layer reference material on top of
# the Phase 242 minimum-viable docs. Order is deterministic for stable
# concatenation sha. Per-agent shims receive them as both bundled prose
# (Aion / OpenCode / OpenClaw) and standalone .md files (Claude skill dir).
PATTERNS_MD="$(read_canonical "$CANONICAL_DIR/PATTERNS.md")"
TROUBLESHOOTING_MD="$(read_canonical "$CANONICAL_DIR/TROUBLESHOOTING.md")"
ANTI_PATTERNS_MD="$(read_canonical "$CANONICAL_DIR/ANTI-PATTERNS.md")"
INTEGRATION_RECIPES_MD="$(read_canonical "$CANONICAL_DIR/INTEGRATION-RECIPES.md")"
KNOWN_LIMITS_MD="$(read_canonical "$CANONICAL_DIR/KNOWN-LIMITS.md")"
CHEAT_SHEET_MD="$(read_canonical "$CANONICAL_DIR/CHEAT-SHEET.md")"

# Concatenated "single-file" payload used by Aion / OpenCode / OpenClaw
# shims (they ship one file, not a directory).
CONCAT_PAYLOAD="$(printf '%s\n\n---\n\n## Tool: click\n\n%s\n\n---\n\n## Tool: type\n\n%s\n\n---\n\n## Tool: screenshot\n\n%s\n\n---\n\n## Tool: key\n\n%s\n\n---\n\n## Tool: scroll\n\n%s\n\n---\n\n## Workflow\n\n%s\n\n---\n\n## PATTERNS\n\n%s\n\n---\n\n## TROUBLESHOOTING\n\n%s\n\n---\n\n## ANTI-PATTERNS\n\n%s\n\n---\n\n## INTEGRATION-RECIPES\n\n%s\n\n---\n\n## KNOWN-LIMITS\n\n%s\n\n---\n\n## CHEAT-SHEET\n\n%s\n' \
  "$LUSE_MD" "$CLICK_MD" "$TYPE_MD" "$SCREENSHOT_MD" "$KEY_MD" "$SCROLL_MD" "$WORKFLOW_MD" \
  "$PATTERNS_MD" "$TROUBLESHOOTING_MD" "$ANTI_PATTERNS_MD" "$INTEGRATION_RECIPES_MD" "$KNOWN_LIMITS_MD" "$CHEAT_SHEET_MD")"

# --- generators ----------------------------------------------------------

generate_claude_skill() {
  # Claude Code skill format: YAML frontmatter + body. SKILL.md is the
  # entry point; tool files live alongside as plain .md.
  local skill_md
  skill_md="$(cat <<'EOF'
---
name: luse
description: Computer-use capability for Liv AI agents — click, type, screenshot, key, scroll on the LivOS desktop via the Luse MCP server. Use when the task requires direct interaction with a graphical application on the host.
source-sha: __PAYLOAD_SHA__
---

<!--
  AUTO-GENERATED FROM docs/luse/LUSE.md — DO NOT EDIT.
  Re-run scripts/sync-luse-skills.sh to refresh.
-->

__BODY__
EOF
)"
  skill_md="${skill_md//__BODY__/$LUSE_MD}"
  write_shim "$REPO_ROOT/.claude/skills/luse/SKILL.md" "$skill_md"

  # Per-tool docs: copy with a leading source-sha marker so the shim is
  # idempotent and traceable to its canonical source.
  for tool in click type screenshot key scroll; do
    local src_var
    case "$tool" in
      click) src_var="$CLICK_MD" ;;
      type) src_var="$TYPE_MD" ;;
      screenshot) src_var="$SCREENSHOT_MD" ;;
      key) src_var="$KEY_MD" ;;
      scroll) src_var="$SCROLL_MD" ;;
    esac
    local tool_md
    tool_md="$(printf '<!-- source-sha: __PAYLOAD_SHA__ -->\n<!-- AUTO-GENERATED FROM docs/luse/tools/%s.md — DO NOT EDIT. -->\n\n%s' "$tool" "$src_var")"
    write_shim "$REPO_ROOT/.claude/skills/luse/$tool.md" "$tool_md"
  done

  # Phase 247: top-level reference docs as standalone .claude/skills/luse/<NAME>.md
  # files. Same shape as the per-tool shims (HTML-comment source-sha marker
  # + AUTO-GENERATED banner + canonical body).
  for top in PATTERNS TROUBLESHOOTING ANTI-PATTERNS INTEGRATION-RECIPES KNOWN-LIMITS CHEAT-SHEET; do
    local top_var
    case "$top" in
      PATTERNS) top_var="$PATTERNS_MD" ;;
      TROUBLESHOOTING) top_var="$TROUBLESHOOTING_MD" ;;
      ANTI-PATTERNS) top_var="$ANTI_PATTERNS_MD" ;;
      INTEGRATION-RECIPES) top_var="$INTEGRATION_RECIPES_MD" ;;
      KNOWN-LIMITS) top_var="$KNOWN_LIMITS_MD" ;;
      CHEAT-SHEET) top_var="$CHEAT_SHEET_MD" ;;
    esac
    local top_md
    top_md="$(printf '<!-- source-sha: __PAYLOAD_SHA__ -->\n<!-- AUTO-GENERATED FROM docs/luse/%s.md — DO NOT EDIT. -->\n\n%s' "$top" "$top_var")"
    write_shim "$REPO_ROOT/.claude/skills/luse/$top.md" "$top_md"
  done
}

generate_generic_shim() {
  # Generic single-file shim for Aion / OpenCode / OpenClaw. Skill
  # format is unknown for these agents as of Phase 242; we ship a plain
  # markdown file with a comment header documenting the placeholder
  # status. When the agent's actual skill format is determined,
  # extend this generator with the appropriate frontmatter / location.
  local target="$1"
  local agent_name="$2"
  local payload
  payload="$(cat <<EOF
<!--
  source-sha: __PAYLOAD_SHA__

  AUTO-GENERATED FROM docs/luse/ — DO NOT EDIT.
  Re-run scripts/sync-luse-skills.sh to refresh.

  Agent: $agent_name
  Format: PLACEHOLDER — $agent_name skill format is not yet pinned for
  Liv AI. This file ships the canonical Luse prose as plain markdown
  so $agent_name agents that scan their skills directory at least
  surface the capability in tool-discovery. Replace with the
  agent-native skill wrapper once the format is locked.
-->

$CONCAT_PAYLOAD
EOF
)"
  write_shim "$target" "$payload"
}

# --- run -----------------------------------------------------------------

generate_claude_skill
generate_generic_shim "$REPO_ROOT/.aion/skills/luse.md"     "Aion CLI"
generate_generic_shim "$REPO_ROOT/.opencode/skills/luse.md" "OpenCode"
generate_generic_shim "$REPO_ROOT/.openclaw/skills/luse.md" "OpenClaw"

# Gemini intentionally skipped — no known skill system; Gemini agents
# discover Luse via MCP tool-discovery only.

TOTAL=$((NEW + UPDATED + UNCHANGED))
echo "Synced $TOTAL shims ($NEW new / $UPDATED updated / $UNCHANGED unchanged)"
