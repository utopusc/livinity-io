'use client';

// Per-user moderation + billing action RAIL. Renders a vertical stack of
// grouped action sections (small-caps labels + full-width stacked buttons)
// designed to live in the sticky LEFT rail of the two-column user-detail
// workspace. Each button calls POST /api/admin/users/{id}/actions via
// userAction(); destructive actions are gated behind a ConfirmDialog. On
// success onChanged() is called so the parent page refetches the user row.

import { useState } from 'react';
import {
  userAction,
  type AdminActionName,
  type AdminUserDetail,
} from '../lib/admin-api';
import { ConfirmDialog } from './confirm-dialog';
import { Toast } from './toast';
import { formatDate } from './format';

type DetailUser = AdminUserDetail['user'];

export type UserActionsProps = {
  user: DetailUser;
  currentAdminId: string;
  onChanged: () => void;
};

// A pending destructive confirmation: holds the action + dialog copy until
// the operator confirms (or cancels) in the ConfirmDialog.
type PendingConfirm = {
  action: AdminActionName;
  params?: Record<string, unknown>;
  title: string;
  body?: string;
  confirmLabel: string;
  requireText?: string;
};

// Preset comp-grant durations rendered as .chip pills.
const GRANT_PRESETS: { label: string; params: Record<string, unknown> }[] = [
  { label: '+1 month', params: { months: 1 } },
  { label: '+3 months', params: { months: 3 } },
  { label: '+6 months', params: { months: 6 } },
  { label: '+1 year', params: { months: 12 } },
];

export function UserActions({ user, currentAdminId, onChanged }: UserActionsProps) {
  // Which action is currently in flight (disables all buttons while busy).
  const [busy, setBusy] = useState<AdminActionName | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [note, setNote] = useState<string>(user.admin_note ?? '');
  const [customAmount, setCustomAmount] = useState<string>('');
  const [customUnit, setCustomUnit] = useState<'months' | 'days'>('months');

  const isSelf = user.id === currentAdminId;
  const suspended = user.suspended_at != null;
  const revoked = user.access_revoked_at != null;

  // DEFENSIVE-SCHEMA: comp_until may be null (column absent or no grant).
  // A grant is "active" only when it parses AND lies in the future.
  const compUntilMs = user.comp_until ? new Date(user.comp_until).getTime() : NaN;
  const compActive = !Number.isNaN(compUntilMs) && compUntilMs > Date.now();

  // Custom grant: enter any amount + unit. The backend extends from
  // max(now, existing future comp_until); months 1..60, days 1..3650 (server clamp).
  const customN = parseInt(customAmount, 10);
  const customValid =
    Number.isFinite(customN) && customN > 0 && customN <= (customUnit === 'months' ? 60 : 3650);
  const customPreview = (() => {
    if (!customValid) return null;
    const end = compActive ? new Date(compUntilMs) : new Date();
    if (customUnit === 'months') end.setMonth(end.getMonth() + customN);
    else end.setDate(end.getDate() + customN);
    return end;
  })();

  async function run(action: AdminActionName, params?: Record<string, unknown>) {
    setBusy(action);
    setToast(null);
    try {
      await userAction(user.id, action, params);
      setToast({ msg: `${labelFor(action)} — done.` });
      onChanged();
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setBusy(null);
    }
  }

  // Open the confirm dialog for a destructive action; runs only after confirm.
  function confirm(p: PendingConfirm) {
    setPending(p);
  }

  function onConfirm() {
    if (!pending) return;
    const { action, params } = pending;
    setPending(null);
    void run(action, params);
  }

  function grantCustom() {
    if (!customValid) return;
    void run('grant_access', customUnit === 'months' ? { months: customN } : { days: customN });
    setCustomAmount('');
  }

  const disabled = busy != null;

  return (
    <div className="ua-rail">
      {/* GRANT ACCESS — time-boxed comp window (users.comp_until) */}
      <div className="ua-section">
        <div className="ua-section-label">Grant access</div>
        {compActive ? (
          <div className="ua-current">
            <span className="ua-current-text">
              Comped until <strong>{formatDate(user.comp_until)}</strong>
            </span>
            <button
              type="button"
              className="btn ghost sm"
              disabled={disabled}
              onClick={() => void run('clear_grant')}
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="ua-current ua-current-empty">No active grant</div>
        )}
        <div className="grant-chips">
          {GRANT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="chip"
              disabled={disabled}
              onClick={() => void run('grant_access', p.params)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grant-custom">
          <input
            className="form-input sm"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder="Amount"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') grantCustom();
            }}
          />
          <select
            className="form-select sm"
            value={customUnit}
            onChange={(e) => setCustomUnit(e.target.value as 'months' | 'days')}
            disabled={disabled}
          >
            <option value="months">months</option>
            <option value="days">days</option>
          </select>
          <button
            type="button"
            className="btn ghost sm"
            disabled={disabled || !customValid}
            onClick={grantCustom}
          >
            Grant
          </button>
        </div>
        {customPreview ? (
          <div className="grant-preview">
            → active until {formatDate(customPreview.toISOString())}
          </div>
        ) : null}
      </div>

      {/* ACCESS — legacy comp flag + manual revoke/restore */}
      <div className="ua-section">
        <div className="ua-section-label">Access</div>
        {user.legacy_free ? (
          <div className="ua-current">
            <span className="ua-current-text">
              <strong>Legacy</strong> — free forever
            </span>
            <button
              type="button"
              className="btn ghost sm"
              disabled={disabled}
              onClick={() => void run('remove_comp')}
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="ua-current ua-current-empty">Not legacy</div>
        )}
        <div className="ua-actions">
          {!user.legacy_free ? (
            <button
              type="button"
              className="btn ghost sm"
              disabled={disabled}
              onClick={() => void run('grant_comp')}
            >
              Make legacy (free forever)
            </button>
          ) : null}
          {!revoked ? (
            <button
              type="button"
              className="btn danger sm"
              disabled={disabled}
              onClick={() =>
                confirm({
                  action: 'revoke',
                  title: 'Revoke access',
                  body: `Immediately revoke ${user.username}'s access (tears down their tunnel/provisioning). They keep their account.`,
                  confirmLabel: 'Revoke access',
                })
              }
            >
              Revoke
            </button>
          ) : !suspended ? (
            <button
              type="button"
              className="btn ghost sm"
              disabled={disabled}
              onClick={() => void run('restore')}
            >
              Restore
            </button>
          ) : null}
        </div>
      </div>

      {/* BILLING SYNC — read-only Stripe → DB heal. Shown for anyone with a
          Stripe customer: fixes rows a missed webhook left stale (e.g. an
          ended trial frozen at 'trialing'), where cancel/resume would 502. */}
      {user.stripe_customer_id ? (
        <div className="ua-section">
          <div className="ua-section-label">Billing sync</div>
          <div className="ua-actions">
            <button
              type="button"
              className="btn ghost sm"
              disabled={disabled}
              onClick={() => void run('sync_stripe')}
            >
              Sync from Stripe
            </button>
          </div>
        </div>
      ) : null}

      {/* SUBSCRIPTION — Stripe cancel/resume */}
      {user.stripe_subscription_id ? (
        <div className="ua-section">
          <div className="ua-section-label">Subscription</div>
          <div className="ua-actions">
            {!user.cancel_at_period_end ? (
              <>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={disabled}
                  onClick={() => void run('cancel_subscription')}
                >
                  Cancel at period end
                </button>
                <button
                  type="button"
                  className="btn danger sm"
                  disabled={disabled}
                  onClick={() =>
                    confirm({
                      action: 'cancel_subscription',
                      params: { immediate: true },
                      title: 'Cancel subscription now',
                      body: `Immediately cancel ${user.username}'s Stripe subscription. This cannot be undone via Resume.`,
                      confirmLabel: 'Cancel now',
                    })
                  }
                >
                  Cancel now
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn ghost sm"
                disabled={disabled}
                onClick={() => void run('resume_subscription')}
              >
                Resume
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* ACCOUNT — admin role, email verification, suspension */}
      <div className="ua-section">
        <div className="ua-section-label">Account</div>
        <div className="ua-actions">
          {!user.is_admin ? (
            <button
              type="button"
              className="btn ghost sm"
              disabled={disabled}
              onClick={() => void run('make_admin')}
            >
              Make admin
            </button>
          ) : !isSelf ? (
            <button
              type="button"
              className="btn danger sm"
              disabled={disabled}
              onClick={() =>
                confirm({
                  action: 'remove_admin',
                  title: 'Remove admin',
                  body: `Remove admin privileges from ${user.username}.`,
                  confirmLabel: 'Remove admin',
                })
              }
            >
              Remove admin
            </button>
          ) : null}
          {!user.email_verified ? (
            <button
              type="button"
              className="btn ghost sm"
              disabled={disabled}
              onClick={() => void run('verify_email')}
            >
              Verify email
            </button>
          ) : null}
          {!suspended ? (
            <button
              type="button"
              className="btn danger sm"
              disabled={disabled}
              onClick={() =>
                confirm({
                  action: 'suspend',
                  title: 'Suspend user',
                  body: `Suspend ${user.username} — revokes access and blocks restore until unsuspended.`,
                  confirmLabel: 'Suspend',
                })
              }
            >
              Suspend
            </button>
          ) : (
            <button
              type="button"
              className="btn ghost sm"
              disabled={disabled}
              onClick={() => void run('unsuspend')}
            >
              Unsuspend
            </button>
          )}
        </div>
      </div>

      {/* NOTE — free-text admin note */}
      <div className="ua-section">
        <div className="ua-section-label">Note</div>
        <div className="ua-note">
          <textarea
            className="form-textarea"
            placeholder="Internal admin note (not shown to the user)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <button
            type="button"
            className="btn primary sm"
            disabled={disabled || note === (user.admin_note ?? '')}
            onClick={() => void run('set_note', { note })}
          >
            Save note
          </button>
        </div>
      </div>

      {/* DANGER — irreversible delete */}
      {!isSelf && !user.is_admin ? (
        <div className="ua-section ua-section-danger">
          <div className="ua-section-label">Danger</div>
          <div className="ua-actions">
            <button
              type="button"
              className="btn danger sm"
              disabled={disabled}
              onClick={() =>
                confirm({
                  action: 'delete_user',
                  params: { confirm: user.username },
                  title: `Delete ${user.username}`,
                  body: `Permanently delete this account, tear down Cloudflare provisioning, cancel any Stripe subscription, and remove all associated data. This cannot be undone.`,
                  confirmLabel: 'Delete user',
                  requireText: user.username,
                })
              }
            >
              Delete user
            </button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pending != null}
        title={pending?.title ?? ''}
        body={pending?.body}
        confirmLabel={pending?.confirmLabel ?? 'Confirm'}
        danger
        requireText={pending?.requireText}
        onConfirm={onConfirm}
        onCancel={() => setPending(null)}
      />

      {toast ? (
        <Toast msg={toast.msg} error={toast.error} onClose={() => setToast(null)} />
      ) : null}
    </div>
  );
}

function labelFor(action: AdminActionName): string {
  switch (action) {
    case 'grant_comp':
      return 'Granted comp';
    case 'remove_comp':
      return 'Removed comp';
    case 'grant_access':
      return 'Granted access';
    case 'clear_grant':
      return 'Cleared grant';
    case 'revoke':
      return 'Revoked access';
    case 'restore':
      return 'Restored access';
    case 'cancel_subscription':
      return 'Subscription cancelled';
    case 'resume_subscription':
      return 'Subscription resumed';
    case 'sync_stripe':
      return 'Synced from Stripe';
    case 'make_admin':
      return 'Made admin';
    case 'remove_admin':
      return 'Removed admin';
    case 'verify_email':
      return 'Email verified';
    case 'suspend':
      return 'Suspended';
    case 'unsuspend':
      return 'Unsuspended';
    case 'set_note':
      return 'Note saved';
    case 'delete_user':
      return 'User deleted';
    default:
      return 'Done';
  }
}
