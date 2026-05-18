// Colorful monogram tile — same shape language as iOS app icons.
// Brand gradient + inner specular highlight. Synthesized per-app from
// `app-visual.ts` until manifest.brand metadata exists.

import { appVisual } from '../lib/app-visual';

type AppIconProps = {
  id: string;
  name: string;
  size?: number;
  radius?: number;
};

export function AppIcon({ id, name, size = 48, radius }: AppIconProps) {
  const { c1, c2, mono } = appVisual(id, name);
  const r = radius ?? Math.round(size * 0.27);
  return (
    <span
      className="card-icon"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
        fontSize: Math.round(size * 0.4),
      }}
      aria-hidden="true"
    >
      <span className="app-icon">{mono}</span>
    </span>
  );
}
