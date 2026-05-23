/**
 * Phase 203-11 — Client view that drives `/apps/[slug]`.
 *
 * Split out from `page.tsx` so the page module can export
 * `generateStaticParams` (server-side concern) while the body stays
 * `"use client"` for the live data fetch + Renderer mount.
 *
 * Extracts the actual slug from `window.location.pathname` (NOT the route
 * params — those are the build-time `__placeholder__` sentinel; see
 * page.tsx for the static-export strategy).
 *
 * Renders via `@openuidev/react-lang`'s Renderer + the same
 * `@openuidev/react-ui` openuiLibrary used by `AppDetail` so the OpenUI
 * Lang content honours the 14-component whitelist + T-203-03 sanitisation
 * already exercised across the codebase.
 *
 * NO toolProvider — the standalone OpenUI app view intentionally does NOT
 * forward Query/Mutation/exec/read invocations to the gateway. Apps that
 * need live tool calls should be opened from inside a chat session via
 * `AppDetail`; the dock-window iframe is a pure render target so a
 * malicious or buggy app cannot escalate to tool execution through the
 * standalone surface (T-203-07 defence-in-depth).
 */

"use client";

import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui/genui-lib";
import { useEffect, useRef, useState } from "react";

import { fetchOpenUiApp, type OpenUiApp } from "@/lib/fetch-openui-app";

type LoadState =
  | { kind: "loading" }
  | { kind: "not-found"; slug: string }
  | { kind: "error"; message: string }
  | { kind: "ready"; app: OpenUiApp };

/** Path prefix the route is mounted under on the parent vhost. */
const APPS_PATH_PREFIX = "/apps/";

/**
 * Extracts the slug from window.location.pathname. Handles both the
 * direct claw-client URL (`/apps/foo`) and the prefixed Caddy-rewrite URL
 * (`/liv-ai-app/apps/foo` or `/plugins/openclawos/apps/foo`).
 */
export function extractSlugFromPathname(pathname: string): string | null {
  // Strip everything up to and including the LAST `/apps/` occurrence;
  // remainder is the slug (possibly with trailing slash / query). Last-match
  // wins because the path could be `/anything/apps/<slug>` after the Caddy
  // chain. Slash within a slug is impossible per the SlugSchema regex on
  // the server (`/^[a-z0-9][a-z0-9-_]*$/i`), so we slice at the next slash.
  const idx = pathname.lastIndexOf(APPS_PATH_PREFIX);
  if (idx < 0) return null;
  let rest = pathname.slice(idx + APPS_PATH_PREFIX.length);
  // Trim trailing slash.
  if (rest.endsWith("/")) rest = rest.slice(0, -1);
  // Strip query/hash if Next.js for some reason left them in pathname.
  rest = rest.split("?")[0]!.split("#")[0]!;
  // Strip a trailing `.html` (the plugin's fallback may leave it on some
  // client-side history pushes; defensive — current Caddy chain does not).
  if (rest.endsWith(".html")) rest = rest.slice(0, -".html".length);
  if (!rest) return null;
  if (rest === "__placeholder__") return null;
  return rest;
}

export function OpenUiAppView() {
  const [slug, setSlug] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [renderErrors, setRenderErrors] = useState<string[]>([]);
  // Track the live reactive renderer state — kept in a ref so re-renders
  // don't churn during streaming Query results.
  const stateRef = useRef<Record<string, unknown>>({});

  // Resolve the slug from the live URL after hydration. Runs once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const resolved = extractSlugFromPathname(window.location.pathname);
    if (!resolved) {
      setState({ kind: "not-found", slug: "(none)" });
      return;
    }
    setSlug(resolved);
  }, []);

  // Fetch whenever the resolved slug changes.
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    setState({ kind: "loading" });
    setRenderErrors([]);

    fetchOpenUiApp(slug, { signal: controller.signal })
      .then((app) => {
        if (controller.signal.aborted) return;
        if (!app) {
          setState({ kind: "not-found", slug });
          return;
        }
        setState({ kind: "ready", app });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: "error", message });
      });

    return () => {
      controller.abort();
    };
  }, [slug]);

  if (state.kind === "loading") {
    return (
      <main className="flex h-full min-h-screen w-full items-center justify-center bg-background">
        <p className="text-sm text-text-neutral-tertiary">Loading app…</p>
      </main>
    );
  }

  if (state.kind === "not-found") {
    return (
      <main className="flex h-full min-h-screen w-full flex-col items-center justify-center gap-2 bg-background p-ml">
        <p className="text-base font-medium text-text-neutral-secondary">App not found</p>
        <p className="text-sm text-text-neutral-tertiary">slug: {state.slug}</p>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="flex h-full min-h-screen w-full flex-col items-center justify-center gap-2 bg-background p-ml">
        <p className="text-base font-medium text-text-alert-primary">Failed to load app</p>
        <p className="text-sm text-text-neutral-tertiary">{state.message}</p>
      </main>
    );
  }

  const { app } = state;
  return (
    <main className="flex h-full min-h-screen w-full flex-col bg-background">
      <header className="border-b border-border-neutral-tertiary px-ml py-sm">
        <h1 className="text-base font-semibold text-text-neutral-primary">{app.name}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-ml">
        {renderErrors.length > 0 ? (
          <div className="mb-ml rounded-lg border border-border-alert-primary bg-alert-background p-sm text-sm text-text-alert-primary">
            <p className="mb-2xs font-medium">Render error</p>
            <pre className="whitespace-pre-wrap text-xs">{renderErrors[0]}</pre>
          </div>
        ) : null}
        <Renderer
          library={openuiLibrary}
          response={app.content}
          onStateUpdate={(next) => {
            stateRef.current = next;
          }}
          onError={(errors) => {
            const messages = errors.map((error) =>
              typeof error === "string"
                ? error
                : error instanceof Error
                  ? error.message
                  : JSON.stringify(error),
            );
            setRenderErrors(messages);
          }}
        />
      </div>
    </main>
  );
}
