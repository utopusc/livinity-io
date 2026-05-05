# Phase 83 — Per-Tool Views — CONTEXT

## Phase identity

| Field | Value |
|---|---|
| Phase | 83 |
| Name | Per-Tool Views |
| Wave | 2 (parallel with P81, P82, P85-UI, P86) |
| Owner agent | Frontend specialist |
| Depends on | P80 (tokens), P81-types.ts (ToolCallSnapshot shape) |
| Blocks | P84 (consumes McpToolView + MCPContentRenderer) |
| Estimated effort | 16 h |

## Scope guard

Write ONLY to:
- `livos/packages/ui/src/routes/ai-chat/v32/views/` — all view components
- `livos/packages/ui/src/routes/playground/v32-tool-views-fixtures.ts` — fixture data
- `livos/packages/ui/src/router.tsx` — one lazy import + one route entry

Do NOT touch: `types.ts` (P81), `index.tsx` (P81), `ToolCallPanel.tsx` (P82), any file outside the above paths.

## ToolCallSnapshot shape (from types.ts — read-only)

```ts
interface ToolCallSnapshot {
  toolId: string
  name: string
  input: Record<string, unknown>
  output?: string
  status: 'running' | 'complete' | 'error'
  startedAt: number
  endedAt?: number
  batchId?: string
}
```

Views receive a `tool: ToolCallSnapshot` prop. They do NOT receive the legacy Suna `assistantContent / toolContent / isStreaming` split — we adapt internally.

## Token map (P80 delivered)

| Semantic token | Tailwind class |
|---|---|
| background | `bg-liv-background` |
| foreground text | `text-liv-foreground` |
| muted bg | `bg-liv-muted` |
| muted text | `text-liv-muted-foreground` |
| border | `border-liv-border` |
| card bg | `bg-liv-card` |
| card text | `text-liv-card-foreground` |
| primary | `bg-liv-primary` / `text-liv-primary` |
| destructive | `bg-liv-destructive` / `text-liv-destructive` |

Font tokens: `font-sans` = Geist Variable, `font-mono` = Geist Mono Variable.

## Files to produce

```
views/
  ToolViewRegistry.tsx      — regex-keyed dispatch component
  ToolViewWrapper.tsx       — shared chrome (header+args+content+footer)
  BrowserToolView.tsx       — base64 image / URL display
  CommandToolView.tsx       — mono terminal output, exit code badge
  FileOpToolView.tsx        — path header, content preview, diff
  StrReplaceToolView.tsx    — old_str/new_str diff blocks
  WebSearchToolView.tsx     — result cards (title+url+snippet)
  WebCrawlToolView.tsx      — URL + page hierarchy/content
  WebScrapeToolView.tsx     — URL + extracted content via MCPContentRenderer
  McpToolView.tsx           — server identity + MCPContentRenderer on result
  GenericToolView.tsx       — JSON fallback
  MCPContentRenderer.tsx    — format dispatcher (search/table/json/md/err/plain)
  mcp-format-detector.ts    — pure function, no React
  get-mcp-server-color.ts   — pure function, stable hash palette

playground/
  v32-tool-views-fixtures.ts  — fixture ToolCallSnapshot for each view type
  v32-tool-views.tsx          — playground page that renders all 9
```

## Status→render mapping (all views must handle)

| status | render |
|---|---|
| `'running'` | Loading skeleton / spinner + progress animation |
| `'complete'` | Full content render |
| `'error'` | Red error card with `tool.output` as error message |

Note: P81's types.ts does not have a `'pending'` status — the three states above cover all cases. `running` covers the "pre-result" case.

## ToolViewComponent interface

```ts
export interface ToolViewComponentProps {
  tool: ToolCallSnapshot
}
export type ToolViewComponent = React.ComponentType<ToolViewComponentProps>
```

## MCPContentRenderer adapter

Unlike Suna which passes pre-parsed `detectionResult` separately, our renderer accepts `rawContent: any` and runs `MCPFormatDetector.detect()` internally. Simpler call site.

## getMCPServerColor return shape

```ts
{ gradient: string, border: string, text: string }
// all Tailwind class strings
// example: { gradient: 'from-blue-500/20 to-blue-600/10', border: 'border-blue-500/20', text: 'text-blue-500' }
```

## Playground fixture map

Each view type needs two fixtures: one in `status: 'complete'` with realistic data, one in `status: 'running'` to verify loading state.

## Design constraints

- `border-liv-border` on all wrapper borders
- `rounded-xl` on wrapper
- Lucide icons via `@tabler/icons-react` mapping (Tabler) per v32 convention — BUT since tool views use specific icon semantics and Suna uses Lucide, we use `lucide-react` which IS already in the package.json (check: shadcn uses it).
- Zero API calls / mutations in view components
- No `useEffect` for data fetching — pure derived state from props
- Memoize expensive derivations with `useMemo`

## Commit target

Single commit:
```
feat(83): v32 per-tool views suite — 9 views + MCP auto-detect + dispatch registry
```

## Verification gates

1. `pnpm --filter ui build` exits 0
2. `pnpm exec tsc --noEmit` — zero new errors
3. `/playground/v32-tool-views` route renders all 9 view types without crash
4. Theme toggle (dark class on html) doesn't break any view
