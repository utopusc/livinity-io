# Phase 209: openclaw → Claude CLI reuse + Haiku 4.5 default — Context

**Gathered:** 2026-05-26
**Status:** Ready for planning
**Mode:** Auto-generated (skip_discuss=true) + live Mini PC probe

## Phase Boundary

Liv AI chat agent stops using `openrouter/nvidia/nemotron-nano-9b-v2:free` (bad coord prediction, slow tool use), starts using `claude-cli/claude-haiku-4-5` via local `claude` CLI backend that reuses an existing Anthropic Max OAuth credential (subscription path, Anthropic-sanctioned per 2026-05-26 operator confirmation).

## Live Mini PC state (probed 2026-05-26T09:18-09:25Z)

- openclaw version: `2026.5.20 (e510042)` at `/opt/livos/node_modules/.pnpm/node_modules/.bin/openclaw`
- liv-claw-gateway service: ACTIVE since 2026-05-26 01:07:38 PDT, `User=bruce`, `Group=bruce`, `OPENCLAW_HOME=/opt/livos/data/openclaw`
- Current journalctl boot line: `[gateway] agent model: openrouter/nvidia/nemotron-nano-9b-v2:free (thinking=medium, fast=off)` — confirms nemotron-9B regression
- `/opt/livos/data/openclaw/openclaw.json` → `agents.defaults.model.primary = "openrouter/nvidia/nemotron-nano-9b-v2:free"`
- `cliBackends` config is `{}` (empty — needs population OR PATH-resolved default)
- `/usr/bin/claude` exists, on PATH (claude-code v2.0.x via `@anthropic-ai/claude-code` global install)
- `/root/.claude/.credentials.json` exists (471 bytes, mode 600, root-owned) — the Max subscription credential
- `/home/bruce/.claude/` does NOT exist
- Sacred constraint: gateway runs as `User=bruce`. Spawned `claude` subprocess inherits HOME=/home/bruce, so it will look at `/home/bruce/.claude/.credentials.json` — which is currently missing.

## Decision: claude-cli reuse model (verified via openclaw source)

Read `/opt/livos/node_modules/.pnpm/openclaw@2026.5.20/node_modules/openclaw/dist/doctor-claude-cli-UgSJI9UJ.js` confirms openclaw's CLI reuse semantics:

- Provider id is literal string `"claude-cli"` (not `"anthropic"`).
- Model id format: `claude-cli/<model-name>`. For Haiku 4.5: `claude-cli/claude-haiku-4-5`.
- Config knob: `agents.defaults.cliBackends["claude-cli"].command` (default `"claude"`, PATH-resolved).
- Auth profile stored at `<OPENCLAW_HOME>/agents/main/agent/auth-profiles.json` under id `CLAUDE_CLI_PROFILE_ID`.
- Runtime spawns the `claude` binary; the binary reads `$HOME/.claude/.credentials.json` on its own (openclaw does not handle OAuth itself for this provider).

## v41-DRAFT.md spec vs reality

Draft spec said `anthropic/claude-haiku-4-5` and `openclaw models auth login --provider anthropic --method cli --set-default`. Reality:
- Model id corrected to `claude-cli/claude-haiku-4-5` (provider in openclaw catalog).
- `openclaw capability model auth login` requires interactive TTY — not usable non-interactively.
- Since claude-cli reuse just needs `$HOME/.claude/.credentials.json` + `claude` binary on PATH, we can ship Phase 209 with file-level operations (copy creds, patch openclaw.json) — no interactive login command needed.

## Approach

1. Establish bruce's HOME claude state: `mkdir -p /home/bruce/.claude` (bruce-owned, 0700) → `cp /root/.claude/.credentials.json /home/bruce/.claude/.credentials.json` → `chown bruce:bruce /home/bruce/.claude/.credentials.json` (mode 0600).
2. Patch `/opt/livos/data/openclaw/openclaw.json` to set `agents.defaults.model.primary = "claude-cli/claude-haiku-4-5"`.
3. `sudo systemctl restart liv-claw-gateway`.
4. Verify `journalctl -u liv-claw-gateway` shows the new model boot line.
5. Smoke test: hit gateway with a single chat message, confirm response (token usage proves Claude API reached).

## Rollback

Single file revert:
- `cp /opt/livos/data/openclaw/openclaw.json.bak /opt/livos/data/openclaw/openclaw.json` (we'll write a `.bak` before edit).
- `rm -rf /home/bruce/.claude/` (delete the copied creds).
- `systemctl restart liv-claw-gateway`.

## Threat model

- **T-209-01 — Credential leak via bruce home.** Copying root-owned credential to bruce-owned location reduces effective access boundary. Mitigation: file mode 0600 + dir mode 0700 + bruce is single trusted system user.
- **T-209-02 — Both /root and /home/bruce credentials drift.** If the Max subscription token rotates and only /root gets updated, bruce's copy goes stale. Mitigation: prefer symlink over copy if SELinux/Apparmor permits. (Fallback: copy + document refresh procedure.)
- **T-209-03 — Anthropic ToS on credential reuse across users.** Memory `feedback_subscription_only.md` + operator confirmation 2026-05-26 establish CLI reuse as Anthropic-sanctioned.

## Invariants

- **INV-209-01** — `/opt/livos/data/openclaw/openclaw.json` must be valid JSON after edit (atomic write via temp file + mv).
- **INV-209-02** — Sacred SHA `f3538e1d811992b782a9bb057d1b7f0a0189f95f` not touched (no source code changes in this phase).
- **INV-209-03** — `liv-claw-gateway` service stays in `active (running)` state after restart.
- **INV-209-04** — Journalctl post-restart logs `claude-cli/claude-haiku-4-5` (NOT `openrouter/nvidia/nemotron-nano-9b-v2:free`).
