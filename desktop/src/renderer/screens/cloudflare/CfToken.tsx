/**
 * src/renderer/screens/cloudflare/CfToken.tsx
 *
 * Screen 1 of the Free/BYOD Cloudflare wizard (CF-01 / CF-02; D-01..D-05).
 *
 * Structure (also tab order, per 03-UI-SPEC): heading -> body -> ALWAYS-VISIBLE
 * 3-scope checklist card (D-02, the load-bearing hand-build fallback -- the
 * token-form deep-link cannot reliably pre-fill the account-level Tunnel scope,
 * so the checklist is what tells the user exactly which 3 permissions to add) ->
 * stateful single-accent deep-link/Continue -> paste field -> per-scope result
 * region (aria-live, verify-on-paste). Verification runs automatically on paste
 * (debounced) or on blur -- there is no separate "Verify" click (D-03).
 *
 * Security (T-03-02): the pasted token lives ONLY as the input value and is
 * handed to window.api.cfVerifyToken once per verify; nothing echoes it back
 * (the IPC result is a secret-free per-scope verdict, never the token). The
 * token is stored to the DPAPI vault main-side on an all-scope pass -- it never
 * crosses back to this renderer.
 *
 * Color-discipline (UI-SPEC call 1): a per-scope PASS is monochrome (--fg check
 * glyph + --fg-dim name), never the tray "box is live" green; a FAIL is
 * --status-error red + "Missing: ..." text, so the signal is never colour-alone.
 */

import { useEffect, useRef, useState } from 'react';
import type { CfVerifyResult, CfScopeRow } from '../../../../shared/ipc-contract';

interface CfTokenProps {
  onVerified: () => void;
}

// The three scopes, spelled verbatim as Cloudflare's dashboard spells them.
// The SAME labels power both the always-visible checklist card and the
// per-scope result rows (looked up by scope), so the two never drift.
const SCOPE_ROWS: { scope: CfScopeRow['scope']; label: string }[] = [
  { scope: 'tunnel', label: 'Account · Cloudflare Tunnel · Edit' },
  { scope: 'dns', label: 'Zone · DNS · Edit' },
  { scope: 'zone', label: 'Zone · Zone · Read' },
];

const VERIFY_DEBOUNCE_MS = 400;

function CheckGlyph(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 12.5l5 5 11-11"
      />
    </svg>
  );
}

function CrossGlyph(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

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

export default function CfToken({ onVerified }: CfTokenProps) {
  const [token, setToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<CfVerifyResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function runVerify(value: string): Promise<void> {
    const t = value.trim();
    if (!t) {
      setResult(null);
      return;
    }
    setVerifying(true);
    try {
      // The ONLY place the pasted token leaves this screen (T-03-02). The
      // result is a per-scope verdict, never the token.
      const r = await window.api.cfVerifyToken(t);
      setResult(r);
    } finally {
      setVerifying(false);
    }
  }

  function handleChange(value: string): void {
    setToken(value);
    setResult(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runVerify(value), VERIFY_DEBOUNCE_MS);
  }

  function handleBlur(): void {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void runVerify(token);
  }

  function openTokenForm(): void {
    void window.api.cfOpenExternal('token-form');
  }

  const verified = result?.kind === 'verified';

  // Narrow the verdict rows once so the map closure below stays cast-free.
  const resultRows: CfScopeRow[] | null =
    result && (result.kind === 'verified' || result.kind === 'scope-missing') ? result.rows : null;

  return (
    <section className="card">
      <h1 className="heading">Connect your Cloudflare account</h1>
      <p className="note-line" style={{ marginTop: 8 }}>
        To put LivOS online at your own domain, Livinity needs one Cloudflare access token. We&apos;ll
        open Cloudflare in your browser with the three permissions pre-filled — just create the token
        and paste it back here.
      </p>

      {/* 3-scope checklist card -- rendered UNCONDITIONALLY (D-02 load-bearing). */}
      <div className="card" style={{ marginTop: 24, background: 'var(--surface-2)' }}>
        <p className="field-label">This token grants exactly three permissions</p>
        <div className="scope-list" style={{ marginTop: 12, gap: 8 }}>
          {SCOPE_ROWS.map((s) => (
            <div key={s.scope} className="scope-row">
              <span className="scope-glyph" aria-hidden="true">
                <CheckGlyph />
              </span>
              <span className="scope-name">{s.label}</span>
            </div>
          ))}
        </div>
        <p className="note-line" style={{ marginTop: 12 }}>
          Nothing else — this token can&apos;t touch billing, your other domains, or account settings.
        </p>
      </div>

      {/* Stateful single accent: deep-link while no valid token; once all three
          scopes pass it demotes to a --fg-mute text link so only "Continue" is accent. */}
      {verified ? (
        <div style={{ marginTop: 16 }}>
          <button type="button" className="link-mute" onClick={openTokenForm}>
            Re-open token form
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 24 }}
            onClick={openTokenForm}
          >
            <ExternalLinkGlyph />
            Open the Cloudflare token form
          </button>
          <p className="note-line" style={{ marginTop: 12 }}>
            Prefer to do it by hand? Create a custom token with the three permissions above, then
            paste it here.
          </p>
        </>
      )}

      {/* Paste field -- verify runs on change (debounced) and on blur (D-03). */}
      <div className="field" style={{ marginTop: 24 }}>
        <label className="field-label" htmlFor="cf-token-paste">
          Paste your token here
        </label>
        <input
          id="cf-token-paste"
          className="field-input mono"
          type="text"
          placeholder="Your Cloudflare API token"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
        />
      </div>

      {token.trim() !== '' && !verifying && (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="link-mute" onClick={() => void runVerify(token)}>
            Check the token again
          </button>
        </div>
      )}

      {/* Per-scope result region -- empty until a paste is verified. */}
      <div className="scope-list" aria-live="polite" aria-busy={verifying} style={{ marginTop: 16 }}>
        {verifying && (
          <>
            <p className="note-line">Checking your token…</p>
            {SCOPE_ROWS.map((s) => (
              <div key={s.scope} className="scope-row">
                <span className="status-dot status-dot-pulse" aria-hidden="true" />
                <span className="scope-name">{s.label}</span>
              </div>
            ))}
          </>
        )}

        {!verifying &&
          resultRows &&
          SCOPE_ROWS.map((s) => {
            const row = resultRows.find((r) => r.scope === s.scope);
            const ok = row?.ok ?? false;
            return (
              <div key={s.scope}>
                <div className={`scope-row ${ok ? 'pass' : 'fail'}`}>
                  <span className="scope-glyph" aria-hidden="true">
                    {ok ? <CheckGlyph /> : <CrossGlyph />}
                  </span>
                  <span className="scope-name">{s.label}</span>
                </div>
                {!ok && (
                  <div style={{ marginLeft: 22 }}>
                    <p className="scope-missing-detail">
                      Missing: {row?.missingLabel ?? s.label}. Re-open the token form and add it.
                    </p>
                    <button type="button" className="link-mute" onClick={openTokenForm}>
                      Re-open token form
                    </button>
                  </div>
                )}
              </div>
            );
          })}

        {!verifying && result?.kind === 'token-invalid' && (
          <p className="error-line">
            That token didn&apos;t work. Copy it again from Cloudflare and paste it here.
          </p>
        )}

        {!verifying && result?.kind === 'network' && (
          <>
            <p className="error-line">
              Couldn&apos;t reach Cloudflare. Check your connection and try again.
            </p>
            <button type="button" className="btn btn-block" onClick={() => void runVerify(token)}>
              Try again
            </button>
          </>
        )}
      </div>

      {/* Continue -- the single accent element once all three scopes pass. */}
      {verified && (
        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 24 }}
          onClick={onVerified}
        >
          Continue
        </button>
      )}
    </section>
  );
}
