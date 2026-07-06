// Throttled operational alerting — a thin guard around sendOpsAlertEmail so
// hot paths (the Stripe webhook, crons) can raise an alarm without ever
// spamming the mailbox or breaking the caller.
//
// Contract:
//   - NEVER throws (an alerting failure must not 500 a webhook/cron).
//   - Always leaves a console.error breadcrumb, even when the email is
//     throttled or OPS_ALERT plumbing is unavailable.
//   - Throttled per `key` via the shared Postgres rate_limits table (works
//     across serverless instances, unlike an in-memory map): at most ONE
//     email per key per window. rateLimit fails OPEN by design; for alerts
//     that direction is acceptable (worst case an extra email, never a
//     swallowed one).
import { rateLimit } from '@/lib/rate-limit';
import { sendOpsAlertEmail } from '@/lib/email';

/** Minimal HTML escape for interpolating untrusted strings (e.g. exception
 *  messages) into alert email bodies. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function opsAlertThrottled(
  key: string,
  windowSeconds: number,
  subject: string,
  html: string,
): Promise<void> {
  // Breadcrumb first — visible in Vercel logs regardless of email fate.
  console.error(`[ops-alert] ${subject} (key=${key})`);
  try {
    const rl = await rateLimit(`ops:${key}`, 1, windowSeconds);
    if (!rl.allowed) return;
    // Resend-side idempotency key (24h) additionally dedupes a same-window
    // double-send if two instances race past the limiter.
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    // Time-bound the send (~3s): these alerts run on hot paths (the webhook's
    // 400/500 branches) that must answer within Stripe's delivery window — a
    // hung Resend call must not turn a fast reject into a delivery timeout.
    // The raced-out send may still complete in the background; the
    // idempotency key makes a later duplicate harmless.
    await Promise.race([
      sendOpsAlertEmail(subject, html, `ops:${key}:${bucket}`),
      new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
    ]);
  } catch (err) {
    console.error('[ops-alert] send failed:', err);
  }
}
