/**
 * RunStore — Redis-backed agent-run lifecycle store. Phase 67-01.
 *
 * Schema per CONTEXT D-09 (verbatim):
 *   liv:agent_run:{runId}:meta     — JSON {userId, task, status, createdAt, completedAt?, finalResult?, error?}
 *   liv:agent_run:{runId}:chunks   — Redis LIST, each entry JSON Chunk {idx, type, payload, ts}
 *   liv:agent_run:{runId}:control  — string, value 'stop' if stop signal sent
 *   liv:agent_run:{runId}:tail     — Pub/Sub channel, payload = chunk idx as string
 *   liv:agent_run:{runId}:idx      — INCR sidecar counter (Claude's discretion per
 *                                    plan action step 3 — chosen for atomicity over
 *                                    LLEN+RPUSH race-prone alternative).
 *
 * Key prefix `liv:agent_run:*` (D-04). 24h TTL refreshed on every append (D-10).
 *
 * Authorization contract (T-67-01-02 mitigation):
 *   This class does NOT enforce userId-based authorization on getMeta /
 *   getChunks / appendChunk. Callers (e.g. SSE handler in Phase 67-03) MUST
 *   verify `meta.userId === jwt.userId` before exposing run data. RunStore
 *   exposes `getMeta` so callers can perform that check. RunIds are 122-bit
 *   UUIDs (unguessable) and are the ONLY safe runId source — see T-67-01-01.
 *
 * Pub/Sub publish payload (Claude's discretion per plan action step 3):
 *   The `:tail` channel publishes the new chunk INDEX (as a decimal string),
 *   NOT the full chunk JSON. Subscribers re-read the chunk via getChunks(idx).
 *   Rationale: keeps the channel narrow + lets a freshly-attached subscriber
 *   miss-then-replay any chunks published before its `subscribe` round-trip
 *   completed (it just calls getChunks(lastIdx+1) on first message).
 *
 * Phase 67 prereq for: 67-02 (LivAgentRunner), 67-03 (SSE endpoint), 67-04
 * (useLivAgentStream hook).
 */

import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';

// ── Types ────────────────────────────────────────────────────────

export type ChunkType =
  | 'text'
  | 'reasoning'
  | 'tool_snapshot'
  | 'tool_call_partial'
  | 'error'
  | 'status'
  | 'status_detail';

export type Chunk = {
  /** 0-based, monotonic per run. */
  idx: number;
  type: ChunkType;
  /** Discriminated by `type` — text:string, reasoning:string,
   *  tool_snapshot:ToolCallSnapshot (D-12), error:{message}, status:string. */
  payload: unknown;
  /** Date.now() at append. */
  ts: number;
};

export type RunStatus = 'queued' | 'running' | 'complete' | 'error' | 'stopped';

export type RunMeta = {
  userId: string;
  task: string;
  status: RunStatus;
  createdAt: number;
  completedAt?: number;
  finalResult?: unknown;
  error?: { message: string; stack?: string };
};

// ── Constants ────────────────────────────────────────────────────

const TTL_SECONDS = 24 * 60 * 60; // 24h per D-10
const KEY_PREFIX = 'liv:agent_run';

const metaKey = (runId: string): string => `${KEY_PREFIX}:${runId}:meta`;
const chunksKey = (runId: string): string => `${KEY_PREFIX}:${runId}:chunks`;
const controlKey = (runId: string): string => `${KEY_PREFIX}:${runId}:control`;
const idxCounterKey = (runId: string): string => `${KEY_PREFIX}:${runId}:idx`;
const tailChannel = (runId: string): string => `${KEY_PREFIX}:${runId}:tail`;

// ── Class ────────────────────────────────────────────────────────

class RunStore {
  constructor(private readonly redis: Redis) {}

  /**
   * Create a new run. Returns the runId (a v4 UUID per D-11).
   * Initial status is 'queued'. Caller (LivAgentRunner) flips to 'running'
   * via a future helper or by calling appendChunk with a status chunk.
   */
  async createRun(userId: string, task: string): Promise<string> {
    const runId = randomUUID();
    const meta: RunMeta = {
      userId,
      task,
      status: 'queued',
      createdAt: Date.now(),
    };
    await this.redis.set(metaKey(runId), JSON.stringify(meta), 'EX', TTL_SECONDS);
    return runId;
  }

  /**
   * Append a chunk to the run. Assigns a monotonic `idx` via an INCR sidecar
   * counter (atomic, race-free under concurrent appends), pushes the full
   * chunk JSON to the `:chunks` list, then publishes the new idx on the
   * `:tail` channel for live subscribers. Refreshes TTL on meta + chunks +
   * control + idx-counter keys per D-10.
   *
   * Returns `{ idx }` so callers can build resume URLs (`?after=<idx>`).
   */
  async appendChunk(
    runId: string,
    chunk: Omit<Chunk, 'idx' | 'ts'> & { ts?: number },
  ): Promise<{ idx: number }> {
    // Atomic idx assignment via sidecar INCR. First INCR returns 1, so subtract
    // 1 to get 0-based idx. EX ensures the counter dies with the rest of the run.
    const nextIdx = await this.redis.incr(idxCounterKey(runId));
    const idx = nextIdx - 1;

    const fullChunk: Chunk = {
      idx,
      type: chunk.type,
      payload: chunk.payload,
      ts: chunk.ts ?? Date.now(),
    };

    await this.redis.rpush(chunksKey(runId), JSON.stringify(fullChunk));

    // Refresh TTL on every key tied to this run. Done sequentially — the
    // performance cost is negligible vs the durability guarantee.
    await this.redis.expire(metaKey(runId), TTL_SECONDS);
    await this.redis.expire(chunksKey(runId), TTL_SECONDS);
    await this.redis.expire(idxCounterKey(runId), TTL_SECONDS);
    // control key may not exist; expire on a missing key is a no-op (returns 0).
    await this.redis.expire(controlKey(runId), TTL_SECONDS);

    // Publish AFTER the list write so subscribers reading via getChunks(idx)
    // are guaranteed to see the chunk.
    await this.redis.publish(tailChannel(runId), String(idx));

    return { idx };
  }

  /**
   * Read all chunks from `fromIndex` (inclusive) to the tail. Empty list ⇒ [].
   * Never throws on missing key (Redis LRANGE on missing key returns []).
   */
  async getChunks(runId: string, fromIndex: number): Promise<Chunk[]> {
    const raw = await this.redis.lrange(chunksKey(runId), fromIndex, -1);
    if (!raw || raw.length === 0) return [];
    const out: Chunk[] = [];
    for (const s of raw) {
      try {
        out.push(JSON.parse(s) as Chunk);
      } catch {
        // Malformed entries are dropped silently — the writer (this class) only
        // ever JSON.stringifies valid Chunks, so a parse error implies external
        // corruption and we'd rather degrade than throw.
      }
    }
    return out;
  }

  /**
   * Subscribe to the run's tail Pub/Sub channel. Uses a duplicated Redis
   * client because ioredis SUBSCRIBE locks the connection from publishes/
   * writes (per ioredis docs + CONTEXT code_context block).
   *
   * The callback fires for EACH new chunk, in idx order. Late subscribers may
   * miss chunks published before they attached — they should call getChunks
   * with the last-seen idx to bridge the gap.
   *
   * Returns an async unsubscribe function. Calling it twice is safe (second
   * call is a no-op because quit() rejects subsequent ops gracefully).
   */
  async subscribeChunks(
    runId: string,
    callback: (chunk: Chunk) => void,
  ): Promise<() => Promise<void>> {
    const sub = this.redis.duplicate();
    await sub.subscribe(tailChannel(runId));

    sub.on('message', async (_channel: string, message: string) => {
      const idx = Number.parseInt(message, 10);
      if (Number.isNaN(idx)) return;
      // Re-read the chunk we were notified about. Single LRANGE call.
      const slice = await this.getChunks(runId, idx);
      // Slice may contain >1 chunk if multiple appends fired between our
      // last poll and this notification — emit each in order.
      for (const c of slice) {
        // Defensive idx check — only emit chunks from the announced idx forward.
        if (c.idx >= idx) callback(c);
      }
    });

    let closed = false;
    return async () => {
      if (closed) return;
      closed = true;
      try {
        await sub.unsubscribe(tailChannel(runId));
      } catch {
        /* swallow — connection may already be closing */
      }
      try {
        await sub.quit();
      } catch {
        /* swallow */
      }
    };
  }

  /**
   * Set the control signal. Currently the only signal is 'stop' (LivAgentRunner
   * polls this on every iter-loop tick and aborts when it sees 'stop').
   */
  async setControl(runId: string, signal: 'stop'): Promise<void> {
    await this.redis.set(controlKey(runId), signal, 'EX', TTL_SECONDS);
  }

  /**
   * Read the control signal. Returns the literal string 'stop' if set, else
   * `null` (NEVER undefined — explicit per plan must-have).
   */
  async getControl(runId: string): Promise<'stop' | null> {
    const v = await this.redis.get(controlKey(runId));
    return v === 'stop' ? 'stop' : null;
  }

  /**
   * Mark the run as complete. Read-modify-write on meta — sets status
   * 'complete', completedAt, finalResult. Refreshes TTL.
   */
  async markComplete(runId: string, finalResult: unknown): Promise<void> {
    const meta = await this.getMeta(runId);
    if (!meta) {
      // Caller invoked markComplete on a run whose meta TTL'd out (or
      // a typo'd runId). Don't throw — the runner may be shutting down
      // and we don't want to crash the caller.
      return;
    }
    meta.status = 'complete';
    meta.completedAt = Date.now();
    meta.finalResult = finalResult;
    await this.redis.set(metaKey(runId), JSON.stringify(meta), 'EX', TTL_SECONDS);
  }

  /**
   * Mark the run as errored. Read-modify-write on meta — sets status 'error',
   * completedAt, error. Refreshes TTL.
   */
  async markError(runId: string, error: { message: string; stack?: string }): Promise<void> {
    const meta = await this.getMeta(runId);
    if (!meta) return;
    meta.status = 'error';
    meta.completedAt = Date.now();
    meta.error = error;
    await this.redis.set(metaKey(runId), JSON.stringify(meta), 'EX', TTL_SECONDS);
  }

  /**
   * Read the run meta. Returns `null` if the meta key has expired or never
   * existed. Public so the SSE handler (67-03) can authorize against
   * meta.userId before streaming chunks.
   */
  async getMeta(runId: string): Promise<RunMeta | null> {
    const raw = await this.redis.get(metaKey(runId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as RunMeta;
    } catch {
      return null;
    }
  }

  /**
   * Enumerate all runs persisted to Redis. Phase 73-05 — sole RunStore
   * extension allowed in P73 per CONTEXT D-06. Used by the boot-time
   * recovery scanner (`recoverIncompleteRuns` in `run-recovery.ts`) to
   * surface orphaned/incomplete runs after a daemon crash.
   *
   * Implementation uses `SCAN MATCH liv:agent_run:*:meta COUNT 100` to
   * iterate non-blockingly (CONTEXT D-27 — KEYS would block Redis on
   * large datasets). Cursor is consumed until it returns to '0'.
   *
   * Each `:meta` key is regex-validated to recover the runId; malformed
   * keys (regex non-match) and meta entries that fail JSON.parse are
   * skipped silently — `getMeta` already returns `null` on parse failure
   * (T-73-05-01 + T-73-05-05 mitigations).
   *
   * Filters compose with AND semantics: `{ userId, status }` returns only
   * runs that match BOTH. Empty Redis ⇒ `[]` (never throws).
   *
   * Cost: O(scanned keys * 1 GET per match). Safe for v31 entry where
   * the 24h-TTL window keeps the working set bounded; if datasets ever
   * grow to where this becomes slow, refactor to MGET batches. Boot-time
   * call cost is bounded by # of non-expired runs in the last 24h.
   */
  async listRuns(filter?: {
    userId?: string;
    status?: RunStatus;
  }): Promise<Array<{ runId: string; meta: RunMeta }>> {
    const results: Array<{ runId: string; meta: RunMeta }> = [];
    let cursor = '0';
    do {
      // ioredis scan signature: scan(cursor, 'MATCH', pattern, 'COUNT', n).
      // Returns [nextCursor, keys[]]. Cast through `any` because ioredis-mock
      // and ioredis both support this varargs form but the typed signature
      // varies across versions.
      const [next, keys]: [string, string[]] = await (this.redis as any).scan(
        cursor,
        'MATCH',
        `${KEY_PREFIX}:*:meta`,
        'COUNT',
        100,
      );
      cursor = next;
      for (const key of keys) {
        // Defensive — an unrelated key could match the pattern by accident
        // (e.g. a manually-inserted debugging key); regex skip on non-match.
        const match = key.match(/^liv:agent_run:(.+):meta$/);
        if (!match) continue;
        const runId = match[1];
        const meta = await this.getMeta(runId);
        if (!meta) continue; // skip TTL'd-out or malformed entries
        if (filter?.userId && meta.userId !== filter.userId) continue;
        if (filter?.status && meta.status !== filter.status) continue;
        results.push({ runId, meta });
      }
    } while (cursor !== '0');
    return results;
  }
}

// ── Public exports ───────────────────────────────────────────────
// Explicit `export { ... }` form for greppability + downstream barrel re-exports.
export { RunStore };

