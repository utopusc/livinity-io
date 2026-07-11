/**
 * src/renderer/screens/LiveSuccess.tsx
 *
 * The arrival screen (INSTALL-04; D-05/D-06) -- the operator's core ask
 * ("kurulum bitince yönetebileceğim bir şey çıksın") made concrete. This is
 * the D-06 supersession of the interim `wsl-handoff` card in App.tsx (the
 * `bb30bd92` block) -- a future wiring plan (05-09) replaces that block with
 * this component, gated behind ConnectedCheck's confirmed verdict.
 *
 * Rendered ONLY once ConnectedCheck's D-05 three-probe verdict has actually
 * returned `{ kind: 'connected' }` -- this screen never shows a
 * "connecting…" sub-state itself (that wait lives entirely in
 * ConnectedCheck.tsx, a distinct screen that hands off here on success).
 *
 * Layout order == tab order (05-UI-SPEC Screen 2): Display "Your Livinity is
 * live" -> status line (the reused CheckGlyph SVG + the literal word
 * "Connected", Label role -- never color-alone, WCAG 1.4.1) -> body -> the
 * address as a copyable mono chip (reused CopyButton, Nameservers.tsx) ->
 * the honest tray note (LOCKED copy -- never claim "always-on") -> the one
 * primary "Open your Livinity" CTA. No "Continue" button: this is the
 * terminal screen of the v1 GUI flow until Phase 6 ships tray supervision.
 *
 * Color exception (05-UI-SPEC Color section): the green "Connected" check is
 * the ONE deliberate `var(--status-running)` use in the whole app outside
 * the tray icon itself -- reusing InstallingProgress.tsx's CheckGlyph SVG
 * (stroke="currentColor"), color-swapped via an inline style wrapper, never
 * a new glyph or a new CSS rule. The accent "Open your Livinity" CTA is the
 * screen's only other color -- this is the one screen allowed two colored
 * elements (05-UI-SPEC: a status readout and a CTA don't compete for the
 * same job the "one accent per screen" rule protects against).
 *
 * Security (T-05-06): "Open your Livinity" calls flowOpenBox() with NO
 * arguments -- the URL is derived MAIN-SIDE from trusted state, never a
 * renderer-supplied address, so a compromised renderer can't open an
 * arbitrary URL through shell.openExternal. The `address` prop here is
 * DISPLAY-ONLY (T-05-01: a non-secret public hostname).
 */

import { useEffect, useRef, useState } from 'react';

interface LiveSuccessProps {
  address: string | null;
}

const COPIED_RESET_MS = 1800;

/** Reused verbatim from InstallingProgress.tsx (same stroke="currentColor"
 * glyph) -- wrapping it in a `color: var(--status-running)` span is the
 * entire "color-swap": no new SVG, no new CSS class. */
function CheckGlyph(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 12.5l5 5 11-11"
      />
    </svg>
  );
}

function CopyGlyph(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1"
      />
    </svg>
  );
}

// SR-only style for the "Copied ✓" live region -- identical to Nameservers.tsx
// (kept out of the button's accessible name so the announcement doesn't
// clobber the aria-label).
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * The animated "Copied ✓" copy button, reused verbatim from
 * `cloudflare/Nameservers.tsx` (the only prior place this pattern is
 * implemented) -- duplicated per this codebase's existing per-screen
 * convention (no shared copy-button component has been extracted yet).
 */
function CopyButton({ value, label }: { value: string; label: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard denied -- the address stays selectable text as a fallback,
      // so the user can still copy it by hand.
    }
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }

  return (
    <>
      <button
        type="button"
        className={`btn copy-btn${copied ? ' copied' : ''}`}
        aria-label={label}
        onClick={() => void handleCopy()}
      >
        <span aria-hidden="true">{copied ? 'Copied' : <CopyGlyph />}</span>
        <span className="copy-check" aria-hidden="true">
          ✓
        </span>
      </button>
      <span role="status" aria-live="polite" style={SR_ONLY}>
        {copied ? 'Copied ✓' : ''}
      </span>
    </>
  );
}

export default function LiveSuccess({ address }: LiveSuccessProps) {
  return (
    <div className="setup-shell">
      <section>
        <h1 className="display">Your Livinity is live</h1>

        {/* Status line: green check glyph + the literal word "Connected" --
            never color-alone (WCAG 1.4.1). The one deliberate green
            exception in the whole app outside the tray icon. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 24 }}>
          <span
            aria-hidden="true"
            style={{ color: 'var(--status-running)', display: 'inline-flex' }}
          >
            <CheckGlyph />
          </span>
          <span className="field-label" style={{ color: 'var(--status-running)' }}>
            Connected
          </span>
        </div>

        <p className="note-line" style={{ marginTop: 8 }}>
          Your box is up and reachable at your own address:
        </p>

        {/* Address block -- omitted (never a dead end) when the address
            couldn't be derived; the rest of the screen still renders. */}
        {address && (
          <div
            className="card"
            style={{
              marginTop: 16,
              background: 'var(--surface-2)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div className="card-row">
              <span className="field-label">Your address</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="value-chip mono">{address}</span>
                <CopyButton value={address} label="Copy your address" />
              </div>
            </div>
          </div>
        )}

        {/* Honest tray note -- LOCKED copy (05-UI-SPEC Copywriting Contract),
            never soften or remove: the box is live THIS SESSION only, not
            "always-on" yet -- that's Phase 6's tray app, stated plainly. */}
        <p className="note-line" style={{ marginTop: 24 }}>
          Livinity is running right now. Keeping it on automatically, and controlling it — start,
          stop, restart — from a tray icon arrives next.
        </p>

        {/* Primary CTA -- a real <button> (never a raw <a href>, Accessibility
            Contract) so the main-side external-nav allowlist gate stays
            intact (T-05-06). No "Continue": this is the terminal screen. */}
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 32 }}
          onClick={() => void window.api.flowOpenBox()}
        >
          Open your Livinity
        </button>
      </section>
    </div>
  );
}
