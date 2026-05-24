"use client";

/**
 * Phase 205 Hot-fix M — Providers tab.
 *
 * In-shell LLM provider key management. Operators no longer need to leave
 * the chat surface and visit `/liv-ai-app/settings` to paste an API key.
 *
 * Wire contract: reuses Phase 204's `provider.config.*` tRPC namespace
 * verbatim — `list` returns redacted `{provider, preview, addedAt}` rows
 * (INV-204-04 redact-on-read); `set` writes raw key to Redis +
 * triggers gateway env-file regeneration + `sudo systemctl restart
 * liv-claw-gateway`; `delete` removes the row + restarts. The raw key
 * NEVER crosses the read path.
 *
 * Simpler than Phase 204's `ProvidersTab` in liv-ai-app:
 *   - No 30s health poll banner (operator can refresh manually if needed).
 *   - Single inline status message (Saved / Save failed) per mutation.
 *   - Optimistic refetch on success; pessimistic stay-on-error otherwise.
 *
 * INV-204-02 — every visible string is English.
 * INV-204-04 — raw key NEVER displayed; preview only.
 */

import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { callMutation, callQuery } from "@/lib/livinityd-client";

/**
 * Locked provider enum — mirrors `livinityd/source/modules/provider/key-store.ts`
 * `PROVIDER_ENUM`. Adding a 7th provider = source edit there + this list.
 */
const PROVIDER_NAMES = ["xai", "anthropic", "openai", "groq", "mistral", "ollama"] as const;
type ProviderName = (typeof PROVIDER_NAMES)[number];

const PROVIDER_LABELS: Record<ProviderName, string> = {
  xai: "xAI (Grok)",
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  groq: "Groq",
  mistral: "Mistral",
  ollama: "Ollama (local)",
};

interface ProviderRow {
  provider: ProviderName;
  preview: string;
  addedAt: string;
}

type SetResult = {
  ok: boolean;
  envFilePath?: string;
  restartTriggered?: boolean;
  restartReason?: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; restarted: boolean }
  | { kind: "deleting"; provider: ProviderName }
  | { kind: "deleted" }
  | { kind: "error"; message: string };

export function ProvidersTab() {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<ProviderName | "">("");
  const [pendingKey, setPendingKey] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const refetch = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const list = await callQuery<undefined, ProviderRow[]>("provider.config.list");
      setRows(list ?? []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const availableProviders = useMemo<ProviderName[]>(() => {
    const configured = new Set(rows.map((r) => r.provider));
    return PROVIDER_NAMES.filter((p) => !configured.has(p));
  }, [rows]);

  // Initial / re-sync of the dropdown selection.
  useEffect(() => {
    if (!pendingProvider && availableProviders.length > 0) {
      setPendingProvider(availableProviders[0] ?? "");
    } else if (pendingProvider && !availableProviders.includes(pendingProvider)) {
      setPendingProvider(availableProviders[0] ?? "");
      setPendingKey("");
    }
  }, [availableProviders, pendingProvider]);

  const handleSave = useCallback(async () => {
    if (!pendingProvider) {
      setStatus({ kind: "error", message: "Pick a provider." });
      return;
    }
    const trimmed = pendingKey.trim();
    if (trimmed.length < 8) {
      setStatus({ kind: "error", message: "Key must be at least 8 characters." });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const res = await callMutation<
        { provider: ProviderName; key: string },
        SetResult
      >("provider.config.set", { provider: pendingProvider, key: trimmed });
      setPendingKey("");
      setStatus({ kind: "saved", restarted: res.restartTriggered === true });
      await refetch();
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [pendingProvider, pendingKey, refetch]);

  const handleDelete = useCallback(
    async (provider: ProviderName) => {
      setStatus({ kind: "deleting", provider });
      try {
        await callMutation<{ provider: ProviderName }, { ok: boolean }>(
          "provider.config.delete",
          { provider },
        );
        setStatus({ kind: "deleted" });
        await refetch();
      } catch (err) {
        setStatus({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [refetch],
  );

  return (
    <div className="space-y-l p-l">
      {/* Header */}
      <div className="space-y-xs">
        <div className="flex items-center gap-s">
          <KeyRound size={16} className="text-text-neutral-tertiary" />
          <h2 className="text-md font-medium text-text-neutral-primary">
            LLM Provider Keys ({rows.length})
          </h2>
        </div>
        <p className="text-sm text-text-neutral-tertiary">
          Paste your API key for any of the supported providers. Keys are
          stored on this server (single-user trust model) and pushed to the
          gateway env file on every save. Adding or removing a key triggers
          a gateway restart automatically.
        </p>
      </div>

      {/* Status message — single source of truth, replaces banners. */}
      {status.kind === "error" && (
        <StatusBanner
          tone="danger"
          icon={AlertTriangle}
          message={status.message}
        />
      )}
      {status.kind === "saved" && (
        <StatusBanner
          tone="success"
          icon={CheckCircle2}
          message={
            status.restarted
              ? "Saved. Gateway is restarting — give it a moment."
              : "Saved to Redis. Gateway restart did not fire — keys may not be picked up until next manual restart."
          }
        />
      )}
      {status.kind === "deleted" && (
        <StatusBanner
          tone="success"
          icon={CheckCircle2}
          message="Removed. Gateway is restarting."
        />
      )}

      {/* Configured providers list */}
      {loading ? (
        <p className="flex items-center gap-xs text-sm text-text-neutral-tertiary">
          <Loader2 size={14} className="animate-spin" />
          Loading providers…
        </p>
      ) : listError ? (
        <StatusBanner tone="danger" icon={AlertTriangle} message={listError} />
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-default/60 bg-sunk-light/30 p-l text-center text-sm text-text-neutral-tertiary dark:bg-elevated/30">
          No provider keys configured yet. Add one below to enable LLM
          inference for the agent.
        </div>
      ) : (
        <ul className="space-y-xs">
          {rows.map((row) => (
            <li
              key={row.provider}
              className="flex items-center justify-between gap-m rounded-md border border-border-default/40 bg-sunk-light/30 px-m py-s dark:bg-elevated/30"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-xs">
                  <span className="text-sm font-medium text-text-neutral-primary">
                    {PROVIDER_LABELS[row.provider]}
                  </span>
                  <span className="font-mono text-xs text-text-neutral-tertiary">
                    {row.preview}
                  </span>
                </div>
                <p className="text-xs text-text-neutral-tertiary">
                  Added {new Date(row.addedAt).toLocaleString()}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleDelete(row.provider)}
                disabled={
                  status.kind === "deleting" && status.provider === row.provider
                }
                title="Remove this provider key"
              >
                {status.kind === "deleting" && status.provider === row.provider ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Trash2 size={12} />
                )}
                <span className="ml-xs">Remove</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Add form */}
      <div className="space-y-m rounded-md border border-border-default/40 bg-background p-l dark:border-border-default/16 dark:bg-foreground/40">
        <div>
          <h3 className="text-sm font-medium text-text-neutral-primary">
            Add a provider
          </h3>
          <p className="text-xs text-text-neutral-tertiary">
            Pick the provider, paste the API key, and save. Keys are stored
            in plaintext on this server — single-user trust model.
          </p>
        </div>

        {availableProviders.length === 0 ? (
          <p className="text-sm text-text-neutral-tertiary">
            All supported providers are already configured. Remove one above
            to add a different key, or paste a new key to overwrite an
            existing one by removing it first.
          </p>
        ) : (
          <>
            <div className="space-y-xs">
              <label
                htmlFor="provider-select"
                className="text-xs font-medium text-text-neutral-secondary"
              >
                Provider
              </label>
              <select
                id="provider-select"
                value={pendingProvider}
                onChange={(e) =>
                  setPendingProvider(e.target.value as ProviderName | "")
                }
                disabled={status.kind === "saving"}
                className="w-full rounded-md border border-border-default bg-background px-m py-s text-sm text-text-neutral-primary outline-none focus:border-border-interactive-emphasis disabled:opacity-60 dark:border-border-default/16 dark:bg-foreground"
              >
                {availableProviders.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-xs">
              <label
                htmlFor="provider-key"
                className="text-xs font-medium text-text-neutral-secondary"
              >
                API key
              </label>
              <input
                id="provider-key"
                type="password"
                value={pendingKey}
                onChange={(e) => setPendingKey(e.target.value)}
                disabled={status.kind === "saving"}
                placeholder="Paste your key here (sk-…, xai-…, gsk_…, etc.)"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-md border border-border-default bg-background px-m py-s font-mono text-sm text-text-neutral-primary outline-none focus:border-border-interactive-emphasis disabled:opacity-60 dark:border-border-default/16 dark:bg-foreground"
              />
              <p className="text-xs text-text-neutral-tertiary">
                The key is sent over HTTPS to livinityd and written to{" "}
                <code className="rounded bg-sunk-light px-3xs font-mono dark:bg-elevated">
                  /opt/livos/etc/liv-claw-gateway.env
                </code>{" "}
                (chmod 0600). Never displayed back — only a redacted preview.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="md"
                onClick={handleSave}
                disabled={status.kind === "saving" || !pendingProvider || pendingKey.length < 8}
              >
                {status.kind === "saving" ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    <span className="ml-xs">Saving…</span>
                  </>
                ) : (
                  <span>Save key</span>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBanner({
  tone,
  icon: Icon,
  message,
}: {
  tone: "success" | "danger";
  icon: typeof CheckCircle2;
  message: string;
}) {
  const styles =
    tone === "success"
      ? "border-border-success/40 bg-success-background text-text-success-primary"
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
