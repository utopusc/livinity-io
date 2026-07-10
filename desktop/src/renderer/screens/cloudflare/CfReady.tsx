/**
 * src/renderer/screens/cloudflare/CfReady.tsx
 *
 * Screen 5 of the Free/BYOD Cloudflare wizard (CF-06 / D-17) -- the terminal
 * "Cloudflare is ready ✓" checkpoint.
 *
 * Structure (also tab order, per 03-UI-SPEC): heading (with a MONOCHROME ✓ glyph)
 * -> body -> read-only summary card (three .card-rows: address / tunnel / records,
 * each a Label key + a .value-chip mono value) -> honest expectation note
 * (.note-line) -> xl (32px) gap -> "Continue" accent.
 *
 * Color-discipline (UI-SPEC call 2): the ✓ is MONOCHROME --fg, deliberately NOT
 * the tray "box is live" running-status colour. At Phase-3 end the origin is
 * still down (502) until Phase 4 brings LivOS up -- a coloured success mark here
 * would falsely imply everything's live, so the honest "won't load until
 * installed" note carries the real expectation. The summary chips are
 * confirmation, not a health status.
 *
 * Security (T-03-18): the summary shows only the user's own address / tunnel name
 * / records label -- non-secret display strings; no token or connector secret.
 */

interface CfReadyProps {
  summary: { address: string; tunnelName: string; recordsLabel: string };
  onContinue: () => void;
}

export default function CfReady({ summary, onContinue }: CfReadyProps) {
  return (
    <section className="card">
      {/* MONOCHROME ✓ -- pinned to --fg (NOT the tray running-status colour); box not live yet. */}
      <h1 className="heading">
        Cloudflare is ready{' '}
        <span aria-hidden="true" style={{ color: 'var(--fg)' }}>
          ✓
        </span>
      </h1>
      <p className="note-line" style={{ marginTop: 8 }}>
        Your domain is connected and your secure tunnel is set up.
      </p>

      {/* Read-only summary card: three Label -> mono value rows. */}
      <div
        className="card"
        style={{
          marginTop: 24,
          background: 'var(--surface-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div className="card-row">
          <span className="field-label">Your address</span>
          <span className="value-chip mono">{summary.address}</span>
        </div>
        <div className="card-row">
          <span className="field-label">Tunnel</span>
          <span className="value-chip mono">{summary.tunnelName}</span>
        </div>
        <div className="card-row">
          <span className="field-label">Records created</span>
          <span className="value-chip mono">{summary.recordsLabel}</span>
        </div>
      </div>

      {/* Honest expectation -- the box isn't live until LivOS is installed (Phase 4). */}
      <p className="note-line" style={{ marginTop: 24 }}>
        Your address won&apos;t load until LivOS is installed and running — that&apos;s the next step.
      </p>

      {/* xl (32px) gap, then Continue (accent) -- the phase-end / Phase-5 handoff. */}
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 32 }}
        onClick={onContinue}
      >
        Continue
      </button>
    </section>
  );
}
