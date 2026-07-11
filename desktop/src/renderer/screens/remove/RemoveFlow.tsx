/**
 * src/renderer/screens/remove/RemoveFlow.tsx
 *
 * The SUP-02 off-ramp: a two-step screen pair (R1 choices -> R2 confirm/
 * working/hand-off), mounted as App.tsx's flat 'remove' screen (07-UI-SPEC
 * §7/§8, screen-notes §2). Every label/list/gate decision is consumed
 * VERBATIM from `../remove-flow` (07-03) -- this component never re-derives
 * copy inline.
 *
 * W4 (checker fix): the WORKING step-list renders from removeExecute's own
 * ack.steps (RemoveExecuteAck -- MAIN's authoritative removePlan output),
 * mapped through the shared REMOVE_STEP_LABELS value import -- NOT
 * remove-flow.ts's `stepCaptions`, which needs `engineRunning`, a fact this
 * renderer has no source for and must never re-compute.
 *
 * `remove:progress` pushes only ever fire WHILE the single `removeExecute`
 * invoke() call is in flight (remove-executor.ts awaits every step in order
 * before resolving) -- the subscription below is mounted UNCONDITIONALLY
 * (not gated on the current stage) so no push can ever arrive before a
 * listener exists; `handleConfirmClick` switches to the 'working' stage
 * BEFORE awaiting `removeExecute` (mirrors App.tsx's cf-provisioning
 * setCfStep-before-await precedent) so the accumulating pushes render live
 * while the call is pending.
 *
 * T-07-19: the renderer NEVER reads the vault or receipts -- only the
 * secret-free RemoveOffer + RemoveExecuteAck + RemoveProgress ever cross the
 * bridge here. The red Collision-style gated confirm (inline style copied
 * verbatim from cloudflare/Collision.tsx:63-92, including the disabled-until-
 * checked double-click guard) appears ONLY when distro deletion is selected;
 * every other combination uses the plain accent "Remove Livinity", never
 * gated (finalButton, remove-flow.ts). W3/D-06: a `blockedByInstall` ack
 * (a live install.sh) keeps the user on 'confirm' with the calm note --
 * never a working animation, never a self-quit. "Finish removal" (hand-off)
 * is the ONLY self-quit in this phase.
 *
 * Both R1/R2 render in .setup-shell (top-anchored, never --centered -- both
 * are multi-element screens, Phase-4 rule). ZERO net-new CSS -- every class
 * below already exists in styles.css.
 */

import { useEffect, useState } from 'react';
import type { RemoveChoices, RemoveOffer, RemoveProgress, RemoveStepId } from '../../../../shared/ipc-contract';
import { REMOVE_STEP_LABELS } from '../../../../shared/ipc-contract';
import { visibleChoices, goesList, staysList, finalButton } from '../remove-flow';

interface RemoveFlowProps {
  /** R1's "Never mind — keep everything" exit, back to Settings. */
  onDone: () => void;
}

type Stage = 'choices' | 'confirm' | 'working' | 'handoff';

const EMPTY_CHOICES: RemoveChoices = { cf: false, distro: false, clear: false };
const EMPTY_VISIBLE = { cf: false, distro: true, clear: true };

/** Copied verbatim from wsl/InstallingProgress.tsx -- the shared step-list done glyph. */
function CheckGlyph(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 12.5l5 5 11-11"
      />
    </svg>
  );
}

export default function RemoveFlow({ onDone }: RemoveFlowProps) {
  const [offer, setOffer] = useState<RemoveOffer | null>(null);
  const [choices, setChoices] = useState<RemoveChoices>(EMPTY_CHOICES);
  const [stage, setStage] = useState<Stage>('choices');
  const [gateChecked, setGateChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [blockedNote, setBlockedNote] = useState(false);
  const [ackSteps, setAckSteps] = useState<RemoveStepId[]>([]);
  const [progress, setProgress] = useState<Partial<Record<RemoveStepId, RemoveProgress['status']>>>({});

  useEffect(() => {
    window.api
      .removeGetOffer()
      .then(setOffer)
      .catch(() => {});
  }, []);

  // Unconditional (not stage-gated): removeExecute's invoke() only resolves
  // AFTER every step (and its progress push) has already happened main-side,
  // so a subscription mounted only once `stage === 'working'` would miss
  // every event that arrived during the call.
  useEffect(() => {
    const unsubscribe = window.api.onRemoveProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.stepId]: p.status }));
    });
    return unsubscribe;
  }, []);

  const offered = offer ? visibleChoices(offer) : EMPTY_VISIBLE;
  const btn = finalButton(choices, gateChecked);
  // Client-knowable without engineRunning: removePlan(choices, *) is always []
  // when none of the three choices are set (the stop-engine gate is
  // `(cf||distro) && engineRunning` -- vacuously false when cf and distro are
  // both false, regardless of engineRunning) -- used only to skip the
  // 'working' stage entirely for a zero-opt removal (D-13), never to infer
  // whether stop-engine itself is included.
  const isZeroOpt = !choices.cf && !choices.distro && !choices.clear;
  const workingSteps = ackSteps.length > 0 ? ackSteps : (Object.keys(progress) as RemoveStepId[]);

  async function handleConfirmClick(): Promise<void> {
    if (confirming) return;
    setConfirming(true);
    setBlockedNote(false);
    setProgress({});
    setAckSteps([]);
    if (!isZeroOpt) setStage('working');
    try {
      const ack = await window.api.removeExecute(choices);
      setConfirming(false);
      if (ack.blockedByInstall) {
        setBlockedNote(true);
        setStage('confirm');
        return;
      }
      setAckSteps(ack.steps);
      setStage('handoff');
    } catch {
      // The main handler always resolves a safe union (never throws) -- this
      // is IN-02 defense in depth against a handler-registration race, same
      // as App.tsx's startProvision catch block.
      setConfirming(false);
      setStage('confirm');
    }
  }

  async function handleFinish(): Promise<void> {
    if (finishing) return;
    setFinishing(true);
    await window.api.removeFinish();
    // No further state update expected -- removeFinish() quits the app.
  }

  return (
    <div className="setup-shell">
      {stage === 'choices' && (
        <section>
          <h1 className="display">Remove Livinity</h1>
          <p className="note-line" style={{ marginTop: 16 }}>
            This removes the Livinity Desktop app from this PC. By default everything else stays — your
            server, your domain, and your data.
          </p>
          <p className="note-line" style={{ marginTop: 8 }}>
            Without the app, your server keeps running for now — but it won&apos;t start again after this
            PC restarts.
          </p>

          <p className="field-label" style={{ marginTop: 24 }}>
            Also remove (optional)
          </p>

          {offered.cf && (
            <div style={{ marginTop: 16 }}>
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="remove-cf"
                  checked={choices.cf}
                  onChange={(e) => setChoices((c) => ({ ...c, cf: e.target.checked }))}
                />
                <label htmlFor="remove-cf">
                  Remove the Cloudflare tunnel and DNS records Livinity created for {offer?.apexHost ?? ''}
                </label>
              </div>
              <p className="note-line" style={{ marginTop: 4, marginLeft: 24 }}>
                Your server is stopped and {offer?.apexHost ?? ''} goes offline. Your Cloudflare account and
                domain are untouched.
              </p>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <div className="checkbox-row">
              <input
                type="checkbox"
                id="remove-distro"
                checked={choices.distro}
                onChange={(e) => setChoices((c) => ({ ...c, distro: e.target.checked }))}
              />
              <label htmlFor="remove-distro">Delete the Livinity system and its data from this PC</label>
            </div>
            <p className="note-line" style={{ marginTop: 4, marginLeft: 24 }}>
              Everything stored on your Livinity server on this PC is permanently deleted. You&apos;ll
              confirm this on the next step.
            </p>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="checkbox-row">
              <input
                type="checkbox"
                id="remove-clear"
                checked={choices.clear}
                onChange={(e) => setChoices((c) => ({ ...c, clear: e.target.checked }))}
              />
              <label htmlFor="remove-clear">Clear my sign-in and settings on this PC</label>
            </div>
            <p className="note-line" style={{ marginTop: 4, marginLeft: 24 }}>
              Leave this unchecked if you might reinstall later.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 24 }}
            onClick={() => setStage('confirm')}
          >
            Continue
          </button>
          <button type="button" className="link-mute" style={{ marginTop: 16 }} onClick={onDone}>
            Never mind — keep everything
          </button>
        </section>
      )}

      {stage === 'confirm' && offer && (
        <section>
          <h1 className="display">Ready to remove Livinity</h1>

          <p className="field-label" style={{ marginTop: 24 }}>
            WHAT GOES
          </p>
          {goesList(choices, offer).map((line, i) => (
            <p key={`goes-${i}`} className="note-line" style={{ marginTop: 8 }}>
              {line}
            </p>
          ))}

          <p className="field-label" style={{ marginTop: 24 }}>
            WHAT STAYS
          </p>
          {staysList(choices, offer).map((line, i) => (
            <p key={`stays-${i}`} className="note-line" style={{ marginTop: 8 }}>
              {line}
            </p>
          ))}

          {blockedNote && (
            <p className="note-line" style={{ marginTop: 24 }}>
              Setup is in progress — finish setting up Livinity before removing it.
            </p>
          )}

          {choices.distro ? (
            <div style={{ marginTop: 32 }}>
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="remove-gate"
                  checked={gateChecked}
                  onChange={(e) => setGateChecked(e.target.checked)}
                />
                <label htmlFor="remove-gate">
                  I understand this permanently deletes my Livinity server&apos;s data from this PC.
                </label>
              </div>
              <button
                type="button"
                className="btn"
                disabled={btn.disabled || confirming}
                onClick={() => void handleConfirmClick()}
                style={{
                  marginTop: 12,
                  background: 'var(--status-error)',
                  borderColor: 'transparent',
                  color: '#200404',
                  opacity: gateChecked ? 1 : 0.4,
                  cursor: gateChecked && !confirming ? 'pointer' : 'not-allowed',
                }}
              >
                {btn.label}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 24 }}
              disabled={btn.disabled || confirming}
              onClick={() => void handleConfirmClick()}
            >
              {btn.label}
            </button>
          )}

          <button
            type="button"
            className="link-mute"
            style={{ marginTop: 16 }}
            onClick={() => {
              setBlockedNote(false);
              setStage('choices');
            }}
          >
            Go back
          </button>
        </section>
      )}

      {stage === 'working' && (
        <section aria-busy="true">
          <h1 className="display">Removing…</h1>
          <div className="step-list" style={{ marginTop: 24 }} aria-live="polite">
            {workingSteps.map((stepId) => {
              const status = progress[stepId];
              const done = status === 'ok' || status === 'skipped' || status === 'failed';
              const active = status === 'active';
              return (
                <div key={stepId}>
                  <div
                    className={`step-item${done ? ' done' : ''}`}
                    aria-current={active ? 'step' : undefined}
                  >
                    <span className="step-indicator" aria-hidden="true">
                      {done ? (
                        <CheckGlyph />
                      ) : active ? (
                        <span className="status-dot status-dot-pulse" />
                      ) : (
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: '50%',
                            background: 'currentColor',
                            display: 'inline-block',
                          }}
                        />
                      )}
                    </span>
                    <span>{REMOVE_STEP_LABELS[stepId]}</span>
                  </div>
                  {stepId === 'cf-teardown' && status === 'failed' && (
                    <p className="note-line" style={{ marginTop: 4, marginLeft: 28 }}>
                      Couldn&apos;t remove everything from Cloudflare — the rest continues. You can remove
                      leftovers from your Cloudflare dashboard.{' '}
                      <button
                        type="button"
                        className="link-mute"
                        onClick={() => void window.api.removeOpenCfDashboard()}
                      >
                        Open Cloudflare dashboard
                      </button>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {stage === 'handoff' && (
        <section>
          <h1 className="display">One last step</h1>
          <p className="note-line" style={{ marginTop: 16 }}>
            The Windows uninstaller opens next to remove the app itself — confirm there and you&apos;re
            done. Livinity Desktop will close now.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-block"
            style={{ marginTop: 24 }}
            disabled={finishing}
            onClick={() => void handleFinish()}
          >
            Finish removal
          </button>
        </section>
      )}
    </div>
  );
}
