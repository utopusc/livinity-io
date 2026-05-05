# Welcome to Livinity

## How We Use Claude

Based on Livinity User's usage over the last 30 days:

Work Type Breakdown:
  Build Feature  ████████░░░░░░░░░░░░  38%
  Debug Fix      █████░░░░░░░░░░░░░░░  23%
  Plan Design    █████░░░░░░░░░░░░░░░  23%
  Continuation   ███░░░░░░░░░░░░░░░░░  16%

Top Skills & Commands:
  /usage              ████████████████████  67x/month
  /gsd-autonomous     ████░░░░░░░░░░░░░░░░  14x/month
  /clear              ████░░░░░░░░░░░░░░░░  13x/month
  /gsd-plan-phase     █░░░░░░░░░░░░░░░░░░░  1x/month
  /gsd-new-milestone  █░░░░░░░░░░░░░░░░░░░  1x/month
  /gsd-fast           █░░░░░░░░░░░░░░░░░░░  1x/month

Top MCP Servers:
  chrome-devtools  ████████████████████  285 calls

## Your Setup Checklist

### Codebases
- [ ] livinity-io — https://github.com/utopusc/livinity-io (main monorepo: livos/ + liv/)
- [ ] livinity-apps — sibling repo for marketplace app definitions (ask Livinity User for URL/access)

### MCP Servers to Activate
- [ ] chrome-devtools — browser automation + DOM inspection + network capture for live UI debugging at https://bruce.livinity.io and local dev. Install via `claude mcp add chrome-devtools-mcp` then start Chrome with `--remote-debugging-port=9223`.

### Skills to Know About
- [/gsd-autonomous](https://github.com/utopusc/livinity-io) — runs all remaining milestone phases autonomously (discuss → plan → execute per phase). The team's main driver — sessions are organized around GSD milestones (currently v29.3 Marketplace AI Broker).
- [/gsd-plan-phase](https://github.com/utopusc/livinity-io) — create detailed plan for a single phase before execution. Use when you want to review plans before code is written.
- [/gsd-new-milestone](https://github.com/utopusc/livinity-io) — start a new milestone cycle (questioning → research → requirements → roadmap).
- [/gsd-fast](https://github.com/utopusc/livinity-io) — execute a trivial task inline (no subagents, no planning overhead). For one-shot fixes.
- /usage — check Anthropic API quota; the team hits 5-hour limits during heavy autonomous runs and uses this to pace work.
- /clear — reset context between phases; always run before starting a new GSD phase to keep the planner agent's context clean.

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
