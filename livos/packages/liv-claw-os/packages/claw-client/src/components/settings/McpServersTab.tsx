"use client";

/**
 * Phase 205-03 — MCP Servers tab.
 *
 * Surfaces the existing `mcp.config.*` tRPC namespace inside the claw-client
 * SettingsDialog. Three sub-flows:
 *
 *   1. List — `callQuery('mcp.config.list')` on mount; renders one row per
 *      server with the transport target and a redacted env-var preview
 *      (each value displayed as the literal `********`, never raw — Phase
 *      204 INV-204-04 carry-forward).
 *
 *   2. Add — small form (name + transport + command/url + env textarea +
 *      enabled flag) that calls `callMutation('mcp.config.add', body)`.
 *      Note: the router exports `add` not `set`/`upsert`; we MATCH the
 *      router per 205-03-PLAN action notes.
 *
 *   3. Delete — per-row Trash2 button calls
 *      `callMutation('mcp.config.delete', {name})`. The `luse` system MCP
 *      row hides the delete button (defense-in-depth — server also rejects
 *      with FORBIDDEN/SYSTEM_MCP).
 *
 * Live-reload contract: per SPEC R3, mutations propagate to running openclaw
 * agents within ~10s WITHOUT a `systemctl restart liv-claw-gateway`. This is
 * handled server-side in mcp-bridge.ts (Phase 205-03 Task 2 — subscribes to
 * the Redis pub channel `liv:mcp:updated` and reconciles its spawned-server
 * map). This tab simply refetches the list after each mutation and surfaces
 * the no-restart helper text.
 *
 * INV-203-09 preserved — the wire envelope is the bare non-batch
 * `{json: input}` flowing through `callMutation` (NOT the legacy batch
 * shape from liv-ai-app McpTab.tsx; that path is the production-broken
 * Phase 204-02 carry-over flagged in 205-01 SPIKE-NOTES).
 */

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { callMutation, callQuery } from "@/lib/livinityd-client";

/**
 * Mirrors `McpServerConfig` from
 * `livinityd/source/modules/server/trpc/mcp-config-router.ts`. We narrow to
 * the fields the tab renders/reads — the wire payload may carry more.
 */
interface McpEntry {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled: boolean;
  system: boolean;
}

interface AddBody {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled: boolean;
}

/**
 * Parse `KEY=value` newline-separated env textarea content into a
 * `Record<string, string>`. Blank lines and lines without `=` are skipped
 * silently. KEYs are trimmed; values are taken verbatim after the first `=`
 * so values may contain `=` (eg base64-padded tokens).
 */
function parseEnvText(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

export function McpServersTab() {
  const [servers, setServers] = useState<McpEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);

  const [pendingName, setPendingName] = useState<string>("");
  const [pendingTransport, setPendingTransport] = useState<"stdio" | "http">(
    "stdio",
  );
  const [pendingCommand, setPendingCommand] = useState<string>("");
  const [pendingUrl, setPendingUrl] = useState<string>("");
  const [pendingEnv, setPendingEnv] = useState<string>("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await callQuery<undefined, McpEntry[]>("mcp.config.list");
      setServers(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load MCP servers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAdd = useCallback(async () => {
    setError(null);
    const name = pendingName.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }
    const body: AddBody = {
      name,
      transport: pendingTransport,
      enabled: true,
    };
    if (pendingTransport === "stdio") {
      const cmd = pendingCommand.trim();
      if (!cmd) {
        setError("Command is required for stdio transport.");
        return;
      }
      body.command = cmd;
    } else {
      const url = pendingUrl.trim();
      if (!url) {
        setError("URL is required for http transport.");
        return;
      }
      body.url = url;
    }
    const env = parseEnvText(pendingEnv);
    if (Object.keys(env).length > 0) body.env = env;

    setSaving(true);
    try {
      await callMutation<AddBody, { ok: true }>("mcp.config.add", body);
      // Reset the form on success.
      setPendingName("");
      setPendingCommand("");
      setPendingUrl("");
      setPendingEnv("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add MCP server");
    } finally {
      setSaving(false);
    }
  }, [pendingName, pendingTransport, pendingCommand, pendingUrl, pendingEnv, refresh]);

  const onDelete = useCallback(
    async (name: string) => {
      setError(null);
      setDeletingName(name);
      try {
        await callMutation<{ name: string }, { ok: true }>("mcp.config.delete", {
          name,
        });
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete MCP server");
      } finally {
        setDeletingName(null);
      }
    },
    [refresh],
  );

  return (
    <div className="space-y-l p-m">
      {/* ── Built-in tools (always on) ─────────────────────────────────────
       *
       * Phase 205 Hot-fix L follow-up — operator UAT (2026-05-24) raised
       * the legitimate confusion that "MCP Servers (0)" implied the agent
       * had no tools. In fact Luse + 11 LivOS built-ins ship to the gateway
       * compile-time via plugin-rpc (Plan 203-06) and are always active.
       * They do NOT live in the `liv:mcp:configs` Redis hash, so they do
       * not surface in the External servers list below. This read-only
       * panel makes the architecture visible without muddying the contract.
       *
       * Counts are static — they are defined at compile time in
       * `liv-claw-os/packages/claw-plugin/src/luse-proxy.ts` (9 luse_*)
       * and `builtin-proxy.ts` (11 LivOS). If those change, update here.
       */}
      <div className="rounded-md border border-border-default/40 bg-sunk-light/30 p-m dark:bg-elevated/30">
        <div className="flex items-baseline justify-between gap-s">
          <h3 className="text-sm font-medium text-text-neutral-primary">
            Built-in tools <span className="text-text-neutral-tertiary">(always on)</span>
          </h3>
          <span className="text-xs text-text-success-primary">active</span>
        </div>
        <ul className="mt-s space-y-2xs text-sm text-text-neutral-secondary">
          <li>
            <span className="font-mono text-text-neutral-primary">luse</span>{" "}
            <span className="text-text-neutral-tertiary">— 9 tools (browser, file, talk-voice, canvas, …)</span>
          </li>
          <li>
            <span className="font-mono text-text-neutral-primary">livos-built-ins</span>{" "}
            <span className="text-text-neutral-tertiary">— 11 tools (weather, get_current_time, ui_render, …)</span>
          </li>
        </ul>
        <p className="mt-s text-xs text-text-neutral-tertiary">
          Built-in tools ship with LivOS and cannot be removed from this UI.
          Add external MCP servers below to expose more tools to the agent.
        </p>
      </div>

      {/* ── Header (external servers) ──────────────────────────────────── */}
      <div className="space-y-xs">
        <h2 className="text-md font-medium text-text-neutral-primary">
          External MCP Servers ({servers.length})
        </h2>
        <p className="text-sm text-text-neutral-tertiary">
          Add MCP servers to expose new tools to the agent. Changes take effect
          within ~10 seconds — no restart required.
        </p>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-border-danger/40 bg-danger-background px-s py-xs text-sm text-text-danger-primary"
        >
          {error}
        </div>
      ) : null}

      {/* ── List ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <p className="text-sm text-text-neutral-tertiary">Loading…</p>
      ) : servers.length === 0 ? (
        <p className="rounded-md border border-dashed border-border-default/60 px-s py-l text-center text-sm text-text-neutral-tertiary">
          No MCP servers configured.
        </p>
      ) : (
        <ul className="divide-y divide-border-default/60 rounded-md border border-border-default/60">
          {servers.map((s) => (
            <li
              key={s.name}
              className="flex items-start gap-s px-s py-s text-sm"
            >
              <div className="min-w-0 flex-1 space-y-xxs">
                <div className="flex items-center gap-xs">
                  <span className="font-medium text-text-neutral-primary">
                    {s.name}
                  </span>
                  <span className="rounded-sm bg-sunk-light px-xxs py-px text-xs uppercase tracking-wide text-text-neutral-tertiary">
                    {s.transport}
                  </span>
                  {s.system ? (
                    <span className="rounded-sm bg-info-background px-xxs py-px text-xs text-text-info-primary">
                      system
                    </span>
                  ) : null}
                </div>
                <p className="truncate font-mono text-xs text-text-neutral-tertiary">
                  {s.transport === "stdio"
                    ? `${s.command ?? "?"}${
                        s.args && s.args.length > 0 ? " " + s.args.join(" ") : ""
                      }`
                    : (s.url ?? "?")}
                </p>
                {s.env && Object.keys(s.env).length > 0 ? (
                  <ul className="space-y-xxs">
                    {Object.keys(s.env).map((k) => (
                      <li
                        key={k}
                        className="font-mono text-xs text-text-neutral-tertiary"
                      >
                        {k}=********
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {s.system ? null : (
                <button
                  type="button"
                  className="inline-flex items-center gap-xxs rounded-md border border-border-default/60 px-xs py-xxs text-xs text-text-danger-primary hover:bg-danger-background disabled:opacity-50"
                  onClick={() => onDelete(s.name)}
                  disabled={deletingName === s.name}
                  aria-label={`Delete ${s.name}`}
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Add form ─────────────────────────────────────────────────────── */}
      <div className="space-y-s rounded-md border border-border-default/60 p-s">
        <h3 className="text-sm font-medium text-text-neutral-primary">
          Add MCP Server
        </h3>
        <div className="grid grid-cols-1 gap-s sm:grid-cols-2">
          <label className="space-y-xxs text-xs text-text-neutral-tertiary">
            <span>Name</span>
            <input
              type="text"
              value={pendingName}
              onChange={(e) => setPendingName(e.target.value)}
              placeholder="my-server"
              className="w-full rounded-md border border-border-default/60 bg-background px-s py-xxs text-sm text-text-neutral-primary"
              disabled={saving}
            />
          </label>
          <label className="space-y-xxs text-xs text-text-neutral-tertiary">
            <span>Transport</span>
            <select
              value={pendingTransport}
              onChange={(e) =>
                setPendingTransport(e.target.value as "stdio" | "http")
              }
              className="w-full rounded-md border border-border-default/60 bg-background px-s py-xxs text-sm text-text-neutral-primary"
              disabled={saving}
            >
              <option value="stdio">stdio</option>
              <option value="http">http</option>
            </select>
          </label>
          {pendingTransport === "stdio" ? (
            <label className="space-y-xxs text-xs text-text-neutral-tertiary sm:col-span-2">
              <span>Command</span>
              <input
                type="text"
                value={pendingCommand}
                onChange={(e) => setPendingCommand(e.target.value)}
                placeholder="/usr/bin/my-mcp-server"
                className="w-full rounded-md border border-border-default/60 bg-background px-s py-xxs font-mono text-sm text-text-neutral-primary"
                disabled={saving}
              />
            </label>
          ) : (
            <label className="space-y-xxs text-xs text-text-neutral-tertiary sm:col-span-2">
              <span>URL</span>
              <input
                type="text"
                value={pendingUrl}
                onChange={(e) => setPendingUrl(e.target.value)}
                placeholder="https://example.com/mcp"
                className="w-full rounded-md border border-border-default/60 bg-background px-s py-xxs font-mono text-sm text-text-neutral-primary"
                disabled={saving}
              />
            </label>
          )}
          <label className="space-y-xxs text-xs text-text-neutral-tertiary sm:col-span-2">
            <span>Environment variables (KEY=value per line, values stored as secrets)</span>
            <textarea
              value={pendingEnv}
              onChange={(e) => setPendingEnv(e.target.value)}
              placeholder={"FOO=bar\nAPI_KEY=********"}
              rows={3}
              className="w-full rounded-md border border-border-default/60 bg-background px-s py-xxs font-mono text-xs text-text-neutral-primary"
              disabled={saving}
            />
          </label>
        </div>
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={onAdd}
            disabled={saving}
          >
            Add MCP Server
          </Button>
        </div>
      </div>
    </div>
  );
}
