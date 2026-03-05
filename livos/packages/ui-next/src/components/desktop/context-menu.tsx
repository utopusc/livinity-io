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
              'fixed z-[var(--z-popover)] min-w-[172px] overflow-hidden rounded-lg py-1',
              'bg-white',
              'border border-black/[0.06]',
              'shadow-[0_8px_32px_oklch(0_0_0/0.12),0_2px_8px_oklch(0_0_0/0.06),0_0_0_0.5px_oklch(0_0_0/0.05)]',
            )}
            style={{
              left: Math.min(position.x, window.innerWidth - 200),
              top: Math.min(position.y, window.innerHeight - 120),
            }}
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            data-no-context-menu
          >
            {menuItems.map((item) => (
              <div key={item.label}>
                <button
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-1.5 text-left',
                    'text-[13px] transition-colors duration-100',
                    item.destructive
                      ? 'text-red-500 hover:bg-red-50'
                      : 'text-neutral-700 hover:bg-neutral-50',
                  )}
                  onClick={item.onClick}
                >
                  {item.icon && (
                    <item.icon
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        item.destructive ? 'text-red-400' : 'text-neutral-400',
                      )}
                    />
                  )}
                  {item.label}
                </button>
                {item.dividerAfter && (
                  <div className="my-1 border-t border-black/[0.05]" />
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
