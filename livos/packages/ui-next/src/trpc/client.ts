'use client';

import { createTRPCReact } from '@trpc/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { type AppRouter } from '../../../livinityd/source/modules/server/trpc/common';

const JWT_KEY = 'jwt';

export const getJwt = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(JWT_KEY);
};

export const setJwt = (token: string) => {
  localStorage.setItem(JWT_KEY, token);
};

export const removeJwt = () => {
  localStorage.removeItem(JWT_KEY);
};

// Single HTTP batch link — same origin, so /trpc is sufficient
const link = httpBatchLink<AppRouter>({
  url: '/trpc',
  headers: () => {
    const token = getJwt();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});

export const links = [link];

// React tRPC client
export const trpcReact = createTRPCReact<AppRouter>();

// Vanilla tRPC client (for non-component usage)
export const trpcClient = createTRPCClient<AppRouter>({ links });

export type { AppRouter };
