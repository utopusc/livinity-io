# Phase 169: Vault Memory Graph View

**Gathered:** 2026-05-19
**Status:** Ready for planning (autonomous, parallel with 166 + 167)
**Source:** v35-CC-PTY-MASTER.md D-V35-F/I
**Wave:** 1 (parallel with 166, 167 — file-disjoint)

<domain>
## Phase Boundary

Add visual graph view of vault contents to AI Chat as a 2nd tab. Backend endpoint `GET /api/vault/graph` walks `/home/bruce/livinity-vault/` for `*.md` files, parses YAML frontmatter + `[[wikilinks]]`, emits `{nodes[], edges[]}` JSON. Frontend uses `react-force-graph-2d` to render interactive graph. Click node → side panel shows file content. Manual refresh button. Cap node count at 2000 (warn if vault exceeds).

**Phase 169 sonu:**
- `/api/vault/graph` returns nodes (`{id, label, type: 'memory'|'session'|'inbox'|'agent'|'skill'|'command', path, frontmatter}`) + edges (`{source, target, type: 'wikilink'|'directory'}`)
- AI Chat route gains tab nav (Terminal | Graph) without breaking session sidebar layout
- Graph view loads on tab switch, renders, supports zoom/pan, click → drawer with file preview (read-only)
- Node count cap: if vault > 2000 .md files, return first 2000 + warning header; UI shows banner
- New dep: `react-force-graph-2d` (D-NEW-DEPS-v35 authorized) — adds ~80KB to UI bundle

</domain>

<decisions>

### Plan 169-01: Vault walker + parser backend

**Files:**
- NEW `livos/packages/livinityd/source/modules/vault-graph/index.ts` (barrel)
- NEW `livos/packages/livinityd/source/modules/vault-graph/walker.ts` + `.test.ts`
- NEW `livos/packages/livinityd/source/modules/vault-graph/parser.ts` + `.test.ts`

**Walker logic:**
```ts
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export interface VaultFile {
  path: string;           // relative to vaultRoot, e.g. 'memory/projects/v35.md'
  type: 'memory' | 'session' | 'inbox' | 'agent' | 'skill' | 'command' | 'root';
  size: number;
  mtime: number;
  frontmatter?: Record<string, unknown>;
  wikilinks: string[];   // raw wikilink targets extracted from body
}

const TYPE_PATHS: Array<[string, VaultFile['type']]> = [
  ['memory/', 'memory'],
  ['sessions/', 'session'],
  ['inbox/', 'inbox'],
  ['.claude/agents/', 'agent'],
  ['.claude/skills/', 'skill'],
  ['.claude/commands/', 'command'],
];

export async function walkVault(vaultRoot: string, maxFiles = 2000): Promise<{ files: VaultFile[]; truncated: boolean }> {
  const files: VaultFile[] = [];
  let truncated = false;
  
  async function walk(dir: string): Promise<void> {
    if (files.length >= maxFiles) { truncated = true; return; }
    const entries = await readdir(path.join(vaultRoot, dir), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.deleted-')) continue;  // tombstones from Phase 163-01
      const relPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Don't recurse into node_modules-like dirs (defensive)
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        await walk(relPath);
      } else if (entry.name.endsWith('.md')) {
        if (files.length >= maxFiles) { truncated = true; return; }
        const fullPath = path.join(vaultRoot, relPath);
        const [content, st] = await Promise.all([
          readFile(fullPath, 'utf8'),
          stat(fullPath),
        ]);
        const { frontmatter, body } = parseFrontmatter(content);
        const wikilinks = extractWikilinks(body);
        files.push({
          path: relPath.replace(/\\/g, '/'),
          type: classifyType(relPath),
          size: st.size,
          mtime: Math.floor(st.mtimeMs),
          frontmatter,
          wikilinks,
        });
      }
    }
  }
  
  await walk('.');
  return { files, truncated };
}

function classifyType(relPath: string): VaultFile['type'] {
  for (const [prefix, type] of TYPE_PATHS) {
    if (relPath.startsWith(prefix)) return type;
  }
  return 'root';
}
```

**Parser logic:**
- `parseFrontmatter(content)`: split on first `---` line, parse YAML via existing `js-yaml` dep (Phase 164-01 already imported)
- `extractWikilinks(body)`: regex `\[\[([^\]\|]+)(?:\|[^\]]*)?\]\]` — capture wikilink target (drop optional `|display` alias)

**Acceptance:**
- 14 vitest assertions (mocked fs): walks recursively, classifies types correctly per TYPE_PATHS, skips `.deleted-*` tombstones, skips node_modules, parses frontmatter via js-yaml, extracts wikilinks with alias-stripping, truncated flag fires at maxFiles, mtime epoch ms format
- 8 parser-only tests: malformed frontmatter graceful, no frontmatter graceful, wikilink with pipe alias, nested wikilinks, escaped brackets

### Plan 169-02: Graph builder + REST endpoint

**Files:**
- NEW `livos/packages/livinityd/source/modules/vault-graph/builder.ts` + `.test.ts`
- NEW `livos/packages/livinityd/source/modules/vault-graph/routes.ts` (Express route, NOT tRPC — file content can be large)
- MOD `livos/packages/livinityd/source/modules/server/index.ts` — register `/api/vault/graph` route

**Builder logic:**
```ts
export interface GraphNode {
  id: string;        // file path (relative)
  label: string;     // basename without .md
  type: VaultFile['type'];
  size: number;
  mtime: number;
}

export interface GraphEdge {
  source: string;    // node id
  target: string;    // node id
  type: 'wikilink' | 'directory';
}

export function buildGraph(files: VaultFile[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = files.map(f => ({
    id: f.path,
    label: path.basename(f.path, '.md'),
    type: f.type,
    size: f.size,
    mtime: f.mtime,
  }));
  
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges: GraphEdge[] = [];
  
  // Wikilink edges
  for (const file of files) {
    for (const link of file.wikilinks) {
      // Resolve link to a node id (try memory/<link>.md, <link>.md, etc.)
      const targetCandidates = [
        `memory/${link}.md`,
        `memory/feedback/${link}.md`,
        `memory/projects/${link}.md`,
        `memory/references/${link}.md`,
        `memory/user/${link}.md`,
        `${link}.md`,
      ];
      const target = targetCandidates.find(c => nodeIds.has(c));
      if (target) {
        edges.push({ source: file.path, target, type: 'wikilink' });
      }
      // Unresolved links: dropped (avoid orphan node spam)
    }
  }
  
  // Directory edges (file → parent dir representational node)
  // For v1, skip directory edges; wikilink-only graph is the spec
  
  return { nodes, edges };
}
```

**Express route:**
```ts
import { Router } from 'express';
import { walkVault } from './walker.js';
import { buildGraph } from './builder.js';

export function createVaultGraphRouter(opts: { vaultRoot: string; authMiddleware: any }) {
  const router = Router();
  
  router.get('/api/vault/graph', opts.authMiddleware, async (req, res) => {
    try {
      const { files, truncated } = await walkVault(opts.vaultRoot, 2000);
      const graph = buildGraph(files);
      res.json({
        nodes: graph.nodes,
        edges: graph.edges,
        truncated,
        totalFiles: files.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // Side panel content fetch
  router.get('/api/vault/file', opts.authMiddleware, async (req, res) => {
    const relPath = req.query.path as string;
    if (!relPath || relPath.includes('..')) return res.status(400).json({ error: 'invalid path' });
    try {
      const content = await readFile(path.join(opts.vaultRoot, relPath), 'utf8');
      res.json({ path: relPath, content });
    } catch (err: any) {
      res.status(404).json({ error: 'file not found' });
    }
  });
  
  return router;
}
```

**Acceptance:**
- 10 vitest assertions: nodes mapped 1:1 from files, wikilinks resolved against candidate paths, unresolved wikilinks dropped (not added as edges), large vault (3000 files) returns truncated:true + max 2000 nodes, `/api/vault/file` rejects `..` path traversal
- Auth middleware enforces same-origin auth as other livinityd endpoints

### Plan 169-03: VaultGraph React component

**Files:**
- NEW `livos/packages/ui/src/features/vault-graph/VaultGraph.tsx` + `.test.tsx`
- NEW `livos/packages/ui/src/features/vault-graph/GraphNodeDetail.tsx`
- NEW `livos/packages/ui/src/features/vault-graph/index.ts`
- MOD `livos/packages/ui/package.json` (add `react-force-graph-2d` dep — D-NEW-DEPS-v35 authorized)

**Component:**
```tsx
import ForceGraph2D from 'react-force-graph-2d';
import { useQuery } from '@tanstack/react-query';

const NODE_COLORS: Record<VaultFile['type'], string> = {
  memory: '#06b6d4',     // cyan
  session: '#a855f7',    // purple
  inbox: '#22c55e',      // green
  agent: '#f59e0b',      // amber
  skill: '#3b82f6',      // blue
  command: '#ec4899',    // pink
  root: '#e5e5e5',       // gray
};

export function VaultGraph() {
  const [activeNode, setActiveNode] = useState<GraphNode | null>(null);
  
  const graphQ = useQuery({
    queryKey: ['vault-graph'],
    queryFn: async () => {
      const res = await fetch('/api/vault/graph', { credentials: 'include' });
      if (!res.ok) throw new Error('graph fetch failed');
      return res.json() as Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean; totalFiles: number }>;
    },
    staleTime: 60_000,
  });
  
  if (graphQ.isLoading) return <div className="flex h-full items-center justify-center">Loading vault graph...</div>;
  if (graphQ.error) return <div className="flex h-full items-center justify-center text-red-500">Failed to load graph</div>;
  
  return (
    <div className="relative h-full w-full">
      {graphQ.data.truncated && (
        <div className="absolute left-2 top-2 z-10 rounded bg-amber-500/20 px-3 py-1 text-sm">
          Vault exceeds 2000 files. Showing first 2000.
        </div>
      )}
      <button
        onClick={() => graphQ.refetch()}
        className="absolute right-2 top-2 z-10 rounded bg-bg-secondary px-3 py-1 text-sm"
      >
        Refresh
      </button>
      <ForceGraph2D
        graphData={{
          nodes: graphQ.data.nodes.map(n => ({ ...n, color: NODE_COLORS[n.type] })),
          links: graphQ.data.edges.map(e => ({ source: e.source, target: e.target })),
        }}
        nodeLabel="label"
        onNodeClick={(node) => setActiveNode(node as any)}
        cooldownTicks={100}
        linkColor={() => '#525252'}
        backgroundColor="transparent"
      />
      {activeNode && (
        <GraphNodeDetail
          node={activeNode}
          onClose={() => setActiveNode(null)}
        />
      )}
    </div>
  );
}
```

**GraphNodeDetail (side drawer):**
- Slide-in from right, ~400px wide
- Fetches `/api/vault/file?path=<node.id>` on mount
- Renders raw markdown content (no rich rendering for v1 — that's deferred polish)
- Close button

**Acceptance:**
- 8 vitest assertions: loading state renders, error state renders, truncated banner shows when truncated:true, refresh button triggers refetch, node click opens detail drawer, detail drawer fetches file content, close button clears activeNode
- `react-force-graph-2d` dep present in package.json + pnpm-lock after install

### Plan 169-04: AI Chat route — Terminal/Graph tab nav

**Files:**
- MOD `livos/packages/ui/src/routes/ai-chat/index.tsx` (Phase 167 placeholder layout) — add tab nav

**Layout:**
```tsx
type Tab = 'terminal' | 'graph';

export default function AiChatRoute() {
  const isMobile = useIsMobile();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('terminal');
  
  if (isMobile) return <MobileFallback />;
  
  return (
    <div className="grid h-full" style={{ gridTemplateColumns: '280px 1fr' }}>
      <SessionSidebar
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
      />
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex border-b border-border bg-bg-secondary">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`px-4 py-2 text-sm ${activeTab === 'terminal' ? 'border-b-2 border-primary text-primary' : 'text-text-secondary'}`}
          >
            Terminal
          </button>
          <button
            onClick={() => setActiveTab('graph')}
            className={`px-4 py-2 text-sm ${activeTab === 'graph' ? 'border-b-2 border-primary text-primary' : 'text-text-secondary'}`}
          >
            Vault Graph
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {activeTab === 'terminal' ? (
            activeSessionId ? (
              <CcTerminal key={activeSessionId} sessionId={activeSessionId} />
            ) : (
              <EmptyState />
            )
          ) : (
            <VaultGraph />
          )}
        </div>
      </div>
    </div>
  );
}
```

**Acceptance:**
- 5 vitest assertions: both tab buttons render, click switches activeTab, Terminal tab renders CcTerminal or EmptyState, Graph tab renders VaultGraph, tab switch does NOT unmount the other (both kept alive via CSS hiding — alternatively remount; pick remount for simpler memory)

**Note on remount vs persist:** Above implementation remounts on tab switch (simpler). If user complains about lost graph zoom state, change to `style={{display: 'none'}}` persistence in a follow-up.

### Plan 169-05: livinityd boot wire-up + vault-graph package install

**Files:**
- MOD `livos/packages/livinityd/source/index.ts` — instantiate vault-graph router; pass to server
- MOD `livos/packages/livinityd/source/modules/server/index.ts` — mount `/api/vault/graph` + `/api/vault/file` via `app.use(vaultGraphRouter)`
- Install `react-force-graph-2d` via `pnpm --filter @livos/ui add react-force-graph-2d`

**Acceptance:**
- `pnpm --filter @livos/ui list react-force-graph-2d` shows version
- `cd livos && pnpm --filter @livos/ui build` succeeds
- `curl http://localhost:8080/api/vault/graph` (authenticated) returns JSON shape `{nodes, edges, truncated, totalFiles}`
- `curl http://localhost:8080/api/vault/file?path=CLAUDE.md` returns file content

</decisions>

<canonical_refs>

- `.planning/v35-CC-PTY-MASTER.md` (D-V35-F: on-demand fetch; D-V35-I: vault files only)
- `livos/packages/livinityd/source/modules/server/index.ts` (Express route mount pattern)
- `livos/packages/livinityd/package.json` (js-yaml already installed — Phase 164-01)
- `livos/packages/livinityd/source/modules/server/middleware/is-authenticated.ts` (auth middleware)
- `react-force-graph-2d` npm package (D-NEW-DEPS-v35 authorized — pre-flight showed d3-force already transitive)

</canonical_refs>

<specifics>

| Plan | Files (NEW unless marked MOD) |
|------|-------------------------------|
| 169-01 | vault-graph/{index,walker,parser}.ts + walker.test.ts + parser.test.ts |
| 169-02 | vault-graph/{builder,routes}.ts + builder.test.ts |
| 169-03 | features/vault-graph/{VaultGraph,GraphNodeDetail,index}.tsx + tests; MOD ui package.json (add react-force-graph-2d) |
| 169-04 | MOD routes/ai-chat/index.tsx (tab nav) |
| 169-05 | MOD source/index.ts (router wire-up); MOD server/index.ts (mount endpoints); install dep |

**Sacred guardrails (every plan):**
- All Phase 162/163/164/165 + Phase 166/167/168 server files UNCHANGED
- D-NEW-DEPS-v35 EXCEPTION: `react-force-graph-2d` ONLY (verify nothing else added to dependencies in any package.json diff)
- Path traversal protection on `/api/vault/file` (`..` rejected)

</specifics>

<deferred>

- Live fs.watch graph updates → v35.1
- System state nodes (RBAC, devices, agents from livinityd DB) → v35.1
- Rich markdown rendering in side drawer → v35.x polish
- Graph layout persistence (zoom/pan position) across tab switches → v35.x polish
- Multi-user vault graph scoping → v36 (when multi-tenant ships)

</deferred>

---

*Phase: 169-vault-graph*
*Wave: 1 (parallel with 166, 167)*
*Estimated: ~2.5 days agent work*
*Depends on: pre-flight verified (d3-force present)*
