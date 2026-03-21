'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { StoreToLivOSMessage, LivOSToStoreMessage, AppStatus, AppCredentials, InstanceInfo } from '../types';

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
  const [appSubdomains, setAppSubdomains] = useState<Map<string, string>>(new Map());
  const [installProgress, setInstallProgress] = useState<Map<string, number>>(new Map());
  const [appCredentials, setAppCredentials] = useState<AppCredentials | null>(null);
  const [instanceInfo, setInstanceInfo] = useState<InstanceInfo | null>(null);
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
          const subMap = new Map<string, string>();
          for (const app of data.apps) {
            map.set(app.id, app.status);
            if (app.subdomain) subMap.set(app.id, app.subdomain);
          }
          setInstalledApps(map);
          setAppSubdomains(subMap);
          if (data.instance) setInstanceInfo(data.instance);
          break;
        }
        case 'installed': {
          // Single app install result (per BRIDGE-05)
          setInstalledApps(prev => {
            const next = new Map(prev);
            next.set(data.appId, data.success ? 'running' : 'not_installed');
            return next;
          });
          // Clear progress for this app
          setInstallProgress(prev => {
            const next = new Map(prev);
            next.delete(data.appId);
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
        case 'progress': {
          // Update progress for the specific app
          setInstallProgress(prev => {
            const next = new Map(prev);
            next.set(data.appId, data.progress);
            return next;
          });
          // Also ensure status shows as installing
          setInstalledApps(prev => {
            const next = new Map(prev);
            if (next.get(data.appId) !== 'installing') {
              next.set(data.appId, 'installing');
            }
            return next;
          });
          break;
        }
        case 'credentials': {
          setAppCredentials({
            appId: data.appId,
            username: data.username,
            password: data.password,
          });
          break;
        }
        case 'reportEvent': {
          // Same-origin call to /api/install-event (no CORS needed)
          fetch('/api/install-event', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Api-Key': data.apiKey,
            },
            body: JSON.stringify({
              app_id: data.appId,
              action: data.action,
              instance_name: data.instanceName,
            }),
          }).catch(() => {}); // fire-and-forget
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
    // Optimistic: mark as installing
    setInstalledApps(prev => {
      const next = new Map(prev);
      next.set(appId, 'installing');
      return next;
    });
    setInstallProgress(prev => {
      const next = new Map(prev);
      next.set(appId, 0);
      return next;
    });
  }, [sendMessage]);

  const sendUninstall = useCallback((appId: string) => {
    sendMessage({ type: 'uninstall', appId });
    // Optimistic: mark as uninstalling
    setInstalledApps(prev => {
      const next = new Map(prev);
      next.set(appId, 'uninstalling');
      return next;
    });
  }, [sendMessage]);

  const sendOpen = useCallback((appId: string) => {
    sendMessage({ type: 'open', appId });
  }, [sendMessage]);

  const getAppStatus = useCallback((appId: string): AppStatus['status'] => {
    return installedApps.get(appId) || 'not_installed';
  }, [installedApps]);

  const getInstallProgress = useCallback((appId: string): number => {
    return installProgress.get(appId) ?? 0;
  }, [installProgress]);

  const clearCredentials = useCallback(() => {
    setAppCredentials(null);
  }, []);

  const getAppSubdomain = useCallback((appId: string): string | undefined => {
    return appSubdomains.get(appId);
  }, [appSubdomains]);

  const sendUpdateSubdomain = useCallback((appId: string, subdomain: string) => {
    sendMessage({ type: 'updateSubdomain', appId, subdomain });
  }, [sendMessage]);

  return {
    isEmbedded,
    installedApps,
    installProgress,
    getInstallProgress,
    appCredentials,
    clearCredentials,
    sendInstall,
    sendUninstall,
    sendOpen,
    getAppStatus,
    getAppSubdomain,
    sendUpdateSubdomain,
    instanceInfo,
  };
}
