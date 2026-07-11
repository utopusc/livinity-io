/**
 * src/renderer/screens/UnifiedError.tsx
 *
 * The D-07 unified orchestrator-level error screen (INSTALL-03) -- the
 * cloudflare-surface and generic-orchestrator variants of map-failure.ts's
 * {screen, copy, retryStep} verdict. Reuses InstallOutcome.tsx's EXACT
 * monochrome shape verbatim (`.setup-shell setup-shell--centered` -> Display
 * title -> `.note-line` body -> optional single `.error-line` -> one accent
 * `.btn.btn-primary.btn-block` CTA) -- this is deliberately NOT a second
 * layout (05-UI-SPEC Screen 3: "every new variant this phase reuses this
 * exact shape").
 *
 * WSL/installer-surface failures are NOT this screen -- they stay routed to
 * the existing InstallOutcome.tsx (four variants: disk/systemd-retry/
 * our-bug/generic), per D-07/05-UI-SPEC. Platform 401/402 route to the
 * existing Login/NoEntitlement screens. Platform 410 is NoTunnel410.tsx, a
 * dedicated calm screen, never this generic shape.
 *
 * Monochrome Display title, `--fg-dim` body, at most ONE `--status-error`
 * red `.error-line` for a genuine technical reason -- never a red title,
 * never a red screen (T-05-01 defense in depth -- `reason` is already
 * redacted main-side via redactSecretLike before it ever crosses IPC as
 * part of a FailureVerdict, see 05-01/05-06). Copy is LOCKED by 05-UI-SPEC
 * -- used verbatim.
 */

interface UnifiedErrorProps {
  variant: 'cloudflare-surface' | 'generic-orchestrator';
  reason?: string;
  onRetry: () => void;
}

export default function UnifiedError({ variant, reason, onRetry }: UnifiedErrorProps) {
  return (
    <div className="setup-shell setup-shell--centered">
      {/* aria-live="polite" -- the recovery CTA's arrival is announced (Accessibility
          Contract); the CTA is the section's sole button, so it's already the first
          (and only) tab stop in this recovered state -- no separate focus management
          needed, identical to Phase 4's declined-UAC/BIOS-dead-end recovery pattern. */}
      <section aria-live="polite">
        {variant === 'cloudflare-surface' && (
          <>
            <h1 className="display">Your Cloudflare connection needs attention</h1>
            <p className="note-line" style={{ marginTop: 16 }}>
              Something changed with your Cloudflare token or domain since you last set this up.
              Reconnect to pick up where you left off.
            </p>
            {reason && (
              <p className="error-line" style={{ marginTop: 16 }}>
                {reason}
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 24 }}
              onClick={onRetry}
            >
              Reconnect Cloudflare
            </button>
          </>
        )}

        {variant === 'generic-orchestrator' && (
          <>
            <h1 className="display">Setup hit a snag</h1>
            <p className="note-line" style={{ marginTop: 16 }}>
              Something interrupted setup. Trying again is safe — Livinity won&apos;t lose your
              progress or duplicate anything it already created.
            </p>
            {reason && (
              <p className="error-line" style={{ marginTop: 16 }}>
                {reason}
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 24 }}
              onClick={onRetry}
            >
              Try again
            </button>
          </>
        )}
      </section>
    </div>
  );
}
