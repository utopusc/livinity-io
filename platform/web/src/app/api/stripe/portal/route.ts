// POST /api/stripe/portal — open the Stripe Customer Portal (cancel, update
// card, view invoices). Session-authed (dashboard cookie). Returns { url }.
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') || 'https://livinity.io';
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await getSession(token) : null;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = await pool.query<{ stripe_customer_id: string | null }>(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [session.userId],
  );
  const customerId = res.rows[0]?.stripe_customer_id;
  if (!customerId) {
    // Never checked out → nothing to manage; UI should send them to /pricing.
    return NextResponse.json({ error: 'no_billing_account' }, { status: 404 });
  }

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl()}/dashboard`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error('[stripe-portal] Stripe API error:', err);
    return NextResponse.json(
      { error: 'Payment service is temporarily unavailable. Please try again.' },
      { status: 502 },
    );
  }
}
