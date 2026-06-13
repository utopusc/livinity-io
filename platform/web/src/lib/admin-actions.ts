// Admin audit log writer.
//
// Best-effort INSERT into admin_actions. The table is operator-applied SEPARATELY
// and possibly AFTER this code deploys, so EVERY write is wrapped in try/catch and
// swallows all errors — a missing table (42P01) must NEVER throw out of an action
// handler and 500 a normal admin path. The audit log is a nice-to-have, not a
// correctness dependency.
import pool from '@/lib/db';

export interface LogAdminActionOpts {
  adminUserId: string;
  adminUsername: string;
  targetUserId: string;
  targetUsername: string;
  action: string;
  detail?: Record<string, unknown> | null;
}

/**
 * Append one row to admin_actions. Never throws — if the table does not exist
 * yet (operator hasn't run the SQL), the error is logged at debug level and
 * swallowed.
 */
export async function logAdminAction(opts: LogAdminActionOpts): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO admin_actions
         (admin_user_id, admin_username, target_user_id, target_username, action, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        opts.adminUserId,
        opts.adminUsername,
        opts.targetUserId,
        opts.targetUsername,
        opts.action,
        opts.detail ? JSON.stringify(opts.detail) : null,
      ],
    );
  } catch (err) {
    // Table may not exist yet — swallow. Never let audit logging break an action.
    console.warn(
      `[admin-actions] log write skipped (action=${opts.action}):`,
      (err as Error)?.message ?? err,
    );
  }
}
