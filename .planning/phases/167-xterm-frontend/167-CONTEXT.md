# Phase 167: xterm.js Frontend (CcTerminal Component)

**Gathered:** 2026-05-19
**Status:** Ready for planning (autonomous, pre-flight verified)
**Source:** v35-CC-PTY-MASTER.md D-V35-B/G/J/K/L
**Wave:** 1 (parallel with 166 + 169)

<domain>
## Phase Boundary

Build the browser-side `<CcTerminal>` React component that renders xterm.js terminal, opens WebSocket to `/ws/cc-pty`, and bridges stdin/stdout. Replaces legacy SDK chat UI in AI dock window. Theme-aware (LivOS dark/light tokens). Mobile shows fallback message.

**Phase 167 sonu:**
- `<CcTerminal sessionId={id}>` component mounts xterm.js, connects WS, plays stdout, sends stdin
- Resize sync: ResizeObserver → JSON resize envelope → server pty resize
- Copy/paste: clipboard API + xterm.js selection
- Theme: live-bound to LivOS theme context (dark/light); xterm.js theme object updates without remount
- Mobile (`useIsMobile()` hook returns true): show banner "AI Chat terminal requires a desktop browser. Mobile fallback: visit /chat-mobile."
- Legacy SDK chat UI in AI dock window route REMOVED (D-V35-K)
- Mobile route `/chat-mobile` retains legacy SDK chat (D-V35-G)

</domain>

<decisions>

### Plan 167-01: CcTerminal core component + xterm.js wiring

**Files:**
- NEW `livos/packages/ui/src/features/cc-terminal/CcTerminal.tsx`
- NEW `livos/packages/ui/src/features/cc-terminal/terminal-ws-client.ts`
- NEW `livos/packages/ui/src/features/cc-terminal/index.ts` (barrel)

**Component shape:**
```tsx
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { CanvasAddon } from '@xterm/addon-canvas';
import '@xterm/xterm/css/xterm.css';

export function CcTerminal({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<CcPtyWsClient | null>(null);
  const theme = useTheme(); // LivOS theme context
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: livosThemeToXtermTheme(theme),
      allowProposedApi: true,
      scrollback: 5000,
    });
    
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new CanvasAddon());
    
    term.open(containerRef.current);
    fit.fit();
    
    const ws = new CcPtyWsClient({
      url: `${wsUrl()}/ws/cc-pty`,
      sessionId,
      onStdout: (data) => term.write(data),
      onAttached: ({ session }) => { /* sidebar metadata sync */ },
      onError: (msg) => term.write(`\r\n\x1b[31m[error] ${msg}\x1b[0m\r\n`),
    });
    
    term.onData((data) => ws.sendStdin(data));
    
    const ro = new ResizeObserver(() => {
      fit.fit();
      ws.sendResize(term.cols, term.rows);
    });
    ro.observe(containerRef.current);
    
    termRef.current = term;
    fitRef.current = fit;
    wsRef.current = ws;
    
    return () => {
      ro.disconnect();
      ws.detach();
      term.dispose();
    };
  }, [sessionId]);
  
  // Theme reactive update (no remount)
  useEffect(() => {
    termRef.current?.setOption?.('theme', livosThemeToXtermTheme(theme));
  }, [theme]);
  
  return <div ref={containerRef} className="h-full w-full bg-bg" />;
}
```

**Acceptance:**
- 8 vitest assertions (@testing-library/react): mounts WITHOUT crashing, sends stdin on Terminal.onData, calls fit on ResizeObserver, disposes on unmount
- Source-text invariants: imports `@xterm/xterm` + `FitAddon` + `WebLinksAddon` + `CanvasAddon`; `term.dispose()` in cleanup; `ws.detach()` in cleanup
- @xterm/* refs in pnpm-lock already present (pre-flight verified) — no new dep

### Plan 167-02: WebSocket client (`terminal-ws-client.ts`)

**File:** `livos/packages/ui/src/features/cc-terminal/terminal-ws-client.ts` + `.test.ts`

**API:**
```ts
export class CcPtyWsClient {
  private ws: WebSocket;
  private reconnectAttempts = 0;
  private maxReconnects = 5;
  
  constructor(opts: {
    url: string;
    sessionId: string;
    onStdout: (data: string) => void;
    onAttached: (env: AttachedEnvelope) => void;
    onError: (msg: string) => void;
    onClose?: () => void;
  });
  
  sendStdin(data: string): void;
  sendResize(cols: number, rows: number): void;
  detach(): void;
}
```

**Reconnect logic:** Exponential backoff (250ms, 500ms, 1s, 2s, 4s), max 5 attempts. On `attach` reconnect, server replays last 4KB scrollback.

**Acceptance:**
- 10 vitest assertions (using `ws` package mock server): connects → sends attach envelope → receives attached → forwards stdout to callback; resize envelopes correctly serialized; detach sends clean envelope + closes WS; reconnect exponential backoff; base64 decode for stdout frames; oversize stdin throttle (server limit mirror)

### Plan 167-03: Theme bridge + LivOS dark/light mapping

**Files:**
- NEW `livos/packages/ui/src/features/cc-terminal/terminal-theme.ts`
- MOD existing theme tokens NOT TOUCHED — read via existing `useTheme()` hook

**Function:**
```ts
export function livosThemeToXtermTheme(theme: LivosTheme): ITheme {
  const isDark = theme.colorScheme === 'dark';
  return {
    background: isDark ? '#0a0a0a' : '#ffffff',
    foreground: isDark ? '#e5e5e5' : '#1a1a1a',
    cursor: isDark ? '#06b6d4' : '#0891b2',
    selectionBackground: isDark ? '#1e293b' : '#e0f2fe',
    black: isDark ? '#000000' : '#1a1a1a',
    red: '#ef4444',
    green: '#22c55e',
    yellow: '#eab308',
    blue: '#3b82f6',
    magenta: '#a855f7',
    cyan: '#06b6d4',
    white: isDark ? '#e5e5e5' : '#1a1a1a',
    brightBlack: '#525252',
    brightRed: '#f87171',
    brightGreen: '#4ade80',
    brightYellow: '#facc15',
    brightBlue: '#60a5fa',
    brightMagenta: '#c084fc',
    brightCyan: '#22d3ee',
    brightWhite: '#ffffff',
  };
}
```

**Acceptance:**
- 4 vitest assertions: dark/light produces different background+foreground; ANSI 16-color palette complete; live theme change in component does not remount terminal (uses `term.options.theme = ...`)

### Plan 167-04: AI Chat route swap (legacy SDK → CcTerminal) + mobile fallback

**Files:**
- MOD `livos/packages/ui/src/routes/ai-chat/index.tsx` — REMOVE legacy SDK chat component import; ADD CcTerminal mount; mobile branch renders fallback
- MOD `livos/packages/ui/src/routes/chat-mobile/index.tsx` (NEW route) — wraps current legacy SDK chat unchanged

**AI Chat route:**
```tsx
import { CcTerminal } from '@/features/cc-terminal';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { useState } from 'react';

export default function AiChatRoute() {
  const isMobile = useIsMobile();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  // ... sidebar wiring deferred to Phase 168
  
  if (isMobile) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <h2 className="text-xl font-semibold">AI Chat requires a desktop browser</h2>
        <p className="text-text-secondary">The terminal UI doesn't render well on mobile. Use the simplified chat instead.</p>
        <a href="/chat-mobile" className="rounded-lg bg-primary px-4 py-2 text-bg">Open mobile chat</a>
      </div>
    );
  }
  
  return (
    <div className="grid h-full" style={{ gridTemplateColumns: '260px 1fr' }}>
      {/* Sidebar — wave 2 (Phase 168) wires it; placeholder for now */}
      <div className="border-r border-border bg-bg-secondary p-4">
        <p className="text-sm text-text-secondary">Session sidebar — Phase 168</p>
      </div>
      <div className="h-full overflow-hidden">
        {activeSessionId ? (
          <CcTerminal sessionId={activeSessionId} />
        ) : (
          <div className="flex h-full items-center justify-center text-text-secondary">
            Select or create a session to start
          </div>
        )}
      </div>
    </div>
  );
}
```

**Legacy SDK chat route (`/chat-mobile`):**
- Move existing AI dock window chat component to `livos/packages/ui/src/routes/chat-mobile/index.tsx`
- Same component, different route — zero refactor
- Mobile users land here; desktop users CAN visit it explicitly

**D-V35-K verification:** Legacy SDK chat component (`SdkChatPanel` or similar) is REMOVED from `routes/ai-chat/index.tsx` and only imported from `routes/chat-mobile/index.tsx`. Grep proves single-use.

**Acceptance:**
- 6 vitest assertions: AiChatRoute mobile branch renders fallback link; desktop branch renders sidebar grid + CcTerminal placeholder; activeSessionId null → "Select or create" placeholder; chat-mobile route loads legacy chat component unchanged
- Source-text invariant: `SdkChatPanel` imported in EXACTLY 1 file (`routes/chat-mobile/index.tsx`)

</decisions>

<canonical_refs>

- `.planning/v35-CC-PTY-MASTER.md`
- `.planning/phases/166-cc-pty-backend/166-CONTEXT.md` (WebSocket protocol contract)
- `livos/packages/ui/src/routes/ai-chat/` (existing AI dock window route — to be replaced)
- `livos/packages/ui/src/hooks/use-is-mobile.ts` (existing mobile detection hook)
- `livos/packages/ui/src/providers/theme-provider.tsx` (LivOS theme context)
- Pre-flight: @xterm/xterm + @xterm/addon-fit + @xterm/addon-web-links + @xterm/addon-canvas all already in pnpm-lock

</canonical_refs>

<specifics>

| Plan | Files (NEW unless marked MOD) |
|------|-------------------------------|
| 167-01 | features/cc-terminal/CcTerminal.tsx + index.ts |
| 167-02 | features/cc-terminal/terminal-ws-client.ts + .test.ts |
| 167-03 | features/cc-terminal/terminal-theme.ts + .test.ts |
| 167-04 | MOD routes/ai-chat/index.tsx (replace legacy); NEW routes/chat-mobile/index.tsx |

**Sacred guardrails (every plan):**
- All Phase 162/163/164/165 server-side files UNCHANGED
- @xterm/* deps already in lockfile (verified pre-flight)
- D-V35-K: legacy SdkChatPanel single-use grep enforced

</specifics>

<deferred>

- Session sidebar wiring → Phase 168 (depends on 166's API + 167's CcTerminal component)
- Vault Graph tab → Phase 169 (parallel; integrates as 2nd tab in ai-chat route)

</deferred>

---

*Phase: 167-xterm-frontend*
*Wave: 1 (parallel with 166, 169)*
*Estimated: ~3 days agent work*
*Depends on: pre-flight verified (@xterm deps present)*
