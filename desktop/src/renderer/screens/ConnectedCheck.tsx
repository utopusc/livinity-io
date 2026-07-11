/**
 * src/renderer/screens/ConnectedCheck.tsx
 *
 * Screen 6 of the install-orchestration flow (INSTALL-04; D-05) -- the
 * bounded wait between install.sh exiting 0 and the arrival moment
 * (LiveSuccess.tsx). Kicks off the main-side D-05 three-probe orchestrator
 * (`flowConnectedCheck`, its own bounded retry) on mount and renders exactly
 * ONE calm combined wait, not a 3-item checklist (05-UI-SPEC Screen 6).
 *
 * Two-state swap, SAME shell (not a screen navigation, per 05-UI-SPEC): the
 * active wait ("Almost there") and the honest fallback ("Your box is
 * installed") share one `<div className="setup-shell setup-shell--
 * centered"><section>` container -- only the inner content swaps, announced
 * via `aria-live="polite"` so a screen-reader user hears the change without
 * a focus jump.
 *
 * - `{ kind: 'connected' }` -> calls `onConnected(address)`; App.tsx swaps to
 *   LiveSuccess.tsx with no separate "success!" transition screen.
 * - `{ kind: 'still-confirming' }` -> swaps in-place to the honest fallback.
 *   This is NOT an error (monochrome, no red, no alarm) -- being unable to
 *   confirm reachability within the bounded window is normal (tunnel
 *   warm-up), and "Open your Livinity" stays the primary CTA, never blocked
 *   (most likely the tunnel just hasn't warmed up yet).
 *
 * The bounded-timeout duration lives entirely main-side inside
 * flowConnectedCheck -- this screen is timeout-value-agnostic by design.
 *
 * IN-06 discipline: a `cancelled` ref guards the on-mount probe so a late
 * resolve after unmount (e.g. the user navigates away some other way) is a
 * no-op -- never a setState-after-unmount warning, never a stray onConnected
 * call.
 */

import { useEffect, useRef, useState } from 'react';

interface ConnectedCheckProps {
  onConnected: (address: string | null) => void;
}

export default function ConnectedCheck({ onConnected }: ConnectedCheckProps) {
  const [fallback, setFallback] = useState<{ address: string | null } | null>(null);

  // Refs so the mount-once probe never re-subscribes on a parent re-render
  // (onConnected is typically an inline arrow) and a late resolve after
  // unmount is a safe no-op (IN-06).
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  const cancelledRef = useRef(false);

  useEffect(() => {
    async function run(): Promise<void> {
      const result = await window.api.flowConnectedCheck();
      if (cancelledRef.current) return;
      if (result.kind === 'connected') {
        onConnectedRef.current(result.address);
        return;
      }
      setFallback({ address: result.address });
    }
    void run();
    return () => {
      cancelledRef.current = true;
    };
    // Runs once on mount -- the D-05 probe kicks off exactly once per screen
    // entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="setup-shell setup-shell--centered">
      <section aria-busy={!fallback} aria-live="polite">
        {!fallback ? (
          <>
            <h1 className="display">Almost there</h1>
            <p className="note-line" style={{ marginTop: 16 }}>
              Confirming your box is reachable at your address…
            </p>
            <div style={{ marginTop: 24 }}>
              <div
                className="progress-track progress-indeterminate"
                role="progressbar"
                aria-label="Working"
              >
                <div className="progress-fill" />
              </div>
            </div>
          </>
        ) : (
          <>
            <h1 className="display">Your box is installed</h1>
            <p className="note-line" style={{ marginTop: 16 }}>
              We&apos;re still confirming it&apos;s reachable at your address — this can take a
              minute right after installing. You can try opening it now, or wait a moment.
            </p>
            {/* Never blocked -- the same primary CTA as LiveSuccess.tsx, calling
                the same enum-allowlisted, main-side-derived flowOpenBox(). */}
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 24 }}
              onClick={() => void window.api.flowOpenBox()}
            >
              Open your Livinity
            </button>
            <p className="note-line" style={{ marginTop: 16 }}>
              We&apos;ll keep checking in the background.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
