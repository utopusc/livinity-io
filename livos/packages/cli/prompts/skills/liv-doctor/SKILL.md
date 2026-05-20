---
name: liv-doctor
description: Validate LivOS vault integrity (item schemas, tree freshness, orphan sessions)
---

# liv-doctor

Trigger: User says "/liv-doctor", "check the vault", "is liv healthy", "validate liv".

Read the expanded workflow at:

@~/.claude/get-livin/workflows/doctor.md

Quick reference:
- Full check:   `liv doctor`
- Raw query:    `liv query doctor.check`

Reports red/green per check:
- items/ directories all have valid item.json
- tree.json mtime >= max(items/<uuid>/item.json mtime)
- schema version matches expected
- no orphan tmux sessions (Phase 166 cc-pty)
- no cycles in parentId chain

Exit code 0 = green, 1 = yellow (repairable), 2 = red (manual intervention).
