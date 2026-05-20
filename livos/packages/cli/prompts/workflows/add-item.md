# Workflow: add-item

**Purpose:** Add a new Project / Agent / Chat item to the LivOS vault tree.

## Process

### Step 1: Decide the item type

Ask the user (or infer from their phrasing):
- "project" — long-lived work container with `cwd` (a folder on disk)
- "agent" — autonomous worker with optional `schedule` (cron expression)
- "chat" — single conversational session (1:1 mapping to a CC PTY session)

### Step 2: Gather required fields

For all types: `name` (string, 1-200 chars)
For projects: optional `cwd` (absolute path)
For agents:   optional `schedule` (cron expression like `0 7 * * *`)
For chats:    optional `ccSessionId` (if attaching to existing CC PTY)

Optional for all: `parentId` (uuid v7 of parent item; null = root under Main Liv)

### Step 3: Execute the create

Run the type-specific command:

```bash
liv query item.create-project --name "<name>" --cwd "<cwd>"
liv query item.create-agent   --name "<name>" --schedule "<cron>"
liv query item.create-chat    --name "<name>"
```

Parse the JSON output. On success, `{item: {id, type, name, parentId, ...}}` is returned.
On failure, stderr contains the error message and exit code is non-zero.

### Step 4: Report back

Tell the user the new item ID and where it landed in the tree. Suggest next actions:
- For projects: "Open it with `liv project open --id <id>`"
- For agents:   "Run it now with `liv agent run --id <id>`" (Phase 176+)
- For chats:    "Attach with `liv attach <id>`" (Phase 174+)

## Error patterns

- `livinityd is offline` → mutations require the daemon. User runs `systemctl start livos` or boots livinityd manually.
- `cwd is project-only` / `schedule is agent-only` → cross-type field bleed; check the type matches the option used.
- `--name required` → CLI argument; nothing to debug, just provide the name.
- `parent not found` → invalid parentId; verify via `liv query tree.list` first.
