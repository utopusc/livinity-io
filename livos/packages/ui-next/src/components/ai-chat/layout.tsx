'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Square,
  Plus,
  Trash2,
  Loader2,
  Check,
  ChevronRight,
  Menu,
  MessageCircle,
  Bot,
  Wrench,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { Button, Badge } from '@/components/ui';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpcReact } from '@/trpc/client';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ToolCall = {
  tool: string;
  params: Record<string, unknown>;
  result: { success: boolean; output: string };
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: number;
};

/* ------------------------------------------------------------------ */
/*  AI Chat Layout                                                     */
/* ------------------------------------------------------------------ */

export function AiChatLayout() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef(0);

  // Conversations list
  const { data: conversations, refetch: refetchConvs } =
    trpcReact.ai.listConversations.useQuery(undefined, { refetchInterval: 10000 });

  // Current conversation
  const { data: conversationData } = trpcReact.ai.getConversation.useQuery(
    { id: conversationId! },
    { enabled: !!conversationId },
  );

  // Chat status (polled while loading)
  const { data: chatStatus } = trpcReact.ai.getChatStatus.useQuery(
    { conversationId: conversationId! },
    { enabled: !!conversationId && isLoading, refetchInterval: 500 },
  );

  // Send mutation
  const sendMutation = trpcReact.ai.send.useMutation({
    onSuccess: (data: any) => {
      if (data) {
        setLocalMessages((prev) => [
          ...prev.filter((m) => m.role !== 'assistant' || m.content !== ''),
          data,
        ]);
      }
      setIsLoading(false);
      refetchConvs();
    },
    onError: () => setIsLoading(false),
  });

  const deleteMutation = trpcReact.ai.deleteConversation.useMutation({
    onSuccess: () => {
      refetchConvs();
      if (conversationId) setConversationId(null);
      setLocalMessages([]);
    },
  });

  // Merge server + local messages
  const messages = useMemo(() => {
    if (conversationData?.messages) return conversationData.messages;
    return localMessages;
  }, [conversationData, localMessages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatStatus]);

  /* ---- Handlers ---- */
  const handleNewConversation = useCallback(() => {
    const id = `conv_${Date.now()}`;
    setConversationId(id);
    setLocalMessages([]);
    setInput('');
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput('');

    // Ensure conversation exists
    const cid = conversationId ?? `conv_${Date.now()}`;
    if (!conversationId) setConversationId(cid);

    // Add user message locally
    const userMsg: Message = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setLocalMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    requestRef.current++;

    sendMutation.mutate({ conversationId: cid, message: text });
  }, [input, isLoading, conversationId, sendMutation]);

  const handleStop = useCallback(() => {
    requestRef.current = 0;
    setIsLoading(false);
    setLocalMessages((prev) => [
      ...prev,
      {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: '_Stopped._',
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex h-full overflow-hidden bg-surface-0">
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="w-56 shrink-0 border-r border-border bg-surface-1 flex flex-col"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 224, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
              <span className="text-xs font-semibold text-text">Conversations</span>
              <button
                className="flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary hover:bg-neutral-100 hover:text-text transition-colors"
                onClick={handleNewConversation}
                aria-label="New conversation"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-0.5 p-1.5">
                {(conversations ?? []).map((conv: any) => (
                  <div
                    key={conv.id}
                    className={cn(
                      'group flex items-center gap-2 rounded-lg px-2.5 py-1.5 cursor-pointer transition-colors',
                      conv.id === conversationId
                        ? 'bg-brand/8 text-brand'
                        : 'text-text-secondary hover:bg-neutral-100 hover:text-text',
                    )}
                    onClick={() => {
                      setConversationId(conv.id);
                      setLocalMessages([]);
                    }}
                  >
                    <MessageCircle
                      className={cn(
                        'h-3 w-3 shrink-0',
                        conv.id === conversationId ? 'text-brand' : 'text-text-tertiary',
                      )}
                    />
                    <span className="flex-1 truncate text-[11px]">{conv.title || 'Untitled'}</span>
                    <button
                      className="hidden h-5 w-5 items-center justify-center rounded text-text-tertiary hover:text-error group-hover:flex transition-colors"
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: conv.id }); }}
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0 bg-surface-0">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border bg-surface-0 px-3 py-2">
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary hover:bg-neutral-100 hover:text-text transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="text-xs font-medium text-text">AI Chat</span>
          <div className="flex-1" />
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary hover:bg-neutral-100 hover:text-text transition-colors"
            onClick={handleNewConversation}
            aria-label="New conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4">
          <div className="mx-auto max-w-3xl space-y-4 py-4">
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
                <Bot className="h-10 w-10" />
                <p className="mt-3 text-sm">Start a conversation</p>
              </div>
            )}

            {messages.map((msg: Message) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Live status */}
            {isLoading && chatStatus && (
              <StatusIndicator status={chatStatus} />
            )}

            {isLoading && !chatStatus && (
              <div className="flex items-center gap-2 text-text-tertiary">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs">Thinking...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="shrink-0 border-t border-border bg-surface-0 p-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isLoading ? 'Working...' : 'Message Liv...'}
              disabled={isLoading}
              className={cn(
                'flex-1 resize-none rounded-xl bg-surface-1 px-3 py-2.5 text-sm text-text',
                'placeholder:text-text-tertiary outline-none border border-border',
                'focus:ring-2 focus:ring-brand/30 focus:border-brand',
                'disabled:opacity-50 transition-colors duration-fast',
                'max-h-[120px] min-h-[40px]',
              )}
              style={{ height: 'auto' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
            />
            {isLoading ? (
              <Button size="icon" variant="destructive" onClick={handleStop} aria-label="Stop">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim()}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Message Bubble                                                     */
/* ------------------------------------------------------------------ */

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5',
          isUser
            ? 'bg-brand text-white'
            : 'bg-surface-1 border border-border shadow-sm',
        )}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none text-text [&_code]:bg-neutral-100 [&_code]:text-text [&_pre]:bg-neutral-100 [&_pre]:border [&_pre]:border-border [&_a]:text-brand">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {message.toolCalls.map((tc, i) => (
              <ToolCallItem key={i} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tool Call Item                                                     */
/* ------------------------------------------------------------------ */

function ToolCallItem({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const shortName = formatToolName(toolCall.tool);

  return (
    <div className="rounded-lg bg-neutral-50 border border-border overflow-hidden">
      <button
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-neutral-100 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Wrench className="h-3 w-3 text-text-tertiary shrink-0" />
        <span className="flex-1 text-text-secondary font-mono">{shortName}</span>
        <Badge variant={toolCall.result.success ? 'success' : 'error'}>
          {toolCall.result.success ? 'OK' : 'FAIL'}
        </Badge>
        <ChevronRight className={cn('h-3 w-3 text-text-tertiary transition-transform', expanded && 'rotate-90')} />
      </button>
      {expanded && (
        <div className="border-t border-border px-2.5 py-2 space-y-1.5 bg-white">
          <pre className="text-[10px] text-text-secondary overflow-x-auto font-mono">
            {JSON.stringify(toolCall.params, null, 2).slice(0, 500)}
          </pre>
          <pre className="text-[10px] text-text-secondary overflow-x-auto font-mono">
            {toolCall.result.output.slice(0, 2000)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status Indicator                                                   */
/* ------------------------------------------------------------------ */

function StatusIndicator({ status }: { status: any }) {
  const steps = status?.steps ?? [];
  const lastSteps = steps.slice(-6);
  const currentTool = status?.tool;

  return (
    <div className="space-y-1.5 rounded-xl bg-surface-1 border border-border px-3 py-2.5">
      {lastSteps.map((step: string, i: number) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          {i < lastSteps.length - 1 ? (
            <Check className="h-3 w-3 text-success shrink-0" />
          ) : (
            <Loader2 className="h-3 w-3 animate-spin text-brand shrink-0" />
          )}
          <span className="text-text-secondary">{step}</span>
        </div>
      ))}
      {currentTool && lastSteps.length === 0 && (
        <div className="flex items-center gap-2 text-[11px]">
          <Loader2 className="h-3 w-3 animate-spin text-brand shrink-0" />
          <span className="text-text-secondary font-mono">{formatToolName(currentTool)}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatToolName(name: string): string {
  const match = name.match(/^mcp__[^_]+__(.+)$/);
  return match ? match[1] : name;
}
