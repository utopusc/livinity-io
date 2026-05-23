/**
 * Phase 198-05 — ThreadList adapter wiring assistant-ui's
 * ExternalStoreThreadListAdapter contract to the Phase 197-05 backend
 * (mastra.agent.threads.list + threads.delete).
 *
 * Phase 201-04 — Ported from livos/packages/ui/src/features/liv-ai/
 *   thread-list-adapter.ts. Major rewrite: the original used the
 *   @trpc/react-query React hooks (list + delete bindings). The subapp
 *   (Next.js iframe in
 *   livos/packages/liv-ai-app/) intentionally has NO tRPC client —
 *   it speaks to livinityd via same-origin native fetch against the
 *   `/trpc/mastra.agent.*` HTTP batch endpoints (INV-201-02 backend
 *   unchanged; D-201-09 native-fetch transport).
 *
 *   Rewrite shape:
 *     - GET  /trpc/mastra.agent.threads.list?batch=1&input=…
 *     - POST /trpc/mastra.agent.threads.delete?batch=1   body: {"0":{"json":{threadId}}}
 *
 *   credentials: 'include' carries the LivOS session cookie back to
 *   livinityd's adminProcedure (single-operator Mini PC deployment).
 *
 *   PRESERVED — Phase 200-07 D-200-19 New Conversation runtime sync:
 *   `runtime.threads.switchToNewThread()` is awaited BEFORE the local
 *   setCurrentThreadId(newThreadId()) state flip in onSwitchToNewThread,
 *   AND fired on onDelete(currentThreadId) cleanup. This is the
 *   load-bearing call that converges /clear (D-200-11) + sidebar
 *   New Conversation button + active-thread delete onto the same
 *   runtime-reset path. RESEARCH §J4 documents the await pitfall:
 *   forgetting `await` races the body callback against the runtime
 *   reset → next /chat/livAi request fires BEFORE the runtime's
 *   state.messages clears.
 *
 *   D-201-23 New Conversation runtime sync MUST appear at least
 *   twice in this file (both call sites preserved through port).
 */

import { useAssistantRuntime } from "@assistant-ui/react";
import { useCallback, useEffect, useState } from "react";

export interface ThreadHistoryItem {
  threadId: string;
  title: string;
  status: "regular" | "archived";
}

export interface ThreadListAdapter {
  threads: () => ThreadHistoryItem[];
  currentThreadId: string;
  /**
   * Phase 200-07 — async because we await
   * `runtime.threads.switchToNewThread()` BEFORE the local state flip
   * (D-200-19; RESEARCH §J4 — never fire-and-forget the runtime call).
   */
  onSwitchToNewThread: () => Promise<void>;
  onSwitchToThread: (threadId: string) => void;
  onDelete: (threadId: string) => Promise<void>;
  isLoading: boolean;
}

// UUID-shaped client-generated threadId — PostgresStore `mastra_threads.id`
// is `uuid` typed, so the id MUST match the RFC 4122 UUID grammar
// (P199 UAT hot-fix). `crypto.randomUUID()` is available in all modern
// browsers + Node.js — no new dep.
function newThreadId(): string {
  return crypto.randomUUID();
}

// tRPC v10 batch GET — the `input` query param is a URL-encoded JSON
// envelope `{ "0": { "json": null, "meta": { "values": ["undefined"] } } }`
// which the v10 server decodes back into the void input the procedure
// expects. Encoded ONCE here so we don't pay encodeURIComponent on every
// refetch.
const THREADS_LIST_QS =
  "batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D";

interface ThreadsListRow {
  id: string;
  title?: string | null;
}

async function fetchThreadsList(): Promise<ThreadsListRow[]> {
  try {
    const res = await fetch(
      `/trpc/mastra.agent.threads.list?${THREADS_LIST_QS}`,
      { credentials: "include" },
    );
    if (!res.ok) return [];
    const data = await res.json();
    // tRPC v10 batch shape: [{ result: { data: { threads: [...] } } }]
    const threads = data?.[0]?.result?.data?.threads;
    if (Array.isArray(threads)) return threads as ThreadsListRow[];
    // Some tRPC v11 setups return { result: { data: { json: { threads } } } }
    const jsonThreads = data?.[0]?.result?.data?.json?.threads;
    if (Array.isArray(jsonThreads)) return jsonThreads as ThreadsListRow[];
    return [];
  } catch {
    return [];
  }
}

async function postDeleteThread(threadId: string): Promise<void> {
  try {
    await fetch("/trpc/mastra.agent.threads.delete?batch=1", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "0": { json: { threadId } } }),
    });
  } catch {
    // best-effort; UI refetch below will reflect server truth
  }
}

export function useThreadListAdapter(): ThreadListAdapter {
  // Phase 200-07 D-200-19 — useAssistantRuntime() must be called from
  // inside a descendant of <AssistantRuntimeProvider>. assistant.tsx's
  // AssistantShell mounts this hook after `useChatRuntime(...)`, so the
  // provider is in scope by call-time.
  const runtime = useAssistantRuntime();

  const [currentThreadId, setCurrentThreadId] = useState<string>(() =>
    newThreadId(),
  );
  const [threadRows, setThreadRows] = useState<ThreadsListRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refetch = useCallback(async () => {
    const rows = await fetchThreadsList();
    setThreadRows(rows);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const threads = useCallback((): ThreadHistoryItem[] => {
    const today = new Date().toISOString().slice(0, 10);
    return threadRows.map((t) => ({
      threadId: t.id,
      title: t.title ?? `Untitled · ${today}`,
      status: "regular" as const,
    }));
  }, [threadRows]);

  const onSwitchToNewThread = useCallback(async () => {
    // D-200-19 / D-201-23 — canonical runtime-sync path. RESEARCH §J4
    // documents the await pitfall. The await is load-bearing — do NOT
    // remove.
    await runtime.threads.switchToNewThread();
    setCurrentThreadId(newThreadId());
  }, [runtime]);

  const onSwitchToThread = useCallback((threadId: string) => {
    // TODO(phase-201+) — Option B sync via ExternalStoreThreadListAdapter
    // to load the old thread's UIMessages into the runtime. First-ship
    // known limitation: clicking an old thread flips local state + the
    // next-send body threadId, but the runtime's UIMessage store still
    // holds the previously-active thread's history. Operator refresh
    // reloads — backend PostgresStore returns full history on next
    // agent.stream().
    setCurrentThreadId(threadId);
  }, []);

  const onDelete = useCallback(
    async (threadId: string): Promise<void> => {
      await postDeleteThread(threadId);
      await refetch();
      // If the deleted thread was the active one, switch to a fresh
      // thread so the operator never lands on a tombstone — both in
      // local state AND in the assistant-ui runtime's UIMessage store
      // (Phase 200-07 D-200-19 / D-201-23 — same runtime call as
      // onSwitchToNewThread above; second of the two required hits).
      if (threadId === currentThreadId) {
        await runtime.threads.switchToNewThread();
        setCurrentThreadId(newThreadId());
      }
    },
    [refetch, currentThreadId, runtime],
  );

  return {
    threads,
    currentThreadId,
    onSwitchToNewThread,
    onSwitchToThread,
    onDelete,
    isLoading,
  };
}
