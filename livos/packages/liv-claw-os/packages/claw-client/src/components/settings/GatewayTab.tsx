"use client";

/**
 * Phase 205-04 — Gateway tab.
 *
 * Three sections wired to the new `openclawos.gateway.*` tRPC namespace:
 *
 *   1. Paired Devices — list + per-row Revoke. The Revoke button on the
 *      current browser's row surfaces a friendly non-destructive error
 *      banner instead of removing the row (server-side self-lock guard via
 *      X-Claw-Device-Id header, per 205-01-SPIKE-NOTES § A1).
 *
 *   2. Allowed Origins — list + Add (URL input) + per-row Remove. Round-trips
 *      directly to `/opt/livos/data/openclaw/openclaw.json` via
 *      OpenclawConfigStore.patch — gateway live-reloads on file write
 *      (Probe A6 confirmed, no restart needed).
 *
 *   3. Authentication — auth.mode dropdown (`none`/`token`/`password`/
 *      `trusted-proxy` per the LIVE-PROBED enum, NOT the SPEC's
 *      'token'|'master' — corrected in Probe A6) + Rotate Token button.
 *      Token rotation displays a sticky one-time banner with the freshly-
 *      generated 64-hex-char token + Copy button (navigator.clipboard).
 *      After dismissal the token is gone for good (local state cleared).
 *
 * Caller-identity contract for the self-lock guard:
 *   The browser's deviceId comes from `getOrCreateDeviceIdentity()`
 *   (IndexedDB-cached sha256(publicKey)). We resolve it once on mount and
 *   attach it as `X-Claw-Device-Id` on the revoke fetch. Both standard
 *   helpers (callQuery / callMutation in lib/livinityd-client.ts) DO NOT
 *   accept extra headers, so the revoke path uses a direct fetch with the
 *   bare-non-batch envelope (mirroring callMutation's wire shape from 205-01
 *   AUTH PATH).
 *
 * English-only invariant (INV-203-05) preserved. CANNOT_REVOKE_SELF /
 * NO_CALLER_IDENTITY are wire-level codes; user-facing messages are friendly
 * English plain text per 205-CONTEXT.md specifics.
 */

import {
  AlertCircle,
  Check,
  Copy,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { getOrCreateDeviceIdentity } from "@/lib/gateway/device-identity";
import { callMutation, callQuery } from "@/lib/livinityd-client";

// ── Types matching openclawos-gateway-router.ts wire envelopes ──────────

interface PairedDeviceRow {
  deviceId: string;
  role: string | null;
  platform: string | null;
  clientId: string | null;
  createdAtMs: number | null;
  approvedAtMs: number | null;
}

interface DevicesListResponse {
  paired: PairedDeviceRow[];
  pending: Array<{ deviceId: string; requestId: string }>;
}

type AuthMode = "none" | "token" | "password" | "trusted-proxy";

interface AuthGetResponse {
  mode: AuthMode;
}

interface RotateTokenResponse {
  token: string;
  generatedAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function humanizeMs(ms: number | null): string {
  if (ms === null) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/**
 * Direct fetch helper for the devices.revoke mutation. The shared
 * callMutation in lib/livinityd-client.ts does not accept additional
 * headers, and the server-side self-lock guard REQUIRES the
 * `X-Claw-Device-Id` header to identify the caller (205-01-SPIKE-NOTES § A1
 * — JWT carries no deviceId/jti, so the header is the only authoritative
 * source). Replicates callMutation's wire envelope shape: bare non-batch
 * `{json: input}` POST body, non-batch (the legacy multi-call shape is the
 * production-broken carry-over from Phase 204-02 per spike). Auth: cookie path via
 * `credentials: 'include'` — the operator already holds a LIVINITY_SESSION
 * cookie when the SettingsDialog is mounted.
 */
async function revokeWithDeviceHeader(
  targetDeviceId: string,
  callerDeviceId: string,
): Promise<{ ok: true }> {
  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "";
  const res = await fetch(`${baseUrl}/trpc/openclawos.gateway.devices.revoke`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Claw-Device-Id": callerDeviceId,
    },
    // Phase 206 fix — bare envelope, no superjson wrap (matches livinityd-client.ts).
    body: JSON.stringify({ deviceId: targetDeviceId }),
  });
  const text = await res.text().catch(() => "");
  let env: {
    result?: { data?: { ok: true } | { json: { ok: true } } };
    error?: {
      message?: string;
      json?: { message?: string; code?: string };
      data?: { code?: string; message?: string };
    };
  } = {};
  try {
    env = JSON.parse(text);
  } catch {
    // fall through — non-JSON body
  }
  if (env.error) {
    const message =
      env.error.json?.message ??
      env.error.data?.message ??
      env.error.message ??
      `HTTP ${res.status}`;
    throw new Error(message);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const raw = env.result?.data;
  if (raw && typeof raw === "object" && "json" in (raw as Record<string, unknown>)) {
    return (raw as { json: { ok: true } }).json;
  }
  return (raw as { ok: true }) ?? { ok: true };
}

// ── Component ───────────────────────────────────────────────────────────

type BannerKind = "error" | "info" | "success";

interface Banner {
  kind: BannerKind;
  message: string;
}

export function GatewayTab() {
  // Caller identity (for X-Claw-Device-Id header on revoke)
  const [callerDeviceId, setCallerDeviceId] = useState<string | null>(null);

  // Section 1: Paired devices
  const [devices, setDevices] = useState<DevicesListResponse | null>(null);
  const [devicesLoading, setDevicesLoading] = useState<boolean>(true);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);

  // Section 2: Allowed origins
  const [origins, setOrigins] = useState<string[]>([]);
  const [originsLoading, setOriginsLoading] = useState<boolean>(true);
  const [pendingOrigin, setPendingOrigin] = useState<string>("");
  const [addingOrigin, setAddingOrigin] = useState<boolean>(false);
  const [removingOrigin, setRemovingOrigin] = useState<string | null>(null);

  // Section 3: Authentication
  const [authMode, setAuthMode] = useState<AuthMode>("token");
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [savingMode, setSavingMode] = useState<boolean>(false);
  const [rotating, setRotating] = useState<boolean>(false);
  const [newToken, setNewToken] = useState<{
    token: string;
    generatedAt: string;
  } | null>(null);
  const [tokenCopied, setTokenCopied] = useState<boolean>(false);

  // Banner (errors + transient info)
  const [banner, setBanner] = useState<Banner | null>(null);

  // ── Resolve caller deviceId once on mount ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ident = await getOrCreateDeviceIdentity();
        if (!cancelled) setCallerDeviceId(ident.deviceId);
      } catch {
        if (!cancelled) {
          setBanner({
            kind: "error",
            message:
              "Cannot verify your current session. Please reload and try again.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Refreshers ───────────────────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const out = await callQuery<undefined, DevicesListResponse>(
        "openclawos.gateway.devices.list",
      );
      // Phase 205 Hot-fix N — shape-validate before storing. If the tRPC
      // envelope ever leaks a non-array `paired` field, `devices.paired.map`
      // downstream crashes the entire route. Fall back to an empty shape
      // and surface the loader instead.
      const safe: DevicesListResponse = {
        paired: out && Array.isArray(out.paired) ? out.paired : [],
        pending: out && Array.isArray(out.pending) ? out.pending : [],
      };
      setDevices(safe);
    } catch (e) {
      setDevices({ paired: [], pending: [] });
      setBanner({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to load paired devices.",
      });
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  const refreshOrigins = useCallback(async () => {
    setOriginsLoading(true);
    try {
      const out = await callQuery<undefined, string[]>(
        "openclawos.gateway.origins.list",
      );
      setOrigins(Array.isArray(out) ? out : []);
    } catch (e) {
      setBanner({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to load allowed origins.",
      });
    } finally {
      setOriginsLoading(false);
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    setAuthLoading(true);
    try {
      const out = await callQuery<undefined, AuthGetResponse>(
        "openclawos.gateway.auth.get",
      );
      setAuthMode(out.mode);
    } catch (e) {
      setBanner({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to load auth state.",
      });
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
    void refreshOrigins();
    void refreshAuth();
  }, [refreshDevices, refreshOrigins, refreshAuth]);

  // ── Revoke handler with self-lock guard handling ─────────────────────
  const onRevoke = useCallback(
    async (deviceId: string) => {
      setBanner(null);
      if (!callerDeviceId) {
        setBanner({
          kind: "error",
          message:
            "Cannot verify your current session. Please reload and try again.",
        });
        return;
      }
      setRevokingDeviceId(deviceId);
      try {
        await revokeWithDeviceHeader(deviceId, callerDeviceId);
        await refreshDevices();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "CANNOT_REVOKE_SELF") {
          setBanner({
            kind: "error",
            message:
              "Cannot revoke the device you are currently signed in with.",
          });
        } else if (msg === "NO_CALLER_IDENTITY") {
          setBanner({
            kind: "error",
            message:
              "Cannot verify your current session. Please reload and try again.",
          });
        } else {
          setBanner({
            kind: "error",
            message: msg || "Failed to revoke device.",
          });
        }
      } finally {
        setRevokingDeviceId(null);
      }
    },
    [callerDeviceId, refreshDevices],
  );

  // ── Origins handlers ─────────────────────────────────────────────────
  const onAddOrigin = useCallback(async () => {
    setBanner(null);
    const origin = pendingOrigin.trim();
    if (!origin) {
      setBanner({ kind: "error", message: "Origin URL is required." });
      return;
    }
    if (!/^https?:\/\//i.test(origin)) {
      setBanner({
        kind: "error",
        message: "Origin must start with http:// or https://",
      });
      return;
    }
    setAddingOrigin(true);
    try {
      await callMutation<{ origin: string }, { ok: true }>(
        "openclawos.gateway.origins.add",
        { origin },
      );
      setPendingOrigin("");
      await refreshOrigins();
    } catch (e) {
      setBanner({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to add origin.",
      });
    } finally {
      setAddingOrigin(false);
    }
  }, [pendingOrigin, refreshOrigins]);

  const onRemoveOrigin = useCallback(
    async (origin: string) => {
      setBanner(null);
      setRemovingOrigin(origin);
      try {
        await callMutation<{ origin: string }, { ok: true }>(
          "openclawos.gateway.origins.remove",
          { origin },
        );
        await refreshOrigins();
      } catch (e) {
        setBanner({
          kind: "error",
          message: e instanceof Error ? e.message : "Failed to remove origin.",
        });
      } finally {
        setRemovingOrigin(null);
      }
    },
    [refreshOrigins],
  );

  // ── Auth handlers ────────────────────────────────────────────────────
  const onSaveMode = useCallback(
    async (mode: AuthMode) => {
      setBanner(null);
      setSavingMode(true);
      try {
        await callMutation<{ mode: AuthMode }, { ok: true }>(
          "openclawos.gateway.auth.setMode",
          { mode },
        );
        setAuthMode(mode);
        setBanner({
          kind: "info",
          message: `Auth mode changed to "${mode}". Existing devices may need to re-pair on next reconnect.`,
        });
      } catch (e) {
        setBanner({
          kind: "error",
          message: e instanceof Error ? e.message : "Failed to save auth mode.",
        });
      } finally {
        setSavingMode(false);
      }
    },
    [],
  );

  const onRotateToken = useCallback(async () => {
    setBanner(null);
    setRotating(true);
    try {
      const out = await callMutation<Record<string, never>, RotateTokenResponse>(
        "openclawos.gateway.auth.rotateToken",
        {} as Record<string, never>,
      );
      setNewToken(out);
      setTokenCopied(false);
    } catch (e) {
      setBanner({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to rotate token.",
      });
    } finally {
      setRotating(false);
    }
  }, []);

  const onCopyToken = useCallback(async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken.token);
      setTokenCopied(true);
      window.setTimeout(() => setTokenCopied(false), 2500);
    } catch (e) {
      setBanner({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to copy token to clipboard.",
      });
    }
  }, [newToken]);

  const onDismissToken = useCallback(() => {
    setNewToken(null);
    setTokenCopied(false);
  }, []);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-l p-m">
      {/* Banner */}
      {banner ? (
        <div
          role="alert"
          className={
            banner.kind === "error"
              ? "rounded-md border border-border-danger/40 bg-danger-background px-s py-xs text-sm text-text-danger-primary"
              : banner.kind === "info"
              ? "rounded-md border border-border-default/40 bg-info-background px-s py-xs text-sm text-text-info-primary"
              : "rounded-md border border-border-default/40 bg-sunk-light px-s py-xs text-sm text-text-neutral-primary"
          }
        >
          <div className="flex items-start gap-xs">
            <AlertCircle size={14} className="mt-px shrink-0" />
            <span>{banner.message}</span>
          </div>
        </div>
      ) : null}

      {/* Rotated-token sticky banner (one-time display) */}
      {newToken ? (
        <div
          role="status"
          className="space-y-s rounded-md border border-border-default bg-sunk-light p-s text-sm"
        >
          <div className="space-y-xxs">
            <h3 className="text-sm font-medium text-text-neutral-primary">
              New gateway token generated
            </h3>
            <p className="text-xs text-text-neutral-tertiary">
              Copy this token now. It will not be shown again. Existing devices
              must re-pair to use the new token.
            </p>
          </div>
          <pre className="overflow-x-auto rounded-sm border border-border-default/60 bg-background px-s py-xs font-mono text-xs text-text-neutral-primary">
            {newToken.token}
          </pre>
          <div className="flex items-center gap-xs">
            <Button variant="primary" size="sm" icon={Copy} onClick={onCopyToken}>
              {tokenCopied ? "Copied" : "Copy"}
            </Button>
            <Button variant="tertiary" size="sm" onClick={onDismissToken}>
              Dismiss
            </Button>
            {tokenCopied ? (
              <span className="inline-flex items-center gap-xxs text-xs text-text-info-primary">
                <Check size={12} />
                Token copied to clipboard
              </span>
            ) : null}
          </div>
          <p className="text-xs text-text-neutral-tertiary">
            Generated at {newToken.generatedAt}
          </p>
        </div>
      ) : null}

      {/* ── Section 1: Paired Devices ─────────────────────────────────── */}
      <section className="space-y-s">
        <div>
          <h2 className="text-md font-medium text-text-neutral-primary">
            Paired devices ({devices?.paired.length ?? 0})
          </h2>
          <p className="text-xs text-text-neutral-tertiary">
            Browsers and clients currently authorised against this gateway.
            Revoking a device forces it to re-pair on next connect.
          </p>
        </div>
        {devicesLoading ? (
          <p className="text-sm text-text-neutral-tertiary">Loading…</p>
        ) : !devices || devices.paired.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-default/60 px-s py-l text-center text-sm text-text-neutral-tertiary">
            No paired devices.
          </p>
        ) : (
          <ul className="divide-y divide-border-default/60 rounded-md border border-border-default/60">
            {devices.paired.map((row) => {
              const isSelf =
                callerDeviceId !== null && row.deviceId === callerDeviceId;
              return (
                <li
                  key={row.deviceId}
                  className="flex items-start gap-s px-s py-s text-sm"
                >
                  <div className="min-w-0 flex-1 space-y-xxs">
                    <div className="flex items-center gap-xs">
                      <span className="font-mono text-xs text-text-neutral-primary">
                        {row.deviceId.slice(0, 12)}…
                      </span>
                      {row.role ? (
                        <span className="rounded-sm bg-sunk-light px-xxs py-px text-xs uppercase tracking-wide text-text-neutral-tertiary">
                          {row.role}
                        </span>
                      ) : null}
                      {isSelf ? (
                        <span className="rounded-sm bg-info-background px-xxs py-px text-xs text-text-info-primary">
                          this device
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-text-neutral-tertiary">
                      {row.platform ?? "?"} · {row.clientId ?? "?"}
                    </p>
                    <p className="text-xs text-text-neutral-tertiary">
                      Approved {humanizeMs(row.approvedAtMs)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-xxs rounded-md border border-border-default/60 px-xs py-xxs text-xs text-text-danger-primary hover:bg-danger-background disabled:opacity-50"
                    onClick={() => onRevoke(row.deviceId)}
                    disabled={revokingDeviceId === row.deviceId}
                    aria-label={`Revoke device ${row.deviceId.slice(0, 12)}`}
                  >
                    <Trash2 size={12} />
                    {revokingDeviceId === row.deviceId ? "Revoking…" : "Revoke"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Section 2: Allowed Origins ────────────────────────────────── */}
      <section className="space-y-s">
        <div>
          <h2 className="text-md font-medium text-text-neutral-primary">
            Allowed origins ({origins.length})
          </h2>
          <p className="text-xs text-text-neutral-tertiary">
            Browser origins permitted to call the openclaw gateway. Changes
            take effect on the next gateway request (no restart needed).
          </p>
        </div>
        {originsLoading ? (
          <p className="text-sm text-text-neutral-tertiary">Loading…</p>
        ) : origins.length === 0 ? (
          <p className="rounded-md border border-dashed border-border-default/60 px-s py-l text-center text-sm text-text-neutral-tertiary">
            No allowed origins configured.
          </p>
        ) : (
          <ul className="divide-y divide-border-default/60 rounded-md border border-border-default/60">
            {origins.map((origin) => (
              <li
                key={origin}
                className="flex items-center gap-s px-s py-s text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-text-neutral-primary">
                  {origin}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-xxs rounded-md border border-border-default/60 px-xs py-xxs text-xs text-text-danger-primary hover:bg-danger-background disabled:opacity-50"
                  onClick={() => onRemoveOrigin(origin)}
                  disabled={removingOrigin === origin}
                  aria-label={`Remove ${origin}`}
                >
                  <Trash2 size={12} />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-xs">
          <input
            type="text"
            value={pendingOrigin}
            onChange={(e) => setPendingOrigin(e.target.value)}
            placeholder="https://example.com"
            className="min-w-0 flex-1 rounded-md border border-border-default/60 bg-background px-s py-xxs font-mono text-xs text-text-neutral-primary"
            disabled={addingOrigin}
          />
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={onAddOrigin}
            disabled={addingOrigin}
          >
            Add Origin
          </Button>
        </div>
      </section>

      {/* ── Section 3: Authentication ─────────────────────────────────── */}
      <section className="space-y-s">
        <div>
          <h2 className="text-md font-medium text-text-neutral-primary">
            Authentication
          </h2>
          <p className="text-xs text-text-neutral-tertiary">
            Gateway authentication mode and master token. Rotating the token
            forces all existing devices to re-pair.
          </p>
        </div>
        {authLoading ? (
          <p className="text-sm text-text-neutral-tertiary">Loading…</p>
        ) : (
          <div className="space-y-s">
            <label className="block space-y-xxs text-xs text-text-neutral-tertiary">
              <span>Auth mode</span>
              <select
                value={authMode}
                onChange={(e) => {
                  void onSaveMode(e.target.value as AuthMode);
                }}
                className="w-full max-w-xs rounded-md border border-border-default/60 bg-background px-s py-xxs text-sm text-text-neutral-primary"
                disabled={savingMode}
              >
                <option value="none">none</option>
                <option value="token">token</option>
                <option value="password">password</option>
                <option value="trusted-proxy">trusted-proxy</option>
              </select>
            </label>
            <div>
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={onRotateToken}
                disabled={rotating}
              >
                {rotating ? "Rotating…" : "Rotate Token"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
