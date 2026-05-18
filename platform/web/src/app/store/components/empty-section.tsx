'use client';

import type { Section } from '../types';

const COPY: Record<Exclude<Section, 'app'>, { title: string; body: string; phase: string }> = {
  webapp: {
    title: 'Web Apps',
    body: 'Browse curated SaaS as desktop windows — Notion, Linear, Slack, Discord and more. Plus a Custom URL form to add any web app to your dock.',
    phase: 'Coming in Phase 151',
  },
  native: {
    title: 'Native Linux Apps',
    body: 'Install desktop apps directly from apt or AppImage — VSCode, GIMP, Blender, Krita, Inkscape and more. Apps appear on your dock and stream into LivOS windows.',
    phase: 'Coming in Phase 150',
  },
  ai: {
    title: 'AI Tools',
    body: 'MCP Market (10 servers including filesystem, github, postgres, slack, brave-search), Agent Templates and GSD planning skills — all one-click installable.',
    phase: 'Coming in Phase 152',
  },
  plugin: {
    title: 'Plugins',
    body: 'Operator-signed plugins extending LivOS backend (routes) and UI (dock widgets, slash commands, MCP servers). Hot-reloadable — no server restart on install.',
    phase: 'Coming in Phase 153',
  },
};

export function EmptySection({ section }: { section: Exclude<Section, 'app'> }) {
  const copy = COPY[section];
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#f5f5f7] px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-[#86868b]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#1d1d1f]" />
        {copy.phase}
      </div>
      <h2 className="mb-3 text-2xl font-bold text-[#1d1d1f]">{copy.title}</h2>
      <p className="text-[15px] leading-relaxed text-[#86868b]">{copy.body}</p>
    </div>
  );
}
