"use client";
import { useState } from "react";
import type { WizardMode } from "./mode-cards";
import type { HybridFormState } from "./hybrid-form";
import type { LocalFormState } from "./local-form";

interface GenState {
  status: "idle" | "minting" | "ready" | "error";
  keyId?: string;
  plainKey?: string;
  error?: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

/**
 * D-111-INSTALL-CMD-COPY-FRIENDLY: command is a SINGLE shell line.
 * No \-continuations. All flags on one line so users can curl-pipe-bash without
 * shell-escape surprises.
 *
 * D-111-KEY-NEVER-RE-SHOWN: plain liv_k_* only rendered in this component when
 * gen.status === "ready". Navigating back+forward in the wizard revokes the old
 * key and mints a new one (parent component handles).
 */
function buildCommand(
  mode: WizardMode,
  hybrid: HybridFormState,
  local: LocalFormState,
  apiKey: string,
): string {
  if (mode === "hybrid") {
    const fullDomain = `${hybrid.subdomain.trim()}.${hybrid.baseDomain.trim()}`;
    return `curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --mode hybrid --domain ${fullDomain} --api-key ${apiKey} --cf-tunnel-token ${hybrid.cfTunnelToken.trim()}`;
  }
  // local-lan
  const host = (local.hostname || "livinity").trim();
  return `curl -fsSL https://livinity.io/install.sh | sudo bash -s -- --mode local-lan --domain ${host}.local --api-key ${apiKey}`;
}

export default function InstallCommandDisplay({
  mode,
  hybrid,
  local,
  gen,
}: {
  mode: WizardMode;
  hybrid: HybridFormState;
  local: LocalFormState;
  gen: GenState;
}) {
  if (gen.status === "minting") {
    return (
      <div className="py-8 text-center text-sm text-zinc-500">
        Generating your API key…
      </div>
    );
  }
  if (gen.status === "error") {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
        <strong>Could not generate API key:</strong> {gen.error ?? "Unknown error"}
      </div>
    );
  }
  if (gen.status !== "ready" || !gen.plainKey) {
    return null;
  }

  const cmd = buildCommand(mode, hybrid, local, gen.plainKey);

  // D-111-RELAY-DATA-PLANE-DOC advisory
  const primaryUrl = mode === "hybrid"
    ? `https://${hybrid.subdomain.trim()}.${hybrid.baseDomain.trim()}`
    : `https://${(local.hostname || "livinity").trim()}.local`;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Your install command</h2>
        <p className="mt-1 text-sm text-zinc-500">
          SSH into your fresh Ubuntu 24.04 VPS (as root or sudo-capable) and paste this single line. The script handles everything: deps, services, TLS, defaults.
        </p>
      </div>

      <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-700 dark:bg-emerald-950">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Install command (one line)
          </p>
          <CopyButton text={cmd} />
        </div>
        <pre className="overflow-x-auto rounded-lg bg-white p-3 font-mono text-xs leading-relaxed text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50">
          <code className="whitespace-pre">{cmd}</code>
        </pre>
        <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-300">
          ⚠ Your API key is baked into this command. It is shown <strong>only once</strong>. If you lose it, click <em>Back</em> to regenerate (the old key will be revoked).
        </p>
      </div>

      <div className="rounded-lg bg-zinc-50 p-4 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        <strong>Your primary URL will be:</strong> <code className="rounded bg-white px-1.5 py-0.5 font-mono dark:bg-zinc-900">{primaryUrl}</code>
        <br />
        <span className="mt-1 block text-zinc-500 dark:text-zinc-400">
          {mode === "hybrid"
            ? "Reached via your Cloudflare Tunnel. TLS terminates at Cloudflare's edge; the connector dials out from your server — no inbound ports required, works behind CGNAT or strict firewalls."
            : "Only reachable from devices on the same LAN. For internet access, choose Hybrid mode instead."}
        </span>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-medium text-zinc-900 dark:text-zinc-50">What happens next?</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
          <li>The script installs Docker, Postgres, Redis, Caddy, cloudflared, and the LivOS services.</li>
          <li>cloudflared connects your server to your tunnel using the token above. Cloudflare handles TLS at the edge.</li>
          <li>It registers your API key with Server5 and seeds the App Store catalog.</li>
          <li>Once the connector is online, finish step 3 of the previous screen: add the two Published application routes in your Cloudflare tunnel.</li>
          <li>Open your URL in a browser — you&apos;ll see the LivOS register screen.</li>
          <li>Return to <a href="/dashboard" className="text-blue-600 hover:underline">your dashboard</a> to confirm the server is online (auto-refreshes every 10s).</li>
        </ol>
      </div>
    </div>
  );
}
