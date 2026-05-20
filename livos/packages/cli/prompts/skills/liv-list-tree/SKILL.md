---
name: liv-list-tree
description: List vault items as a tree (Projects, Agents, Chats)
---

# liv-list-tree

Trigger: User says "/liv-list-tree", "show me the vault", "list items", "what's in liv".

Quick reference:
- Flat list:         `liv list`
- Tree view:         `liv list --tree`
- Include archived:  `liv list --archived`
- Raw query:         `liv query tree.list`

Output is JSON-on-stdout. Tree view groups by parentId client-side; falls back
to ~/liv/tree.json on disk when livinityd is offline (read-only fallback).

Each item has shape `{id, type, name, parentId, createdAt, ...type-specific}`.
The `--tree` flag wraps the flat array into nested `children: [...]` arrays.
