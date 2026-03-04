'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type MenuPosition = { x: number; y: number } | null;

type MenuItem = {
  label: string;
  icon?: React.ElementType;
  onClick: () => void;
  destructive?: boolean;
  dividerAfter?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Context Menu                                                       */
/* ------------------------------------------------------------------ */

export function DesktopContextMenu({
  children,
  onChangeWallpaper,
}: {
  children: ReactNode;
  onChangeWallpaper?: () => void;
}) {
  const [position, setPosition] = useState<MenuPosition>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { logout } = useAuth();

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Only show on the desktop background, not on windows/dock
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-context-menu]')) return;
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback(() => setPosition(null), []);

  // Close on click outside or escape
  useEffect(() => {
    if (!position) return;
    const handleClick = () => close();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [position, close]);

  const menuItems: MenuItem[] = [
    {
      label: 'Change Wallpaper',
      icon: Image,
      onClick: () => {
        close();
        onChangeWallpaper?.();
      },
      dividerAfter: true,
    },
    {
      label: 'Sign Out',
      icon: LogOut,
      onClick: () => {
        close();
        logout();
      },
      destructive: true,
    },
  ];

  return (
    <div onContextMenu={handleContextMenu} className="contents">
      {children}

      <AnimatePresence>
        {position && (
          <motion.div
            ref={menuRef}
            className={cn(
              'fixed z-[var(--z-popover)] min-w-[180px] rounded-xl py-1',
              'bg-surface-2/95 backdrop-blur-xl',
              'border border-white/10',
              'shadow-xl shadow-black/30',
            )}
            style={{
              left: Math.min(position.x, window.innerWidth - 200),
              top: Math.min(position.y, window.innerHeight - 120),
            }}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
          >
            {menuItems.map((item, i) => (
              <div key={item.label}>
                <button
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                    'transition-colors',
                    item.destructive
                      ? 'text-error hover:bg-error/10'
                      : 'text-text-secondary hover:bg-white/8 hover:text-text',
                  )}
                  onClick={item.onClick}
                >
                  {item.icon && <item.icon className="h-4 w-4" />}
                  {item.label}
                </button>
                {item.dividerAfter && (
                  <div className="my-1 border-t border-white/5" />
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
