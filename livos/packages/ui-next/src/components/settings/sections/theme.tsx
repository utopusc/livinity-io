'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWallpaper, wallpapers } from '@/providers/wallpaper';

export default function ThemeSection() {
  const { wallpaper, setWallpaperId } = useWallpaper();

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-medium text-text">Wallpaper</h4>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {wallpapers.map((wp) => {
          const isActive = wp.id === wallpaper.id;
          return (
            <button
              key={wp.id}
              className={cn(
                'relative aspect-[16/10] overflow-hidden rounded-lg',
                'ring-2 transition-all',
                isActive
                  ? 'ring-brand'
                  : 'ring-transparent hover:ring-neutral-300',
              )}
              onClick={() => setWallpaperId(wp.id)}
            >
              <img
                src={wp.thumbUrl}
                alt={`Wallpaper ${wp.id}`}
                className="h-full w-full object-cover"
              />
              {isActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
