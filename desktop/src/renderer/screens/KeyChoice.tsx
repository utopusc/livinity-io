/**
 * src/renderer/screens/KeyChoice.tsx
 *
 * AUTH-06 liv_k_ key-conflict screen (D-14 -- the destructive pattern is
 * specified exactly, not left open). Paste-and-probe is the visual default;
 * the destructive regenerate is disclosure-hidden, checkbox-gated, and red
 * -- physically distant from the primary paste action so it can never be
 * the accidental click. This is the ONLY component that may ever call
 * `window.api.authRegenerateKey` (T-02-04).
 */

import { useState } from 'react';

interface KeyChoiceProps {
  onProceed: () => void;
}

type ProbeError = '' | 'invalid' | 'inactive' | 'network' | 'account_mismatch';
type RegenError = '' | 'email_unverified' | 'subscription_required' | 'network' | 'failed';

const PROBE_ERROR_COPY: Record<Exclude<ProbeError, ''>, string> = {
  invalid: "That key doesn't look right. Double-check and try again.",
  inactive: "This key's account doesn't currently have an active plan.",
  network: "Couldn't reach Livinity. Check your connection and try again.",
  account_mismatch:
    'This key belongs to a different account. Sign in with that account, or generate a new key for this one.',
};

const REGEN_ERROR_COPY: Record<Exclude<RegenError, ''>, string> = {
  email_unverified:
    "Please verify your email to continue. We've sent you a link — check your inbox, then try again.",
  subscription_required: 'This account no longer has an active plan.',
  network: "Couldn't reach Livinity. Check your connection and try again.",
  failed: "Couldn't generate a new key. Please try again.",
};

export default function KeyChoice({ onProceed }: KeyChoiceProps) {
  const [key, setKey] = useState('');
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<ProbeError>('');

  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<RegenError>('');

  const canSubmitKey = key.startsWith('liv_k_') && key.length > 'liv_k_'.length;

  async function handleUseKey(): Promise<void> {
    if (!canSubmitKey || probing) return;
    setProbing(true);
    setProbeError('');
    try {
      const r = await window.api.authProbeKey(key);
      if (r.ok) {
        onProceed();
        return;
      }
      if (r.reason === 'not_found') {
        setProbeError('invalid');
      } else {
        setProbeError(r.reason);
      }
    } finally {
      setProbing(false);
    }
  }

  async function handleRegenerate(): Promise<void> {
    if (!confirmed || regenerating) return;
    setRegenerating(true);
    setRegenError('');
    try {
      const r = await window.api.authRegenerateKey();
      if (r.ok) {
        onProceed();
        return;
      }
      setRegenError(r.reason);
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <section className="card">
      <h1 className="heading">We found an existing install key</h1>
      <p className="note-line" style={{ marginTop: 8 }}>
        Your account already has a Livinity install key. If you know it, paste it below. Only
        generate a new one if you've lost it.
      </p>

      <div className="field" style={{ marginTop: 16 }}>
        <label className="field-label" htmlFor="key-choice-paste">
          Install key
        </label>
        <input
          id="key-choice-paste"
          className="field-input mono"
          type="text"
          placeholder="liv_k_..."
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setProbeError('');
          }}
        />
      </div>

      <p className="error-line" aria-live="polite">
        {probeError && PROBE_ERROR_COPY[probeError]}
      </p>

      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!canSubmitKey || probing}
        onClick={handleUseKey}
      >
        {probing ? 'Checking key…' : 'Use this key'}
      </button>

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          className="disclosure-toggle"
          aria-expanded={disclosureOpen}
          onClick={() => setDisclosureOpen((v) => !v)}
        >
          <span aria-hidden="true">{disclosureOpen ? '▾' : '▸'}</span>
          Lost your key?
        </button>

        {disclosureOpen && (
          <div style={{ marginTop: 12 }}>
            <p className="note-line">
              Generating a new key will disconnect your existing LivOS box — it will lose its
              connection until you reinstall with the new key.
            </p>

            <div className="checkbox-row" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                id="confirm-regen"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <label htmlFor="confirm-regen">
                I understand my existing LivOS box will lose its connection.
              </label>
            </div>

            <p className="error-line" aria-live="polite">
              {regenError && REGEN_ERROR_COPY[regenError]}
            </p>

            <button
              type="button"
              className="btn"
              disabled={!confirmed || regenerating}
              onClick={handleRegenerate}
              style={{
                background: 'var(--status-error)',
                borderColor: 'transparent',
                color: '#200404',
                opacity: confirmed ? 1 : 0.4,
                cursor: confirmed && !regenerating ? 'pointer' : 'not-allowed',
              }}
            >
              {regenerating ? 'Generating…' : 'Generate new key'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
