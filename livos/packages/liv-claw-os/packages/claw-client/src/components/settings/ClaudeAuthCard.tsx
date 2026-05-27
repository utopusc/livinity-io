/**
 * Phase 221 T2 — Claude (subscription) Auth card.
 *
 * Operator quote 2026-05-27: "Claude Auth mod geri eklenmisti ya openclaw a
 * onu geri getirebilir misin? UI dan auth yapmak istiyorum."
 *
 * Renders inside ProvidersTab above the legacy provider grid. Calls the
 * `auth.claude.*` tRPC namespace (Phase 221 T1), which itself proxies to
 * liv-core's `/api/claude/*` Express endpoints. UX mirrors the xAI auth
 * pattern: status badge + "Authenticate with Claude" button → opens
 * claude.ai PKCE flow in a new tab → operator pastes the callback code
 * back into a textarea → Submit writes credentials to disk → the local
 * `claude` CLI immediately picks them up on next chat turn.
 *
 * Sacred SHA f3538e1d (sdk-agent-runner.ts) is NOT touched — once the
 * credentials file is on disk, the existing subscription path Just Works.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { callMutation, callQuery } from "@/lib/livinityd-client";

interface ClaudeAuthStatus {
  authenticated: boolean;
  method: string;
  provider: string;
}

interface ClaudeStartResult {
  url?: string;
  alreadyAuthenticated?: boolean;
  error?: string;
}

export function ClaudeAuthCard() {
  const [status, setStatus] = useState<ClaudeAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [oauthUrl, setOauthUrl] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await callQuery<undefined, ClaudeAuthStatus>(
        "auth.claude.status",
      );
      setStatus(s);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Failed to read Claude auth status",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleStart = useCallback(async () => {
    setStarting(true);
    setActionMsg(null);
    setActionErr(null);
    try {
      const res = await callMutation<Record<string, never>, ClaudeStartResult>(
        "auth.claude.startLogin",
        {},
      );
      if (res.error) {
        setActionErr(res.error);
        return;
      }
      if (res.alreadyAuthenticated) {
        setActionMsg("Already authenticated — refreshed.");
        await refresh();
        return;
      }
      if (res.url) {
        setOauthUrl(res.url);
        window.open(res.url, "_blank", "noopener,noreferrer");
        setActionMsg(
          "A new tab opened. Approve in claude.ai, then paste the code below.",
        );
      } else {
        setActionErr("Unexpected response — no URL returned.");
      }
    } catch (e) {
      setActionErr(
        e instanceof Error ? e.message : "Failed to start Claude login",
      );
    } finally {
      setStarting(false);
    }
  }, [refresh]);

  const handleSubmit = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setActionErr("Paste the authorization code first.");
      return;
    }
    setSubmitting(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await callMutation<
        { code: string },
        { success: boolean; error?: string }
      >("auth.claude.submitCode", { code: trimmed });
      if (!res.success) {
        setActionErr(res.error ?? "Code rejected.");
        return;
      }
      setActionMsg(
        "Claude authenticated. The CLI now has subscription credentials on disk.",
      );
      setCode("");
      setOauthUrl(null);
      await refresh();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Failed to submit code");
    } finally {
      setSubmitting(false);
    }
  }, [code, refresh]);

  const handleLogout = useCallback(async () => {
    if (
      !window.confirm(
        "Log out from Claude? The credentials file is deleted; you will need to authenticate again to use Claude.",
      )
    ) {
      return;
    }
    setLoggingOut(true);
    setActionMsg(null);
    setActionErr(null);
    try {
      await callMutation<Record<string, never>, { ok?: boolean }>(
        "auth.claude.logout",
        {},
      );
      setActionMsg("Logged out. Claude credentials cleared.");
      setOauthUrl(null);
      setCode("");
      await refresh();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Failed to log out");
    } finally {
      setLoggingOut(false);
    }
  }, [refresh]);

  return (
    <div className="space-y-s rounded-md border border-border-default/60 p-m">
      <div className="flex items-start justify-between gap-s">
        <div className="space-y-xxs">
          <div className="flex items-center gap-xs">
            <KeyRound size={14} className="text-text-neutral-tertiary" />
            <h3 className="text-sm font-medium text-text-neutral-primary">
              Claude (subscription)
            </h3>
            {loading ? (
              <span className="text-xs text-text-neutral-tertiary">
                Checking…
              </span>
            ) : status?.authenticated ? (
              <span className="rounded-sm bg-success-background px-xxs py-px text-xs text-text-success-primary">
                ✓ Authenticated
              </span>
            ) : (
              <span className="rounded-sm bg-sunk-light px-xxs py-px text-xs text-text-neutral-tertiary">
                Not authenticated
              </span>
            )}
          </div>
          <p className="text-xs text-text-neutral-tertiary">
            Anthropic Pro / Max OAuth login for the local{" "}
            <code className="font-mono">claude</code> CLI. Once authenticated,
            openclaw + the agent loop use your subscription instead of an API
            key. No restart required.
          </p>
        </div>
        {status?.authenticated ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "…" : "Log out"}
          </Button>
        ) : null}
      </div>

      {loadError ? (
        <p
          role="alert"
          className="rounded-md border border-border-danger/40 bg-danger-background px-s py-xxs text-xs text-text-danger-primary"
        >
          {loadError}
        </p>
      ) : null}
      {actionErr ? (
        <p
          role="alert"
          className="rounded-md border border-border-danger/40 bg-danger-background px-s py-xxs text-xs text-text-danger-primary"
        >
          {actionErr}
        </p>
      ) : null}
      {actionMsg ? (
        <p
          role="status"
          className="rounded-md border border-border-success/40 bg-success-background px-s py-xxs text-xs text-text-success-primary"
        >
          {actionMsg}
        </p>
      ) : null}

      {!loading && !status?.authenticated ? (
        <div className="space-y-s">
          <div className="flex items-center gap-s">
            <Button
              variant="primary"
              size="sm"
              onClick={handleStart}
              disabled={starting}
            >
              {starting ? "Starting…" : "Authenticate with Claude"}
            </Button>
            {oauthUrl ? (
              <a
                href={oauthUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-text-neutral-link underline"
              >
                Reopen authorize URL
              </a>
            ) : null}
          </div>
          {oauthUrl ? (
            <div className="space-y-xxs">
              <label className="text-xs text-text-neutral-tertiary">
                Authorization code (paste from claude.ai callback page)
              </label>
              <div className="flex items-center gap-s">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="paste code#state here"
                  className="flex-1 rounded-md border border-border-default/60 bg-background px-s py-xxs font-mono text-xs text-text-neutral-primary"
                  disabled={submitting}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitting || !code.trim()}
                >
                  {submitting ? "Submitting…" : "Submit"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
