"use client";

/**
 * Phase 205 Hot-fix O — Providers tab redesigned as per-provider cards.
 *
 * Replaces the Hot-fix M provider-dropdown + paste form (operator UAT 2026-
 * 05-24: "inputlar açılan dropbox'larda kötü") with a deterministic list:
 * one card per supported provider, each independently configurable.
 *
 * Per-provider configuration paths (verified — no invented OAuth surfaces):
 *
 *   xAI         — OAuth device-code (existing `auth.xai.*` router from
 *                 Phase 195-03; `opencode auth login -p xai -m "xAI Grok
 *                 OAuth (Headless / Remote / VPS)"` spawned server-side) OR
 *                 API-key paste fallback (`provider.config.set`).
 *   Anthropic   — API key only. opencode does NOT expose an Anthropic
 *                 OAuth flow we can reuse; the broker subscription path
 *                 (memory ref `reference_anthropic_subscription_state`) is
 *                 separately wired in `claude.ts` and not surfaced here.
 *   OpenAI      — API key only. opencode CLI surface for ChatGPT/Codex
 *                 sign-in is not currently bridged in livinityd; not
 *                 inventing one.
 *   Groq        — API key only.
 *   Mistral     — API key only.
 *   Ollama      — API key (or any token-like string — local Ollama
 *                 typically ignores it but the gateway env file still
 *                 needs a value).
 *
 * Wire contract:
 *   - `provider.config.list`   → ProviderRow[] (redacted preview)
 *   - `provider.config.set`    → triggers gateway env-file regen + restart
 *   - `provider.config.delete` → ditto
 *   - `auth.xai.start`         → {flowId, url, startedAt}
 *   - `auth.xai.status`        → {connected, tier?, expiresAt?, ...}
 *   - `auth.xai.disconnect`    → {ok: true}
 *
 * UX rules locked with operator on 2026-05-24:
 *   - No central "add provider" form. Each provider's input is rendered
 *     inline inside its own card.
 *   - xAI OAuth happens IN-CARD. Start → render URL panel + copy button +
 *     spinner; poll `auth.xai.status` every 2s; on `connected:true` collapse
 *     panel and refresh the card. Cancel just collapses; server-side flow
 *     lifetime (10 min) covers cleanup.
 *
 * INV-204-02 — every visible string is English.
 * INV-204-04 — raw key NEVER displayed; preview only.
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
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { callMutation, callQuery } from "@/lib/livinityd-client";

// ────────────────────────────────────────────────────────────────────────────
// Provider catalog
// ────────────────────────────────────────────────────────────────────────────

const PROVIDER_NAMES = ["xai", "anthropic", "openai", "groq", "mistral", "ollama"] as const;
type ProviderName = (typeof PROVIDER_NAMES)[number];

interface ProviderMeta {
  label: string;
  /** Hint text shown above the API-key input. */
  hint: string;
  /** Whether this provider exposes an OAuth flow we can drive from livinityd. */
  hasOAuth: boolean;
}

const PROVIDER_META: Record<ProviderName, ProviderMeta> = {
  xai: {
    label: "xAI (Grok)",
    hint: "Paste an xAI API key (xai-…) or sign in with your xAI account below.",
    hasOAuth: true,
  },
  anthropic: {
    label: "Anthropic (Claude)",
    hint: "Paste your Anthropic API key (sk-ant-…). Subscription-based sign-in is not currently supported here.",
    hasOAuth: false,
  },
  openai: {
    label: "OpenAI (GPT)",
    hint: "Paste your OpenAI API key (sk-…). ChatGPT/Codex sign-in is not currently supported here.",
    hasOAuth: false,
  },
  groq: {
    label: "Groq",
    hint: "Paste your Groq API key (gsk_…).",
    hasOAuth: false,
  },
  mistral: {
    label: "Mistral",
    hint: "Paste your Mistral API key.",
    hasOAuth: false,
  },
  ollama: {
    label: "Ollama (local)",
    hint: "Paste any non-empty token. Local Ollama typically ignores it but the gateway env file requires a value.",
    hasOAuth: false,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Wire types
// ────────────────────────────────────────────────────────────────────────────

interface ProviderRow {
  provider: ProviderName;
  preview: string;
  addedAt: string;
}

interface SetResult {
  ok: boolean;
  envFilePath?: string;
  restartTriggered?: boolean;
  restartReason?: string;
}

interface XaiStatus {
  connected: boolean;
  tier?: number;
  scopes?: string[];
  expiresAt?: number;
  principalId?: string;
  teamId?: string;
  lastRefreshAt?: number;
}

interface XaiStartResult {
  flowId: string;
  url: string;
  startedAt: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export function ProvidersTab() {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [xaiStatus, setXaiStatus] = useState<XaiStatus | null>(null);
  const [xaiStatusError, setXaiStatusError] = useState<string | null>(null);

  const refetchKeys = useCallback(async () => {
    try {
      const list = await callQuery<undefined, ProviderRow[]>("provider.config.list");
      setRows(Array.isArray(list) ? list : []);
      setListError(null);
    } catch (err) {
      setRows([]);
      setListError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refetchXaiStatus = useCallback(async () => {
    try {
      const status = await callQuery<undefined, XaiStatus>("auth.xai.status");
      setXaiStatus(status ?? { connected: false });
      setXaiStatusError(null);
    } catch (err) {
      // Status never throws server-side; if it does here it's an
      // auth/network problem. Show as not-connected — the card UI still
      // works (the operator can still paste an API key).
      setXaiStatus({ connected: false });
      setXaiStatusError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void Promise.all([refetchKeys(), refetchXaiStatus()]).finally(() => {
      setLoading(false);
    });
  }, [refetchKeys, refetchXaiStatus]);

  const keyByProvider = new Map(rows.map((r) => [r.provider, r] as const));

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
          Configure how Liv AI authenticates to each LLM provider. xAI also
          supports signing in with an xAI account — the rest are API-key
          only. Saving or removing a key triggers a gateway restart so
          changes take effect automatically.
        </p>
      </div>

      {listError ? (
        <StatusBanner
          tone="danger"
          icon={AlertTriangle}
          message={`Couldn't load configured keys: ${listError}`}
        />
      ) : null}

      {loading ? (
        <p className="flex items-center gap-xs text-sm text-text-neutral-tertiary">
          <Loader2 size={14} className="animate-spin" />
          Loading providers…
        </p>
      ) : (
        <ul className="space-y-m">
          {PROVIDER_NAMES.map((p) => (
            <li key={p}>
              <ProviderCard
                provider={p}
                meta={PROVIDER_META[p]}
                row={keyByProvider.get(p) ?? null}
                xaiStatus={p === "xai" ? xaiStatus : null}
                xaiStatusError={p === "xai" ? xaiStatusError : null}
                onKeysChanged={refetchKeys}
                onXaiStatusChanged={refetchXaiStatus}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ProviderCard — one row in the providers list
// ────────────────────────────────────────────────────────────────────────────

interface CardProps {
  provider: ProviderName;
  meta: ProviderMeta;
  row: ProviderRow | null;
  xaiStatus: XaiStatus | null;
  xaiStatusError: string | null;
  onKeysChanged: () => Promise<void>;
  onXaiStatusChanged: () => Promise<void>;
}

function ProviderCard({
  provider,
  meta,
  row,
  xaiStatus,
  xaiStatusError,
  onKeysChanged,
  onXaiStatusChanged,
}: CardProps) {
  const [pendingKey, setPendingKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardNotice, setCardNotice] = useState<string | null>(null);

  // xAI OAuth flow state
  const [oauthFlow, setOauthFlow] = useState<XaiStartResult | null>(null);
  const [oauthStarting, setOauthStarting] = useState(false);
  const [oauthCopied, setOauthCopied] = useState(false);
  const [oauthDisconnecting, setOauthDisconnecting] = useState(false);
  const pollTimerRef = useRef<number | null>(null);

  // Reset transient banners whenever the configured-key state changes.
  useEffect(() => {
    setCardError(null);
    setCardNotice(null);
  }, [row?.preview, row?.addedAt]);

  // Poll xAI status while an OAuth flow is in progress.
  useEffect(() => {
    if (provider !== "xai" || !oauthFlow) return;
    let cancelled = false;
    const tick = async () => {
      await onXaiStatusChanged();
      if (cancelled) return;
      // Re-check via current props on next render — the poll is driven by
      // ProvidersTab refetching; we just keep firing every 2s until the
      // operator cancels OR the status flips to connected (handled below).
      pollTimerRef.current = window.setTimeout(tick, 2000);
    };
    pollTimerRef.current = window.setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [provider, oauthFlow, onXaiStatusChanged]);

  // Auto-close the OAuth panel once xAI reports connected.
  useEffect(() => {
    if (oauthFlow && xaiStatus?.connected) {
      setOauthFlow(null);
      setOauthCopied(false);
      setCardNotice("xAI account connected.");
    }
  }, [oauthFlow, xaiStatus?.connected]);

  const handleSaveKey = useCallback(async () => {
    const trimmed = pendingKey.trim();
    if (trimmed.length < 8) {
      setCardError("Key must be at least 8 characters.");
      return;
    }
    setCardError(null);
    setCardNotice(null);
    setSaving(true);
    try {
      const res = await callMutation<
        { provider: ProviderName; key: string },
        SetResult
      >("provider.config.set", { provider, key: trimmed });
      setPendingKey("");
      setCardNotice(
        res.restartTriggered === true
          ? "Saved. Gateway is restarting."
          : "Saved. Gateway restart did not fire — manual restart may be needed.",
      );
      await onKeysChanged();
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [pendingKey, provider, onKeysChanged]);

  const handleRemoveKey = useCallback(async () => {
    setCardError(null);
    setCardNotice(null);
    setRemoving(true);
    try {
      await callMutation<{ provider: ProviderName }, { ok: boolean }>(
        "provider.config.delete",
        { provider },
      );
      setCardNotice("Key removed. Gateway is restarting.");
      await onKeysChanged();
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoving(false);
    }
  }, [provider, onKeysChanged]);

  // ── xAI OAuth handlers ──────────────────────────────────────────────────

  const handleStartOAuth = useCallback(async () => {
    setCardError(null);
    setCardNotice(null);
    setOauthStarting(true);
    try {
      const result = await callMutation<Record<string, never>, XaiStartResult>(
        "auth.xai.start",
        {} as Record<string, never>,
      );
      setOauthFlow(result);
      setOauthCopied(false);
    } catch (err) {
      setCardError(
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
      setCardError(
        err instanceof Error
          ? `Couldn't copy URL: ${err.message}`
          : "Couldn't copy URL.",
      );
    }
  }, [oauthFlow]);

  const handleDisconnectOAuth = useCallback(async () => {
    setCardError(null);
    setCardNotice(null);
    setOauthDisconnecting(true);
    try {
      await callMutation<Record<string, never>, { ok: boolean }>(
        "auth.xai.disconnect",
        {} as Record<string, never>,
      );
      setCardNotice("xAI account disconnected.");
      await onXaiStatusChanged();
    } catch (err) {
      setCardError(err instanceof Error ? err.message : String(err));
    } finally {
      setOauthDisconnecting(false);
    }
  }, [onXaiStatusChanged]);

  // ── Derived status badge ────────────────────────────────────────────────

  const isXai = provider === "xai";
  const hasApiKey = row !== null;
  const hasXaiOAuth = isXai && xaiStatus?.connected === true;
  const isConnected = hasApiKey || hasXaiOAuth;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="rounded-lg border border-border-default/40 bg-background p-m dark:border-border-default/16 dark:bg-foreground/30">
      {/* Header row */}
      <div className="flex items-start justify-between gap-m">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-s">
            <h3 className="text-sm font-medium text-text-neutral-primary">
              {meta.label}
            </h3>
            <StatusPill
              connected={isConnected}
              detail={
                hasXaiOAuth
                  ? "via xAI account"
                  : hasApiKey
                  ? "via API key"
                  : undefined
              }
            />
          </div>
          {hasXaiOAuth ? (
            <p className="mt-3xs text-xs text-text-neutral-tertiary">
              {[
                xaiStatus?.tier ? `Tier ${xaiStatus.tier}` : null,
                xaiStatus?.expiresAt
                  ? `Token expires ${new Date(xaiStatus.expiresAt).toLocaleString()}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Signed in with xAI."}
            </p>
          ) : null}
          {hasApiKey ? (
            <p className="mt-3xs font-mono text-xs text-text-neutral-tertiary">
              {row!.preview} · Added {new Date(row!.addedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      </div>

      {/* Banners */}
      {cardError ? (
        <div className="mt-s">
          <StatusBanner tone="danger" icon={AlertTriangle} message={cardError} />
        </div>
      ) : null}
      {cardNotice && !cardError ? (
        <div className="mt-s">
          <StatusBanner tone="success" icon={CheckCircle2} message={cardNotice} />
        </div>
      ) : null}
      {isXai && xaiStatusError ? (
        <div className="mt-s">
          <StatusBanner
            tone="danger"
            icon={AlertTriangle}
            message={`Couldn't read xAI status: ${xaiStatusError}`}
          />
        </div>
      ) : null}

      {/* xAI OAuth in-progress panel */}
      {isXai && oauthFlow ? (
        <div className="mt-m space-y-s rounded-md border border-border-default/60 bg-sunk-light/40 p-m dark:bg-elevated/30">
          <div>
            <p className="text-sm font-medium text-text-neutral-primary">
              Open this URL in any browser to sign in with your xAI account
            </p>
            <p className="mt-3xs text-xs text-text-neutral-tertiary">
              The URL can be opened on a different device — this is the
              standard xAI device-code flow. Sign-in usually completes within
              a minute. This panel will close automatically once you finish.
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
              onClick={() => window.open(oauthFlow.url, "_blank", "noopener,noreferrer")}
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

      {/* Action area — API-key form + (xAI only) Connect-with-account button */}
      {!oauthFlow ? (
        <div className="mt-m space-y-s">
          {/* API-key row */}
          <div className="space-y-xs">
            <label
              htmlFor={`provider-key-${provider}`}
              className="text-xs text-text-neutral-tertiary"
            >
              {meta.hint}
            </label>
            <div className="flex flex-wrap items-center gap-xs">
              <input
                id={`provider-key-${provider}`}
                type="password"
                value={pendingKey}
                onChange={(e) => setPendingKey(e.target.value)}
                disabled={saving}
                placeholder={hasApiKey ? "Paste a new key to replace" : "Paste API key"}
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
                  <span>{hasApiKey ? "Replace key" : "Save key"}</span>
                )}
              </Button>
              {hasApiKey ? (
                <Button
                  variant="tertiary"
                  size="md"
                  icon={Trash2}
                  onClick={handleRemoveKey}
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
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function StatusPill({ connected, detail }: { connected: boolean; detail?: string }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-3xs rounded-full bg-success-background px-xs py-3xs text-xs font-medium text-text-success-primary">
        <Check size={10} />
        {detail ? `Connected (${detail})` : "Connected"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-3xs rounded-full bg-sunk-light px-xs py-3xs text-xs font-medium text-text-neutral-tertiary dark:bg-elevated">
      Not connected
    </span>
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
