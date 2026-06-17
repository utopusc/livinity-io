// Shared heading slugifier — used by both the markdown renderer (to set
// heading `id`s) and the TOC extractor (to build matching anchor links). They
// MUST use the same function or "On this page" links won't scroll correctly.
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
