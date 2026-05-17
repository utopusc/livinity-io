"use client";
import { useState } from "react";

export interface HybridFormState {
  subdomain: string;
  baseDomain: string;
  cfTunnelToken: string;
}

function CopyChip({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="ml-2 rounded border border-zinc-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      {copied ? "Copied" : label ?? "Copy"}
    </button>
  );
}

function FieldRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">{label}</p>
        <p className={`mt-0.5 truncate text-sm text-zinc-900 dark:text-zinc-50 ${mono ? "font-mono" : ""}`}>{value || <span className="text-zinc-400">—</span>}</p>
      </div>
      {value && <CopyChip text={value} />}
    </div>
  );
}

export default function HybridForm({
  state,
  onChange,
}: {
  state: HybridFormState;
  onChange: (s: HybridFormState) => void;
}) {
  const [tokenVisible, setTokenVisible] = useState(false);

  const sub = state.subdomain.trim();
  const base = state.baseDomain.trim();
  const fullDomain = sub && base ? `${sub}.${base}` : "";
  const wildcardSub = sub ? `*.${sub}` : "";
  const tokenLen = state.cfTunnelToken.trim().length;
  const tokenLooksValid = tokenLen >= 100 && /^[A-Za-z0-9+/=_-]+$/.test(state.cfTunnelToken.trim());

  return (
    <div className="space-y-8">
      {/* Section header */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Configure Hybrid mode</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Your LivOS will be reachable on a subdomain you choose, via a Cloudflare Tunnel — no port forwarding, no public IP required.
        </p>
      </div>

      {/* ─── 1. Domain ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <header className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900">1</span>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Your domain</h3>
        </header>

        <p className="text-xs text-zinc-500">
          Pick a subdomain (e.g. <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px] dark:bg-zinc-800">lu</code>) under any domain you own and host on Cloudflare (e.g. <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px] dark:bg-zinc-800">livinity.live</code>). DNS is configured automatically by the tunnel.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1.4fr]">
          <label className="block">
            <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Subdomain</span>
            <input
              type="text"
              value={state.subdomain}
              onChange={(e) => onChange({ ...state, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              placeholder="lu"
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
            />
          </label>

          <div className="hidden items-end pb-2 text-zinc-400 sm:flex">
            <span className="text-lg">.</span>
          </div>

          <label className="block">
            <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Domain</span>
            <input
              type="text"
              value={state.baseDomain}
              onChange={(e) => onChange({ ...state, baseDomain: e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, "") })}
              placeholder="livinity.live"
              autoComplete="off"
              spellCheck={false}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
            />
          </label>
        </div>

        {/* Live preview */}
        <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-800/60">
          <span className="text-zinc-500">Your URL will be: </span>
          <code className="font-mono text-sm text-zinc-900 dark:text-zinc-50">
            {fullDomain ? `https://${fullDomain}` : "https://<subdomain>.<domain>"}
          </code>
        </div>
      </section>

      {/* ─── 2. Get your CF Tunnel token ────────────────────────── */}
      <section className="space-y-3">
        <header className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900">2</span>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Get your Cloudflare Tunnel token</h3>
        </header>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <ol className="space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">1</span>
              <span>
                Open Cloudflare{" "}
                <a href="https://one.dash.cloudflare.com/" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline dark:text-blue-400">Zero Trust dashboard</a>
                {" "}→ left sidebar <strong>Networks</strong> → <strong>Tunnels</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">2</span>
              <span>
                Click <strong>Create a tunnel</strong> → pick <strong>Cloudflared</strong> → <strong>Next</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">3</span>
              <span>
                Name your tunnel — we suggest{" "}
                <code className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">
                  livos-{sub || "<subdomain>"}
                </code>
                {sub && <CopyChip text={`livos-${sub}`} label="Copy" />}
                . Click <strong>Save tunnel</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">4</span>
              <span>
                On the <em>Install and run a connector</em> page, pick any OS (e.g. Windows / 64-bit). Cloudflare shows a command like:{" "}
                <code className="mt-1 block rounded bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  cloudflared.exe service install <span className="text-emerald-600 dark:text-emerald-400">eyJhIjoiMz...</span>
                </code>
                Copy the long string <strong>after</strong> <code className="font-mono text-xs">service install</code> (starts with <code className="font-mono text-xs">eyJ</code>). That's your tunnel token. Paste it below.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">5</span>
              <span>
                You can click <strong>Next</strong> and leave the routes blank for now — we'll add them in step 3 below. The connector will show as <em>No connectors installed</em> until <code className="font-mono text-xs">install.sh</code> runs on your server.
              </span>
            </li>
          </ol>
        </div>

        {/* Token input */}
        <label className="block">
          <span className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Paste your tunnel token</span>
          <div className="mt-1 flex gap-2">
            <input
              type={tokenVisible ? "text" : "password"}
              value={state.cfTunnelToken}
              onChange={(e) => onChange({ ...state, cfTunnelToken: e.target.value.trim() })}
              placeholder="eyJhIjoiMzcyMWZi..."
              autoComplete="off"
              spellCheck={false}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
            />
            <button
              type="button"
              onClick={() => setTokenVisible((v) => !v)}
              className="rounded-lg border border-zinc-200 px-3 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {tokenVisible ? "Hide" : "Show"}
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">
              {tokenLen === 0
                ? "Long base64 string starting with eyJ…"
                : tokenLooksValid
                  ? <span className="text-emerald-600 dark:text-emerald-400">✓ Looks like a valid tunnel token ({tokenLen} chars)</span>
                  : <span className="text-amber-600 dark:text-amber-400">⚠ This doesn't look like a tunnel token yet ({tokenLen} chars — expected ~200+)</span>}
            </span>
          </div>
        </label>
      </section>

      {/* ─── 3. After install: add routes ───────────────────────── */}
      <section className="space-y-3">
        <header className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900">3</span>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">After install: add Published application routes</h3>
        </header>

        <p className="text-xs text-zinc-500">
          Once <code className="font-mono">install.sh</code> finishes and the connector is healthy, go back to your tunnel in Cloudflare and add <strong>two routes</strong> — one for your main URL, one wildcard for app subdomains (n8n, AdGuard, etc.). Both point to the same place: <code className="font-mono">localhost:80</code> on your server (Caddy handles routing internally).
        </p>

        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Back in Zero Trust → Networks → Tunnels → click your tunnel <code className="font-mono">livos-{sub || "<subdomain>"}</code> → tab <strong>Published application routes</strong> → <strong>Add a published application route</strong>.
          </p>
        </div>

        {/* Route 1 — apex */}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Route 1</span>
            <span className="text-xs font-medium text-emerald-900 dark:text-emerald-200">Your main URL — required</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FieldRow label="Subdomain" value={sub} />
            <FieldRow label="Domain" value={base} />
            <FieldRow label="Path" value="(leave empty)" mono={false} />
            <FieldRow label="Service · Type" value="HTTP" />
            <FieldRow label="Service · URL" value="localhost:80" />
            <FieldRow label="Full hostname" value={fullDomain} />
          </div>
          <p className="mt-3 text-[11px] text-emerald-800 dark:text-emerald-300">
            Save this route. DNS CNAME is created automatically by Cloudflare.
          </p>
        </div>

        {/* Route 2 — wildcard */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Route 2</span>
            <span className="text-xs font-medium text-blue-900 dark:text-blue-200">Wildcard for apps (n8n, AdGuard, …) — recommended</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FieldRow label="Subdomain" value={wildcardSub} />
            <FieldRow label="Domain" value={base} />
            <FieldRow label="Path" value="(leave empty)" mono={false} />
            <FieldRow label="Service · Type" value="HTTP" />
            <FieldRow label="Service · URL" value="localhost:80" />
            <FieldRow label="Full hostname" value={wildcardSub && base ? `${wildcardSub}.${base}` : ""} />
          </div>
          <p className="mt-3 text-[11px] text-blue-800 dark:text-blue-300">
            If Cloudflare says <em>“DNS record already exists”</em> for the wildcard, open DNS settings and add the CNAME manually:{" "}
            <code className="font-mono">{wildcardSub || "*.<subdomain>"} → &lt;tunnel-id&gt;.cfargotunnel.com</code> (Proxied).
          </p>
        </div>

        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          You can add routes <em>before</em> running <code className="font-mono">install.sh</code>; the tunnel will start serving once the connector comes online.
        </p>
      </section>

      {/* Security note */}
      <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
        <strong className="text-zinc-700 dark:text-zinc-200">Security:</strong> Your tunnel token is baked into the install command on the next step and stored only on your server at <code className="font-mono">/etc/livos/secrets/cf-tunnel-token</code> (0600). It never lands in Livinity's database.
      </div>
    </div>
  );
}
