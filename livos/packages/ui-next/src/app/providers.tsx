'use client';

import { type ReactNode } from 'react';
import { TrpcProvider } from '@/trpc/provider';
import { AuthProvider } from '@/providers/auth';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TrpcProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </TrpcProvider>
  );
}
