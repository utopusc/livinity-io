// Blocklist of known disposable/temp-mail domains — closes the abuse path where
// a script registers unlimited accounts using an inbox it can read via API to
// auto-click the verification link (observed: web-library.net, 33 accounts
// created 2026-07-16..18 probing free-trial/promo/API-key flows).
//
// Best-effort, not exhaustive: this blocks the well-known providers plus the
// one seen in the wild. It intentionally does not use a live DNS/MX lookup —
// a static list fails safe (never blocks a real provider by mistake) and never
// adds request latency or an external dependency to signup.
const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'web-library.net',
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'guerrillamail.biz',
  'guerrillamail.org',
  'guerrillamail.de',
  'sharklasers.com',
  '10minutemail.com',
  '10minutemail.net',
  '10minemail.com',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  'tempmailo.com',
  'tempinbox.com',
  'throwawaymail.com',
  'yopmail.com',
  'yopmail.net',
  'yopmail.fr',
  'trashmail.com',
  'trashmail.net',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'fakeinbox.com',
  'mintemail.com',
  'emailondeck.com',
  'moakt.com',
  'moakt.cc',
  'discard.email',
  'discardmail.com',
  'spamgourmet.com',
  'mohmal.com',
  'incognitomail.com',
  'harakirimail.com',
  'jetable.org',
  'mailnesia.com',
  'spam4.me',
  'tempr.email',
  'mailcatch.com',
  'burnermail.io',
  'mailsac.com',
  'inboxbear.com',
  'crazymailing.com',
  'letterhaven.net',
  'einrot.com',
  'anonaddy.me',
  'mytemp.email',
  '33mail.com',
]);

export function isDisposableEmailDomain(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
