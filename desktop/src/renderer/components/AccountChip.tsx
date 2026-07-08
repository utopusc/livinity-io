/**
 * src/renderer/components/AccountChip.tsx
 *
 * AUTH-03 header account chip. Replaces the header-right slot (Phase 1's
 * debug status-badge) on every authenticated screen (UI-SPEC Screen 5).
 * Renders only once `authGetAccount` resolves an account -- never renders a
 * placeholder chip for a signed-out state (App.tsx only mounts this
 * component once `screen` is past login/loading).
 */

import { useEffect, useRef, useState } from 'react';
import type { Account } from '../../../shared/ipc-contract';

interface AccountChipProps {
  onSignedOut: () => void;
}

export default function AccountChip({ onSignedOut }: AccountChipProps) {
  const [account, setAccount] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.api.authGetAccount().then(setAccount);
  }, []);

  // Escape/click-outside closes the menu -- no custom tabindex, the chip
  // trigger and the Sign-out row remain natural tab stops.
  useEffect(() => {
    function handlePointerDown(e: MouseEvent): void {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  async function handleSignOut(): Promise<void> {
    await window.api.authSignOut();
    setOpen(false);
    setNote('Signed out.');
    // Briefly surface the confirmation before returning to login -- a
    // non-destructive, non-blocking transition (no confirmation dialog).
    setTimeout(() => onSignedOut(), 500);
  }

  if (!account) return null;

  const initial = account.email.charAt(0).toUpperCase();

  return (
    <div className="account-chip-wrap" ref={wrapRef}>
      <button
        type="button"
        className="account-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="chip-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="chip-email">{account.email}</span>
        <span className="chip-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="account-menu" role="menu">
          <button
            type="button"
            className="account-menu-row"
            role="menuitem"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      )}

      {note && (
        <p className="note-line" aria-live="polite" style={{ marginTop: 8 }}>
          {note}
        </p>
      )}
    </div>
  );
}
