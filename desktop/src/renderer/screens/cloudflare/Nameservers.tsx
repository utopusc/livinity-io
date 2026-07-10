/**
 * src/renderer/screens/cloudflare/Nameservers.tsx
 *
 * Screen 3 of the Free/BYOD Cloudflare wizard (CF-04; D-10..D-12) -- the
 * "point your domain to Cloudflare" / zone-not-active detour.
 *
 * Structure (also tab order, per 03-UI-SPEC): heading -> body naming the zone ->
 * two nameserver copy-rows (mono value + the reusable animated "Copied ✓" copy
 * button) -> calm authority warning (.note-line, NOT red) -> timing / safe-to-
 * close note (.note-line) -> "Check again" accent primary -> still-not-active
 * result region (aria-live, neutral copy).
 *
 * The two nameservers are LIVE per-zone values (D-10) -- passed in from the
 * cfSelectDomain/cfRecheckZone result, never hard-coded. "Check again" is the
 * PRIMARY manual re-check (D-12); a gentle background poll (30s -> backoff) is a
 * silent bonus that surfaces only through the same "Checking your domain…" tick
 * and never hides/replaces the manual button. On {kind:'active'} the wizard
 * advances; {kind:'pending'} refreshes the displayed nameservers + shows a
 * NEUTRAL (not red) "still not active" line; {kind:'network'} offers a retry.
 *
 * Security (T-03-18): the copied strings are the user's own public Cloudflare
 * nameservers -- non-secret zone data; no token or connector secret is here.
 */

import { useEffect, useRef, useState } from 'react';

interface NameserversProps {
  zoneId: string;
  zoneName: string;
  nameServers: string[];
  onActive: () => void;
}

const POLL_INITIAL_MS = 30_000;
const POLL_MAX_MS = 120_000;
const COPIED_RESET_MS = 1800;

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

// SR-only style for the "Copied ✓" live region -- keeps the announcement out of
// the button's accessible name (which is the aria-label "Copy nameserver N of 2")
// without needing a net-new CSS class (this plan touches only the 3 screens).
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
 * The web-guide's animated "Copied ✓" copy button, reused verbatim on the token
 * system's .copy-btn / .copy-btn.copied classes (the check pops in; the
 * transition is prefers-reduced-motion-guarded in styles.css). Neutral .btn --
 * never accent, never red. The confirmation is announced via a separate
 * aria-live="polite" region so screen-reader users hear "Copied ✓" without the
 * button's aria-label being clobbered.
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
      // Clipboard denied -- the nameserver value stays selectable text as a
      // fallback, so the user can still copy it by hand.
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

export default function Nameservers({ zoneId, zoneName, nameServers, onActive }: NameserversProps) {
  const [servers, setServers] = useState<string[]>(nameServers);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<'pending' | 'network' | null>(null);

  // Refs so the mount-once background poll never re-subscribes on a parent
  // re-render (onActive is typically an inline arrow) and never double-fires
  // alongside a manual "Check again".
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;
  const zoneIdRef = useRef(zoneId);
  zoneIdRef.current = zoneId;
  const inFlightRef = useRef(false);

  async function recheck(manual: boolean): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setChecking(true);
    if (manual) setResult(null);
    try {
      const r = await window.api.cfRecheckZone(zoneIdRef.current);
      if (r.kind === 'active') {
        onActiveRef.current();
        return;
      }
      if (r.kind === 'pending') {
        if (r.nameServers.length > 0) setServers(r.nameServers);
        if (manual) setResult('pending');
        return;
      }
      // network
      if (manual) setResult('network');
    } catch {
      if (manual) setResult('network');
    } finally {
      inFlightRef.current = false;
      setChecking(false);
    }
  }

  // Gentle background auto-poll (D-12 bonus): silent, backs off 30s -> 120s,
  // surfaces only through the shared "Checking your domain…" tick, and is fully
  // torn down on unmount. It never hides/replaces the manual button below.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = POLL_INITIAL_MS;

    async function poll(): Promise<void> {
      if (cancelled) return;
      await recheck(false);
      if (cancelled) return;
      delay = Math.min(Math.round(delay * 1.5), POLL_MAX_MS);
      timer = setTimeout(() => void poll(), delay);
    }

    timer = setTimeout(() => void poll(), delay);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Mount-once: zoneId/onActive are read through refs, so no re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="card">
      <h1 className="heading">Point your domain to Cloudflare</h1>
      <p className="note-line" style={{ marginTop: 8 }}>
        Your domain {zoneName} is on Cloudflare but isn&apos;t active yet. At the company where you
        bought it, replace its nameservers with these two:
      </p>

      {/* Two live nameserver copy-rows: selectable mono value + animated copy button. */}
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {servers.map((ns, i) => (
          <div
            key={ns}
            className="card-row"
            style={{ position: 'relative', justifyContent: 'space-between' }}
          >
            <span className="value-chip mono">{ns}</span>
            <CopyButton value={ns} label={`Copy nameserver ${i + 1} of ${servers.length}`} />
          </div>
        ))}
      </div>

      {/* Authority warning -- calm .note-line, deliberately NOT red. */}
      <p className="note-line" style={{ marginTop: 24 }}>
        Until Cloudflare is in charge of your domain, nothing else will work — even if the old
        nameservers still show up for a while.
      </p>

      {/* Timing / safe-to-close -- also a calm .note-line. */}
      <p className="note-line" style={{ marginTop: 16 }}>
        This can take a few minutes to a few hours. You can close Livinity and come back later —
        we&apos;ll pick up right here.
      </p>

      {/* "Check again" -- the PRIMARY manual re-check (accent). Always visible;
          the background poll never hides it. */}
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 24 }}
        aria-busy={checking}
        disabled={checking}
        onClick={() => void recheck(true)}
      >
        {checking ? 'Checking your domain…' : 'Check again'}
      </button>

      {/* Still-not-active / network result -- neutral copy for pending (NOT red). */}
      <div aria-live="polite" style={{ marginTop: 16, minHeight: '1.5em' }}>
        {!checking && result === 'pending' && (
          <p className="note-line">
            Still not active yet. Nameserver changes can take a while — check again in a bit.
          </p>
        )}
        {!checking && result === 'network' && (
          <>
            <p className="error-line">
              Couldn&apos;t reach Cloudflare. Check your connection and try again.
            </p>
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: 8 }}
              onClick={() => void recheck(true)}
            >
              Try again
            </button>
          </>
        )}
      </div>
    </section>
  );
}
