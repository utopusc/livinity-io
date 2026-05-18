'use client';

import Link from 'next/link';
import { useStore } from '../store-provider';
import { CATEGORIES, type AppSummary } from '../types';
import { appVisual } from '../lib/app-visual';
import { Icon } from './icons';

interface FeaturedHeroProps {
  apps: AppSummary[];
}

// Editorial spotlight — one pick, full-width black surface with a warm
// peach gradient accent on the visual side. The lone color moment on
// otherwise monochrome chrome. See Livinity DS featured hero pattern.
export function FeaturedHero({ apps }: FeaturedHeroProps) {
  const { token, instanceName } = useStore();
  if (apps.length === 0) return null;

  const app = apps[0];
  const cat = CATEGORIES[app.category];
  const visual = appVisual(app.id, app.name);

  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (instanceName) params.set('instance', instanceName);
  const qs = params.toString();
  const href = `/store/${app.id}${qs ? `?${qs}` : ''}`;

  return (
    <div className="featured-hero">
      <div className="featured-body">
        <div>
          <div className="featured-eyebrow">Editor's pick · This week</div>
          <h2 className="featured-title">
            {app.name} <em>—</em> {app.tagline.toLowerCase().replace(/\.$/, '')}
          </h2>
          <p className="featured-desc">
            A self-hosted alternative your data never leaves. Set up in under
            three minutes, runs on the LivOS you already own.
          </p>
        </div>
        <div className="featured-foot">
          <div className="featured-actions">
            <Link href={href} className="install primary">
              <Icon name="download" size={14} /> Install on LivOS
            </Link>
            <Link href={href} className="install featured-ghost">
              Learn more <Icon name="arrow-right" size={13} />
            </Link>
          </div>
          <div className="featured-meta">
            <span>{cat?.label ?? app.category}</span>
            <span className="sep">·</span>
            <span>v{app.version}</span>
            <span className="sep">·</span>
            <span>MIT · self-hosted</span>
          </div>
        </div>
      </div>
      <div className="featured-visual">
        <div
          className="featured-icon"
          style={
            app.icon_url
              ? { background: '#fff', padding: 22 }
              : { background: `linear-gradient(135deg, ${visual.c1}, ${visual.c2})`, color: 'white' }
          }
        >
          {app.icon_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={app.icon_url}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          ) : (
            visual.mono
          )}
        </div>
      </div>
    </div>
  );
}
