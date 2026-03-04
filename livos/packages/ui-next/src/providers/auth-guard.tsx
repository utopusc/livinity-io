'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth';
import { getJwt } from '@/trpc/client';

/**
 * Redirects to /login if not logged in.
 */
export function EnsureLoggedIn({ children }: { children: ReactNode }) {
  const { isLoggedIn, isLoading, userExists, userExistsLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || userExistsLoading) return;
    if (!userExists) {
      router.replace('/onboarding');
      return;
    }
    if (!isLoggedIn && !getJwt()) {
      router.replace('/login');
    }
  }, [isLoggedIn, isLoading, userExists, userExistsLoading, router]);

  if (isLoading || userExistsLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!isLoggedIn && !getJwt()) return null;

  return <>{children}</>;
}

/**
 * Redirects to / if already logged in.
 */
export function EnsureLoggedOut({ children }: { children: ReactNode }) {
  const { isLoggedIn, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      router.replace('/');
    }
  }, [isLoggedIn, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (isLoggedIn) return null;

  return <>{children}</>;
}

/**
 * Redirects to /login if user already exists (for onboarding).
 */
export function EnsureNoUser({ children }: { children: ReactNode }) {
  const { userExists, userExistsLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!userExistsLoading && userExists) {
      router.replace('/login');
    }
  }, [userExists, userExistsLoading, router]);

  if (userExistsLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    );
  }

  if (userExists) return null;

  return <>{children}</>;
}
