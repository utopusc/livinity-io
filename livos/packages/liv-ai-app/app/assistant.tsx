"use client";

/**
 * Phase 201-04 — AssistantShell extends the Plan 201-02 minimal shell
 * with:
 *
 *   • selectedModel state (LivAiModelId) + hydration via
 *     fetchActiveModel() against `/trpc/mastra.agent.getActiveModel`
 *     (native fetch — no tRPC client; D-201-09).
 *   • currentThreadId via the Phase 201-04 native-fetch
 *     useThreadListAdapter() — preserves D-200-19 / D-201-23 runtime
 *     sync (runtime.threads.switchToNewThread()).
 *   • AssistantChatTransport `body` callback closes over refs to
 *     currentThreadId + selectedModel so every /chat/livAi request
 *     carries the freshest values (RESEARCH §J5 closure-staleness
 *     pitfall — useRef pattern instead of plain state).
 *   • <LivAiComposer> mounted via the Thread `composerSlot` prop
 *     (D-201-21 — reuse Phase 200-05 composer 1:1) so the @ + /
 *     popovers + inline model picker render in place of the default
 *     Composer.
 */

import { useEffect, useRef, useState } from "react";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import {
  AssistantChatTransport,
  useChatRuntime,
} from "@assistant-ui/react-ai-sdk";

import { Thread } from "@/components/assistant-ui/thread";
import { LivAiComposer } from "@/lib/liv-ai/composer";
import {
  DEFAULT_LIV_AI_MODEL_ID,
  type LivAiModelId,
} from "@/lib/liv-ai/models";
import { useThreadListAdapter } from "@/lib/liv-ai/thread-list-adapter";

// tRPC v10 batch GET — encoded ONCE here for the void-input getActiveModel
// procedure. Decoded: { "0": { "json": null, "meta": { "values": ["undefined"] } } }
const GET_ACTIVE_MODEL_QS =
  "batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D";

async function fetchActiveModel(): Promise<string | null> {
  try {
    const res = await fetch(
      `/trpc/mastra.agent.getActiveModel?${GET_ACTIVE_MODEL_QS}`,
      { credentials: "include" },
    );
    if (!res.ok) return null;
    const data = await res.json();
    // tRPC v10 batch shape variants — accept both v10 and v11 envelopes.
    const modelName =
      data?.[0]?.result?.data?.modelName ??
      data?.[0]?.result?.data?.json?.modelName ??
      null;
    return typeof modelName === "string" ? modelName : null;
  } catch {
    return null;
  }
}

async function postSetActiveModel(modelName: string): Promise<void> {
  try {
    await fetch("/trpc/mastra.agent.setActiveModel?batch=1", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ "0": { json: { modelName } } }),
    });
  } catch {
    // best-effort — next page load re-hydrates from server
  }
}

function AssistantShell() {
  // Phase 201-04 — must mount the thread-list adapter INSIDE the
  // AssistantRuntimeProvider tree so useAssistantRuntime() resolves
  // (D-200-19 render-tree caveat carried from Plan 200-07). Achieved
  // by reading currentThreadId AFTER useChatRuntime() below — the
  // provider is established on the same render tick.
  const [selectedModel, setSelectedModel] = useState<LivAiModelId>(
    DEFAULT_LIV_AI_MODEL_ID,
  );

  // Hydrate selected model on first mount from server-side Redis
  // (mastra.agent.getActiveModel adminProcedure). If the server has
  // no value yet we keep DEFAULT_LIV_AI_MODEL_ID.
  useEffect(() => {
    void fetchActiveModel().then((m) => {
      if (m) setSelectedModel(m as LivAiModelId);
    });
  }, []);

  // Refs feed the AssistantChatTransport body() closure so every
  // /chat/livAi request picks up the freshest values without
  // re-instantiating the transport (which would tear down the active
  // EventSource stream). RESEARCH §J5 — closure-staleness pitfall.
  const selectedModelRef = useRef<LivAiModelId>(selectedModel);
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const handleModelChange = (next: LivAiModelId) => {
    setSelectedModel(next);
    void postSetActiveModel(next);
  };

  return (
    <AssistantShellWithRuntime
      selectedModel={selectedModel}
      selectedModelRef={selectedModelRef}
      onModelChange={handleModelChange}
    />
  );
}

interface AssistantShellWithRuntimeProps {
  selectedModel: LivAiModelId;
  selectedModelRef: React.MutableRefObject<LivAiModelId>;
  onModelChange: (next: LivAiModelId) => void;
}

/**
 * Inner component — runs the thread-list adapter (which calls
 * useAssistantRuntime() internally) AFTER useChatRuntime() so the
 * runtime exists by the time the adapter reads it.
 *
 * The `body` callback closure captures the currentThreadIdRef +
 * selectedModelRef so each /chat/livAi POST sends:
 *
 *   { threadId: <latest>, config: { modelName: <latest> } }
 *
 * D-201-23 — currentThreadId rotates via the adapter's onSwitchToNewThread
 * (sidebar button + active-thread delete + /clear slash command all
 * converge on `runtime.threads.switchToNewThread()`).
 */
function AssistantShellWithRuntime({
  selectedModel,
  selectedModelRef,
  onModelChange,
}: AssistantShellWithRuntimeProps) {
  // currentThreadId ref needs to be available to the body() closure
  // BEFORE we instantiate useChatRuntime — but the adapter's hook
  // requires the runtime context to exist. We side-step by mounting
  // the runtime first (with a ref that gets populated by an inner
  // child), and reading currentThreadId via a child component.
  const currentThreadIdRef = useRef<string>("");

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/chat/livAi",
      credentials: "include",
      body: () => ({
        threadId: currentThreadIdRef.current,
        config: { modelName: selectedModelRef.current },
      }),
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadListSync currentThreadIdRef={currentThreadIdRef} />
      <Thread
        composerSlot={<LivAiComposer selectedModel={selectedModel} onModelChange={onModelChange} />}
      />
    </AssistantRuntimeProvider>
  );
}

/**
 * Mounts useThreadListAdapter() inside the runtime provider and
 * mirrors `currentThreadId` into the ref the transport's body()
 * closure reads. Render output is null — pure side-effect bridge.
 *
 * (This is also where future surfaces like a thread sidebar would
 * subscribe to the adapter — for now Plan 201-04 only needs the
 * threadId ref wiring.)
 */
function ThreadListSync({
  currentThreadIdRef,
}: {
  currentThreadIdRef: React.MutableRefObject<string>;
}) {
  const { currentThreadId } = useThreadListAdapter();
  useEffect(() => {
    currentThreadIdRef.current = currentThreadId;
  }, [currentThreadId, currentThreadIdRef]);
  return null;
}

export const Assistant = () => <AssistantShell />;
