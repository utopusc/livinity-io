// Two-column WORKSPACE primitives for dense admin detail screens.
//
// Layout shape:
//   <DetailHeader ... />        ← big title + muted meta line + status badges
//   <Workspace rail={…}>        ← sticky LEFT manage rail (grouped actions)
//     <WsCard>…</WsCard>        ← RIGHT column: stacked info cards (no tabs)
//   </Workspace>
//
// All styling lives in admin.css (.ws / .ws-header / .ws-rail / .ws-main /
// .ws-card / .ws-kv). These components are presentation-only — no data
// fetching, no client state — so they stay framework-light and reusable.

import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// DetailHeader — clean detail-screen header (title + meta + badges + right slot)
// ---------------------------------------------------------------------------
export type DetailHeaderProps = {
  title: ReactNode;
  /** Muted meta/subtitle line under the title (e.g. email · joined date). */
  subtitle?: ReactNode;
  /** Row of status badges rendered under the meta line. */
  badges?: ReactNode;
  /** Optional right-aligned slot (e.g. a back link or top-level action). */
  right?: ReactNode;
};

export function DetailHeader({ title, subtitle, badges, right }: DetailHeaderProps) {
  return (
    <div className="ws-header">
      <div className="ws-header-main">
        <h1 className="ws-header-title">{title}</h1>
        {subtitle != null ? <div className="ws-header-sub">{subtitle}</div> : null}
        {badges != null ? <div className="ws-header-badges">{badges}</div> : null}
      </div>
      {right != null ? <div className="ws-header-right">{right}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workspace — sticky left rail + flexible right column
// ---------------------------------------------------------------------------
export type WorkspaceProps = {
  /** Optional detail header rendered above the two-column grid. */
  header?: ReactNode;
  /** Left sticky rail content (grouped action sections). */
  rail: ReactNode;
  /** Right column content — stacked WsCard blocks. */
  children: ReactNode;
};

export function Workspace({ header, rail, children }: WorkspaceProps) {
  return (
    <>
      {header != null ? header : null}
      <div className="ws">
        <aside className="ws-rail">{rail}</aside>
        <div className="ws-main">{children}</div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// WsCard — consistent right-column card (header row + body)
// ---------------------------------------------------------------------------
export type WsCardProps = {
  title: ReactNode;
  /** Optional right-aligned slot in the card header (count, action, badge). */
  right?: ReactNode;
  children: ReactNode;
};

export function WsCard({ title, right, children }: WsCardProps) {
  return (
    <section className="ws-card">
      <div className="ws-card-head">
        <h2 className="ws-card-title">{title}</h2>
        {right != null ? <div className="ws-card-right">{right}</div> : null}
      </div>
      <div className="ws-card-body">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// KV — a single key/value row (for billing facts inside a WsCard)
// ---------------------------------------------------------------------------
export type KVProps = {
  label: ReactNode;
  children: ReactNode;
};

export function KV({ label, children }: KVProps) {
  return (
    <div className="ws-kv">
      <span className="ws-kv-label">{label}</span>
      <span className="ws-kv-value">{children}</span>
    </div>
  );
}
