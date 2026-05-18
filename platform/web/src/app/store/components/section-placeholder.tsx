'use client';

import type { Section } from '../types';
import { Icon, type IconName } from './icons';

const PLACEHOLDER_GLYPHS: Record<Exclude<Section, 'app'>, IconName> = {
  webapp: 'globe',
  native: 'monitor',
  ai: 'sparkle',
  plugin: 'puzzle',
};

const PLACEHOLDER_PHASES: Record<Exclude<Section, 'app'>, number> = {
  webapp: 151,
  native: 150,
  ai: 152,
  plugin: 153,
};

const PLACEHOLDER_TITLES: Record<
  Exclude<Section, 'app'>,
  { lead: string; em: string; line: string }
> = {
  webapp: {
    lead: 'Web apps,',
    em: 'as windows',
    line: 'Run Notion, Linear, Slack and the rest as proper desktop windows on your LivOS.',
  },
  native: {
    lead: 'Native Linux apps,',
    em: 'one click',
    line: "Install VS Code, Blender, GIMP, OBS and more straight into your home server's desktop.",
  },
  ai: {
    lead: 'AI tooling for',
    em: 'your Liv',
    line: 'MCP servers, agent templates and planning skills your local assistant can speak to.',
  },
  plugin: {
    lead: 'Operator',
    em: 'extensions',
    line: 'Signed plugins that extend LivOS with new backend routes and UI — starting with Livinity Broker.',
  },
};

const PLACEHOLDER_SAMPLES: Record<Exclude<Section, 'app'>, string[]> = {
  webapp: ['Notion', 'Linear', 'Slack', 'Discord', 'GitHub', 'Figma', 'Vercel', 'Cloudflare', 'ChatGPT', 'Claude'],
  native: [
    'Visual Studio Code',
    'Cursor',
    'IntelliJ',
    'GIMP',
    'Krita',
    'Inkscape',
    'Blender',
    'Audacity',
    'OBS Studio',
    'LibreOffice',
  ],
  ai: [
    'filesystem MCP',
    'github MCP',
    'postgres MCP',
    'brave-search MCP',
    'puppeteer MCP',
    'slack MCP',
    'gdrive MCP',
    'memory MCP',
    'livinity-files',
    'Code reviewer agent',
    'Bug triager agent',
    'GSD',
  ],
  plugin: ['Livinity Broker'],
};

export function SectionPlaceholder({ section }: { section: Exclude<Section, 'app'> }) {
  const title = PLACEHOLDER_TITLES[section];
  const phase = PLACEHOLDER_PHASES[section];
  const samples = PLACEHOLDER_SAMPLES[section];
  const glyph = PLACEHOLDER_GLYPHS[section];

  return (
    <div className="placeholder">
      <div className="badge">
        <span className="dot" />
        Coming in Phase {phase}
      </div>
      <div className="placeholder-glyph">
        <Icon name={glyph} size={36} />
      </div>
      <h2 className="placeholder-title">
        {title.lead} <em>{title.em}</em>
      </h2>
      <p className="placeholder-desc">{title.line}</p>
      <div className="placeholder-list">
        {samples.map((s) => (
          <span key={s} className="placeholder-chip">
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
