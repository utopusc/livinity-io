'use client';

import { Toaster as SonnerToaster } from 'sonner';

function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        className:
          'bg-surface-1 border-border text-text rounded-xl shadow-lg',
        descriptionClassName: 'text-text-secondary',
      }}
      gap={8}
    />
  );
}

export { Toaster };
export { toast } from 'sonner';
