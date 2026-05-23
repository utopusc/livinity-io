/**
 * Phase 202-08 — OpenUI Lang component whitelist.
 *
 * Defines the 14 components the LLM is allowed to emit through the
 * `ui_render` tool. Each entry pairs a component name with:
 *   - a zod schema for its props (validated on render)
 *   - a React render function that maps validated props + children to JSX
 *
 * The renderer (openui-renderer.tsx) walks the OpenUI Lang JSON tree and:
 *   1. Looks up the component by name in `OPENUI_COMPONENTS`.
 *   2. If absent: renders `<UnknownComponent name=… />` (no crash, no
 *      silent swallow — operator sees what the model tried to emit).
 *   3. If present: zod-parses props; on failure shows a small error chip;
 *      on success calls the render fn with parsed props + walked children.
 *
 * INV-202-05: All component names + emitted strings are English.
 * T-202-06 (XSS):
 *   - No `dangerouslySetInnerHTML` anywhere in this file.
 *   - Image src URLs are validated by `isSafeUrl()` — only https://,
 *     protocol-relative //, root-relative /, or data:image/* pass.
 *     javascript:, vbscript:, file:, data:text/html etc. are rejected
 *     and rendered as a placeholder.
 *   - Link href URLs use the same `isSafeUrl()` gate; rejected hrefs
 *     fall back to `#` and the link gets `aria-disabled`.
 *   - `target="_blank"` always pairs with `rel="noopener noreferrer"`.
 */

import type { ReactNode } from 'react';
import { z } from 'zod';

// ─── Safe-URL gate (T-202-06) ──────────────────────────────────────────

const SAFE_IMG_DATA_PREFIX = /^data:image\/(png|jpeg|gif|webp|svg\+xml);/i;
const DANGEROUS_SCHEMES = /^(javascript|vbscript|data|file|about):/i;

export function isSafeUrl(value: unknown, opts: { allowDataImage?: boolean } = {}): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  const v = value.trim();

  // data:image/* is allowed only when explicitly requested (image src).
  if (opts.allowDataImage && SAFE_IMG_DATA_PREFIX.test(v)) return true;

  // Reject any dangerous scheme.
  if (DANGEROUS_SCHEMES.test(v)) return false;

  // https://, protocol-relative, root-relative, fragment — all OK.
  if (/^https:\/\//i.test(v)) return true;
  if (v.startsWith('//')) return true;
  if (v.startsWith('/')) return true;
  if (v.startsWith('#')) return true;

  // Plain http:// is rejected (forces secure-context for any LLM-emitted URL).
  return false;
}

// ─── Component prop schemas + render functions ─────────────────────────

/**
 * A render context that components receive after props are validated.
 * `children` are already walked by the renderer — each is either a JSX
 * node (for known components) or an unknown-component fallback.
 */
export interface RenderContext {
  children: ReactNode;
  /** node index inside its parent — used as a stable React key. */
  key: string;
}

export interface ComponentDef<TProps> {
  /** zod schema for the props bag. children are passed separately. */
  propsSchema: z.ZodType<TProps>;
  /** maps validated props + walked children to JSX. */
  render: (props: TProps, ctx: RenderContext) => ReactNode;
}

// helper: build a typed entry without losing inference
function defineComponent<TProps>(def: ComponentDef<TProps>): ComponentDef<TProps> {
  return def;
}

// — heading —
const headingProps = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  text: z.string().optional(),
});
const headingDef = defineComponent<z.infer<typeof headingProps>>({
  propsSchema: headingProps,
  render: (p, ctx) => {
    const level = p.level ?? 2;
    const cls =
      level === 1
        ? 'text-2xl font-semibold tracking-tight mb-2'
        : level === 2
          ? 'text-xl font-semibold tracking-tight mb-1.5'
          : level === 3
            ? 'text-lg font-medium mb-1'
            : 'text-base font-medium mb-1';
    const content = p.text ?? ctx.children;
    if (level === 1) return <h1 key={ctx.key} className={cls}>{content}</h1>;
    if (level === 2) return <h2 key={ctx.key} className={cls}>{content}</h2>;
    if (level === 3) return <h3 key={ctx.key} className={cls}>{content}</h3>;
    return <h4 key={ctx.key} className={cls}>{content}</h4>;
  },
});

// — text — inline span
const textProps = z.object({
  text: z.string().optional(),
  tone: z.enum(['default', 'muted', 'success', 'danger']).optional(),
});
const textDef = defineComponent<z.infer<typeof textProps>>({
  propsSchema: textProps,
  render: (p, ctx) => {
    const toneCls =
      p.tone === 'muted'
        ? 'text-muted-foreground'
        : p.tone === 'success'
          ? 'text-emerald-600 dark:text-emerald-400'
          : p.tone === 'danger'
            ? 'text-red-600 dark:text-red-400'
            : '';
    return (
      <span key={ctx.key} className={toneCls}>
        {p.text ?? ctx.children}
      </span>
    );
  },
});

// — paragraph —
const paragraphProps = z.object({
  text: z.string().optional(),
});
const paragraphDef = defineComponent<z.infer<typeof paragraphProps>>({
  propsSchema: paragraphProps,
  render: (p, ctx) => (
    <p key={ctx.key} className="my-1.5 text-sm leading-relaxed text-foreground">
      {p.text ?? ctx.children}
    </p>
  ),
});

// — button — display only; onClick is intentionally a no-op (interactive
//   callbacks land in Phase 220+ when ui_render gets a return path).
const buttonProps = z.object({
  label: z.string(),
  variant: z.enum(['default', 'outline', 'ghost']).optional(),
});
const buttonDef = defineComponent<z.infer<typeof buttonProps>>({
  propsSchema: buttonProps,
  render: (p, ctx) => {
    const base =
      'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-50';
    const variantCls =
      p.variant === 'outline'
        ? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
        : p.variant === 'ghost'
          ? 'hover:bg-accent hover:text-accent-foreground'
          : 'bg-primary text-primary-foreground hover:bg-primary/90';
    return (
      <button
        key={ctx.key}
        type="button"
        className={`${base} ${variantCls}`}
        onClick={() => {
          /* no-op — Phase 220+ wires emit-back path */
        }}
      >
        {p.label}
      </button>
    );
  },
});

// — list — bulleted by default; numbered via variant='ordered'
const listProps = z.object({
  variant: z.enum(['unordered', 'ordered']).optional(),
});
const listDef = defineComponent<z.infer<typeof listProps>>({
  propsSchema: listProps,
  render: (p, ctx) => {
    const cls = 'ml-5 my-1.5 space-y-0.5 text-sm';
    return p.variant === 'ordered' ? (
      <ol key={ctx.key} className={`list-decimal ${cls}`}>
        {/* children are already <li>-able nodes; wrap each in a list-item
            row regardless of what came back from the recursive walk. */}
        {Array.isArray(ctx.children) ? (
          ctx.children.map((child, i) => <li key={i}>{child}</li>)
        ) : (
          <li>{ctx.children}</li>
        )}
      </ol>
    ) : (
      <ul key={ctx.key} className={`list-disc ${cls}`}>
        {Array.isArray(ctx.children) ? (
          ctx.children.map((child, i) => <li key={i}>{child}</li>)
        ) : (
          <li>{ctx.children}</li>
        )}
      </ul>
    );
  },
});

// — card — bordered container with optional header
const cardProps = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
});
const cardDef = defineComponent<z.infer<typeof cardProps>>({
  propsSchema: cardProps,
  render: (p, ctx) => (
    <div key={ctx.key} className="rounded-lg border bg-card p-3 shadow-sm">
      {(p.title || p.subtitle) && (
        <div className="mb-2 border-b pb-2">
          {p.title && <div className="text-sm font-semibold text-foreground">{p.title}</div>}
          {p.subtitle && (
            <div className="text-xs text-muted-foreground">{p.subtitle}</div>
          )}
        </div>
      )}
      <div className="text-sm">{ctx.children}</div>
    </div>
  ),
});

// — image —
const imageProps = z.object({
  src: z.string(),
  alt: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
const imageDef = defineComponent<z.infer<typeof imageProps>>({
  propsSchema: imageProps,
  render: (p, ctx) => {
    if (!isSafeUrl(p.src, { allowDataImage: true })) {
      return (
        <div
          key={ctx.key}
          className="my-1.5 rounded border border-dashed border-muted-foreground/40 bg-muted/30 p-2 text-xs text-muted-foreground"
        >
          [image rejected: unsafe URL]
        </div>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={ctx.key}
        src={p.src}
        alt={p.alt ?? ''}
        width={p.width}
        height={p.height}
        className="my-1.5 max-w-full rounded border"
      />
    );
  },
});

// — link —
const linkProps = z.object({
  href: z.string(),
  text: z.string().optional(),
  external: z.boolean().optional(),
});
const linkDef = defineComponent<z.infer<typeof linkProps>>({
  propsSchema: linkProps,
  render: (p, ctx) => {
    const safe = isSafeUrl(p.href);
    return (
      <a
        key={ctx.key}
        href={safe ? p.href : '#'}
        aria-disabled={!safe || undefined}
        target={p.external ? '_blank' : undefined}
        rel={p.external ? 'noopener noreferrer' : undefined}
        className={
          safe
            ? 'text-primary underline-offset-2 hover:underline'
            : 'cursor-not-allowed text-muted-foreground line-through'
        }
      >
        {p.text ?? ctx.children}
      </a>
    );
  },
});

// — divider —
const dividerProps = z.object({});
const dividerDef = defineComponent<z.infer<typeof dividerProps>>({
  propsSchema: dividerProps,
  render: (_p, ctx) => <hr key={ctx.key} className="my-2 border-border" />,
});

// — layout-stack — vertical flex container
const layoutStackProps = z.object({
  gap: z.number().int().min(0).max(8).optional(),
});
const layoutStackDef = defineComponent<z.infer<typeof layoutStackProps>>({
  propsSchema: layoutStackProps,
  render: (p, ctx) => {
    const gap = p.gap ?? 2;
    return (
      <div key={ctx.key} className={`flex flex-col gap-${gap}`}>
        {ctx.children}
      </div>
    );
  },
});

// — layout-row — horizontal flex container
const layoutRowProps = z.object({
  gap: z.number().int().min(0).max(8).optional(),
  align: z.enum(['start', 'center', 'end', 'between']).optional(),
});
const layoutRowDef = defineComponent<z.infer<typeof layoutRowProps>>({
  propsSchema: layoutRowProps,
  render: (p, ctx) => {
    const gap = p.gap ?? 2;
    const alignCls =
      p.align === 'center'
        ? 'items-center'
        : p.align === 'end'
          ? 'items-end justify-end'
          : p.align === 'between'
            ? 'items-center justify-between'
            : 'items-start';
    return (
      <div key={ctx.key} className={`flex flex-row ${alignCls} gap-${gap}`}>
        {ctx.children}
      </div>
    );
  },
});

// — badge — pill chip
const badgeProps = z.object({
  text: z.string(),
  tone: z.enum(['default', 'success', 'warning', 'danger', 'info']).optional(),
});
const badgeDef = defineComponent<z.infer<typeof badgeProps>>({
  propsSchema: badgeProps,
  render: (p, ctx) => {
    const toneCls =
      p.tone === 'success'
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
        : p.tone === 'warning'
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
          : p.tone === 'danger'
            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
            : p.tone === 'info'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
              : 'bg-secondary text-secondary-foreground';
    return (
      <span
        key={ctx.key}
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneCls}`}
      >
        {p.text}
      </span>
    );
  },
});

// — input — display-only (disabled). Interactive form posting is Phase 220+.
const inputProps = z.object({
  value: z.string().optional(),
  placeholder: z.string().optional(),
  label: z.string().optional(),
});
const inputDef = defineComponent<z.infer<typeof inputProps>>({
  propsSchema: inputProps,
  render: (p, ctx) => (
    <div key={ctx.key} className="my-1.5">
      {p.label && (
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {p.label}
        </label>
      )}
      <input
        type="text"
        disabled
        readOnly
        value={p.value ?? ''}
        placeholder={p.placeholder}
        className="h-9 w-full rounded-md border border-input bg-muted/40 px-3 text-sm shadow-sm"
      />
    </div>
  ),
});

// — table —
const tableProps = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
});
const tableDef = defineComponent<z.infer<typeof tableProps>>({
  propsSchema: tableProps,
  render: (p, ctx) => (
    <div key={ctx.key} className="my-2 overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {p.columns.map((col) => (
              <th
                key={col}
                className="border-b px-3 py-2 text-left text-xs font-medium text-muted-foreground"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.rows.map((row, ri) => (
            <tr key={ri} className="border-b last:border-0">
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2">
                  {cell === null || cell === undefined ? '' : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
});

/**
 * The whitelist. Renderer ONLY accepts components whose name is a key
 * here. Anything else falls back to UnknownComponent in the renderer
 * (T-202-06). 14 entries.
 */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous component def map
export const OPENUI_COMPONENTS: Record<string, ComponentDef<any>> = {
  heading: headingDef,
  text: textDef,
  paragraph: paragraphDef,
  button: buttonDef,
  list: listDef,
  card: cardDef,
  image: imageDef,
  link: linkDef,
  divider: dividerDef,
  'layout-stack': layoutStackDef,
  'layout-row': layoutRowDef,
  badge: badgeDef,
  input: inputDef,
  table: tableDef,
};

export const OPENUI_ALLOWED_COMPONENT_NAMES = Object.keys(OPENUI_COMPONENTS);
