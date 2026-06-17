import { slugifyHeading } from './slugify';

export type TocItem = { level: 2 | 3; text: string; id: string };

// Extract h2/h3 headings from markdown for the "On this page" rail. Skips
// fenced code blocks so a `# comment` inside ```bash isn't treated as a heading.
export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  let inFence = false;
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.+)$/.exec(line);
    if (m) {
      const level = m[1].length as 2 | 3;
      const text = m[2].replace(/[#*`_~]/g, '').trim();
      if (text) items.push({ level, text, id: slugifyHeading(text) });
    }
  }
  return items;
}
