'use client';

// Centered modal confirmation dialog. Renders null when `open` is false.
// When `requireText` is set, the confirm button stays disabled until the
// operator types the exact string (e.g. a username for a destructive delete).
// Escape always invokes onCancel.

import { useEffect, useState, type ReactNode } from 'react';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** When set, the confirm button is disabled until the user types this exactly. */
  requireText?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  danger,
  requireText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');

  // Reset the typed-confirmation each time the dialog (re)opens.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  // Escape closes the dialog.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const gateOk = requireText == null || typed === requireText;

  return (
    <div className="confirm-overlay" onMouseDown={onCancel} role="presentation">
      <div
        className="confirm-card"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h3 className="confirm-title">{title}</h3>
        {body != null ? <div className="confirm-body">{body}</div> : null}
        {requireText != null ? (
          <div className="confirm-gate">
            <label className="form-label" htmlFor="confirm-gate-input">
              Type <code>{requireText}</code> to confirm
            </label>
            <input
              id="confirm-gate-input"
              className="form-input"
              type="text"
              value={typed}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && gateOk) onConfirm();
              }}
            />
          </div>
        ) : null}
        <div className="confirm-actions">
          <button type="button" className="btn ghost sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn sm ${danger ? 'danger' : 'primary'}`}
            disabled={!gateOk}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
