const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://livinity.io';
const FROM_ADDRESS = 'Livinity <noreply@livinity.io>';

// Where operational alarms (Phase 280/283/284: DNS-quota, abuse, cost) are sent.
// Env-overridable; defaults to the operator's monitored ops/abuse mailbox.
const OPS_ALERT_EMAIL = process.env.OPS_ALERT_EMAIL || 'everything@livinity.io';

// `idempotencyKey` (Resend, valid 24h) dedupes accidental duplicate sends of
// the SAME logical email (double-submit, retry). Floods of DISTINCT sends are
// handled separately by the rate limiter on the calling endpoints.
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  idempotencyKey?: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`[email] (dev mode) To: ${to}, Subject: ${subject}`);
    console.log(`[email] ${html.replace(/<[^>]*>/g, '')}`);
    return;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  await resend.emails.send(
    {
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    },
    idempotencyKey ? { idempotencyKey } : undefined,
  );
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${BASE_URL}/verify?token=${token}`;

  await sendEmail(
    to,
    'Verify your Livinity account',
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="font-size: 20px; font-weight: 700; color: #111; margin-bottom: 16px;">Welcome to Livinity</h2>
      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">Click the button below to verify your email address and complete your registration.</p>
      <a href="${link}" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify Email</a>
      <p style="color: #999; font-size: 13px; margin-top: 24px;">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
    </div>
  `,
    `verify:${to}:${token}`,
  );
}

export async function sendTrialEndingEmail(to: string, trialEndsAt: Date | null): Promise<void> {
  const dateLabel = trialEndsAt
    ? trialEndsAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    : 'soon';

  await sendEmail(to, 'Your Livinity trial is ending', `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="font-size: 20px; font-weight: 700; color: #111; margin-bottom: 16px;">Your free trial ends ${trialEndsAt ? `on ${dateLabel}` : dateLabel}</h2>
      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">Your Livinity Pro subscription will start automatically when the trial ends. If you'd rather not continue, you can cancel anytime from your billing settings.</p>
      <a href="${BASE_URL}/dashboard" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Manage Billing</a>
      <p style="color: #999; font-size: 13px; margin-top: 24px;">Cancel before the trial ends and you won't be charged.</p>
    </div>
  `);
}

export async function sendPaymentFailedEmail(to: string): Promise<void> {
  await sendEmail(to, 'Payment failed — action needed', `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="font-size: 20px; font-weight: 700; color: #111; margin-bottom: 16px;">We couldn't process your payment</h2>
      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">Your latest Livinity Pro payment didn't go through. Please update your payment method within 3 days to keep your server online — we'll retry automatically in the meantime.</p>
      <a href="${BASE_URL}/dashboard" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Update Payment Method</a>
      <p style="color: #999; font-size: 13px; margin-top: 24px;">If payment keeps failing, access to your Livinity subdomain will be paused until billing is resolved.</p>
    </div>
  `);
}

export async function sendAccessPausedEmail(to: string, username: string): Promise<void> {
  await sendEmail(to, 'Your Livinity server has been paused', `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="font-size: 20px; font-weight: 700; color: #111; margin-bottom: 16px;">${username}.livinity.io is paused</h2>
      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">Your subscription is no longer active, so access to your Livinity subdomain has been paused. Your server and data are untouched — resubscribe and it comes right back online.</p>
      <a href="${BASE_URL}/pricing" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Resubscribe</a>
      <p style="color: #999; font-size: 13px; margin-top: 24px;">Questions? Just reply to this email.</p>
    </div>
  `);
}

/**
 * Operational alarm to the operator's monitored ops mailbox (NOT a user-facing
 * email). Used by the QUOTA-04 zone-capacity alarm + QUOTA-03 orphan report.
 * `idempotencyKey` (24h, Resend) dedupes a daily alarm if the cron retries.
 */
export async function sendOpsAlertEmail(
  subject: string,
  html: string,
  idempotencyKey?: string,
): Promise<void> {
  await sendEmail(
    OPS_ALERT_EMAIL,
    subject,
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
      <h2 style="font-size: 18px; font-weight: 700; color: #111; margin-bottom: 16px;">⚠️ Livinity ops alert</h2>
      ${html}
      <p style="color: #999; font-size: 12px; margin-top: 24px;">Automated alert from the Livinity platform. Set OPS_ALERT_EMAIL to change where these go.</p>
    </div>
  `,
    idempotencyKey,
  );
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${BASE_URL}/reset-password?token=${token}`;

  await sendEmail(
    to,
    'Reset your Livinity password',
    `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="font-size: 20px; font-weight: 700; color: #111; margin-bottom: 16px;">Reset your password</h2>
      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">Click the button below to set a new password for your Livinity account.</p>
      <a href="${link}" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reset Password</a>
      <p style="color: #999; font-size: 13px; margin-top: 24px;">This link expires in 1 hour. If you didn't request a password reset, you can ignore this email.</p>
    </div>
  `,
    `reset:${to}:${token}`,
  );
}
