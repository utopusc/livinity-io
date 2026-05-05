/**
 * ToolCallPanel.tsx — Phase 82 (V32-PANEL-01..06)
 *
 * Fixed right-side overlay for inspecting tool call history during an agent run.
 * Ported from Suna's `tool-call-side-panel.tsx` and adapted for LivOS's
 * ToolCallSnapshot model (P87 batchId field) + v32 liv-* design tokens (P80).
 *
 * Behavioural contract:
 *   - Slides in from the right via Framer Motion spring animation.
 *   - Auto-tracks the LATEST tool call (Live mode) unless user scrubs back.
 *   - Slider scrubber at the bottom scrubs tool call history.
 *   - "Jump to Live" pill appears in Manual mode while agent is running.
 *   - Cmd+I (Ctrl+I) closes the panel globally.
 *   - Dispatches `liv-sidebar-toggled` CustomEvent on every open/close change
 *     so chat layout components can shrink/expand accordingly.
 *   - batchId grouping: consecutive tool calls sharing the same batchId are
 *     shown with a group-header divider on the slider track labels.
 *
 * Usage (P81 index.tsx will wire this up):
 *   <ToolCallPanel
 *     toolCalls={toolCalls}
 *     isOpen={panelOpen}
 *     onClose={() => setPanelOpen(false)}
 *     agentStatus="running"
 *   />
 *
 * DO NOT touch:
 *   - routes/ai-chat/v32/index.tsx   (P81's lane)
 *   - routes/ai-chat/v32/views/      (P83's lane)
 *
 * TODO: P81 to provide canonical ToolCallSnapshot + ChatMessage types via types.ts.
 * We import from './types' with a fallback inline interface below.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Pause, Play, X } from 'lucide-react';

import { Slider } from '@/shadcn-components/ui/slider';
import { cn } from '@/shadcn-lib/utils';

// ---------------------------------------------------------------------------
// Type import — P81 ships canonical types.ts; import from there.
// If types.ts is not yet present, fall back to the inline shape below and
// add a TODO comment. Current state: P81 has shipped types.ts — using import.
// ---------------------------------------------------------------------------

import type { ToolCallSnapshot } from './types';
export type { ToolCallSnapshot };

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface ToolCallPanelProps {
  /** Full list of tool call snapshots accumulated so far in this run */
  toolCalls: ToolCallSnapshot[];
  /** Whether the panel is visible */
  isOpen: boolean;
  /** Called when user closes the panel (X button, Cmd+I, etc.) */
  onClose: () => void;
  /**
   * Current agent run status. Drives "Jump to Live" pill visibility:
   * the pill shows only when agent is actively running and user is in manual mode.
   */
  agentStatus?: 'idle' | 'running' | 'complete' | 'error';
  /**
   * Optional: index to jump to when an external pill/badge in the chat thread
   * is clicked. P81 can pass this to sync the panel to a specific tool call.
   */
  externalNavigateToIndex?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns a human-readable label for a tool name */
function toolDisplayName(name: string): string {
  return name
    .replace(/^mcp_bytebot_/, 'Bytebot: ')
    .replace(/^mcp_/, 'MCP: ')
    .replace(/^browser_/, 'Browser: ')
    .replace(/^web_/, 'Web: ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Returns a status color class for the badge */
function statusBadgeClass(status: ToolCallSnapshot['status']): string {
  switch (status) {
    case 'running':
      return 'bg-blue-500/10 text-blue-600 border-blue-200 dark:text-blue-400 dark:border-blue-800';
    case 'complete':
      return 'bg-green-500/10 text-green-600 border-green-200 dark:text-green-400 dark:border-green-800';
    case 'error':
      return 'bg-red-500/10 text-red-600 border-red-200 dark:text-red-400 dark:border-red-800';
  }
}

/** Groups consecutive snapshots that share the same batchId */
function groupByBatchId(toolCalls: ToolCallSnapshot[]): Array<{
  batchId: string | undefined;
  startIndex: number;
  count: number;
}> {
  if (toolCalls.length === 0) return [];
  const groups: Array<{ batchId: string | undefined; startIndex: number; count: number }> = [];
  let current = { batchId: toolCalls[0].batchId, startIndex: 0, count: 1 };

  for (let i = 1; i < toolCalls.length; i++) {
    if (toolCalls[i].batchId === current.batchId) {
      current.count++;
    } else {
      groups.push(current);
      current = { batchId: toolCalls[i].batchId, startIndex: i, count: 1 };
    }
  }
  groups.push(current);
  return groups;
}

// ---------------------------------------------------------------------------
// ToolCallPanel — main component
// ---------------------------------------------------------------------------

export function ToolCallPanel({
  toolCalls,
  isOpen,
  onClose,
  agentStatus = 'idle',
  externalNavigateToIndex,
}: ToolCallPanelProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [mode, setMode] = useState<'live' | 'manual'>('live');
  const prevToolCountRef = useRef<number>(0);

  // Dispatch custom event whenever isOpen changes so chat layout can respond
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('liv-sidebar-toggled', { detail: { open: isOpen } }),
    );
  }, [isOpen]);

  // Cmd+I / Ctrl+I — global close shortcut
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Auto-advance in live mode when new tool calls arrive
  useEffect(() => {
    const newCount = toolCalls.length;
    if (newCount === 0) return;

    if (mode === 'live') {
      setCurrentIndex(newCount - 1);
    } else if (newCount > prevToolCountRef.current && mode === 'manual') {
      // In manual mode we do NOT follow new calls — user is inspecting history
    }

    prevToolCountRef.current = newCount;
  }, [toolCalls.length, mode]);

  // External navigation (from pill click in chat thread, wired by P81)
  useEffect(() => {
    if (
      externalNavigateToIndex !== undefined &&
      externalNavigateToIndex >= 0 &&
      externalNavigateToIndex < toolCalls.length
    ) {
      setCurrentIndex(externalNavigateToIndex);
      const isLatest = externalNavigateToIndex === toolCalls.length - 1;
      setMode(isLatest ? 'live' : 'manual');
    }
  }, [externalNavigateToIndex, toolCalls.length]);

  // When panel first opens with existing tool calls, show the latest
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current && toolCalls.length > 0) {
      setCurrentIndex(toolCalls.length - 1);
      setMode('live');
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, toolCalls.length]);

  const safeIndex = Math.min(currentIndex, Math.max(0, toolCalls.length - 1));
  const currentTool = toolCalls[safeIndex] ?? null;
  const total = toolCalls.length;
  const isAgentRunning = agentStatus === 'running';
  const showJumpToLive = mode === 'manual' && isAgentRunning;

  // Batch grouping for slider track labels
  const batchGroups = useMemo(() => groupByBatchId(toolCalls), [toolCalls]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSliderChange = useCallback(
    ([value]: number[]) => {
      setCurrentIndex(value);
      const isLatest = value === toolCalls.length - 1;
      setMode(isLatest ? 'live' : 'manual');
    },
    [toolCalls.length],
  );

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = Math.max(0, prev - 1);
      setMode('manual');
      return next;
    });
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = Math.min(toolCalls.length - 1, prev + 1);
      const isLatest = next === toolCalls.length - 1;
      setMode(isLatest ? 'live' : 'manual');
      return next;
    });
  }, [toolCalls.length]);

  const jumpToLive = useCallback(() => {
    setCurrentIndex(toolCalls.length - 1);
    setMode('live');
  }, [toolCalls.length]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function renderEmptyState() {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-liv-muted">
          <Activity className="h-8 w-8 text-liv-muted-foreground" />
        </div>
        <div className="space-y-1 text-center">
          <h3 className="text-sm font-medium text-liv-foreground">No tool activity</h3>
          <p className="max-w-[240px] text-xs leading-relaxed text-liv-muted-foreground">
            Tool calls and results will appear here as the agent works.
          </p>
        </div>
      </div>
    );
  }

  function renderToolContent() {
    if (!currentTool) return renderEmptyState();

    return (
      <div className="flex flex-1 flex-col gap-3 overflow-auto p-4">
        {/* Tool name + status header */}
        <div className="flex items-center gap-2">
          <span className="flex-1 truncate text-sm font-medium text-liv-foreground">
            {toolDisplayName(currentTool.name)}
          </span>
          <span
            className={cn(
              'flex-shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
              statusBadgeClass(currentTool.status),
            )}
          >
            {currentTool.status}
          </span>
        </div>

        {/* Placeholder content tile — P83 will replace this with ToolViewRegistry */}
        {/* P83 will replace this placeholder with ToolViewRegistry */}
        <div className="rounded-lg border border-liv-border bg-liv-background p-3">
          <p className="mb-2 text-xs font-medium text-liv-muted-foreground">
            raw snapshot — P83 ToolViewRegistry pending
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-liv-foreground">
            {JSON.stringify(currentTool, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  function renderSliderSection() {
    if (total <= 1) return null;

    return (
      <div className="border-t border-liv-border bg-liv-muted/50 px-4 pb-4 pt-3 space-y-2">
        {/* Batch group ticks — labels for batchId boundaries above the slider */}
        {batchGroups.length > 1 && (
          <div className="relative h-4">
            {batchGroups.map((group, gi) => {
              const pct = total > 1 ? (group.startIndex / (total - 1)) * 100 : 0;
              return (
                <div
                  key={`${group.batchId ?? 'solo'}-${gi}`}
                  className="absolute top-0 -translate-x-1/2"
                  style={{ left: `${pct}%` }}
                  title={group.batchId ? `Batch ${group.batchId.slice(0, 8)}` : 'Solo tool'}
                >
                  <div className="h-1.5 w-0.5 rounded-full bg-liv-border" />
                </div>
              );
            })}
          </div>
        )}

        {/* Navigation row: prev / slider / next */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevious}
            disabled={safeIndex <= 0}
            aria-label="Previous tool call"
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-liv-muted-foreground transition-colors hover:bg-liv-accent hover:text-liv-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-liv-ring"
          >
            <Pause className="h-3.5 w-3.5" />
          </button>

          <Slider
            min={0}
            max={Math.max(0, total - 1)}
            step={1}
            value={[safeIndex]}
            onValueChange={handleSliderChange}
            aria-label="Scrub through tool call history"
            className="flex-1"
          />

          <button
            onClick={handleNext}
            disabled={safeIndex >= total - 1}
            aria-label="Next tool call"
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-liv-muted-foreground transition-colors hover:bg-liv-accent hover:text-liv-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-liv-ring"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Step counter */}
        <p className="text-center text-xs text-liv-muted-foreground">
          Step {safeIndex + 1} of {total}
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="tool-call-panel"
          initial={{ x: 480 }}
          animate={{ x: 0 }}
          exit={{ x: 480 }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="fixed inset-y-0 right-0 z-30 flex w-[480px] flex-col bg-liv-card border-l border-liv-border shadow-2xl"
          aria-label="Tool call side panel"
          role="complementary"
        >
          {/* Header */}
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-liv-border px-4 py-3">
            {/* Live / Manual badge */}
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
                mode === 'live'
                  ? 'border-green-200 bg-green-500/10 text-green-600 dark:border-green-800 dark:text-green-400'
                  : 'border-amber-200 bg-amber-500/10 text-amber-600 dark:border-amber-800 dark:text-amber-400',
              )}
              aria-live="polite"
              aria-label={mode === 'live' ? 'Live mode — tracking latest tool call' : 'Manual mode — scrubbing history'}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  mode === 'live'
                    ? 'animate-pulse bg-green-500'
                    : 'bg-amber-500',
                )}
              />
              {mode === 'live' ? 'Live' : 'Manual'}
            </div>

            {/* Panel title */}
            <span className="flex-1 truncate text-sm font-medium text-liv-foreground">
              Tool Calls
              {total > 0 && (
                <span className="ml-1.5 text-xs font-normal text-liv-muted-foreground">
                  ({total})
                </span>
              )}
            </span>

            {/* Jump to Live pill — shown only in manual mode while agent is running */}
            {showJumpToLive && (
              <button
                onClick={jumpToLive}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-green-200 bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-600 transition-colors hover:bg-green-500/20 dark:border-green-800 dark:text-green-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-liv-ring"
                aria-label="Jump to live — return to latest tool call"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                Jump to Live
              </button>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              aria-label="Close tool panel (Cmd+I)"
              title="Close (Cmd+I)"
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-liv-muted-foreground transition-colors hover:bg-liv-accent hover:text-liv-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-liv-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body — tool content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {total === 0 ? renderEmptyState() : renderToolContent()}
          </div>

          {/* Footer — slider scrubber */}
          {renderSliderSection()}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ToolCallPanel;
