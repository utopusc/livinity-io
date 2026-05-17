"use client";
import { useState } from "react";
import type { WizardMode } from "./mode-cards";

interface ModeDoc {
  id: WizardMode;
  title: string;
  comingSoon?: boolean;
  shortDescription: string;
  preReqs?: string[];
  whatItDoes?: string[];
  securityTradeoffs?: string[];
  troubleshooting?: { question: string; answer: string }[];
}

const DOCS: ModeDoc[] = [
  {
    id: "local-lan",
    title: "Local (LAN)",
    shortDescription: "LivOS reachable from your home network at <hostname>.local. No internet exposure, no DNS, no certificates from a public CA.",
    preReqs: [
      "An Ubuntu 24.04 machine on your home network (any small VPS or Mini PC works — 4 GB RAM minimum, 16 GB recommended)",
      "Avahi / Bonjour mDNS support on the LAN (default on most home routers; Windows clients may need Bonjour installed)",
      "Root or sudo access on the install target",
    ],
    whatItDoes: [
      "Installs Docker + Postgres + Redis + Caddy on the target host",
      "Configures Caddy to listen on :443 with a self-signed certificate for <hostname>.local",
      "Publishes mDNS records so devices on the LAN auto-discover the host",
      "Starts all 4 LivOS services (livinityd + liv-core + liv-worker + liv-memory)",
    ],
    securityTradeoffs: [
      "Self-signed TLS — browsers show a one-time warning. Acceptable for LAN-only use; you can install the cert system-wide for clean UX.",
      "Only accessible from devices on the same network. NOT internet-reachable.",
      "No upstream public CA validation; not suitable for sharing access with people outside your home.",
    ],
    troubleshooting: [
      {
        question: "I cannot reach livinity.local from my iPhone.",
        answer: "iOS uses Bonjour — usually works out of the box. If it does not, manually map the LAN IP in your phone's settings, or use the IP directly: https://192.168.x.x.",
      },
      {
        question: "How do I switch to Hybrid mode later?",
        answer: "Re-run the wizard, pick Hybrid, paste the new command. The installer will detect the existing install and upgrade in place.",
      },
    ],
  },
  {
    id: "hybrid",
    title: "Hybrid (Recommended)",
    shortDescription: "LivOS reachable on a subdomain you choose, via a Cloudflare Tunnel. TLS terminates at Cloudflare's edge; your server dials out — no port forwarding, no public IPv4 required, works behind CGNAT.",
    preReqs: [
      "An Ubuntu 24.04 VPS or home server (4 GB RAM minimum, 16 GB recommended)",
      "A domain you control, with DNS hosted on Cloudflare",
      "A Cloudflare Tunnel — created in Zero Trust → Networks → Tunnels (we walk you through it in step 2)",
      "The connector token from that tunnel (long base64 string, starts with eyJ…)",
      "Root or sudo access on the install target",
    ],
    whatItDoes: [
      "Installs Docker + Postgres + Redis + Caddy + cloudflared on the target host",
      "Stores your tunnel token at /etc/livos/secrets/cf-tunnel-token (mode 0600)",
      "Starts cloudflared as a systemd service, which dials out to Cloudflare and joins your tunnel",
      "Configures Caddy on localhost:80 to dispatch requests by Host header to the right app",
      "Registers your API key with Server5 so the App Store iframe and platform services work",
      "Starts all 4 LivOS services (livinityd + liv-core + liv-worker + liv-memory)",
    ],
    securityTradeoffs: [
      "Public HTTPS — anyone with the URL can reach the login page. Strong passwords + 2FA recommended.",
      "Traffic flows through Cloudflare's edge (TLS terminated there). If that's not acceptable, run a self-hosted reverse proxy on a VPS with public IPv4 instead.",
      "The tunnel token is sensitive — anyone holding it can join your tunnel. It is stored only on your server (mode 0600) and never persisted to Livinity's database.",
      "App subdomains (n8n, AdGuard, etc.) require the wildcard route shown in step 3. Without it, only the apex URL works.",
    ],
    troubleshooting: [
      {
        question: "After install, the URL returns 502 / Bad Gateway.",
        answer: "Check the connector status in Cloudflare → Zero Trust → Networks → Tunnels. If it shows 'No connectors installed', the cloudflared service didn't start: `sudo systemctl status cloudflared` on your server.",
      },
      {
        question: "App subdomains (n8n.<sub>.<domain>) return 1033 / tunnel not found.",
        answer: "You forgot to add Route 2 (the wildcard route) in step 3, or the wildcard CNAME isn't proxied. Re-run step 3 from the wizard.",
      },
      {
        question: "Can I use a domain that is NOT on Cloudflare?",
        answer: "Not yet — Hybrid mode requires Cloudflare-managed DNS. For LAN-only use, pick Local instead.",
      },
    ],
  },
  {
    id: "tunnel",
    title: "Own-Cloud (CF Tunnel)",
    comingSoon: true,
    shortDescription: "Cloudflare Tunnel — bypasses NAT/CGNAT/strict firewalls without port forwarding. Useful when your VPS or home server cannot expose ports 80/443 directly.",
  },
  {
    id: "cloud",
    title: "Cloud",
    comingSoon: true,
    shortDescription: "Fully managed LivOS hosted on Livinity infrastructure. Zero self-hosting required — just register and use. Pricing TBA.",
  },
];

export default function ModeDocs() {
  const [openId, setOpenId] = useState<WizardMode | null>(null);
  return (
    <div id="mode-docs-section" className="mt-10 rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-800/40">
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Mode reference</h3>
      <p className="mt-1 text-sm text-zinc-500">Click a mode to expand prerequisites, what-it-does, and security notes.</p>
      <div className="mt-4 space-y-2">
        {DOCS.map((doc) => {
          const isOpen = openId === doc.id;
          return (
            <div key={doc.id} id={`mode-doc-${doc.id}`} className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : doc.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{doc.title}</span>
                  {doc.comingSoon && (
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                      Coming Soon
                    </span>
                  )}
                </div>
                <svg className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {isOpen && (
                <div className="border-t border-zinc-100 px-4 py-4 text-sm dark:border-zinc-800">
                  <p className="text-zinc-700 dark:text-zinc-300">{doc.shortDescription}</p>
                  {doc.preReqs && (
                    <>
                      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Prerequisites</h4>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
                        {doc.preReqs.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    </>
                  )}
                  {doc.whatItDoes && (
                    <>
                      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">What the installer does</h4>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
                        {doc.whatItDoes.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </>
                  )}
                  {doc.securityTradeoffs && (
                    <>
                      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Security tradeoffs</h4>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-zinc-600 dark:text-zinc-400">
                        {doc.securityTradeoffs.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </>
                  )}
                  {doc.troubleshooting && doc.troubleshooting.length > 0 && (
                    <>
                      <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Troubleshooting</h4>
                      <dl className="mt-2 space-y-2 text-xs">
                        {doc.troubleshooting.map((t, i) => (
                          <div key={i}>
                            <dt className="font-medium text-zinc-700 dark:text-zinc-300">{t.question}</dt>
                            <dd className="mt-0.5 text-zinc-600 dark:text-zinc-400">{t.answer}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
