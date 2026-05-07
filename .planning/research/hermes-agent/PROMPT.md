# Research Prompt — hermes-agent vs LivOS

**Goal**: Identify what features/patterns from `nousresearch/hermes-agent` are
worth porting into LivOS's agent stack (`liv/packages/core/`,
`livos/packages/livinityd/source/modules/computer-use/`,
`livos/packages/ui/src/routes/ai-chat/`).

## Hard constraints (read first)

1. **Sacred file**: `liv/packages/core/src/sdk-agent-runner.ts` SHA must stay
   `f3538e1d811992b782a9bb057d1b7f0a0189f95f`. Verify with
   `git hash-object liv/packages/core/src/sdk-agent-runner.ts` BEFORE writing
   anything. Findings document MUST NOT propose modifying this file.
2. **Subscription-only**: LivOS uses Claude (Anthropic broker subscription
   path). No BYOK / no API-key flow. The `sdk-subscription` path in
   `liv/packages/core/src/providers/` is locked. Any feature that requires
   raw API key access is out of scope — flag and skip.
3. **No backwards-compat hacks**: Findings should describe direct ports, not
   "supports both" toggles.
4. **Language**: Write FINDINGS.md in English. Section titles in English.

## Deliverables

Write **one** file: `.planning/research/hermes-agent/FINDINGS.md`.

Structure:

```
# Hermes-Agent → LivOS — Port Analysis

## 1. Hermes-Agent overview (2 paragraphs)
   What it is, what problem it solves, who built it.

## 2. Architecture comparison (table)
   | Layer | hermes-agent | LivOS today | Gap |

## 3. Feature inventory
   For EACH feature found in hermes-agent, fill this row:
   - **Feature**:
   - **What it does**:
   - **Hermes file/module**: <path:line>
   - **LivOS equivalent**: <path:line> OR "missing"
   - **Port verdict**: PORT / SKIP / ALREADY-HAVE
   - **Reason**:
   - **Estimated effort**: S / M / L (S=<1 day, M=1-3 days, L=>3 days)

## 4. Top-3 recommended ports
   Ranked by value/effort. For each: paragraph on WHY, paragraph on WHAT to
   port (specific files), paragraph on integration risks.

## 5. Out-of-scope items
   Features that exist in hermes-agent but should NOT be ported. With reason
   per item.

## 6. Open questions for the user
   3-5 specific questions where you couldn't decide without product input.
```

## How to research

1. Clone or webfetch `https://github.com/nousresearch/hermes-agent`.
   Try in this order:
   - `git ls-remote https://github.com/nousresearch/hermes-agent.git` to confirm
     it exists.
   - WebFetch `https://raw.githubusercontent.com/nousresearch/hermes-agent/main/README.md`
   - If 404: WebFetch `https://github.com/nousresearch/hermes-agent` (HTML)
     and extract the actual default branch / repo paths.
   - If still 404: WebSearch `"nousresearch/hermes-agent"` and find the
     correct casing / repo name. (Possible alternates: `Hermes`,
     `HermesAgent`, `nous-hermes`.)
2. Once found: read `README.md`, `package.json`/`pyproject.toml`,
   `src/`/`lib/` top-level files, any `examples/`, any `prompts/` directory.
   Skim for: tool-calling format, agent loop structure, system prompt
   patterns, memory/context strategy, eval harness, MCP support,
   computer-use integration, multi-modal handling.
3. Map LivOS's current surface by reading (in this order — read once, don't
   re-read):
   - `liv/packages/core/src/sdk-agent-runner.ts` (sacred — read-only context)
   - `liv/packages/core/src/lib.ts` and `index.ts` (exports)
   - `liv/packages/core/src/providers/` (Claude SDK adapter, broker path)
   - `livos/packages/livinityd/source/modules/computer-use/native/input.ts`
     and `screenshot.ts` (the bytebot port we just fixed)
   - `livos/packages/livinityd/source/modules/computer-use/mcp/tools.ts` and
     `bytebot-mcp-config.ts`
   - `livos/packages/livinityd/source/modules/computer-use/bytebot-system-prompt.ts`
   - `livos/packages/ui/src/hooks/use-agent-socket.ts` (UI agent socket)
   - `livos/packages/ui/src/routes/ai-chat/index.tsx` (chat surface)
   - `.planning/PROJECT.md` and `.planning/ROADMAP.md` for milestone context
4. For each hermes feature, search LivOS for the equivalent BEFORE marking
   missing. Use Grep liberally.

## Quality bar

- Cite specific file paths AND line numbers in both repos.
- Don't invent features — only describe what you've actually read.
- If a hermes feature has multiple plausible LivOS analogs, list ALL and
  pick the closest with a one-line rationale.
- Keep total length under 1500 words. Be precise, not exhaustive.

## What NOT to do

- Do NOT modify any source files.
- Do NOT propose changes to `liv/packages/core/src/sdk-agent-runner.ts`.
- Do NOT propose anything that requires raw Anthropic API key access.
- Do NOT propose features that overlap with our existing P79 bytebot port
  unless hermes does it materially differently.
- Do NOT write a roadmap or PLAN.md — just findings + ranked ports.
- Do NOT speculate about hermes internals you couldn't verify.
