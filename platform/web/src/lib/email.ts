const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://livinity.io';
const FROM_ADDRESS = 'Livinity <noreply@livinity.io>';

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`[email] (dev mode) To: ${to}, Subject: ${subject}`);
    console.log(`[email] ${html.replace(/<[^>]*>/g, '')}`);
    return;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  });
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${BASE_URL}/verify?token=${token}`;

  await sendEmail(to, 'Verify your Livinity account', `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="font-size: 20px; font-weight: 700; color: #111; margin-bottom: 16px;">Welcome to Livinity</h2>
      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">Click the button below to verify your email address and complete your registration.</p>
      <a href="${link}" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Verify Email</a>
      <p style="color: #999; font-size: 13px; margin-top: 24px;">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
    </div>
  `);
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${BASE_URL}/reset-password?token=${token}`;

  await sendEmail(to, 'Reset your Livinity password', `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="font-size: 20px; font-weight: 700; color: #111; margin-bottom: 16px;">Reset your password</h2>
      <p style="color: #555; line-height: 1.6; margin-bottom: 24px;">Click the button below to set a new password for your Livinity account.</p>
      <a href="${link}" style="display: inline-block; background: #111; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Reset Password</a>
      <p style="color: #999; font-size: 13px; margin-top: 24px;">This link expires in 1 hour. If you didn't request a password reset, you can ignore this email.</p>
    </div>
  `);
}
