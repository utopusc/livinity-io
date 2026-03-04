'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { trpcReact } from '@/trpc/client';

/* ------------------------------------------------------------------ */
/*  Wallpaper data                                                     */
/* ------------------------------------------------------------------ */

export type WallpaperId = string;

export type Wallpaper = {
  id: WallpaperId;
  url: string;
  thumbUrl: string;
  brandColorHsl: string;
};

export const wallpapers: Wallpaper[] = [
  { id: '1', url: '/wallpapers/1.jpg', thumbUrl: '/wallpapers/generated-thumbs/1.jpg', brandColorHsl: '240 60% 55%' },
  { id: '2', url: '/wallpapers/2.jpg', thumbUrl: '/wallpapers/generated-thumbs/2.jpg', brandColorHsl: '200 70% 50%' },
  { id: '3', url: '/wallpapers/3.jpg', thumbUrl: '/wallpapers/generated-thumbs/3.jpg', brandColorHsl: '280 50% 55%' },
  { id: '4', url: '/wallpapers/4.jpg', thumbUrl: '/wallpapers/generated-thumbs/4.jpg', brandColorHsl: '160 60% 45%' },
  { id: '5', url: '/wallpapers/5.jpg', thumbUrl: '/wallpapers/generated-thumbs/5.jpg', brandColorHsl: '350 65% 55%' },
  { id: '6', url: '/wallpapers/6.jpg', thumbUrl: '/wallpapers/generated-thumbs/6.jpg', brandColorHsl: '210 55% 50%' },
  { id: '7', url: '/wallpapers/7.jpg', thumbUrl: '/wallpapers/generated-thumbs/7.jpg', brandColorHsl: '30 70% 55%' },
  { id: '8', url: '/wallpapers/8.jpg', thumbUrl: '/wallpapers/generated-thumbs/8.jpg', brandColorHsl: '190 65% 45%' },
  { id: '9', url: '/wallpapers/9.jpg', thumbUrl: '/wallpapers/generated-thumbs/9.jpg', brandColorHsl: '270 55% 50%' },
  { id: '10', url: '/wallpapers/10.jpg', thumbUrl: '/wallpapers/generated-thumbs/10.jpg', brandColorHsl: '220 60% 55%' },
  { id: '11', url: '/wallpapers/11.jpg', thumbUrl: '/wallpapers/generated-thumbs/11.jpg', brandColorHsl: '170 55% 50%' },
  { id: '12', url: '/wallpapers/12.jpg', thumbUrl: '/wallpapers/generated-thumbs/12.jpg', brandColorHsl: '340 60% 50%' },
  { id: '13', url: '/wallpapers/13.jpg', thumbUrl: '/wallpapers/generated-thumbs/13.jpg', brandColorHsl: '250 55% 55%' },
  { id: '14', url: '/wallpapers/14.jpg', thumbUrl: '/wallpapers/generated-thumbs/14.jpg', brandColorHsl: '180 50% 45%' },
  { id: '15', url: '/wallpapers/15.jpg', thumbUrl: '/wallpapers/generated-thumbs/15.jpg', brandColorHsl: '300 50% 50%' },
  { id: '16', url: '/wallpapers/16.jpg', thumbUrl: '/wallpapers/generated-thumbs/16.jpg', brandColorHsl: '15 65% 55%' },
  { id: '17', url: '/wallpapers/17.jpg', thumbUrl: '/wallpapers/generated-thumbs/17.jpg', brandColorHsl: '230 60% 50%' },
  { id: '18', url: '/wallpapers/18.jpg', thumbUrl: '/wallpapers/generated-thumbs/18.jpg', brandColorHsl: '150 55% 45%' },
  { id: '19', url: '/wallpapers/19.jpg', thumbUrl: '/wallpapers/generated-thumbs/19.jpg', brandColorHsl: '260 50% 55%' },
  { id: '20', url: '/wallpapers/20.jpg', thumbUrl: '/wallpapers/generated-thumbs/20.jpg', brandColorHsl: '195 60% 50%' },
  { id: '21', url: '/wallpapers/21.jpg', thumbUrl: '/wallpapers/generated-thumbs/21.jpg', brandColorHsl: '320 55% 50%' },
];

const wallpaperMap = new Map(wallpapers.map((w) => [w.id, w]));
const defaultWallpaper = wallpapers[0];

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

type WallpaperContextT = {
  wallpaper: Wallpaper;
  isLoading: boolean;
  setWallpaperId: (id: WallpaperId) => void;
  allWallpapers: Wallpaper[];
};

const WallpaperContext = createContext<WallpaperContextT | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function WallpaperProvider({ children }: { children: ReactNode }) {
  const { data: wallpaperId, isLoading } = trpcReact.user.wallpaper.useQuery();
  const utils = trpcReact.useUtils();
  const setMutation = trpcReact.user.set.useMutation({
    onSuccess: () => {
      utils.user.wallpaper.invalidate();
      utils.user.get.invalidate();
    },
  });

  const wallpaper = useMemo(
    () => wallpaperMap.get(wallpaperId ?? '') ?? defaultWallpaper,
    [wallpaperId],
  );

  const setWallpaperId = useCallback(
    (id: WallpaperId) => {
      setMutation.mutate({ wallpaper: id });
    },
    [setMutation],
  );

  // Apply brand color CSS vars
  useEffect(() => {
    const el = document.documentElement;
    el.style.setProperty('--color-brand-dynamic', `hsl(${wallpaper.brandColorHsl})`);
    el.style.setProperty(
      '--color-brand-dynamic-lighter',
      `hsl(${wallpaper.brandColorHsl} / 0.7)`,
    );
    el.style.setProperty(
      '--color-brand-dynamic-lightest',
      `hsl(${wallpaper.brandColorHsl} / 0.15)`,
    );
  }, [wallpaper.brandColorHsl]);

  const ctx = useMemo(
    () => ({ wallpaper, isLoading, setWallpaperId, allWallpapers: wallpapers }),
    [wallpaper, isLoading, setWallpaperId],
  );

  return (
    <WallpaperContext.Provider value={ctx}>{children}</WallpaperContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Background component                                               */
/* ------------------------------------------------------------------ */

export function WallpaperBackground() {
  const { wallpaper } = useWallpaper();
  const [loaded, setLoaded] = useState(false);
  const prevRef = useRef(wallpaper.url);

  useEffect(() => {
    if (wallpaper.url !== prevRef.current) {
      setLoaded(false);
      prevRef.current = wallpaper.url;
    }
    const img = new Image();
    img.onload = () => setLoaded(true);
    img.src = wallpaper.url;
  }, [wallpaper.url]);

  return (
    <div className="fixed inset-0 z-0">
      {/* Blurred thumbnail — always visible */}
      <div
        className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl"
        style={{ backgroundImage: `url(${wallpaper.thumbUrl})` }}
      />

      {/* Full resolution — fades in */}
      <AnimatePresence mode="sync">
        {loaded && (
          <motion.div
            key={wallpaper.id}
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${wallpaper.url})` }}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
      </AnimatePresence>

      {/* Subtle vignette overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useWallpaper() {
  const ctx = useContext(WallpaperContext);
  if (!ctx) throw new Error('useWallpaper must be used within WallpaperProvider');
  return ctx;
}
