'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 w-8 text-caption',
  md: 'h-10 w-10 text-body',
  lg: 'h-14 w-14 text-heading-sm',
};

function Avatar({ src, alt, fallback, size = 'md', className }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initials = fallback?.slice(0, 2).toUpperCase() ?? '?';

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-full bg-neutral-100 border border-border',
        'flex items-center justify-center font-semibold text-text-secondary',
        sizeClasses[size],
        className,
      )}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={alt ?? ''}
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

export { Avatar, type AvatarProps };
