'use client';

import { motion } from 'framer-motion';
import { Monitor } from 'lucide-react';
import { useAuth } from '@/providers/auth';
import { trpcReact } from '@/trpc/client';
import { Button } from '@/components/ui';

export default function DesktopPage() {
  const { logout } = useAuth();
  const { data: version } = trpcReact.system.version.useQuery();
  const { data: user } = trpcReact.user.get.useQuery();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg p-4">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand/10">
          <Monitor className="h-10 w-10 text-brand" />
        </div>

        <h1 className="text-display-sm font-bold text-text">
          {user?.name ? `Hello, ${user.name}` : 'LivOS Desktop'}
        </h1>
        <p className="mt-2 text-body text-text-secondary">
          {version ? `${version.name} v${version.version}` : 'Loading...'}
        </p>
        <p className="mt-1 text-caption text-text-tertiary">
          Desktop shell coming in Phase 03
        </p>

        <div className="mt-8">
          <Button variant="ghost" onClick={logout}>
            Sign out
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
