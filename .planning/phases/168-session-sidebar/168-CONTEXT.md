# Phase 168: Session Sidebar + Lifecycle UI

**Gathered:** 2026-05-19
**Status:** Ready for planning (autonomous, depends on 166 + 167 wave 1)
**Source:** v35-CC-PTY-MASTER.md D-V35-A/C/H
**Wave:** 2 (after Wave 1 ships)

<domain>
## Phase Boundary

Wire the AI Chat sidebar to CC PTY backend. Sidebar lists user's tmux sessions (from `livos-cc-sessions.json`), shows last-message preview, last-active timestamp. Click session → mount `<CcTerminal sessionId>` in main pane. New Session button → POST → backend creates tmux session + entry; sidebar refreshes; auto-selects new session. Rename/delete actions per session. Cross-tab "attached elsewhere" indicator when same session is open in another browser tab.

**Phase 168 sonu:**
- tRPC router `cc-pty-router.ts`: `list` / `create` / `rename` / `delete` / `getPreview` procedures (adminProcedure-gated, single-user mode for now)
- All 5 procedures in httpOnlyPaths (auth survives WS reconnect)
- Sidebar component lists sessions sorted by `lastMessageAt` desc
- Last-message preview parses CC's session jsonl at `/root/.claude/projects/-home-bruce-livinity-vault/<ccSessionId>.jsonl` (first user message line, truncated)
- Cross-tab indicator via Redis pub/sub: when session attached, publishes `liv:cc-pty:attached:<sessionId>` with attachId; other tabs subscribe and display badge

</domain>

<decisions>

### Plan 168-01: tRPC `cc-pty-router.ts` (5 procedures)

**Files:**
- NEW `livos/packages/livinityd/source/modules/server/trpc/cc-pty-router.ts` + `.test.ts`
- MOD `livos/packages/livinityd/source/modules/server/trpc/index.ts` (register router)
- MOD `livos/packages/livinityd/source/modules/server/trpc/common.ts` (add 5 httpOnlyPaths entries)

**Procedures (all adminProcedure-gated):**

```ts
import { z } from 'zod';
import { router, adminProcedure } from './trpc.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export default router({
  list: adminProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.currentUser!.id;
      const sessions = await ctx.livinityd!.ccPtyManager.listSessions(userId);
      return { sessions };
    }),
  
  create: adminProcedure
    .input(z.object({
      title: z.string().min(1).max(100).optional(),
      cwd: z.string().optional(),  // defaults to vault root if absent
    }).strict())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.currentUser!.id;
      const session = await ctx.livinityd!.ccPtyManager.createSession({
        userId,
        title: input.title,
        cwd: input.cwd,
      });
      return { session };
    }),
  
  rename: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(100),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      await ctx.livinityd!.ccPtyManager.renameSession(input.id, input.title);
      return { ok: true };
    }),
  
  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }).strict())
    .mutation(async ({ ctx, input }) => {
      await ctx.livinityd!.ccPtyManager.killSession(input.id);
      return { ok: true };
    }),
  
  getPreview: adminProcedure
    .input(z.object({ id: z.string().uuid() }).strict())
    .query(async ({ ctx, input }) => {
      const session = await ctx.livinityd!.ccPtyManager.getSession(input.id);
      if (!session?.ccSessionId) return { preview: null };
      // CC jsonl path: HOME=/root + project-encoded vault path
      const jsonlPath = path.join('/root/.claude/projects/-home-bruce-livinity-vault', `${session.ccSessionId}.jsonl`);
      try {
        const content = await readFile(jsonlPath, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        const firstUserMessage = lines.find(line => {
          try {
            const parsed = JSON.parse(line);
            return parsed.role === 'user';
          } catch { return false; }
        });
        if (!firstUserMessage) return { preview: null };
        const parsed = JSON.parse(firstUserMessage);
        const text = typeof parsed.content === 'string' ? parsed.content : JSON.stringify(parsed.content);
        return { preview: text.slice(0, 120) };
      } catch (err) {
        return { preview: null };
      }
    }),
});
```

**Acceptance:**
- 8 vitest assertions: list returns user's sessions only (RBAC check), create returns shape, rename updates store, delete removes from store + tmux, getPreview gracefully handles missing jsonl (returns null), getPreview truncates at 120 chars, all procedures adminProcedure (grep ≥5)
- httpOnlyPaths cluster includes exact 5 paths: `ccPty.list`, `ccPty.create`, `ccPty.rename`, `ccPty.delete`, `ccPty.getPreview`

**Manager API extension (166's `manager.ts` gains 2 methods):**
- `renameSession(id, title)` → just `store.update(id, { title })`
- `getSession(id)` → `store.getById(id)`

This is a small additive change to Phase 166's manager.ts — fully backward-compatible.

### Plan 168-02: SessionSidebar component

**Files:**
- NEW `livos/packages/ui/src/features/cc-sessions/SessionSidebar.tsx` + `.test.tsx`
- NEW `livos/packages/ui/src/features/cc-sessions/SessionItem.tsx`
- NEW `livos/packages/ui/src/features/cc-sessions/NewSessionButton.tsx`
- NEW `livos/packages/ui/src/features/cc-sessions/index.ts`

**SessionSidebar:**
```tsx
export function SessionSidebar({ activeSessionId, onSelect }: {
  activeSessionId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const list = trpcReact.ccPty.list.useQuery(undefined, { refetchInterval: 10_000 });
  const createMutation = trpcReact.ccPty.create.useMutation({
    onSuccess: ({ session }) => {
      list.refetch();
      onSelect(session.id);
    },
  });
  
  const sortedSessions = useMemo(
    () => [...(list.data?.sessions ?? [])].sort((a, b) => 
      Math.max(b.lastMessageAt, b.lastAttachedAt) - Math.max(a.lastMessageAt, a.lastAttachedAt)
    ),
    [list.data]
  );
  
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <NewSessionButton onClick={() => createMutation.mutate({})} loading={createMutation.isLoading} />
      <div className="flex-1 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <p className="text-sm text-text-secondary">No sessions yet. Click "New Session" to start.</p>
        ) : (
          sortedSessions.map(s => (
            <SessionItem
              key={s.id}
              session={s}
              active={s.id === activeSessionId}
              onSelect={() => onSelect(s.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

**SessionItem:** title + relative time + last-message preview (truncated 60 chars) + 3-dot menu (Rename, Delete). Active session highlighted with accent border.

**NewSessionButton:** prominent button, "+ New Session", disabled while creating.

**Acceptance:**
- 10 vitest assertions: empty state renders prompt; populated list sorts by lastMessageAt desc; active session highlighted; create → list refetch + auto-select; rename action opens inline edit; delete confirms then removes
- Refetch interval explicit: 10s polling (Phase 169 may add WS push later)

### Plan 168-03: AI Chat route integration (wire sidebar + terminal)

**Files:**
- MOD `livos/packages/ui/src/routes/ai-chat/index.tsx` — replace Phase 167 placeholder sidebar with `<SessionSidebar>` + state

**Updated route:**
```tsx
export default function AiChatRoute() {
  const isMobile = useIsMobile();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  if (isMobile) return <MobileFallback />;
  
  return (
    <div className="grid h-full" style={{ gridTemplateColumns: '280px 1fr' }}>
      <SessionSidebar
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
      />
      <div className="h-full overflow-hidden">
        {activeSessionId ? (
          <CcTerminal key={activeSessionId} sessionId={activeSessionId} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
```

**`key={activeSessionId}`** forces CcTerminal remount on session switch (clean state, new WS connection).

**Acceptance:**
- 4 vitest assertions: sidebar + main pane rendered; selecting a session mounts CcTerminal with correct sessionId; switching sessions remounts (key check); empty state renders when no session selected

### Plan 168-04: Cross-tab/cross-device attach indicator

**Files:**
- MOD `livos/packages/livinityd/source/modules/cc-pty/manager.ts` — emit Redis pub/sub on attach/detach
- MOD `livos/packages/livinityd/source/modules/server/trpc/cc-pty-router.ts` — new `subscribeAttachStatus` subscription procedure (WebSocket-backed)
- MOD `livos/packages/ui/src/features/cc-sessions/SessionItem.tsx` — show "attached elsewhere" badge

**Redis keys:**
- Channel: `liv:cc-pty:attached`
- Message: JSON `{sessionId, attachId, attachedAt}` (attachId = browser tab UUID generated on mount)
- Manager publishes on attach; subscribes; updates in-memory `attachedBy: Map<sessionId, Set<attachId>>`

**UI:** SessionItem shows small dot/badge if `attachedElsewhere` (i.e., active attachers ≠ this tab's attachId).

**Acceptance:**
- 6 vitest assertions: attach publishes pub/sub message; second-tab subscription receives it; UI renders badge; detach clears badge; multiple tabs same session = mirror not error; tab close fires detach automatically

</decisions>

<canonical_refs>

- `.planning/v35-CC-PTY-MASTER.md`
- `.planning/phases/166-cc-pty-backend/166-CONTEXT.md` (manager + store API contracts)
- `.planning/phases/167-xterm-frontend/167-CONTEXT.md` (CcTerminal component API)
- `livos/packages/livinityd/source/modules/server/trpc/autonomous-router.ts` (Phase 165-02 pattern to mirror)
- `livos/packages/livinityd/source/modules/server/trpc/common.ts` (httpOnlyPaths location)
- `livos/packages/ui/src/components/...` (existing button/menu/badge components to reuse)

</canonical_refs>

<specifics>

| Plan | Files (NEW unless marked MOD) |
|------|-------------------------------|
| 168-01 | trpc/cc-pty-router.ts + .test.ts; MOD trpc/index.ts (register); MOD trpc/common.ts (5 paths); MOD cc-pty/manager.ts (+2 methods) |
| 168-02 | features/cc-sessions/{SessionSidebar,SessionItem,NewSessionButton,index}.tsx + tests |
| 168-03 | MOD routes/ai-chat/index.tsx (wire sidebar) |
| 168-04 | MOD cc-pty/manager.ts (Redis pub/sub); MOD cc-pty-router.ts (subscription); MOD SessionItem.tsx (badge) |

**Sacred guardrails (every plan):**
- All Phase 162/163/164/165 server-side files UNCHANGED
- Phase 166 module additive-only modifications (renameSession, getSession added; existing methods untouched)
- 5 httpOnlyPaths entries added (cumulative count grows from 9 to 14)
- adminProcedure on every procedure (RBAC enforced)

</specifics>

<deferred>

- Live fs.watch session jsonl preview updates → v35.1
- Multi-user session namespacing → v36 (when multi-tenant ships)

</deferred>

---

*Phase: 168-session-sidebar*
*Wave: 2 (depends on 166 + 167 from Wave 1)*
*Estimated: ~1.5 days agent work*
