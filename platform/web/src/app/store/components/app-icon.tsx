'use client';

// Colorful monogram tile — used when an app has no icon_url, or as a
// background behind a transparent icon. Brand gradient + inner specular
// highlight. iOS-style radius.

import { useState } from 'react';
import { appVisual } from '../lib/app-visual';

type AppIconProps = {
  id: string;
  name: string;
  iconUrl?: string | null;
  size?: number;
  radius?: number;
};

export function AppIcon({ id, name, iconUrl, size = 48, radius }: AppIconProps) {
  const { c1, c2, mono } = appVisual(id, name);
  const r = radius ?? Math.round(size * 0.27);

  // Track whether the icon URL loaded; on error we silently fall back to
  // monogram. Many seeded rows have broken icon_url values (Github raw
  // links that 404) — failing soft beats showing broken-image glyphs.
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = iconUrl && iconUrl.trim().length > 0 && !imgFailed;

  if (showImage) {
    // White rounded tile holding the real icon. White background gives
    // transparent/dark logos a consistent surface; padding matches the
    // monogram tile's optical weight.
    return (
      <span
        className="card-icon"
        style={{
          width: size,
          height: size,
          borderRadius: r,
          background: '#fff',
          padding: Math.round(size * 0.12),
          boxSizing: 'border-box',
        }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconUrl as string}
          alt=""
          onError={() => setImgFailed(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </span>
    );
  }

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
