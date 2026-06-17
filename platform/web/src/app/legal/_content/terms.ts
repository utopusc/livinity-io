import type { LegalDoc } from './types';

// NOTE: professional template — review by licensed counsel before relying on
// it in a dispute. Placeholder tokens ([COMPANY LEGAL NAME], etc.) are filled
// once the legal entity is finalized.
export const terms: LegalDoc = {
  slug: 'terms',
  title: 'Terms of Service',
  summary: 'The agreement between you and Livinity that governs your use of the service.',
  updated: 'June 17, 2026',
  body: `These Terms of Service ("Terms") are a binding agreement between you ("you", "your", or "User") and [COMPANY LEGAL NAME] ("Livinity", "we", "us", or "our") governing your access to and use of the Livinity platform at livinity.io, the LivOS software, and all related websites, applications, APIs, and services (collectively, the "Service").

**By creating an account, installing LivOS, or otherwise using the Service, you agree to these Terms.** If you do not agree, do not use the Service. If you use the Service on behalf of an organization, you represent that you are authorized to bind that organization, and "you" refers to that organization.

## 1. The Service

Livinity lets you install the LivOS server software on hardware you own or control, and makes that server reachable over the internet through Livinity-operated infrastructure — including DNS, a secure tunnel, and per-user subdomains of the form \`{username}.livinity.io\` and per-application subdomains. The Service includes the livinity.io platform (account management, provisioning, and the application library), the LivOS software, and the AI features bundled with it.

You are responsible for the hardware on which you run LivOS, for its security and lawful operation, and for everything you make accessible through your subdomains.

## 2. Eligibility & Accounts

You must be at least 18 years old, or the age of majority in your jurisdiction, to use the Service. You agree to provide accurate registration information, to keep your password and API keys confidential, and to be responsible for all activity under your account. Notify us immediately at [CONTACT EMAIL] of any unauthorized use. We may refuse, suspend, or reclaim usernames, including for trademark, impersonation, or abuse reasons.

## 3. Subscriptions, Trials & Billing

Some features require a paid subscription. Pricing, billing intervals, and any free trial are presented at sign-up or in your account. Payments are processed by our payment processor (Stripe); by subscribing you also agree to the processor's terms. Subscriptions renew automatically at the end of each billing period unless cancelled. You authorize us to charge your payment method for recurring fees and applicable taxes. Refunds and cancellations are governed by our [Refund & Cancellation Policy](/legal/refund). We may change prices on prospective notice; continued use after a price change constitutes acceptance.

## 4. Acceptable Use

Your use of the Service is subject to our [Acceptable Use Policy](/legal/acceptable-use), which is incorporated into these Terms by reference. Among other things, you may not use the Service or your subdomains to host or distribute illegal content, malware, or phishing; to operate an open proxy, VPN egress, or anonymization service for third parties; to mine cryptocurrency; to send spam; to conduct or facilitate attacks; or to consume infrastructure in a manner that violates our or our upstream providers' terms (including serving video or a disproportionate volume of large/non-HTML files through the content-delivery network or tunnel). **You acknowledge that the Service routes traffic through shared third-party infrastructure (including Cloudflare), and that abuse by your account can affect that infrastructure for all users; we may act immediately to protect the platform.**

## 5. Your Content & Responsibility

You retain ownership of the data, files, applications, and content you store on or serve through your LivOS server ("Your Content"). You are solely responsible for Your Content and for any third party to whom you provide access. You represent that you have the rights necessary to host and distribute Your Content and that it does not violate any law or third-party right. We do not monitor Your Content in the ordinary course, but we may remove content, disable a subdomain, or suspend access where required by law, by an upstream provider, or by these Terms.

## 6. Intellectual Property

The Service, including the livinity.io platform, the Livinity name and logos, and the LivOS software (except for components licensed under their own open-source or third-party licenses), is owned by Livinity and protected by intellectual-property laws. We grant you a limited, non-exclusive, non-transferable, revocable license to use the Service in accordance with these Terms. You may not copy, resell, sublicense, reverse engineer (except as permitted by law), or create derivative works of the proprietary parts of the Service except as expressly allowed.

## 7. Third-Party Services

The Service integrates third-party providers (including Cloudflare for DNS/tunnel/CDN, Supabase for data storage, Vercel for hosting, Stripe for payments, and Resend for email) and may let you install third-party or community applications. Your use of third-party components is subject to their terms, and we are not responsible for them. Installing community applications is at your own risk.

## 8. Privacy

Our handling of personal data is described in our [Privacy Policy](/legal/privacy) and [Cookie Policy](/legal/cookies). By using the Service you consent to that handling.

## 9. Suspension & Termination

You may stop using the Service and close your account at any time. We may suspend or terminate your access, in whole or in part, with or without notice: (a) for a breach of these Terms or the Acceptable Use Policy; (b) where required to protect the Service, other users, or our upstream providers (including in response to an abuse report or a provider directive); (c) for non-payment; or (d) if continued provision becomes unlawful or commercially impracticable. For severe violations — including the hosting of illegal content, malware, phishing, or child sexual abuse material — suspension may be immediate and without notice. Upon termination, your right to use the Service ends; sections that by their nature should survive (ownership, disclaimers, liability limits, indemnity, governing law) survive.

## 10. Disclaimers

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, OR THAT YOUR DATA WILL NOT BE LOST. YOU ARE RESPONSIBLE FOR MAINTAINING YOUR OWN BACKUPS.

## 11. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW, LIVINITY AND ITS OFFICERS, EMPLOYEES, AND SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM OR RELATED TO THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE GREATER OF (a) THE AMOUNTS YOU PAID US IN THE 12 MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM, OR (b) USD 100. Some jurisdictions do not allow certain limitations, so some of the above may not apply to you.

## 12. Indemnification

You agree to indemnify and hold harmless Livinity from any claim, loss, or expense (including reasonable legal fees) arising from Your Content, your use of the Service, your violation of these Terms or the Acceptable Use Policy, or your violation of any law or third-party right.

## 13. Changes

We may modify these Terms. We will post the updated Terms with a new "Last updated" date and, for material changes, provide reasonable notice. Your continued use after the effective date constitutes acceptance.

## 14. Governing Law & Disputes

These Terms are governed by the laws of the State of Delaware, USA, without regard to its conflict-of-laws rules. Subject to applicable law, you and Livinity agree that any dispute will be resolved exclusively in the state or federal courts located in Delaware, and you consent to their jurisdiction. Where binding arbitration or a different forum is required by mandatory local law applicable to you (including consumer-protection law), that law controls to the extent required.

## 15. Miscellaneous

These Terms, together with the policies incorporated by reference, are the entire agreement between you and Livinity regarding the Service. If any provision is unenforceable, the rest remains in effect. Our failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign them in connection with a merger, acquisition, or sale of assets.

## 16. Contact

Questions about these Terms: [CONTACT EMAIL] · [COMPANY LEGAL NAME], [COMPANY ADDRESS].`,
};
