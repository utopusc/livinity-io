/**
 * src/renderer/screens/NoEntitlement.tsx
 *
 * AUTH-05 no-entitlement choice screen (D-10 -- never a dead end). All three
 * actions (Start Free / See Pro plans / I upgraded -- check again) are
 * always visible together, never sequentially gated behind one another.
 */

import { useState } from 'react';
import type { RouteResult } from '../../../shared/ipc-contract';

interface NoEntitlementProps {
  onRouted: (route: RouteResult) => void;
}

export default function NoEntitlement({ onRouted }: NoEntitlementProps) {
  const [freeNote, setFreeNote] = useState('');
  const [rechecking, setRechecking] = useState(false);
  const [recheckNote, setRecheckNote] = useState('');

  async function handleStartFree(): Promise<void> {
    setFreeNote('');
    const r = await window.api.authChooseFree();
    if (r.ok) {
      onRouted(r.route);
      return;
    }
    if (r.reason === 'has_paid_plan') {
      // They already have a plan -- fold into the same recheck path so the
      // route resolves against their real entitlement instead of dead-ending.
      await handleRecheck();
      return;
    }
    setFreeNote("Free tier isn't available right now — try again in a moment.");
  }

  function handleSeePro(): void {
    void window.api.authOpenExternal('pricing');
  }

  async function handleRecheck(): Promise<void> {
    setRecheckNote('');
    setRechecking(true);
    try {
      const r = await window.api.authGetRoute();
      if (r.kind !== 'no-entitlement') {
        onRouted(r);
        return;
      }
      setRecheckNote('Still no active plan — try Start Free, or check again in a moment.');
    } finally {
      setRechecking(false);
    }
  }

  return (
    <section className="card">
      <h1 className="heading">You're signed in — let's get you set up</h1>
      <p className="note-line" style={{ marginTop: 8 }}>
        Your account doesn't have an active plan yet. Start free with your own domain, or take a
        look at Pro.
      </p>

      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={handleStartFree}
        style={{ marginTop: 16 }}
      >
        Start Free (use your own domain)
      </button>
      {freeNote && (
        <p className="note-line" aria-live="polite" style={{ marginTop: 8 }}>
          {freeNote}
        </p>
      )}

      <div style={{ marginTop: 32 }}>
        <button type="button" className="btn btn-block" onClick={handleSeePro}>
          See Pro plans
        </button>
      </div>

      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button type="button" className="link-mute" onClick={handleRecheck} disabled={rechecking}>
          {rechecking ? 'Checking your plan…' : 'I upgraded — check again'}
        </button>
      </div>

      {recheckNote && (
        <p className="note-line" aria-live="polite" style={{ marginTop: 8 }}>
          {recheckNote}
        </p>
      )}
    </section>
  );
}
