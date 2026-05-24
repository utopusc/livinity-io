"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` once on mount in production builds. Skipped in dev so
 * Next's HMR isn't fighting cached assets (and so a forgotten registration
 * doesn't follow you across `pnpm dev` restarts).
 *
 * The SW itself is intentionally minimal — see public/sw.js. We don't try
 * to take over Next's hashed bundles; this is just an "add to home screen
 * works on iOS" + "loads offline shell" guarantee.
 *
 * Phase 203 Hot-fix I 2026-05-24 — when a SW update is available, we now
 * trigger an automatic reload AND wipe the in-memory + Cache Storage shell so
 * the next navigation pulls the fresh `index.html` + the fresh JS chunks.
 *
 * Why this is needed:
 *   - SW updates only swap on next navigation by default. Operators in LivOS
 *     never navigate (the iframe just sits there) so the new SW never
 *     activates and the old shell + old bundle keep being served.
 *   - Even with `_headers` Cache-Control: no-store on /index.html, the
 *     openclaw plugin's static-serve middleware does NOT honor _headers — it
 *     ships its own ETag-based handler — so we can't rely on HTTP-level
 *     freshness.
 *   - Aggressive client-side reload-on-update is the only path that works
 *     for an iframe-hosted PWA we don't control the lifecycle of.
 *
 * The flow:
 *   1. Register `/sw.js`.
 *   2. Listen for `updatefound` → new SW installs in the background.
 *   3. When it transitions to `installed` AND an old controller is present
 *      (i.e., this is a true UPDATE not a first-install), call
 *      `caches.keys()` → delete every cache (kills the v2 shell), then
 *      `location.reload()`.
 *
 * Guards against reload loops via a session-scoped marker.
 */
const RELOAD_MARKER_KEY = "claw-sw-update-reloaded";

async function wipeAllCachesAndReload() {
  if (typeof window === "undefined") return;
  try {
    if ("caches" in self) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // best-effort
  }
  // Loop guard: only reload once per browser session per detected update.
  // If the marker is already set, another tab/handler already reloaded.
  try {
    if (window.sessionStorage.getItem(RELOAD_MARKER_KEY)) return;
    window.sessionStorage.setItem(RELOAD_MARKER_KEY, String(Date.now()));
  } catch {
    // sessionStorage can throw in private-mode iframes — accept double-reload risk
  }
  window.location.reload();
}

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    let unmounted = false;
    const handle = window.setTimeout(async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        if (unmounted) return;

        // Force an immediate update check on mount — covers operators whose
        // browsers had the OLD sw.js cached and never re-queried for it.
        try {
          await registration.update();
        } catch {
          // ignore — update is best-effort
        }

        const handleUpdate = () => {
          const incoming = registration.installing ?? registration.waiting;
          if (!incoming) return;
          incoming.addEventListener("statechange", () => {
            if (incoming.state === "installed" && navigator.serviceWorker.controller) {
              // True update (had a prior controller) → wipe + reload.
              void wipeAllCachesAndReload();
            }
          });
        };
        registration.addEventListener("updatefound", handleUpdate);
        // If a worker is already installing/waiting at register time, hook it now.
        if (registration.installing || registration.waiting) handleUpdate();
      } catch (err) {
        console.warn("[claw] sw register failed:", err);
      }
    }, 1500);
    return () => {
      unmounted = true;
      window.clearTimeout(handle);
    };
  }, []);
  return null;
}
