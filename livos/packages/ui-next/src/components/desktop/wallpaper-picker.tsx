'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWallpaper, wallpapers } from '@/providers/wallpaper';

/* ------------------------------------------------------------------ */
/*  Wallpaper Picker Dialog                                            */
/* ------------------------------------------------------------------ */

export function WallpaperPicker({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { wallpaper, setWallpaperId } = useWallpaper();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[var(--z-overlay)] bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            className={cn(
              'fixed left-1/2 top-1/2 z-[var(--z-modal)] w-full max-w-xl -translate-x-1/2 -translate-y-1/2',
              'overflow-hidden rounded-xl',
              'bg-white',
              'border border-black/[0.06]',
              'shadow-[0_24px_64px_oklch(0_0_0/0.16),0_4px_16px_oklch(0_0_0/0.08),0_0_0_0.5px_oklch(0_0_0/0.06)]',
            )}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            data-no-context-menu
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/[0.05] px-5 py-4">
              <div>
                <h2 className="text-[13px] font-semibold text-neutral-900">
                  Choose Wallpaper
                </h2>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  {wallpapers.length} wallpapers available
                </p>
              </div>
              <button
                onClick={onClose}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-lg',
                  'text-neutral-400 transition-colors duration-100',
                  'hover:bg-neutral-100 hover:text-neutral-600',
                )}
                aria-label="Close wallpaper picker"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-4 gap-2.5 p-4 sm:grid-cols-5">
              {wallpapers.map((wp) => {
                const isActive = wp.id === wallpaper.id;
                return (
                  <button
                    key={wp.id}
                    className={cn(
                      'group relative aspect-[16/10] overflow-hidden rounded-lg',
                      'transition-all duration-150',
                      isActive
                        ? 'ring-2 ring-brand ring-offset-1 ring-offset-white shadow-[0_0_16px_oklch(0.588_0.158_241.97/0.20)]'
                        : 'ring-1 ring-black/[0.06] hover:ring-black/[0.14]',
                    )}
                    onClick={() => setWallpaperId(wp.id)}
                    aria-label={`Select wallpaper ${wp.id}`}
                    aria-pressed={isActive}
                  >
                    <img
                      src={wp.thumbUrl}
                      alt={`Wallpaper ${wp.id}`}
                      className={cn(
                        'h-full w-full object-cover',
                        'transition-transform duration-300',
                        'group-hover:scale-105',
                      )}
                    />

                    {/* Active overlay — subtle darkening with brand dot */}
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 flex items-end justify-end bg-brand/10 p-1.5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.15 }}
                      >
                        <div className="flex h-4 w-4 items-center justify-center rounded-full bg-brand shadow-sm">
                          <svg
                            viewBox="0 0 12 12"
                            className="h-2.5 w-2.5 text-white"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="2 6 5 9 10 3" />
                          </svg>
                        </div>
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="border-t border-black/[0.05] px-5 py-3">
              <p className="text-[11px] text-neutral-400">
                Changes apply immediately across your desktop
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
