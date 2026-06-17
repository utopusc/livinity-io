import type { LegalDoc } from './types';

// Professional template — review by counsel/DPO before relying on it. Covers
// GDPR (EU/UK) and KVKK (Türkiye) data-subject rights and lists sub-processors.
export const privacy: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  summary: 'What personal data Livinity collects, why, who processes it, and your rights.',
  updated: 'June 17, 2026',
  body: `This Privacy Policy explains how Livinity Inc. ("Livinity", "we", "us") collects, uses, and shares personal data when you use livinity.io and the LivOS service (the "Service"). For the purposes of the EU/UK General Data Protection Regulation ("GDPR") and the Turkish Personal Data Protection Law No. 6698 ("KVKK"), Livinity is the **data controller** for the personal data described here. Our contact is everything@livinity.io.

This policy covers the personal data we process to operate the platform. It does **not** cover the data you choose to store on or process through your own LivOS server — for that data, **you** are the controller and are responsible for your own compliance.

## 1. Data We Collect

- **Account data:** email address, chosen username, and a hashed password. (We never store your password in plain text.)
- **Authentication data:** session tokens and, where you create them, API keys.
- **Provisioning & device metadata:** your assigned subdomain, tunnel configuration, the applications you install, and related operational records needed to route traffic to your server.
- **Billing data:** subscription status and plan. Card and payment details are collected and stored by our payment processor (Stripe) — **we do not store full card numbers.**
- **Usage & log data:** IP address, browser/user-agent, timestamps, and request/error logs, used for security, abuse prevention, and reliability.
- **Support communications:** messages you send us and our replies.

## 2. How & Why We Use Data

We use personal data to: create and manage your account; provision and operate your subdomain and tunnel; process payments and prevent fraud; provide support; secure the platform and investigate abuse; comply with legal obligations; and send service-related and (where permitted) product communications.

## 3. Legal Bases (GDPR)

We rely on: **performance of a contract** (to provide the Service you signed up for); **legitimate interests** (security, abuse prevention, improving the Service), balanced against your rights; **consent** (where required, e.g. certain communications — withdrawable at any time); and **legal obligation** (tax, accounting, lawful requests).

## 4. Sub-Processors

We share personal data with the following processors, who act on our instructions under data-processing agreements, only as needed to run the Service:

| Sub-processor | Purpose | Typical data |
|---------------|---------|--------------|
| Cloudflare | DNS, secure tunnel, CDN/edge, DDoS protection | IP addresses, request metadata, subdomain routing |
| Supabase | Database, file storage, authentication | account data, app metadata, uploaded files |
| Vercel | Hosting of the livinity.io web platform | request logs, IP addresses |
| Stripe | Subscription payments | billing identifiers, payment data (held by Stripe) |
| Resend | Transactional email (verification, password reset) | email address, message content |

We may update this list; material changes will be reflected here with a new date.

## 5. International Transfers

Our providers may process data in the United States and other countries. Where we transfer personal data out of the EEA, UK, or Türkiye, we rely on appropriate safeguards (such as the EU Standard Contractual Clauses and provider commitments) and, for KVKK, on the lawful transfer mechanisms it requires.

## 6. Retention

We keep personal data for as long as your account is active and as needed to provide the Service, then for the period required to meet legal, accounting, security, and dispute-resolution obligations, after which it is deleted or anonymized. Backups and logs are retained for limited, rolling periods.

## 7. Security

We use technical and organizational measures appropriate to the risk, including encryption in transit, hashed passwords, access controls, and encrypted storage of sensitive tokens. No method of transmission or storage is perfectly secure; we cannot guarantee absolute security, and you are responsible for safeguarding your own server and credentials.

## 8. Your Rights — GDPR (EU/UK)

Subject to applicable law, you may: **access** your data; request **rectification** of inaccurate data; request **erasure** ("right to be forgotten"); **restrict** or **object** to processing; obtain **portability** of data you provided; and **withdraw consent** at any time. You also have the right to **lodge a complaint** with your supervisory authority. To exercise these rights, contact everything@livinity.io; we respond within the timeframes the law requires.

## 9. Your Rights — KVKK (Türkiye)

If you are in Türkiye, under Article 11 of the KVKK you have the right to: learn whether your data is processed and request information about it; learn the purpose of processing and whether it is used accordingly; know the third parties to whom data is transferred domestically or abroad; request correction of incomplete or inaccurate data; request erasure or destruction; request that corrections/erasures be notified to third parties; object to results produced solely by automated analysis; and claim compensation for damage caused by unlawful processing. Submit requests to everything@livinity.io (or to the registered data-controller address 5630 Mission St #322, San Francisco, CA 94112); we respond within the periods set by the KVKK.

## 10. Cookies

We use a small number of cookies that are necessary to operate the Service (for example, your login session). See our [Cookie Policy](/legal/cookies) for details. We do not use third-party advertising or cross-site tracking cookies.

## 11. Children

The Service is not directed to children under 16 (or the minimum age in your jurisdiction), and we do not knowingly collect their data. If you believe a child has provided us data, contact everything@livinity.io and we will delete it.

## 12. Changes

We may update this policy. We will post the new version here with an updated date and, for material changes, provide reasonable notice.

## 13. Contact

Privacy questions or rights requests: everything@livinity.io · Livinity Inc., 5630 Mission St #322, San Francisco, CA 94112.`,
};
