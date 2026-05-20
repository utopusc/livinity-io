# Workflow: doctor

**Purpose:** Validate LivOS vault integrity. Reports red/green per check.

## Process

### Step 1: Run the check

```bash
liv doctor
```

The CLI walks the vault root (default `~/liv/`) and runs these checks:

1. **items/ schema** — every `items/<uuid>/` has a valid `item.json` with required fields (`id`, `type`, `name`, `parentId`, `createdAt`).
2. **tree.json freshness** — `tree.json` mtime ≥ max(item.json mtime). Stale tree.json is rebuildable but signals a daemon issue.
3. **Schema version** — `vault.json.schemaVersion` matches the expected current version.
4. **Orphan tmux sessions** — Phase 166 cc-pty sessions referenced by chat items that no longer exist on tmux (kills the dangling reference).
5. **Tree integrity** — no cycles in parentId chain; no orphan items pointing to non-existent parents.

### Step 2: Interpret output

Output is JSON:
```json
{
  "checks": [
    {"name": "items_schema", "status": "ok", "count": 42},
    {"name": "tree_freshness", "status": "stale", "lag_ms": 12345}
  ],
  "status": "yellow"
}
```

Status legend:
- `ok` (green) — all good
- `stale` (yellow) — repairable; usually `liv migrate` fixes it
- `error` (red) — manual intervention required; check the `note` field

### Step 3: Repair (if needed)

For stale tree.json: `liv migrate` (Phase 173) rebuilds the cache.
For orphan tmux sessions: `liv doctor --repair` (Phase 173) prunes the chat→session links.
For schema mismatch: see migration docs at `.planning/phases/173-*`.
