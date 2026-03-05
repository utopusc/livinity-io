'use client';

import { AlertTriangle, RotateCcw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui';

export default function DesktopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-surface-0/90 backdrop-blur-2xl p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-error/10 border border-error/20">
        <AlertTriangle className="h-8 w-8 text-error" />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-semibold text-text">Desktop Error</h1>
        <p className="mt-1 text-sm text-text-tertiary max-w-md">
          {error.message || 'The desktop encountered an error. Try reloading.'}
        </p>
      </div>
      <div className="flex gap-3">
        <Button onClick={reset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reload Desktop
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            localStorage.removeItem('jwt');
            window.location.href = '/login';
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}
