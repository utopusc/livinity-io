/**
 * src/renderer/screens/cloudflare/DomainPicker.tsx
 *
 * Screen 2 of the Free/BYOD Cloudflare wizard (CF-03; D-06..D-09, D-11).
 *
 * Structure (also tab order, per 03-UI-SPEC): heading -> body -> native
 * <select> zone dropdown with two <optgroup>s (Active first, then "Needs
 * nameserver change" -- both selectable; picking a pending zone routes to the
 * nameserver screen) -> editable "Name for your box" sub-label (prefilled
 * "liv") -> dual live URL preview ("Your LivOS" <sub>.<zone> / "Your apps"
 * chat-<sub>.<zone>) -> "Don't see your domain?" guidance sub-card -> Continue.
 *
 * The single-label (hyphen) scheme is enforced LIVE by validateSubLabel -- the
 * SAME pure function the main process uses as its authoritative SSRF/host-
 * injection gate (T-03-06). This screen is preview-only feedback; Continue is
 * disabled until a zone is chosen and the sub-label is valid.
 *
 * Adding a zone is a DEEP-LINK only (cfOpenExternal('add-site')) -- there is no
 * in-app zone creation (a POST would need a 4th scope; D-11). Zero zones on a
 * verified token is never a dead end -- it renders the same guidance sub-card as
 * the whole body (D-09).
 */

import { useEffect, useState } from 'react';
import { validateSubLabel } from '../../../main/cloudflare/validate-sub-label';
import type { CfZoneSummary } from '../../../../shared/ipc-contract';

interface DomainPickerProps {
  onReady: () => void;
  onPendingZone: (zoneId: string) => void;
  onCollision: () => void;
}

// Sub-label verdict -> copy. 'dots'/'charset' share the UI-SPEC "illegal" line;
// 'empty' and 'length' get their own calm one-liners.
const SUB_LABEL_ERROR_COPY: Record<'empty' | 'dots' | 'charset' | 'length', string> = {
  empty: 'Give your box a name.',
  dots: 'Use one word — letters, numbers or hyphens, no dots.',
  charset: 'Use one word — letters, numbers or hyphens, no dots.',
  length: 'Keep the name short — 63 characters or fewer.',
};

function ExternalLinkGlyph(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 4h6v6M20 4l-9 9M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"
      />
    </svg>
  );
}

/**
 * The "add a domain on Cloudflare" guidance sub-card. Reused verbatim by the
 * "Don't see your domain?" toggle AND by the zero-zones body (D-09), so the two
 * paths can never diverge. Add-site is a system-browser deep-link only (D-11).
 */
function GuidanceCard({
  heading,
  body,
  onRecheck,
}: {
  heading: string;
  body: string;
  onRecheck: () => void;
}): React.ReactElement {
  return (
    <div className="card" style={{ marginTop: 16, background: 'var(--surface-2)' }}>
      <h2 className="heading">{heading}</h2>
      <p className="note-line" style={{ marginTop: 8 }}>
        {body}
      </p>
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 16 }}
        onClick={() => void window.api.cfOpenExternal('add-site')}
      >
        <ExternalLinkGlyph />
        Add a domain on Cloudflare
      </button>
      <button type="button" className="btn btn-block" style={{ marginTop: 8 }} onClick={onRecheck}>
        Check again
      </button>
    </div>
  );
}

export default function DomainPicker({ onReady, onPendingZone, onCollision }: DomainPickerProps) {
  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState<CfZoneSummary[]>([]);
  const [loadError, setLoadError] = useState<'network' | 'unauthorized' | null>(null);
  const [zoneId, setZoneId] = useState('');
  const [subLabel, setSubLabel] = useState('liv');
  const [showGuidance, setShowGuidance] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<'scope-missing' | 'network' | null>(null);

  async function loadZones(): Promise<void> {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await window.api.cfGetZones();
      if (r.ok) {
        setZones(r.zones);
      } else {
        setLoadError(r.reason);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadZones();
  }, []);

  function handleZoneChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const id = e.target.value;
    setZoneId(id);
    setInlineError(null);
    const zone = zones.find((z) => z.id === id);
    // A pending zone can't serve traffic yet -> route to the nameserver screen.
    if (zone && zone.status !== 'active') {
      onPendingZone(id);
    }
  }

  async function handleContinue(): Promise<void> {
    const verdict = validateSubLabel(subLabel);
    if (!zoneId || !verdict.ok || submitting) return;
    setSubmitting(true);
    setInlineError(null);
    try {
      const r = await window.api.cfSelectDomain(zoneId, subLabel.trim());
      if (r.kind === 'ready') {
        onReady();
        return;
      }
      if (r.kind === 'collision') {
        onCollision();
        return;
      }
      if (r.kind === 'scope-missing') {
        setInlineError('scope-missing');
        return;
      }
      setInlineError('network');
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Loading / error / zero-zones branches (never a dead end) ----

  if (loading) {
    return (
      <section className="card">
        <h1 className="heading">Pick your domain</h1>
        <div
          aria-live="polite"
          aria-busy="true"
          style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span className="status-dot status-dot-pulse" aria-hidden="true" />
          <p className="note-line">Loading your domains…</p>
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="card">
        <h1 className="heading">Pick your domain</h1>
        <p className="error-line" style={{ marginTop: 16 }}>
          {loadError === 'network'
            ? "Couldn't reach Cloudflare. Check your connection and try again."
            : "That token didn't work. Copy it again from Cloudflare and paste it here."}
        </p>
        <button type="button" className="btn btn-block" onClick={() => void loadZones()}>
          Try again
        </button>
      </section>
    );
  }

  if (zones.length === 0) {
    // Zero zones on a verified token (D-09): the guidance sub-card IS the body.
    return (
      <section className="card">
        <h1 className="heading">Pick your domain</h1>
        <GuidanceCard
          heading="No domains found on this token"
          body="This Cloudflare account doesn't have any domains yet. Add one, then check again."
          onRecheck={() => void loadZones()}
        />
      </section>
    );
  }

  // ---- Main state ----

  const activeZones = zones.filter((z) => z.status === 'active');
  const pendingZones = zones.filter((z) => z.status !== 'active');

  const verdict = validateSubLabel(subLabel);
  const selectedZone = zones.find((z) => z.id === zoneId);

  let subLabelError = '';
  if (!verdict.ok && subLabel.trim() !== '') {
    subLabelError = SUB_LABEL_ERROR_COPY[verdict.error];
  }

  const canContinue = zoneId !== '' && verdict.ok && !submitting;

  return (
    <section className="card">
      <h1 className="heading">Pick your domain</h1>
      <p className="note-line" style={{ marginTop: 8 }}>
        Choose the domain LivOS will live at. This is the address you — and your apps — will use.
      </p>

      <div className="field" style={{ marginTop: 24 }}>
        <label className="field-label" htmlFor="domain-select">
          Your domain
        </label>
        <select
          id="domain-select"
          className="cf-select"
          value={zoneId}
          onChange={handleZoneChange}
        >
          <option value="" disabled>
            Choose a domain
          </option>
          {activeZones.length > 0 && (
            <optgroup label="Active">
              {activeZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </optgroup>
          )}
          {pendingZones.length > 0 && (
            <optgroup label="Needs nameserver change">
              {pendingZones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      <div className="field" style={{ marginTop: 16 }}>
        <label className="field-label" htmlFor="sub-label">
          Name for your box
        </label>
        <input
          id="sub-label"
          className="field-input mono"
          type="text"
          value={subLabel}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="sub-label-help sub-label-error"
          onChange={(e) => setSubLabel(e.target.value)}
        />
        <p id="sub-label-help" className="field-label" style={{ fontWeight: 400, color: 'var(--fg-mute)' }}>
          One word — lowercase letters, numbers or hyphens. No dots.
        </p>
      </div>
      <p id="sub-label-error" className="error-line" aria-live="polite">
        {subLabelError}
      </p>

      {/* Dual live URL preview -- teaches the hyphen scheme (D-07). Only shown
          once a zone is chosen and the sub-label is valid. */}
      {selectedZone && verdict.ok && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="card-row">
            <span className="field-label">Your LivOS</span>
            <span className="value-chip">{`${subLabel.trim()}.${selectedZone.name}`}</span>
          </div>
          <div className="card-row">
            <span className="field-label">Your apps</span>
            <span className="value-chip">{`chat-${subLabel.trim()}.${selectedZone.name}`}</span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          className="link-mute"
          aria-expanded={showGuidance}
          onClick={() => setShowGuidance((v) => !v)}
        >
          Don&apos;t see your domain?
        </button>
      </div>
      {showGuidance && (
        <GuidanceCard
          heading="Add your domain to Cloudflare first"
          body="Your domain has to be on Cloudflare before Livinity can use it. Add it in your browser, then come back and check again."
          onRecheck={() => void loadZones()}
        />
      )}

      {inlineError === 'scope-missing' && (
        <div style={{ marginTop: 16 }}>
          <p className="error-line">
            Livinity couldn&apos;t check this domain — the token is missing a permission. Re-open the
            token form and add it.
          </p>
          <button
            type="button"
            className="link-mute"
            onClick={() => void window.api.cfOpenExternal('token-form')}
          >
            Re-open token form
          </button>
        </div>
      )}
      {inlineError === 'network' && (
        <div style={{ marginTop: 16 }}>
          <p className="error-line">
            Couldn&apos;t reach Cloudflare. Check your connection and try again.
          </p>
          <button type="button" className="btn btn-block" onClick={() => void handleContinue()}>
            Try again
          </button>
        </div>
      )}

      {/* Continue is accent only when the guidance sub-card isn't superseding it
          (one-accent-per-screen-state discipline). */}
      <button
        type="button"
        className={`btn btn-block ${showGuidance ? '' : 'btn-primary'}`}
        style={{ marginTop: 24 }}
        disabled={!canContinue}
        onClick={() => void handleContinue()}
      >
        {submitting ? 'Checking…' : 'Continue'}
      </button>
    </section>
  );
}
