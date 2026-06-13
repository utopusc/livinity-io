'use client';

// Per-user moderation + billing action panel. Renders grouped buttons that
// adapt to the target user's current state. Each button calls the
// POST /api/admin/users/{id}/actions endpoint via userAction(); destructive
// actions are gated behind a ConfirmDialog. On success onChanged() is called
// so the parent page refetches the (now stale) user row.

import { useState } from 'react';
import {
  userAction,
  type AdminActionName,
  type AdminUserDetail,
} from '../lib/admin-api';
import { ConfirmDialog } from './confirm-dialog';
import { Toast } from './toast';

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

export function UserActions({ user, currentAdminId, onChanged }: UserActionsProps) {
  // Which action is currently in flight (disables all buttons while busy).
  const [busy, setBusy] = useState<AdminActionName | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [note, setNote] = useState<string>(user.admin_note ?? '');

  const isSelf = user.id === currentAdminId;
  const suspended = user.suspended_at != null;
  const revoked = user.access_revoked_at != null;

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

  const disabled = busy != null;

  return (
    <div className="user-actions">
      {/* ACCESS — comp grant + manual revoke/restore */}
      <div className="ua-group">
        <div className="ua-group-label">Access</div>
        <div className="ua-buttons">
          {user.legacy_free ? (
            <button
              type="button"
              className="btn ghost sm"
              disabled={disabled}
              onClick={() => void run('remove_comp')}
            >
              Remove comp
            </button>
          ) : (
            <button
              type="button"
              className="btn ghost sm"
              disabled={disabled}
              onClick={() => void run('grant_comp')}
            >
              Grant comp
            </button>
          )}
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

      {/* SUBSCRIPTION — Stripe cancel/resume */}
      {user.stripe_subscription_id ? (
        <div className="ua-group">
          <div className="ua-group-label">Subscription</div>
          <div className="ua-buttons">
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
      <div className="ua-group">
        <div className="ua-group-label">Account</div>
        <div className="ua-buttons">
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
      <div className="ua-group">
        <div className="ua-group-label">Note</div>
        <div className="ua-note">
          <textarea
            className="form-textarea"
            placeholder="Internal admin note (not shown to the user)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          <div className="ua-buttons">
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
      </div>

      {/* DANGER — irreversible delete */}
      {!isSelf && !user.is_admin ? (
        <div className="ua-group ua-group-danger">
          <div className="ua-group-label">Danger</div>
          <div className="ua-buttons">
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
    case 'revoke':
      return 'Revoked access';
    case 'restore':
      return 'Restored access';
    case 'cancel_subscription':
      return 'Subscription cancelled';
    case 'resume_subscription':
      return 'Subscription resumed';
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
