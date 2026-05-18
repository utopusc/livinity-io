// Deterministic visual derivation for app cards: monogram + gradient pair.
// The Livinity DS Store design uses per-app gradient tiles + 1-2 letter
// monograms (see store.css `.card-icon`). Today's `apps` rows don't carry
// brand colors — we synthesize them here from app.id (slug) so the visual
// stays consistent across reloads without a schema migration.
//
// When v37 P150-P153 ship and seed rows include real brand metadata in
// `manifest.brand`, this helper can prefer manifest values and fall back
// to the derived palette.

export type GradientPair = { c1: string; c2: string };

// Hand-picked palette aligned with the Livinity Design System color
// language. Cool/warm balanced; nothing over-saturated. Order matters
// — id hash maps onto this list, so reshuffling changes assignments.
const PALETTE: readonly GradientPair[] = [
  { c1: '#ea4b71', c2: '#ff6b8e' }, // rose
  { c1: '#aa5cc3', c2: '#7841ad' }, // violet
  { c1: '#3680b8', c2: '#1f5c8a' }, // ocean
  { c1: '#67b279', c2: '#3b8a4c' }, // sage
  { c1: '#175ddc', c2: '#0b3b8c' }, // royal
  { c1: '#88171a', c2: '#5e1012' }, // wine
  { c1: '#0082c9', c2: '#005a8c' }, // azure
  { c1: '#f46800', c2: '#c44400' }, // amber
  { c1: '#5cdd8b', c2: '#2ea25b' }, // mint
  { c1: '#0d9488', c2: '#0c6e6a' }, // teal
  { c1: '#007acc', c2: '#0056a4' }, // sky
  { c1: '#fbbf24', c2: '#d97706' }, // gold
  { c1: '#609926', c2: '#3f6b13' }, // moss
  { c1: '#13bef9', c2: '#0a7ba8' }, // cyan
  { c1: '#6366f1', c2: '#4338ca' }, // indigo
  { c1: '#4250af', c2: '#293580' }, // periwinkle
  { c1: '#06b6d4', c2: '#0e7490' }, // sea
  { c1: '#1f6feb', c2: '#0d4ec0' }, // cobalt
  { c1: '#2ad4be', c2: '#0fa094' }, // jade
  { c1: '#1f3b73', c2: '#102352' }, // navy
  { c1: '#62a7f2', c2: '#3a7fc7' }, // forget-me-not
  { c1: '#10b981', c2: '#047857' }, // emerald
  { c1: '#3b82f6', c2: '#1d4ed8' }, // blue
] as const;

// Small list of operator-curated overrides — apps where the brand identity
// is so strong that a synthesized palette would feel off. These match the
// Claude Design store-data.jsx fixtures exactly.
const OVERRIDES: Record<string, GradientPair & { mono?: string }> = {
  n8n: { c1: '#ea4b71', c2: '#ff6b8e', mono: 'n8' },
  jellyfin: { c1: '#aa5cc3', c2: '#7841ad', mono: 'J' },
  nextcloud: { c1: '#0082c9', c2: '#005a8c', mono: 'N' },
  adguard: { c1: '#67b279', c2: '#3b8a4c', mono: 'A' },
  grafana: { c1: '#f46800', c2: '#c44400', mono: 'G' },
  'code-server': { c1: '#007acc', c2: '#0056a4', mono: '<>' },
  bolt: { c1: '#fbbf24', c2: '#d97706', mono: 'B' },
  'open-webui': { c1: '#1f6feb', c2: '#0d4ec0', mono: 'O' },
  ollama: { c1: '#000000', c2: '#1d1d1f', mono: 'ㅁ' },
  immich: { c1: '#4250af', c2: '#293580', mono: 'I' },
  portainer: { c1: '#13bef9', c2: '#0a7ba8', mono: 'P' },
  suna: { c1: '#2ad4be', c2: '#0fa094', mono: 'S' },
};

// Fowler–Noll–Vo 1a hash — small, fast, deterministic. We only need a
// stable index into PALETTE so collisions across the 27-item catalog are
// fine; the palette is large enough that visually-similar apps stay rare.
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function appGradient(id: string): GradientPair {
  const override = OVERRIDES[id];
  if (override) return { c1: override.c1, c2: override.c2 };
  return PALETTE[fnv1a(id) % PALETTE.length];
}

// Monogram derivation: prefer override, else 1-letter (uppercase first
// alpha char of the slug). Two-letter names ("n8", "<>") only come from
// overrides — for the synthesized path we keep it consistent at 1 char.
export function appMonogram(id: string, name: string): string {
  const override = OVERRIDES[id];
  if (override?.mono) return override.mono;
  const firstAlpha = (name || id).match(/[A-Za-z0-9]/);
  return (firstAlpha ? firstAlpha[0] : '?').toUpperCase();
}

export function appVisual(id: string, name: string): GradientPair & { mono: string } {
  const { c1, c2 } = appGradient(id);
  return { c1, c2, mono: appMonogram(id, name) };
}
