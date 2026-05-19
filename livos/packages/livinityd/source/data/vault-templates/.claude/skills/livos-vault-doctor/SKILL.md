---
name: livos-vault-doctor
description: Audit vault for broken [[wikilinks]] and orphaned memory files. Report-only — no auto-fix.
---

# Vault Doctor

You are auditing the LivOS Obsidian vault rooted at the current working directory. **Do not modify any files.** Produce a single Markdown report and stop.

## Step 1 — Enumerate vault markdown files

Use the Glob tool with pattern `**/*.md` to list every Markdown file inside the vault. Exclude `inbox/` from broken-link scanning (inbox entries are autonomous-agent outputs and can legitimately reference future memory files).

## Step 2 — Extract [[wikilinks]]

For each non-inbox file, use Read to load the contents. Match `[[<target>]]` references with a simple regex: capture `target` (the text between the first `[[` and the matching `]]`, ignoring any `|alias` suffix and any `#heading` suffix).

## Step 3 — Resolve targets

For each unique `target`, decide which file it points to using this resolution order (first hit wins):

1. `<vault>/memory/<target>.md`
2. `<vault>/memory/<subdir>/<target>.md` for each subdir under `memory/` (feedback, projects, references, user)
3. `<vault>/<target>.md` (top-level)

If none of the candidate files exists, the link is **broken**.

## Step 4 — Find orphans

List every file under `memory/**`. A file is **orphaned** if no `[[wikilink]]` resolved to it in Step 3.

## Step 5 — Emit the report

Write the final report **inline in the chat reply** — do NOT create any file. Structure:

```
# Vault Doctor Report

_Audit run: <ISO timestamp>_

## Broken Wikilinks (<N>)

| Source file | Broken target | Suggested fix |
| --- | --- | --- |
| <relative path> | <target> | rename / create stub / remove link |

## Orphaned Memory Files (<N>)

| Path | Last modified |
| --- | --- |
| memory/foo.md | <ISO> |

## Summary

- Files scanned: <N>
- Broken links: <N>
- Orphans: <N>
```

If both sections are empty: emit `# Vault Doctor Report` + `_All clean — no broken wikilinks, no orphans._` and stop.

## Constraints

- Use only Read + Glob tools. Do NOT use Bash, Edit, Write, or any FS mutation tool.
- Hard cap: scan at most 500 files. If the vault is larger, scan the first 500 in Glob order and note `_(truncated — showing first 500 of <total>)_` in the summary.
- Do not follow `[[wikilinks]]` recursively into target file contents.
- Token budget: target ≤ 12 turns. Be efficient.
