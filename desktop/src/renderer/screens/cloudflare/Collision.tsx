/**
 * src/renderer/screens/cloudflare/Collision.tsx
 *
 * Screen 4 of the Free/BYOD Cloudflare wizard (D-08) -- the phase's ONE
 * destructive path. The chosen {sub}.{zone} already has a DNS record pointing
 * somewhere ELSE (a record already pointing at OUR tunnel resumes silently
 * upstream and never reaches this screen).
 *
 * Destructive mechanism is LOCKED to Phase 2's house pattern (copied verbatim
 * from KeyChoice.tsx:143-173): a checkbox + a disabled-until-checked red button
 * -- NOT type-to-confirm (the audience is non-technical; a typed-confirm field
 * is CLI-grade friction). The SAFE "Pick a different name" is the accent primary
 * on top; the destructive take-over is demoted below an xl (32px) gap so it can
 * never be the accidental default click (T-03-05).
 *
 * This is the sole renderer path that can request the destructive
 * cfProvision(true) -- and only through onTakeOver, reachable only once the
 * checkbox is checked.
 */

import { useState } from 'react';

interface CollisionProps {
  /** The `{sub}.{zone}` string whose record already points elsewhere. */
  apexHost: string;
  /** Safe primary: return to Screen 2 with the sub-label field focused. */
  onPickDifferent: () => void;
  /** Confirmed destructive take-over -> parent wires this to cfProvision(true). */
  onTakeOver: () => void;
}

export default function Collision({ apexHost, onPickDifferent, onTakeOver }: CollisionProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [takingOver, setTakingOver] = useState(false);

  function handleTakeOver(): void {
    if (!confirmed || takingOver) return;
    setTakingOver(true);
    onTakeOver();
  }

  return (
    <section className="card">
      <h1 className="heading">That name is already in use</h1>
      <p className="note-line" style={{ marginTop: 8 }}>
        There&apos;s already a record for {apexHost} on your domain, pointing somewhere else. Livinity
        won&apos;t change it unless you tell it to.
      </p>

      {/* Safe primary (accent), on top -- the dominant, physically-first action. */}
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ marginTop: 24 }}
        onClick={onPickDifferent}
      >
        Pick a different name
      </button>

      {/* xl (32px) gap, then the demoted destructive take-over block. Mechanism
          copied verbatim from KeyChoice.tsx:143-173 -- checkbox + disabled-until-
          checked red button, NEVER type-to-confirm. */}
      <div style={{ marginTop: 32 }}>
        <div className="checkbox-row">
          <input
            type="checkbox"
            id="confirm-takeover"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <label htmlFor="confirm-takeover">
            I understand this will repoint {apexHost} to my LivOS box.
          </label>
        </div>

        <button
          type="button"
          className="btn"
          disabled={!confirmed || takingOver}
          onClick={handleTakeOver}
          style={{
            marginTop: 12,
            background: 'var(--status-error)',
            borderColor: 'transparent',
            color: '#200404',
            opacity: confirmed ? 1 : 0.4,
            cursor: confirmed && !takingOver ? 'pointer' : 'not-allowed',
          }}
        >
          {takingOver ? 'Setting up…' : 'Use this name anyway'}
        </button>
      </div>
    </section>
  );
}
