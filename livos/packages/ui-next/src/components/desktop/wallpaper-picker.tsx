'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Check } from 'lucide-react';
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
            className="fixed inset-0 z-[var(--z-overlay)] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            className={cn(
              'fixed left-1/2 top-1/2 z-[var(--z-modal)] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2',
              'rounded-2xl overflow-hidden',
              'bg-surface-1/95 backdrop-blur-2xl',
              'border border-white/10',
              'shadow-xl shadow-black/40',
            )}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <h2 className="text-sm font-semibold text-text">Choose Wallpaper</h2>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-white/10 hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-4 gap-2 p-4 sm:grid-cols-5 md:grid-cols-7">
              {wallpapers.map((wp) => {
                const isActive = wp.id === wallpaper.id;
                return (
                  <button
                    key={wp.id}
                    className={cn(
                      'relative aspect-[16/10] overflow-hidden rounded-lg',
                      'ring-2 transition-all',
                      isActive
                        ? 'ring-brand shadow-glow'
                        : 'ring-transparent hover:ring-white/20',
                    )}
                    onClick={() => setWallpaperId(wp.id)}
                  >
                    <img
                      src={wp.thumbUrl}
                      alt={`Wallpaper ${wp.id}`}
                      className="h-full w-full object-cover"
                    />
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center bg-black/30"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <Check className="h-4 w-4 text-white" />
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
