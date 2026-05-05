# Phase 83 Summary — v32 Per-Tool Views Suite

## Commit

`0df7475b` — feat(83): v32 per-tool views suite — 9 views + MCP auto-detect + dispatch registry

## Files created (18 total)

### Planning
- `.planning/phases/83-per-tool-views/83-CONTEXT.md`

### Views (`livos/packages/ui/src/routes/ai-chat/v32/views/`)

| File | Purpose |
|---|---|
| `ToolViewRegistry.tsx` | Regex-keyed dispatch component + `resolveToolViewComponent()` for programmatic use |
| `ToolViewWrapper.tsx` | Shared chrome: header (name, status badge, duration), collapsible args accordion, content slot, error card |
| `BrowserToolView.tsx` | Base64/URL screenshot render; DOM excerpt fallback; pulse-ring loading state |
| `CommandToolView.tsx` | Monospace terminal output (Geist Mono), exit code badge, stderr in red sub-block |
| `FileOpToolView.tsx` | Path header, 50-line preview with line numbers, side-by-side diff for edit ops |
| `StrReplaceToolView.tsx` | Stacked removed/added diff blocks with `- ` / `+ ` prefix lines |
| `WebSearchToolView.tsx` | Search result cards with favicon, title (linked), URL, snippet; favicons via Google S2 |
| `WebCrawlToolView.tsx` | URL card + page hierarchy list + extracted content with copy button + word count |
| `WebScrapeToolView.tsx` | URL header + MCPContentRenderer on extracted content |
| `McpToolView.tsx` | Server identity (color-coded by hash palette), tool detail strip, collapsible result via MCPContentRenderer |
| `GenericToolView.tsx` | JSON.stringify fallback; pretty-prints valid JSON |
| `MCPContentRenderer.tsx` | Dispatcher: search cards, table grid, JSON pre, ReactMarkdown, error card, URL list, plain pre |
| `mcp-format-detector.ts` | Pure function `detectMCPFormat(content)` → `{format, confidence, parsedData}` |
| `get-mcp-server-color.ts` | Pure function `getMCPServerColor(name)` → `{gradient, border, text}` — djb2 hash + named overrides |

### Playground
| File | Purpose |
|---|---|
| `livos/packages/ui/src/routes/playground/v32-tool-views-fixtures.ts` | 19 fixture `ToolCallSnapshot` objects across 9 view types (complete + running each, plus error) |
| `livos/packages/ui/src/routes/playground/v32-tool-views.tsx` | Playground page with theme toggle; renders all 9 groups in 2-col grid |

### Router modification
- `livos/packages/ui/src/router.tsx` — added lazy import + `playground/v32-tool-views` route under EnsureLoggedIn

## Files NOT touched (scope guard respected)
- `types.ts` (P81)
- `index.tsx` (P81)
- `ToolCallPanel.tsx` (P82)
- Anything outside `views/` and `playground/`

## Verification

| Gate | Result |
|---|---|
| `pnpm --filter ui build` | Exit 0 — 12193 modules, no new errors |
| Zero new TypeScript errors | Confirmed (only pre-existing warnings in motion-primitives from third-party) |
| All views handle running/complete/error | Confirmed — each view has explicit branch per status |
| D-LIV-STYLED | All colors use `liv-*` tokens; no hardcoded hex/rgb |
| D-NO-NEW-DEPS | Used existing `react-markdown@^9.0.1`, `@tabler/icons-react`, `lucide-react` |
| D-PURE-VIEWS | Zero API calls, zero mutations, zero global state writes |

## Design decisions

1. **`ToolViewComponent` props interface** — takes `{tool: ToolCallSnapshot}` directly rather than Suna's `assistantContent / toolContent` split. Parsing is done internally via `useMemo` in each view. Simpler call site for P82.

2. **`MCPContentRenderer` accepts `rawContent: any`** — runs detection internally instead of requiring pre-parsed `FormatDetectionResult` at call site. Consistent with how both `WebScrapeToolView` and `McpToolView` use it.

3. **`getMCPServerColor` djb2 hash** — unsigned 32-bit via `>>> 0`, modulo 8-color palette. Named overrides for `bytebot`, `exa`, `github`, `smithery`, `notion`, `slack`, `filesystem` ensure stable well-known server colors regardless of hash collisions.

4. **Terminal output styling** — `bg-zinc-950` dark background for command output block; this is intentional (matches the Suna pattern and looks correct in both light and dark themes for a terminal aesthetic).

5. **`react-markdown` usage** — imported directly from the already-installed `react-markdown@^9.0.1`. No CSP issues since this is a SPA with no external stylesheet injection.

## What P82 (ToolCallPanel) needs to consume this

```tsx
import { ToolViewRegistry } from '@/routes/ai-chat/v32/views/ToolViewRegistry'

// Inside the panel, for the selected tool:
<ToolViewRegistry tool={selectedTool} />
```

That is the entire integration surface.
