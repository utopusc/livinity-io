/**
 * src/renderer/screens/NoTunnel410.tsx
 *
 * The dedicated calm 410/no-managed-tunnel screen (INSTALL-03; D-08, D-11) --
 * an account-level state, NOT a fault the user caused. Framed exactly like
 * BiosDeadEnd.tsx (a task/waiting-on-something-else state): monochrome
 * Display title (NEVER red), `--fg-dim` body, a working "Check again", and a
 * "Contact support" link. Deliberately its OWN screen, not a variant of
 * UnifiedError.tsx's generic shape (D-08: "never the generic failure card")
 * -- it has no `.error-line`, no ordered help-step list (provisioning the
 * missing tunnel is entirely platform-side and out of app scope, D-11).
 *
 * T-05-06 (Tampering, external-nav allowlist): "Contact support" calls
 * `flowOpenExternal('support')` -- an enum target, never a renderer-chosen
 * URL. The main-side handler maps it to a FIXED support URL, mirroring
 * wslOpenExternal/cfOpenExternal's enum-allowlisted external open.
 */

import { useState } from 'react';

interface NoTunnel410Props {
  onResolved: () => void;
}

export default function NoTunnel410({ onResolved }: NoTunnel410Props) {
  const [checking, setChecking] = useState(false);
  const [stillUnresolved, setStillUnresolved] = useState(false);

  async function handleCheckAgain(): Promise<void> {
    setChecking(true);
    setStillUnresolved(false);
    try {
      const route = await window.api.flowResume();
      // FlowRouteSchema has no dedicated "no-tunnel-410" kind -- the closest
      // still-blocked shape it can carry is `cf-reconnect` (map-failure.ts's
      // comment: exit-1 reasons are disambiguated by text, not exit code, and
      // a stale-token verdict is a distinct surface that still means "not
      // resolved yet" from this screen's point of view); a null return (no
      // route computed) is the same "still stuck" signal. Any other concrete
      // route means platform-side provisioning has since completed.
      if (route === null || route.kind === 'cf-reconnect') {
        setStillUnresolved(true);
      } else {
        onResolved();
      }
    } finally {
      setChecking(false);
    }
  }

  function openSupport(): void {
    void window.api.flowOpenExternal('support');
  }

  return (
    <div className="setup-shell setup-shell--centered">
      <section>
        <h1 className="display">Your account isn&apos;t set up for hosting yet</h1>
        <p className="note-line" style={{ marginTop: 16 }}>
          Livinity couldn&apos;t find a managed hosting slot for your account. If you just
          subscribed, this can take a few minutes to activate — otherwise, reach out and we&apos;ll
          sort it out.
        </p>

        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 24 }}
          disabled={checking}
          onClick={() => void handleCheckAgain()}
        >
          Check again
        </button>

        <div style={{ marginTop: 16 }}>
          <button type="button" className="link-mute" onClick={openSupport}>
            Contact support
          </button>
        </div>

        {/* Neutral result region -- NEVER red (a calm account-level precondition, not a fault),
            identical discipline to BiosDeadEnd.tsx's still-off region. */}
        <div aria-live="polite" aria-busy={checking} style={{ marginTop: 16 }}>
          {checking && (
            <div className="scope-row">
              <span className="status-dot status-dot-pulse" aria-hidden="true" />
              <span className="scope-name">Checking your account…</span>
            </div>
          )}
          {stillUnresolved && !checking && (
            <p className="note-line">
              Still not set up on our side yet. Once it&apos;s ready, choose Check again.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
