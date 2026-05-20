# Phase 166: CC PTY Backend (tmux + node-pty + WebSocket)

**Gathered:** 2026-05-19
**Status:** Ready for planning (autonomous, pre-flight verified)
**Source:** v35-CC-PTY-MASTER.md D-V35-A/B/C/D/E/H/N
**Wave:** 1 (parallel with 167 + 169)

<domain>
## Phase Boundary

Build the livinityd-side tmux/PTY infrastructure that owns Claude Code subprocess lifecycle. WebSocket endpoint `/ws/cc-pty` lets browser clients attach to a tmux session by ID; the tmux session OWNS the `claude` binary subprocess (NOT the WebSocket). Browser tab close → tmux keeps running. Reattach = new WebSocket against existing tmux.

**Phase 166 sonu:**
- `cc-pty-manager.ts` module exports `createSession(opts)`, `attachSession(id, ws)`, `killSession(id)`, `listSessions(userId)`
- tmux session naming: `livos-cc-<userId>-<uuid8>` (max 30 chars per tmux limit)
- Each tmux session spawned with `claude --resume <cc-session-id> --dangerously-skip-permissions` if resume id present, else fresh `claude`
- `vault/.claude/livos-cc-sessions.json` lists all known sessions per user
- WS protocol: control envelopes (JSON) for attach/detach/resize/kill; stdout streamed as base64 frames
- Idle reaper: at boot + every 5min, check tmux session list, kill ones idle >24h (`liv:config:cc_pty_idle_h` configurable)
- Concurrent cap enforced (D-V35-H, default 10)

</domain>

<decisions>

### Plan 166-01: tmux apt install + cc-pty module scaffold

**Files:**
- NEW `livos/packages/livinityd/source/modules/cc-pty/index.ts` (barrel re-export)
- NEW `livos/packages/livinityd/source/modules/cc-pty/types.ts` (interfaces)
- MOD `livos/packages/livinityd/source/index.ts` (placeholder import, no wire-up yet)

**Types:**
```ts
export interface CcPtySession {
  id: string;             // livos session uuid
  userId: string;         // 'admin' or future multi-user
  tmuxName: string;       // 'livos-cc-admin-abc12345'
  ccSessionId?: string;   // CC's internal jsonl session id; set when CC writes it
  cwd: string;            // /home/bruce/livinity-vault (default vault path)
  model?: string;         // pinned model for this session ('claude-opus-4-7' default; null = uses CC default)
  createdAt: number;      // epoch ms
  lastAttachedAt: number; // epoch ms (touched on every WS attach)
  lastMessageAt: number;  // epoch ms (touched when stdout flush detected)
  title?: string;         // user-editable name
}

export interface CcPtyManagerOptions {
  vaultPath: string;
  redis: Redis;
  logger: Logger;
  idleHours?: number;     // default from liv:config:cc_pty_idle_h ?? 24
  maxSessions?: number;   // default from liv:config:cc_pty_max_sessions ?? 10
}
```

**Acceptance:**
- `cd livos && pnpm --filter livinityd exec tsc --noEmit` clean for new module
- types.ts source-text invariant test: `CcPtySession` interface exports 9 fields exactly
- `which tmux` returns path AND `tmux -V` returns `tmux 3.4` or later — verify at module init (throw if missing)

**Note on tmux install:** Phase 170 deploy step runs `sudo apt install -y tmux` on Mini PC. Phase 166 ALL development is offline (no Mini PC ops yet); local Windows dev doesn't need tmux because tests stub the spawn calls.

### Plan 166-02: SessionStore (file-backed metadata)

**File:** `livos/packages/livinityd/source/modules/cc-pty/session-store.ts` + `.test.ts`

**Logic:**
- Store at `<vaultPath>/.claude/livos-cc-sessions.json` as JSON array (D-V35-C)
- API: `load()`, `save()`, `getByUser(userId)`, `add(session)`, `update(id, patch)`, `remove(id)`
- Atomic writes: write to `.tmp` + rename
- Locking: simple file mutex (vault is single-writer per livinityd instance; no cross-process contention expected)
- Schema version: `{schemaVersion: 1, sessions: CcPtySession[]}` for future migrations

**Acceptance:**
- 12 vitest assertions: add → load → match; update preserves other fields; remove drops single entry; atomic write survives mid-save crash (simulate via `.tmp` left behind); concurrent-read safe; schemaVersion guard

### Plan 166-03: PTY manager (tmux + node-pty bridge)

**File:** `livos/packages/livinityd/source/modules/cc-pty/manager.ts` + `.test.ts`

**Core logic:**
```ts
import * as pty from 'node-pty';
import { randomUUID } from 'crypto';

class CcPtyManager {
  private attachedTerminals = new Map<string, IPty>();  // sessionId → pty handle
  
  async createSession(opts: { userId, title?, cwd? }): Promise<CcPtySession> {
    // 1. Enforce cap
    const existing = await this.store.getByUser(opts.userId);
    if (existing.length >= this.maxSessions) throw new Error('CcPty: session cap reached');
    
    // 2. Generate tmux name
    const id = randomUUID();
    const tmuxName = `livos-cc-${opts.userId}-${id.slice(0, 8)}`;
    
    // 3. Spawn tmux detached with claude as initial command
    const cwd = opts.cwd ?? this.vaultPath;
    const tmuxCmd = `tmux new-session -d -s ${tmuxName} -c ${cwd} 'HOME=/root claude'`;
    execSync(tmuxCmd, { env: { ...process.env, HOME: '/root' }});
    
    // 4. Persist
    const session = { id, userId: opts.userId, tmuxName, cwd, createdAt: Date.now(), lastAttachedAt: 0, lastMessageAt: 0, title: opts.title };
    await this.store.add(session);
    return session;
  }
  
  async attachSession(sessionId: string, onStdout: (chunk: Buffer) => void): Promise<{stdin: (data: string) => void, resize: (cols, rows) => void, detach: () => void}> {
    const session = await this.store.getById(sessionId);
    if (!session) throw new Error(`session ${sessionId} not found`);
    
    // Verify tmux session still alive
    const alive = execSync(`tmux has-session -t ${session.tmuxName} 2>/dev/null; echo $?`).toString().trim() === '0';
    if (!alive) {
      // Resurrect: spawn new tmux + claude --resume <ccSessionId> if present
      const resumeArg = session.ccSessionId ? `--resume ${session.ccSessionId}` : '';
      execSync(`tmux new-session -d -s ${session.tmuxName} -c ${session.cwd} 'HOME=/root claude ${resumeArg}'`, ...);
    }
    
    // Spawn node-pty wrapper around `tmux attach -t <name>`
    const ptyProc = pty.spawn('tmux', ['attach', '-t', session.tmuxName], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: session.cwd,
      env: { ...process.env, HOME: '/root', TERM: 'xterm-256color' },
    });
    
    ptyProc.onData((data) => {
      session.lastMessageAt = Date.now();
      this.store.update(session.id, { lastMessageAt: session.lastMessageAt }).catch(() => {});
      onStdout(Buffer.from(data));
    });
    
    this.attachedTerminals.set(sessionId, ptyProc);
    await this.store.update(sessionId, { lastAttachedAt: Date.now() });
    
    return {
      stdin: (data) => ptyProc.write(data),
      resize: (cols, rows) => ptyProc.resize(cols, rows),
      detach: () => { ptyProc.kill(); this.attachedTerminals.delete(sessionId); },
    };
  }
  
  async killSession(id: string): Promise<void> {
    const session = await this.store.getById(id);
    if (!session) return;
    execSync(`tmux kill-session -t ${session.tmuxName} 2>/dev/null || true`);
    this.attachedTerminals.delete(id);
    await this.store.remove(id);
  }
  
  async listSessions(userId: string): Promise<CcPtySession[]> {
    return this.store.getByUser(userId);
  }
  
  async runIdleReaper(): Promise<{ reaped: number }> {
    const idleMs = (this.idleHours ?? 24) * 3600 * 1000;
    const cutoff = Date.now() - idleMs;
    const all = await this.store.loadAll();
    let reaped = 0;
    for (const s of all) {
      const idle = Math.max(s.lastAttachedAt, s.lastMessageAt, s.createdAt);
      if (idle < cutoff) {
        await this.killSession(s.id);
        reaped++;
      }
    }
    return { reaped };
  }
}
```

**Acceptance:**
- 14 vitest assertions: cap enforced, tmux name format, attach resurrects dead tmux, idle reaper kills correctly, kill cleans both tmux + store + attachedTerminals Map, concurrent attach to same session = two independent pty handles (mirror mode per D-V35-E)
- tmux command construction uses string-escape (defense against tmux session name injection — userId/title NEVER interpolated into shell unescaped)

### Plan 166-04: WebSocket handler `/ws/cc-pty`

**File:** `livos/packages/livinityd/source/modules/cc-pty/ws-handler.ts` + `.test.ts`

**Protocol (D-V35-B):**

Client → server (JSON envelopes):
```json
{"type": "attach", "sessionId": "uuid"}
{"type": "stdin", "data": "user typed text"}
{"type": "resize", "cols": 120, "rows": 30}
{"type": "detach"}
```

Server → client:
```json
{"type": "attached", "session": {id, tmuxName, cwd, title, ...}}
{"type": "stdout", "data": "base64-encoded terminal output"}
{"type": "exited", "code": 0}
{"type": "error", "message": "..."}
```

**Auth:** JWT validation from cookie OR `Authorization: Bearer` header (match existing `ws-agent.ts` pattern). User session resolved via `is-authenticated.ts` middleware. Only authenticated users can attach; userId binds to session ownership.

**Wire-up:** `livos/.../server/index.ts` mounts `/ws/cc-pty` via `this.mountWebSocketServer('/ws/cc-pty', ...)` (existing helper).

**Acceptance:**
- 10 vitest assertions: attach validates ownership (user X can't attach to user Y's session), stdin/resize plumbed to pty.write/pty.resize, detach cleanly closes (no zombie pty), unauthed connection rejects with 401-style close code, oversize stdin (>1MB) rejected with explicit error

### Plan 166-05: Boot wire-up + idle reaper integration

**Files:**
- MOD `livos/packages/livinityd/source/index.ts` — instantiate `CcPtyManager` after vault scaffolder + auth verifier + autonomous scheduler; call `manager.start()` (non-fatal try/catch); register `manager.stop()` in shutdown hook
- MOD `livos/packages/livinityd/source/modules/server/index.ts` — mount `/ws/cc-pty` endpoint
- NEW `livos/packages/livinityd/source/modules/cc-pty/idle-reaper.ts` — setInterval 5min → `manager.runIdleReaper()` (mirror Phase 165-01 pattern; do NOT touch existing `IdleSessionReaper`)
- Run-at-boot: also do a one-shot `runIdleReaper()` so livinityd restart doesn't lose 24h+ tmux corpses

**Acceptance:**
- `cd livos && pnpm --filter livinityd exec tsc --noEmit` clean
- Boot order verified via source-text grep: scaffoldVault → smokeAuthCheck → AutonomousScheduler.start → IdleSessionReaper.start → **CcPtyManager.start** → drainInstallPendingRedisKeys
- 6 boot-sequence regression tests preserved (no breaking re-order)

</decisions>

<canonical_refs>

- `.planning/v35-CC-PTY-MASTER.md` (master plan, decisions D-V35-A/B/C/D/E/H/N)
- `livos/packages/livinityd/source/index.ts` (boot wire-up insertion point)
- `livos/packages/livinityd/source/modules/server/index.ts` (WebSocket mount helper pattern)
- `livos/packages/livinityd/source/modules/server/ws-agent.ts` (auth + WS protocol shape to mirror)
- `livos/packages/livinityd/source/modules/claude-runner/idle-reaper.ts` (Phase 165-01 reaper pattern to mirror)
- `livos/packages/livinityd/source/modules/autonomous-scheduler/scheduler.ts` (Phase 164 boot wire-up pattern)
- `livos/packages/livinityd/source/modules/server/middleware/is-authenticated.ts` (auth resolution)
- Pre-flight evidence: node-pty refs 3 in lockfile; @xterm refs 8 in lockfile; tmux NOT installed (Phase 170 apt install)

</canonical_refs>

<specifics>

| Plan | Files (NEW unless marked MOD) |
|------|-------------------------------|
| 166-01 | cc-pty/index.ts, cc-pty/types.ts; MOD source/index.ts (import only) |
| 166-02 | cc-pty/session-store.ts, cc-pty/session-store.test.ts |
| 166-03 | cc-pty/manager.ts, cc-pty/manager.test.ts |
| 166-04 | cc-pty/ws-handler.ts, cc-pty/ws-handler.test.ts; MOD source/modules/server/index.ts (/ws/cc-pty mount) |
| 166-05 | cc-pty/idle-reaper.ts; MOD source/index.ts (boot wire-up + shutdown hook) |

**Sacred guardrails (every plan):**
- Sacred SHA, D-09, Phase 161-02 helper, Phase 162 vault-scaffolder, Phase 162-02 agent-session.ts, Phase 163 ws-agent.ts surface routing all UNCHANGED
- D-NEW-DEPS-v35: node-pty already in lockfile (verified pre-flight) — no new npm dep added
- tmux apt install deferred to Phase 170 deploy

</specifics>

<deferred>

- xterm.js frontend component → Phase 167 (parallel — different files)
- Vault graph backend + UI → Phase 169 (parallel — different files)
- Session sidebar UI → Phase 168 (wave 2, depends on 166 + 167)
- Mini PC deploy + apt install tmux + UAT → Phase 170 (wave 3)

</deferred>

---

*Phase: 166-cc-pty-backend*
*Wave: 1 (parallel with 167, 169)*
*Estimated: ~3 days agent work*
*Depends on: v34.x SHIPPED (already complete)*
