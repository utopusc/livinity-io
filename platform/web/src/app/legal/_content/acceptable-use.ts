import type { LegalDoc } from './types';

// Professional template — the operational basis for suspending abusive tenants
// and for limiting upstream-provider (Cloudflare) account-level risk.
export const acceptableUse: LegalDoc = {
  slug: 'acceptable-use',
  title: 'Acceptable Use Policy',
  summary: 'What you may not do with the Service — and what happens if you do.',
  updated: 'June 17, 2026',
  body: `This Acceptable Use Policy ("AUP") governs your use of the Livinity platform, the LivOS software, and any subdomain or tunnel we provide (the "Service"). It is part of, and incorporated into, our [Terms of Service](/legal/terms). Because the Service routes your traffic through shared third-party infrastructure (including Cloudflare), abuse by one user can jeopardize the platform for everyone — so we enforce this policy strictly.

You are responsible for all activity on your account, your LivOS server, and anything reachable through your subdomains, including activity by anyone you give access to.

## 1. Prohibited Content

You may not use the Service to host, store, transmit, or make available:

- **Child sexual abuse material (CSAM) or any child exploitation content.** This is absolutely prohibited. We have zero tolerance: such content is removed immediately without notice, your account is terminated, and it is reported to the appropriate authorities and to the National Center for Missing & Exploited Children (NCMEC) as required by law.
- Content that is illegal under applicable law, or that promotes or facilitates illegal activity.
- Phishing pages, fraudulent content, or material designed to deceive or steal credentials.
- Malware, ransomware, spyware, viruses, command-and-control infrastructure, or exploit kits.
- Content that infringes intellectual-property rights (copyright, trademark) or misappropriates trade secrets.
- Content that harasses, threatens, defames, or violates the privacy or other rights of others.

## 2. Prohibited Activities

You may not:

- Send spam or unsolicited bulk messaging, or violate anti-spam laws (CAN-SPAM, GDPR/ePrivacy, etc.).
- Operate an open proxy, relay, anonymization, or VPN-egress service for third parties through the Service.
- Mine cryptocurrency or run comparable resource-abusive workloads through Livinity-provided infrastructure.
- Launch, facilitate, participate in, or knowingly attract denial-of-service or other network attacks.
- Probe, scan, or test the vulnerability of the platform, or breach or circumvent authentication, rate limits, quotas, or security controls, without our prior written authorization.
- Resell, sublicense, or provide the underlying Livinity or upstream-provider infrastructure to third parties as a standalone service.

## 3. Resource & Bandwidth Abuse

The Service is delivered over shared content-delivery and tunnel infrastructure subject to upstream-provider terms. You may not use it to serve video, streaming media, or a disproportionate volume of large or non-HTML files in a way that violates those upstream terms (for example, Cloudflare's restrictions on serving such content through the CDN on non-enterprise plans). We may meter, throttle, or restrict traffic that threatens platform stability or our standing with a provider.

## 4. Security & Integrity

You must not interfere with or disrupt the integrity or performance of the Service, attempt to gain unauthorized access to any system or account, or use the Service in any way that could damage, disable, or impair it or the networks connected to it.

## 5. Enforcement & Consequences

We may investigate suspected violations and may, at our discretion and to the extent permitted by law: remove or disable content; disable a subdomain or tunnel; throttle or rate-limit; and suspend or terminate your account. **For severe violations — including CSAM, malware distribution, phishing, attack traffic, or any matter that exposes our upstream providers — action may be immediate and without prior notice.** We will also act when directed by an upstream provider or required by law. Enforcement is in addition to any other remedies available to us.

## 6. Reporting Abuse

To report a violation, email **everything@gmail.com** with the URL or subdomain, a description, and any supporting evidence. We aim to acknowledge reports promptly and to act within the timeframes required by our upstream providers and applicable law.

## 7. Changes

We may update this AUP. The current version is always posted here with its effective date; continued use after an update constitutes acceptance.

## 8. Contact

Questions about this policy: everything@gmail.com. Abuse reports: everything@gmail.com.`,
};
