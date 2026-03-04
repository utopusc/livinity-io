'use client';

import { createTRPCReact, type TRPCClientErrorLike } from '@trpc/react-query';
import {
  createTRPCClient,
  httpBatchLink,
  splitLink,
  wsLink,
  createWSClient,
  type inferRouterInputs,
  type inferRouterOutputs,
} from '@trpc/client';
import { type AppRouter, httpOnlyPaths } from '../../../livinityd/source/modules/server/trpc/common';

const JWT_KEY = 'jwt';
const JWT_REFRESH_KEY = 'jwt-last-refreshed';

export const getJwt = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(JWT_KEY);
};

export const setJwt = (token: string) => {
  localStorage.setItem(JWT_KEY, token);
};

export const removeJwt = () => {
  localStorage.removeItem(JWT_KEY);
  localStorage.removeItem(JWT_REFRESH_KEY);
};

// Build URLs from current window location
function getUrls() {
  const { protocol, hostname, port } = window.location;
  const portPart = port ? `:${port}` : '';
  const httpOrigin = `${protocol}//${hostname}${portPart}`;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
  return {
    http: `${httpOrigin}/trpc`,
    ws: `${wsProtocol}//${hostname}${portPart}/trpc`,
  };
}

// HTTP link with auth header
const httpLink = httpBatchLink<AppRouter>({
  url: () => getUrls().http,
  headers: () => {
    const token = getJwt();
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
});

// WS client (lazy, only when JWT exists)
let wsClientInstance: ReturnType<typeof createWSClient> | null = null;

function getWsClient() {
  if (wsClientInstance) return wsClientInstance;
  wsClientInstance = createWSClient({
    url: () => {
      const token = getJwt();
      const base = getUrls().ws;
      return token ? `${base}?token=${token}` : base;
    },
    onClose: () => {
      wsClientInstance = null;
    },
  });
  return wsClientInstance;
}

const wsLinkInstance = wsLink<AppRouter>({ client: getWsClient });

// Split: HTTP for auth routes + no-token, WS for everything else
const httpOnlySet = new Set<string>(httpOnlyPaths);

export const links = [
  splitLink({
    condition: (op) => {
      if (op.type === 'subscription') return false;
      if (!getJwt()) return true;
      return httpOnlySet.has(op.path);
    },
    true: httpLink,
    false: wsLinkInstance,
  }),
];

// React tRPC client
export const trpcReact = createTRPCReact<AppRouter>();

// Vanilla tRPC client (for non-component usage)
export const trpcClient = createTRPCClient<AppRouter>({ links });

// Type exports
export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
export type RouterError = TRPCClientErrorLike<AppRouter>;
export type { AppRouter };
