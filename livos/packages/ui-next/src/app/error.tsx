'use client';

import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-bg p-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-error/10 border border-error/20">
        <AlertTriangle className="h-8 w-8 text-error" />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-semibold text-text">Something went wrong</h1>
        <p className="mt-1 text-sm text-text-tertiary max-w-md">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={reset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
        <Button variant="ghost" onClick={() => window.location.href = '/'}>
          <Home className="mr-2 h-4 w-4" />
          Go Home
        </Button>
      </div>
    </div>
  );
}
