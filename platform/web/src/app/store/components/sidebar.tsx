'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '../store-provider';
import { CATEGORIES } from '../types';
import { cn } from '@/lib/utils';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { selectedCategory, setSelectedCategory, token, instanceName } = useStore();
  const pathname = usePathname();
  const isProfileActive = pathname === '/store/profile';

  const profileParams = new URLSearchParams();
  if (token) profileParams.set('token', token);
  if (instanceName) profileParams.set('instance', instanceName);
  const profileQs = profileParams.toString();
  const profileHref = `/store/profile${profileQs ? `?${profileQs}` : ''}`;

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 h-full w-60 border-r border-[#e5e5e7] bg-white/80 backdrop-blur-xl transition-transform md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col px-4 py-6">
          {/* Branding */}
          <div className="mb-8 flex items-center gap-2 px-2">
            <div className="h-2.5 w-2.5 rounded-full bg-teal-500" />
            <span className="text-lg font-semibold text-[#1d1d1f]">Store</span>
          </div>

          {/* Discover */}
          <button
            onClick={() => {
              setSelectedCategory(null);
              onClose();
            }}
            className={cn(
              'mb-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
              selectedCategory === null
                ? 'bg-teal-50 text-teal-600'
                : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
            )}
          >
            Discover
          </button>

          {/* Categories section header */}
          <p className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-[#86868b]">
            Categories
          </p>

          {/* Category list */}
          <nav className="flex flex-col gap-0.5">
            {Object.entries(CATEGORIES).map(([key, { label, icon }]) => (
              <button
                key={key}
                onClick={() => {
                  setSelectedCategory(key);
                  onClose();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  selectedCategory === key
                    ? 'bg-teal-50 font-medium text-teal-600'
                    : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
                )}
              >
                <span className="text-base">{icon}</span>
                {label}
              </button>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* My Apps */}
          <div className="border-t border-[#e5e5e7] pt-4">
            <Link
              href={profileHref}
              onClick={onClose}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                isProfileActive
                  ? 'bg-teal-50 font-medium text-teal-600'
                  : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
              )}
            >
              My Apps
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
