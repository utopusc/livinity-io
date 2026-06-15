// Server-only Stripe client + price config.
// SECRET_KEY lives ONLY in env (Vercel) — never committed. Import this only from
// server code (route handlers / server actions), never from a client component.
import Stripe from 'stripe';

// Lazy singleton: `next build` imports route modules to collect route config,
// so a module-scope throw would break builds on machines without the env var.
// Fails loud at first actual use instead.
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('[stripe] STRIPE_SECRET_KEY is required (set it in Vercel env)');
  }
  // apiVersion intentionally omitted → the SDK uses its bundled pinned default,
  // which matches the account default. Avoids a TS literal-version mismatch on
  // SDK bumps. Pin explicitly later if you want lockstep control.
  _stripe = new Stripe(secretKey, { typescript: true });
  return _stripe;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return Reflect.get(getStripe(), prop);
  },
});

export type BillingInterval = 'monthly' | 'yearly';

/** Resolve a checkout price ID from the requested billing interval. */
export function priceIdForInterval(interval: BillingInterval): string {
  const monthly = process.env.STRIPE_PRICE_ID_MONTHLY;
  const yearly = process.env.STRIPE_PRICE_ID_YEARLY;
  const id = interval === 'yearly' ? yearly : monthly;
  if (!id) {
    throw new Error(
      `[stripe] STRIPE_PRICE_ID_${interval === 'yearly' ? 'YEARLY' : 'MONTHLY'} is not set`,
    );
  }
  return id;
}

/**
 * EDU price ($3.99/mo, MONTHLY ONLY) for verified US `.edu` emails, or `null`
 * if `STRIPE_PRICE_ID_EDU_MONTHLY` isn't configured. Returns null (rather than
 * throwing) so an unset env degrades gracefully — the checkout route falls back
 * to the standard monthly price instead of failing an `.edu` user's checkout.
 * EDU does not apply to yearly: `.edu` users who pick yearly pay standard
 * $69.99/yr.
 */
export function eduMonthlyPriceId(): string | null {
  return process.env.STRIPE_PRICE_ID_EDU_MONTHLY ?? null;
}

/** The 3-day free trial (card upfront) applied at checkout. */
export const TRIAL_PERIOD_DAYS = 3;

/** Grace window (days) after a failed payment before the enforcement cron cuts access. */
export const PAST_DUE_GRACE_DAYS = 3;
