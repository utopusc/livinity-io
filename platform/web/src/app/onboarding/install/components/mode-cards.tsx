"use client";

export type WizardMode = "local-lan" | "hybrid" | "tunnel" | "cloud";

interface ModeOption {
  id: WizardMode;
  title: string;
  badge?: string;
  tagline: string;
  pros: string[];
  comingSoon?: boolean;
}

const MODES: ModeOption[] = [
  {
    id: "local-lan",
    title: "Local (LAN)",
    tagline: "Run on your home network. Accessible via <hostname>.local.",
    pros: ["No domain required", "Zero external dependencies", "Fastest setup"],
  },
  {
    id: "hybrid",
    title: "Hybrid",
    badge: "Recommended",
    tagline: "Your own domain via Cloudflare DNS-01 + Let's Encrypt.",
    pros: ["Public HTTPS URL", "You own the domain", "Direct internet — no relay middleman"],
  },
  {
    id: "tunnel",
    title: "Own-Cloud (CF Tunnel)",
    tagline: "Cloudflare Tunnel — works behind CGNAT or strict firewalls.",
    pros: ["Bypasses NAT/firewall", "No port forwarding"],
    comingSoon: true,
  },
  {
    id: "cloud",
    title: "Cloud",
    tagline: "Fully managed on Livinity infrastructure.",
    pros: ["Zero self-hosting", "Auto-updates"],
    comingSoon: true,
  },
];

function scrollToDoc(id: WizardMode) {
  const el = document.getElementById(`mode-doc-${id}`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

export default function ModeCards({
  value,
  onChange,
}: {
  value: WizardMode;
  onChange: (m: WizardMode) => void;
}) {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Choose your install mode</h2>
      <p className="mb-6 text-sm text-zinc-500">You can change this later by reinstalling. <a href="#mode-docs-section" className="text-blue-600 hover:underline">See full reference below</a>.</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {MODES.map((m) => {
          const isSelected = value === m.id;
          const disabled = !!m.comingSoon;
          return (
            <div
              key={m.id}
              className={`relative rounded-xl border-2 p-5 text-left transition ${
                isSelected
                  ? "border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-800"
                  : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
              } ${disabled ? "opacity-50" : ""}`}
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(m.id)}
                className={`block w-full text-left ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{m.title}</h3>
                  {m.badge && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
                      {m.badge}
                    </span>
                  )}
                  {m.comingSoon && (
                    <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                      Coming Soon
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-zinc-500">{m.tagline}</p>
                <ul className="mt-3 space-y-1">
                  {m.pros.map((p, i) => (
                    <li key={i} className="text-xs text-zinc-600 dark:text-zinc-400">
                      {"✓ "}{p}
                    </li>
                  ))}
                </ul>
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); scrollToDoc(m.id); }}
                className="mt-3 text-xs text-blue-600 hover:underline"
              >
                Learn more about {m.title} →
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
