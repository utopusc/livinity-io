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

// Build tRPC URL from current window location
function getTrpcUrl() {
  if (typeof window === 'undefined') return '/trpc';
  const { protocol, hostname, port } = window.location;
  const portPart = port ? `:${port}` : '';
  return `${protocol}//${hostname}${portPart}/trpc`;
}

// Single HTTP batch link with auth header
const link = httpBatchLink<AppRouter>({
  url: getTrpcUrl,
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
