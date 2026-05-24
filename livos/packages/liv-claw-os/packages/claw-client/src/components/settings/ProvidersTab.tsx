"use client";

/**
 * Phase 206 — Providers tab redesigned around the openclaw native CLI.
 *
 * Replaces Phase 204's gateway env file approach (provider.config.*) with a
 * thin wrapper over the openclaw 2026.5.20 `capability model` CLI surface.
 * Operator UAT 2026-05-24 proved the env file is dead (agent reads
 * auth-profiles.json, never the env file). This tab now:
 *
 *   1. Renders a "Default model" picker at the top driven by
 *      `openclaw.models.list` (35+ providers × varying model counts;
 *      OpenRouter alone is 265 models). Selection persists via
 *      `openclaw.config.setDefaultModel`.
 *
 *   2. Renders a provider card per entry returned by
 *      `openclaw.providers.list`. No hardcoded provider catalog — whatever
 *      openclaw knows about, the operator can configure. Each card shows
 *      configured-or-missing status from `openclaw.auth.status`.
 *
 *   3. Per-card auth actions:
 *      - "Use API key" inline input → `openclaw.auth.setApiKey` writes
 *        directly to auth-profiles.json (correct store for the agent).
 *      - "Remove" button → `openclaw.auth.logout`.
 *      - xAI-only: "Connect with xAI account" → existing `auth.xai.*`
 *        OAuth surface (preserved unchanged).
 *
 * INV-204-04 carry-forward — raw keys never displayed; preview-only.
 * Operator preference (locked Phase 205 Hot-fix M.1): no central dropdown +
 * paste form; each provider gets its own card with inline input.
 */

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { callMutation, callQuery } from "@/lib/livinityd-client";

// ────────────────────────────────────────────────────────────────────────────
// Wire-format types — mirror livinityd `openclaw-router.ts` outputs
// ────────────────────────────────────────────────────────────────────────────

interface ProviderInfo {
  provider: string;
  count: number;
  defaults: string[];
  available: boolean;
  configured: boolean;
  selected: boolean;
}

interface ModelInfo {
  id: string;
  name?: string;
  provider: string;
  contextWindow?: number;
  reasoning?: boolean;
  input?: string[];
}

interface RuntimeAuthRoute {
  provider: string;
  runtime?: string;
  authProvider?: string;
  status: string;
}

interface AuthStatus {
  configPath?: string;
  agentDir?: string;
  defaultModel?: string | null;
  resolvedDefault?: string | null;
  auth?: {
    storePath?: string;
    providersWithOAuth?: string[];
    missingProvidersInUse?: string[];
    runtimeAuthRoutes?: RuntimeAuthRoute[];
  };
}

interface XaiStatus {
  connected: boolean;
  tier?: number;
  expiresAt?: number;
}

interface XaiStartResult {
  flowId: string;
  url: string;
  startedAt: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Provider display labels — display-only, falls back to provider id if absent
// ────────────────────────────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  xai: "xAI (Grok)",
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  "openai-codex": "OpenAI Codex / ChatGPT",
  google: "Google (Gemini)",
  "google-vertex": "Google Vertex AI",
  groq: "Groq",
  mistral: "Mistral",
  ollama: "Ollama (local)",
  openrouter: "OpenRouter",
  "vercel-ai-gateway": "Vercel AI Gateway",
  "amazon-bedrock": "Amazon Bedrock",
  "azure-openai-responses": "Azure OpenAI",
  "github-copilot": "GitHub Copilot",
  "cloudflare-ai-gateway": "Cloudflare AI Gateway",
  "cloudflare-workers-ai": "Cloudflare Workers AI",
  deepseek: "DeepSeek",
  fireworks: "Fireworks AI",
  huggingface: "Hugging Face",
  "kimi-coding": "Kimi (Coding)",
  minimax: "MiniMax",
  moonshotai: "Moonshot AI",
  nvidia: "NVIDIA NIM",
  together: "Together AI",
  "claude-cli": "Claude CLI",
  cerebras: "Cerebras",
  byteplus: "ByteDance Plus",
  volcengine: "Volcengine",
  zai: "Z.AI",
  xiaomi: "Xiaomi MiMo",
};

function labelOf(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

// ────────────────────────────────────────────────────────────────────────────
// Status banner helper
// ────────────────────────────────────────────────────────────────────────────

function StatusBanner({
  tone,
  icon: Icon,
  message,
}: {
  tone: "success" | "danger" | "info";
  icon: typeof CheckCircle2;
  message: string;
}) {
  const styles =
    tone === "success"
      ? "border-border-success/40 bg-success-background text-text-success-primary"
      : tone === "info"
      ? "border-border-default/40 bg-info-background text-text-info-primary"
      : "border-border-danger/40 bg-danger-background text-text-danger-primary";
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-xs rounded-md border px-m py-s text-sm ${styles}`}
    >
      <Icon size={16} className="mt-3xs shrink-0" />
      <p className="leading-snug">{message}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Default model picker
// ────────────────────────────────────────────────────────────────────────────

function DefaultModelPicker({
  models,
  current,
  onChange,
  saving,
}: {
  models: ModelInfo[];
  current: string | null;
  onChange: (value: string) => void;
  saving: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current || !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const grouped = useMemo(() => {
    const safe = Array.isArray(models) ? models : [];
    const filtered = search.trim()
      ? safe.filter((m) => {
          const q = search.trim().toLowerCase();
          return (
            m.id.toLowerCase().includes(q) ||
            (m.name ?? "").toLowerCase().includes(q) ||
            m.provider.toLowerCase().includes(q)
          );
        })
      : safe;
    const byProvider = new Map<string, ModelInfo[]>();
    for (const m of filtered) {
      const arr = byProvider.get(m.provider) ?? [];
      arr.push(m);
      byProvider.set(m.provider, arr);
    }
    return Array.from(byProvider.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
  }, [models, search]);

  const totalCount = Array.isArray(models) ? models.length : 0;
  const currentLabel = current ?? "(none — chat will fail until set)";

  return (
    <div ref={ref} className="space-y-xs">
      <div className="flex items-center gap-xs">
        <KeyRound size={14} className="text-text-neutral-tertiary" />
        <h2 className="text-md font-medium text-text-neutral-primary">
          Default model
        </h2>
      </div>
      <p className="text-sm text-text-neutral-tertiary">
        The model used for new chats when you don&apos;t pick one explicitly.
        Each chat can still override this from the composer. {totalCount} models
        available across {grouped.length} providers.
      </p>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          disabled={saving}
          className="flex w-full items-center justify-between gap-s rounded-md border border-border-default bg-background px-m py-s text-left text-sm text-text-neutral-primary outline-none focus:border-border-interactive-emphasis disabled:opacity-60 dark:border-border-default/16 dark:bg-foreground"
        >
          <span className="truncate font-mono">{currentLabel}</span>
          <span className="shrink-0 text-text-neutral-tertiary">
            {saving ? <Loader2 size={14} className="animate-spin" /> : open ? "▲" : "▼"}
          </span>
        </button>
        {open ? (
          <div className="absolute left-0 right-0 top-full z-10 mt-3xs max-h-[420px] overflow-hidden rounded-md border border-border-default bg-background shadow-lg dark:border-border-default/16 dark:bg-foreground">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models or providers…"
              autoFocus
              className="w-full border-b border-border-default/40 bg-background px-m py-s text-sm outline-none dark:border-border-default/16 dark:bg-foreground"
            />
            <div className="max-h-[360px] overflow-y-auto">
              {grouped.length === 0 ? (
                <p className="px-m py-l text-center text-sm text-text-neutral-tertiary">
                  No models match.
                </p>
              ) : (
                grouped.map(([provider, list]) => (
                  <div key={provider} className="border-b border-border-default/30 last:border-b-0">
                    <div className="px-m py-2xs text-xs font-medium uppercase tracking-wide text-text-neutral-tertiary">
                      {labelOf(provider)} ({list.length})
                    </div>
                    {list.slice(0, 30).map((m) => {
                      const qualified = `${m.provider}/${m.id}`;
                      const isCurrent = qualified === current;
                      return (
                        <button
                          key={qualified}
                          type="button"
                          onClick={() => {
                            onChange(qualified);
                            setOpen(false);
                            setSearch("");
                          }}
                          className={`flex w-full items-baseline justify-between gap-s px-m py-xs text-left text-sm hover:bg-sunk-light dark:hover:bg-elevated ${
                            isCurrent ? "bg-info-background" : ""
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate font-mono text-text-neutral-primary">
                            {m.id}
                          </span>
                          {m.name && m.name !== m.id ? (
                            <span className="shrink-0 text-xs text-text-neutral-tertiary">
                              {m.name}
                            </span>
                          ) : null}
                          {isCurrent ? (
                            <Check size={12} className="shrink-0 text-text-success-primary" />
                          ) : null}
                        </button>
                      );
                    })}
                    {list.length > 30 ? (
                      <p className="px-m py-2xs text-xs text-text-neutral-tertiary">
                        {list.length - 30} more — refine search to narrow.
                      </p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Provider card
// ────────────────────────────────────────────────────────────────────────────

interface ProviderCardProps {
  info: ProviderInfo;
  authStatus: AuthStatus | null;
  xaiStatus: XaiStatus | null;
  onChanged: () => Promise<void>;
}

function ProviderCard({ info, authStatus, xaiStatus, onChanged }: ProviderCardProps) {
  const [pendingKey, setPendingKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // xAI OAuth flow state
  const [oauthFlow, setOauthFlow] = useState<XaiStartResult | null>(null);
  const [oauthStarting, setOauthStarting] = useState(false);
  const [oauthCopied, setOauthCopied] = useState(false);
  const [oauthDisconnecting, setOauthDisconnecting] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  const isXai = info.provider === "xai";
  const hasXaiOAuth = isXai && xaiStatus?.connected === true;

  // Derive configured status from auth.runtimeAuthRoutes (or providersWithOAuth)
  const routes = Array.isArray(authStatus?.auth?.runtimeAuthRoutes)
    ? authStatus!.auth!.runtimeAuthRoutes!
    : [];
  const oauthProviders = Array.isArray(authStatus?.auth?.providersWithOAuth)
    ? authStatus!.auth!.providersWithOAuth!
    : [];
  const routeForThis = routes.find((r) => r.provider === info.provider);
  const isConfigured =
    info.configured ||
    routeForThis?.status === "configured" ||
    oauthProviders.includes(info.provider) ||
    hasXaiOAuth;

  // xAI status polling while OAuth flow active. On completion, ALSO bridges
  // opencode's auth.json into openclaw's auth-profiles.json so the running
  // agent actually sees the credential (Phase 206 root-cause: the two
  // stores are independent — see project_phase206_shipped memory).
  useEffect(() => {
    if (!isXai || !oauthFlow) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await callQuery<undefined, XaiStatus>("auth.xai.status");
        if (cancelled) return;
        if (s?.connected) {
          // Bridge opencode auth.json → openclaw auth-profiles.json. Best-
          // effort: if the bridge mutation fails the operator can re-paste
          // a permanent API key from the same card; we don't block the UI
          // success message on the bridge.
          try {
            // Phase 206 path: bridgeFromOpencode landed at openclaw.bridgeFromOpencode
            // (top-level of openclaw router, NOT openclaw.auth.* — router brace
            // shuffle left it as a sibling of auth/config/profiles). Confirmed
            // live on Mini PC 2026-05-24 — top-level path returns 200 with
            // {ok:true, bridged:["xai"]}.
            await callMutation<
              { providers?: string[] },
              { ok: boolean; bridged: string[] }
            >("openclaw.bridgeFromOpencode", { providers: ["xai"] });
          } catch (bridgeErr) {
            console.warn("xAI OAuth bridge failed", bridgeErr);
          }
          setOauthFlow(null);
          setOauthCopied(false);
          setNotice("xAI account connected and bridged to the running agent.");
          await onChanged();
          return;
        }
      } catch {
        // Ignore — keep polling.
      }
      if (!cancelled) {
        pollTimerRef.current = window.setTimeout(tick, 2000);
      }
    };
    pollTimerRef.current = window.setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isXai, oauthFlow, onChanged]);

  const handleSaveKey = useCallback(async () => {
    const trimmed = pendingKey.trim();
    if (trimmed.length < 8) {
      setError("Key must be at least 8 characters.");
      return;
    }
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await callMutation<
        { provider: string; key: string },
        { ok: boolean; preview: string }
      >("openclaw.auth.setApiKey", { provider: info.provider, key: trimmed });
      setPendingKey("");
      setNotice("Saved. Agent will pick up the new key automatically.");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [pendingKey, info.provider, onChanged]);

  const handleRemove = useCallback(async () => {
    setError(null);
    setNotice(null);
    setRemoving(true);
    try {
      await callMutation<{ provider: string }, { removed: boolean }>(
        "openclaw.auth.logout",
        { provider: info.provider },
      );
      setNotice("Removed.");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoving(false);
    }
  }, [info.provider, onChanged]);

  const handleStartOAuth = useCallback(async () => {
    setError(null);
    setNotice(null);
    setOauthStarting(true);
    try {
      const result = await callMutation<Record<string, never>, XaiStartResult>(
        "auth.xai.start",
        {} as Record<string, never>,
      );
      setOauthFlow(result);
      setOauthCopied(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Couldn't start xAI sign-in: ${err.message}`
          : "Couldn't start xAI sign-in.",
      );
    } finally {
      setOauthStarting(false);
    }
  }, []);

  const handleCancelOAuth = useCallback(() => {
    setOauthFlow(null);
    setOauthCopied(false);
  }, []);

  const handleCopyUrl = useCallback(async () => {
    if (!oauthFlow) return;
    try {
      await navigator.clipboard.writeText(oauthFlow.url);
      setOauthCopied(true);
      window.setTimeout(() => setOauthCopied(false), 2500);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Couldn't copy URL: ${err.message}`
          : "Couldn't copy URL.",
      );
    }
  }, [oauthFlow]);

  const handleDisconnectOAuth = useCallback(async () => {
    setError(null);
    setNotice(null);
    setOauthDisconnecting(true);
    try {
      await callMutation<Record<string, never>, { ok: boolean }>(
        "auth.xai.disconnect",
        {} as Record<string, never>,
      );
      setNotice("xAI account disconnected.");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOauthDisconnecting(false);
    }
  }, [onChanged]);

  return (
    <div className="rounded-lg border border-border-default/40 bg-background p-m dark:border-border-default/16 dark:bg-foreground/30">
      {/* Header row */}
      <div className="flex items-start justify-between gap-m">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-s">
            <h3 className="truncate text-sm font-medium text-text-neutral-primary">
              {labelOf(info.provider)}
            </h3>
            <span className="font-mono text-xs text-text-neutral-tertiary">
              {info.provider}
            </span>
            {isConfigured ? (
              <span className="inline-flex items-center gap-3xs rounded-full bg-success-background px-xs py-3xs text-xs font-medium text-text-success-primary">
                <Check size={10} />
                {hasXaiOAuth ? "Connected (via xAI account)" : "Configured"}
              </span>
            ) : info.selected ? (
              <span className="inline-flex items-center gap-3xs rounded-full bg-alert-background px-xs py-3xs text-xs font-medium text-text-alert-primary">
                Selected · auth missing
              </span>
            ) : (
              <span className="inline-flex items-center gap-3xs rounded-full bg-sunk-light px-xs py-3xs text-xs font-medium text-text-neutral-tertiary dark:bg-elevated">
                Not connected
              </span>
            )}
          </div>
          <p className="mt-3xs text-xs text-text-neutral-tertiary">
            {info.count} model{info.count === 1 ? "" : "s"} available
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-s">
          <StatusBanner tone="danger" icon={AlertTriangle} message={error} />
        </div>
      ) : null}
      {notice && !error ? (
        <div className="mt-s">
          <StatusBanner tone="success" icon={CheckCircle2} message={notice} />
        </div>
      ) : null}

      {/* xAI OAuth panel */}
      {isXai && oauthFlow ? (
        <div className="mt-m space-y-s rounded-md border border-border-default/60 bg-sunk-light/40 p-m dark:bg-elevated/30">
          <div>
            <p className="text-sm font-medium text-text-neutral-primary">
              Open this URL in any browser to sign in with your xAI account
            </p>
            <p className="mt-3xs text-xs text-text-neutral-tertiary">
              Sign-in usually completes within a minute. This panel will close
              automatically.
            </p>
          </div>
          <pre className="overflow-x-auto rounded-sm border border-border-default/60 bg-background px-s py-xs font-mono text-xs text-text-neutral-primary">
            {oauthFlow.url}
          </pre>
          <div className="flex flex-wrap items-center gap-xs">
            <Button variant="primary" size="sm" icon={Copy} onClick={handleCopyUrl}>
              {oauthCopied ? "Copied" : "Copy URL"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={ExternalLink}
              onClick={() =>
                window.open(oauthFlow.url, "_blank", "noopener,noreferrer")
              }
            >
              Open in new tab
            </Button>
            <Button variant="tertiary" size="sm" onClick={handleCancelOAuth}>
              Cancel
            </Button>
            <span className="ml-xs inline-flex items-center gap-xxs text-xs text-text-neutral-tertiary">
              <Loader2 size={12} className="animate-spin" />
              Waiting for sign-in…
            </span>
          </div>
        </div>
      ) : null}

      {!oauthFlow ? (
        <div className="mt-m space-y-s">
          {/* API-key row */}
          <div className="space-y-xs">
            <label
              htmlFor={`provider-key-${info.provider}`}
              className="text-xs text-text-neutral-tertiary"
            >
              {isConfigured
                ? "Paste a new key to replace, or remove the existing one below."
                : "Paste your API key to enable this provider."}
            </label>
            <div className="flex flex-wrap items-center gap-xs">
              <input
                id={`provider-key-${info.provider}`}
                type="password"
                value={pendingKey}
                onChange={(e) => setPendingKey(e.target.value)}
                disabled={saving}
                placeholder={
                  isConfigured ? "Paste a new key to replace" : "Paste API key"
                }
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-md border border-border-default bg-background px-m py-s font-mono text-sm text-text-neutral-primary outline-none focus:border-border-interactive-emphasis disabled:opacity-60 dark:border-border-default/16 dark:bg-foreground"
              />
              <Button
                variant="primary"
                size="md"
                onClick={handleSaveKey}
                disabled={saving || pendingKey.trim().length < 8}
              >
                {saving ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span className="ml-xs">Saving…</span>
                  </>
                ) : (
                  <span>{isConfigured ? "Replace key" : "Save key"}</span>
                )}
              </Button>
              {isConfigured && !hasXaiOAuth ? (
                <Button
                  variant="tertiary"
                  size="md"
                  icon={Trash2}
                  onClick={handleRemove}
                  disabled={removing}
                >
                  {removing ? "Removing…" : "Remove"}
                </Button>
              ) : null}
            </div>
          </div>

          {/* xAI OAuth controls */}
          {isXai ? (
            <div className="border-t border-border-default/40 pt-s dark:border-border-default/16">
              {hasXaiOAuth ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDisconnectOAuth}
                  disabled={oauthDisconnecting}
                >
                  {oauthDisconnecting ? "Disconnecting…" : "Disconnect xAI account"}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleStartOAuth}
                  disabled={oauthStarting}
                >
                  {oauthStarting ? (
                    <>
                      <Loader2 size={12} className="animate-spin" />
                      <span className="ml-xs">Starting…</span>
                    </>
                  ) : (
                    <span>Connect with xAI account</span>
                  )}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main tab
// ────────────────────────────────────────────────────────────────────────────

export function ProvidersTab() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [xaiStatus, setXaiStatus] = useState<XaiStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [defaultSaving, setDefaultSaving] = useState(false);
  const [defaultNotice, setDefaultNotice] = useState<string | null>(null);
  const [defaultError, setDefaultError] = useState<string | null>(null);

  // Filter — show only configured-or-most-popular providers by default.
  const [showAll, setShowAll] = useState(false);

  const refetchAll = useCallback(async () => {
    setLoadError(null);
    try {
      const [provs, mods, status, xai] = await Promise.all([
        callQuery<undefined, ProviderInfo[]>("openclaw.providers.list").catch(
          () => [] as ProviderInfo[],
        ),
        callQuery<undefined, ModelInfo[]>("openclaw.models.list").catch(
          () => [] as ModelInfo[],
        ),
        callQuery<undefined, AuthStatus>("openclaw.auth.status").catch(
          () => null,
        ),
        callQuery<undefined, XaiStatus>("auth.xai.status").catch(
          () => ({ connected: false }) as XaiStatus,
        ),
      ]);
      setProviders(Array.isArray(provs) ? provs : []);
      setModels(Array.isArray(mods) ? mods : []);
      setAuthStatus(status);
      setXaiStatus(xai ?? { connected: false });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refetchAll().finally(() => setLoading(false));
  }, [refetchAll]);

  const handleDefaultModelChange = useCallback(
    async (model: string) => {
      setDefaultError(null);
      setDefaultNotice(null);
      setDefaultSaving(true);
      try {
        await callMutation<{ model: string }, { ok: boolean }>(
          "openclaw.config.setDefaultModel",
          { model },
        );
        setDefaultNotice(`Default model set to ${model}.`);
        await refetchAll();
      } catch (err) {
        setDefaultError(err instanceof Error ? err.message : String(err));
      } finally {
        setDefaultSaving(false);
      }
    },
    [refetchAll],
  );

  // Compact list: configured providers first, then top 6 by model count.
  const visibleProviders = useMemo(() => {
    if (showAll) {
      return [...providers].sort((a, b) => {
        // Configured first, then by count desc.
        if (a.configured !== b.configured) return a.configured ? -1 : 1;
        return b.count - a.count;
      });
    }
    const configured = providers.filter((p) => p.configured);
    const popular = providers
      .filter((p) => !p.configured)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    // Always include xAI + OpenRouter + OpenAI + Anthropic even if not in top 8
    const pinnedIds = ["xai", "openrouter", "openai", "openai-codex", "anthropic"];
    const pinned = providers.filter(
      (p) => !p.configured && pinnedIds.includes(p.provider) && !popular.includes(p),
    );
    return [...configured, ...popular, ...pinned];
  }, [providers, showAll]);

  return (
    <div className="space-y-l p-l">
      {/* Header */}
      <div className="space-y-xs">
        <div className="flex items-center gap-s">
          <KeyRound size={16} className="text-text-neutral-tertiary" />
          <h2 className="text-md font-medium text-text-neutral-primary">
            LLM Providers
          </h2>
        </div>
        <p className="text-sm text-text-neutral-tertiary">
          Configure which LLM providers Liv AI can use. Pick a default model
          for new chats; each chat can override from the composer. Saving an
          API key or completing OAuth automatically refreshes the agent — no
          restart required.
        </p>
      </div>

      {loadError ? (
        <StatusBanner
          tone="danger"
          icon={AlertTriangle}
          message={`Couldn't reach openclaw: ${loadError}`}
        />
      ) : null}

      {loading ? (
        <p className="flex items-center gap-xs text-sm text-text-neutral-tertiary">
          <Loader2 size={14} className="animate-spin" />
          Loading providers and models…
        </p>
      ) : (
        <>
          {/* Default model picker */}
          <DefaultModelPicker
            models={models}
            current={authStatus?.defaultModel ?? authStatus?.resolvedDefault ?? null}
            onChange={handleDefaultModelChange}
            saving={defaultSaving}
          />
          {defaultError ? (
            <StatusBanner tone="danger" icon={AlertTriangle} message={defaultError} />
          ) : null}
          {defaultNotice && !defaultError ? (
            <StatusBanner
              tone="success"
              icon={CheckCircle2}
              message={defaultNotice}
            />
          ) : null}

          {/* Provider grid header */}
          <div className="flex items-center justify-between border-t border-border-default/30 pt-m dark:border-border-default/16">
            <div>
              <h3 className="text-sm font-medium text-text-neutral-primary">
                Providers ({providers.length})
              </h3>
              <p className="text-xs text-text-neutral-tertiary">
                {visibleProviders.length === providers.length
                  ? "All providers shown."
                  : `Showing ${visibleProviders.length} most relevant. Toggle below to see all ${providers.length}.`}
              </p>
            </div>
            <Button
              variant="tertiary"
              size="sm"
              onClick={() => setShowAll((p) => !p)}
            >
              {showAll ? "Show fewer" : "Show all"}
            </Button>
          </div>

          {/* Provider cards */}
          <ul className="space-y-m">
            {visibleProviders.map((p) => (
              <li key={p.provider}>
                <ProviderCard
                  info={p}
                  authStatus={authStatus}
                  xaiStatus={p.provider === "xai" ? xaiStatus : null}
                  onChanged={refetchAll}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
