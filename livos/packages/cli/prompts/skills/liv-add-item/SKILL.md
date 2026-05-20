---
name: liv-add-item
description: Add a new vault item (Project, Agent, or Chat) to the LivOS tree
---

# liv-add-item

Trigger: User says "/liv-add-item …", "add a new project", "create an agent", "add a chat".

This skill is a thin shim. Read the expanded workflow at:

@~/.claude/get-livin/workflows/add-item.md

Quick reference:
- New Project:  `liv query item.create-project --name "<name>" [--cwd <path>]`
- New Agent:    `liv query item.create-agent --name "<name>" [--schedule "<cron>"]`
- New Chat:     `liv query item.create-chat --name "<name>"`

All commands emit JSON to stdout with `{item: <BaseItem>}` on success.
Mutations require livinityd to be running (Phase 171 vault-items PubSub).
On failure: stderr contains the error message and exit code is non-zero.
