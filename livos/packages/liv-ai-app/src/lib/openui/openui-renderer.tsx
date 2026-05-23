/**
 * Phase 202-08 — OpenUI Lang renderer + `ui_render` tool registration.
 *
 * The agent emits a JSON tree via the `ui_render` built-in tool (Phase
 * 202-08 backend addition). assistant-ui surfaces the tool call as a
 * tool-call message part; this file's `UiRenderTool` registers a renderer
 * for `toolName === 'ui_render'` that walks the tree and mounts the
 * matching whitelisted component for each node.
 *
 * Rule-3 deviation (Plan 202-08 Task 1): the originally specified npm
 * package `@openuidev/renderer` does NOT exist on the public registry
 * (`npm view @openuidev/renderer` → 404). The plan's deviation handler
 * clause (b) authorises shipping a minimal in-repo renderer instead. The
 * `ui_render` tool surface (loose `tree: z.unknown()` input) is
 * unchanged; only the consumer of the tree lives in-repo now.
 *
 * INV-202-10: this file is a NEW addition. tool-renderers.tsx is touched
 * separately to mount <UiRenderTool /> alongside the 16 frozen renderers.
 * No semantic change to existing renderers.
 *
 * T-202-06 (XSS mitigation):
 *   - 14-component whitelist (OPENUI_COMPONENTS) — unknown component
 *     names render as `[unknown component: <name>]` placeholder.
 *   - Props are zod-parsed; malformed props render a small error chip
 *     rather than crashing the render tree.
 *   - Image src / link href URLs are validated by `isSafeUrl()` —
 *     javascript:, vbscript:, file: schemes rejected.
 *   - No `dangerouslySetInnerHTML` anywhere.
 *   - All text content flows through React's standard escape path.
 *
 * Recursion depth cap (defence-in-depth): tree depth > 32 collapses to a
 * placeholder so a pathological model emission can't blow the React stack.
 */

'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import type { ReactNode } from 'react';

import { OPENUI_COMPONENTS, type ComponentDef } from './openui-components';

const MAX_TREE_DEPTH = 32;

/** OpenUI Lang node shape (validated at render time, not zod-typed). */
interface OpenUiNode {
  component?: unknown;
  props?: unknown;
  children?: unknown;
  text?: unknown;
}

/** Renders an arbitrary tree value as React children. */
function renderNode(node: unknown, depth: number, key: string): ReactNode {
  if (depth > MAX_TREE_DEPTH) {
    return (
      <span key={key} className="text-xs text-red-600 dark:text-red-400">
        [tree too deep]
      </span>
    );
  }
  // Plain strings/numbers/booleans are rendered as text content.
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'boolean') return node ? 'true' : 'false';
  if (node === null || node === undefined) return null;

  // Array → walk each entry as a sibling.
  if (Array.isArray(node)) {
    return node.map((entry, i) =>
      renderNode(entry, depth + 1, `${key}.${i}`),
    );
  }

  // Object → must be an OpenUI node with a `component` field.
  if (typeof node === 'object') {
    const n = node as OpenUiNode;
    const componentName = typeof n.component === 'string' ? n.component : null;
    if (!componentName) {
      return (
        <span key={key} className="text-xs text-red-600 dark:text-red-400">
          [node missing component name]
        </span>
      );
    }
    const def: ComponentDef<unknown> | undefined = OPENUI_COMPONENTS[componentName];
    if (!def) {
      return (
        <span
          key={key}
          className="inline-block rounded border border-dashed border-muted-foreground/40 bg-muted/30 px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          [unknown component: {componentName}]
        </span>
      );
    }
    // Validate props.
    const propsCandidate = n.props ?? {};
    const parsed = def.propsSchema.safeParse(propsCandidate);
    if (!parsed.success) {
      return (
        <span
          key={key}
          className="inline-block rounded border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          title={parsed.error.message}
        >
          [invalid props on &lt;{componentName}&gt;]
        </span>
      );
    }
    // Walk children. children may be a single node, an array, or absent.
    const childrenValue = n.children;
    const walkedChildren =
      childrenValue === undefined
        ? null
        : Array.isArray(childrenValue)
          ? childrenValue.map((c, i) => renderNode(c, depth + 1, `${key}.c${i}`))
          : renderNode(childrenValue, depth + 1, `${key}.c`);
    return def.render(parsed.data, { children: walkedChildren, key });
  }

  // Anything else (function, symbol, bigint) — drop silently.
  return null;
}

// ─── makeAssistantToolUI wrapper ───────────────────────────────────────

interface UiRenderArgs {
  tree?: unknown;
  title?: string;
}
interface UiRenderResult {
  rendered: true;
  title?: string;
}

export const UiRenderTool = makeAssistantToolUI<UiRenderArgs, UiRenderResult>({
  toolName: 'ui_render',
  render: ({ args, status }) => {
    // While args are still streaming we show a tiny placeholder so the
    // chat doesn't flash an empty card.
    if (status.type === 'running' && (args === undefined || args.tree === undefined)) {
      return (
        <div className="my-2 rounded-md border bg-card p-3 text-sm text-muted-foreground">
          Composing UI…
        </div>
      );
    }
    if (status.type === 'incomplete') {
      const reason = (status as { reason?: string }).reason;
      if (reason === 'cancelled') {
        return (
          <div className="my-2 rounded-md border bg-card p-3 text-sm text-muted-foreground">
            Cancelled
          </div>
        );
      }
      return (
        <div className="my-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          UI render failed
        </div>
      );
    }
    const title = args?.title;
    const tree = args?.tree;
    return (
      <div className="my-2 rounded-md border bg-card p-3 shadow-sm">
        {title && (
          <div className="mb-2 border-b pb-2 text-sm font-medium text-foreground">
            {title}
          </div>
        )}
        <div className="text-sm text-foreground">{renderNode(tree, 0, 'root')}</div>
      </div>
    );
  },
});
