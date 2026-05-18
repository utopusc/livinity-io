// Single inline-SVG icon bank used across the store surface. Stroke-based,
// 24-viewBox, currentColor — matches the DS line-icon language.

import type { SVGProps } from 'react';

export type IconName =
  | 'search'
  | 'arrow-right'
  | 'arrow-left'
  | 'check'
  | 'download'
  | 'open'
  | 'trash'
  | 'external'
  | 'shield'
  | 'spark'
  | 'alert'
  | 'globe'
  | 'tower'
  | 'monitor'
  | 'puzzle'
  | 'cube'
  | 'chat'
  | 'filter'
  | 'refresh'
  | 'chevron-r'
  | 'chevron-d'
  | 'x'
  | 'star'
  | 'lock'
  | 'sparkle';

type IconProps = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export function Icon({ name, size = 16, ...rest }: IconProps) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...rest,
  };
  switch (name) {
    case 'search':
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
      );
    case 'arrow-right':
      return <svg {...p}><path d="M5 12h14M13 5l7 7-7 7" /></svg>;
    case 'arrow-left':
      return <svg {...p}><path d="M19 12H5M11 19l-7-7 7-7" /></svg>;
    case 'check':
      return <svg {...p}><path d="M4 12l5 5 11-11" /></svg>;
    case 'download':
      return <svg {...p}><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></svg>;
    case 'open':
    case 'external':
      return <svg {...p}><path d="M14 4h6v6M10 14L20 4M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" /></svg>;
    case 'trash':
      return <svg {...p}><path d="M4 7h16M10 7V4h4v3M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7" /></svg>;
    case 'shield':
      return (
        <svg {...p}>
          <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case 'spark':
      return <svg {...p}><path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M5.6 18.4l4.2-4.2M14.2 9.8l4.2-4.2" /></svg>;
    case 'alert':
      return <svg {...p}><path d="M12 9v4M12 17h.01M10.3 4l-8 13.4A2 2 0 0 0 4 20h16a2 2 0 0 0 1.7-2.6L13.7 4a2 2 0 0 0-3.4 0z" /></svg>;
    case 'globe':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case 'tower':
      return (
        <svg {...p}>
          <rect x="6" y="3" width="12" height="18" rx="2" />
          <path d="M9 7h6M9 11h6M9 15h2" />
        </svg>
      );
    case 'monitor':
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M9 21h6M12 17v4" />
        </svg>
      );
    case 'puzzle':
      return <svg {...p}><path d="M14 4a2 2 0 1 0-4 0v2H6a2 2 0 0 0-2 2v4h2a2 2 0 1 1 0 4H4v4a2 2 0 0 0 2 2h4v-2a2 2 0 1 1 4 0v2h4a2 2 0 0 0 2-2v-4h-2a2 2 0 1 1 0-4h2V8a2 2 0 0 0-2-2h-4z" /></svg>;
    case 'cube':
      return (
        <svg {...p}>
          <path d="M21 8l-9-5-9 5 9 5 9-5z" />
          <path d="M3 8v8l9 5 9-5V8" />
          <path d="M12 13v8" />
        </svg>
      );
    case 'chat':
      return <svg {...p}><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5z" /></svg>;
    case 'filter':
      return <svg {...p}><path d="M3 5h18M6 12h12M10 19h4" /></svg>;
    case 'refresh':
      return (
        <svg {...p}>
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
      );
    case 'chevron-r':
      return <svg {...p}><path d="M9 6l6 6-6 6" /></svg>;
    case 'chevron-d':
      return <svg {...p}><path d="M6 9l6 6 6-6" /></svg>;
    case 'x':
      return <svg {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case 'star':
      return <svg {...p}><path d="M12 2l3.1 6.3 7 1-5 4.9 1.2 7L12 17.8 5.7 21.2l1.2-7-5-4.9 7-1z" /></svg>;
    case 'lock':
      return (
        <svg {...p}>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      );
    case 'sparkle':
      return <svg {...p}><path d="M12 3l1.8 4.8a4 4 0 0 0 2.4 2.4L21 12l-4.8 1.8a4 4 0 0 0-2.4 2.4L12 21l-1.8-4.8a4 4 0 0 0-2.4-2.4L3 12l4.8-1.8a4 4 0 0 0 2.4-2.4L12 3z" /></svg>;
    default:
      return null;
  }
}
