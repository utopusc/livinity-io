'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { StoreToLivOSMessage, LivOSToStoreMessage, AppStatus } from '../types';

const ALLOWED_ORIGINS = [
  'https://livinity.io',
  'https://apps.livinity.io',
];

// In development, also allow localhost origins
function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.some(o => origin === o)) return true;
  // Allow *.livinity.io subdomains
  if (/^https:\/\/[a-z0-9-]+\.livinity\.io$/.test(origin)) return true;
  // Allow localhost/127.0.0.1 in development
  if (process.env.NODE_ENV === 'development' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

export function usePostMessage() {
  const [isEmbedded, setIsEmbedded] = useState(false);
  const [installedApps, setInstalledApps] = useState<Map<string, AppStatus['status']>>(new Map());
  const parentOriginRef = useRef<string | null>(null);

  // Detect iframe on mount
  useEffect(() => {
    try {
      const embedded = window.self !== window.top;
      setIsEmbedded(embedded);
    } catch {
      // Cross-origin iframe access throws -- means we ARE embedded
      setIsEmbedded(true);
    }
  }, []);

  // Send message to parent LivOS window
  const sendMessage = useCallback((message: StoreToLivOSMessage) => {
    if (!isEmbedded) return;
    // Use '*' for targetOrigin since parent origin varies per LivOS instance
    // Security is handled by origin validation on RECEIVED messages
    window.parent.postMessage(message, '*');
  }, [isEmbedded]);

  // Listen for messages from LivOS parent
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Origin validation (per BRIDGE-06)
      if (!isAllowedOrigin(event.origin)) return;

      const data = event.data as LivOSToStoreMessage;
      if (!data || typeof data.type !== 'string') return;

      // Remember the parent origin for future reference
      parentOriginRef.current = event.origin;

      switch (data.type) {
        case 'status': {
          // Full status update -- replace the map (per BRIDGE-04)
          const map = new Map<string, AppStatus['status']>();
          for (const app of data.apps) {
            map.set(app.id, app.status);
          }
          setInstalledApps(map);
          break;
        }
        case 'installed': {
          // Single app install result (per BRIDGE-05)
          setInstalledApps(prev => {
            const next = new Map(prev);
            next.set(data.appId, data.success ? 'running' : 'not_installed');
            return next;
          });
          break;
        }
        case 'uninstalled': {
          // Single app uninstall result
          setInstalledApps(prev => {
            const next = new Map(prev);
            if (data.success) {
              next.set(data.appId, 'not_installed');
            }
            return next;
          });
          break;
        }
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Send 'ready' when embedded and mounted
  useEffect(() => {
    if (isEmbedded) {
      sendMessage({ type: 'ready' });
    }
  }, [isEmbedded, sendMessage]);

  // Action senders (per BRIDGE-01, BRIDGE-02, BRIDGE-03)
  const sendInstall = useCallback((appId: string) => {
    const composeUrl = `${window.location.origin}/api/apps/${appId}/compose`;
    sendMessage({ type: 'install', appId, composeUrl });
    // Optimistic: mark as installing (show "stopped" while pending)
    setInstalledApps(prev => {
      const next = new Map(prev);
      next.set(appId, 'stopped');
      return next;
    });
  }, [sendMessage]);

  const sendUninstall = useCallback((appId: string) => {
    sendMessage({ type: 'uninstall', appId });
  }, [sendMessage]);

  const sendOpen = useCallback((appId: string) => {
    sendMessage({ type: 'open', appId });
  }, [sendMessage]);

  const getAppStatus = useCallback((appId: string): AppStatus['status'] => {
    return installedApps.get(appId) || 'not_installed';
  }, [installedApps]);

  return {
    isEmbedded,
    installedApps,
    sendInstall,
    sendUninstall,
    sendOpen,
    getAppStatus,
  };
}
