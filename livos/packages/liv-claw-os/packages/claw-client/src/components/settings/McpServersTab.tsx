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

import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { callMutation, callQuery } from "@/lib/livinityd-client";

/**
 * Built-in MCP catalog — Phase 205 Hot-fix L3.
 *
 * Source of truth (verified 2026-05-24 against the actual on-disk plugin
 * registrations — NOT guessed):
 *   - 9 luse_* tools registered by `luse-proxy.ts` (`registerLuseProxyTools`)
 *   - 11 tools registered by `builtin-proxy.ts` (`registerBuiltinProxyTools`),
 *     of which 8 overlap with luse_* and 3 are LivOS utilities
 *     (`weather`, `get_current_time`, `ui_render`).
 *
 * Total unique tools available to the agent without any user action: **12**
 * — 9 Luse (computer use, Bytebot fork per P100-10 rename D-100-10-B) + 3
 * LivOS utilities.
 *
 * Counts here MUST match those proxies. If you add/remove a tool there,
 * mirror it here. A future hardening pass should expose this via a
 * `mcp.builtin.list` tRPC query so the catalog is self-describing.
 */
type BuiltinToolDef = { name: string; label: string; destructive: boolean };

const LUSE_TOOLS: ReadonlyArray<BuiltinToolDef> = [
  { name: "luse_computer_screenshot", label: "Screenshot Desktop", destructive: false },
  { name: "luse_list_windows", label: "List Open Windows", destructive: false },
  { name: "luse_get_cursor_position", label: "Get Cursor Position", destructive: false },
  { name: "luse_computer_click_mouse", label: "Click Mouse", destructive: true },
  { name: "luse_computer_type_text", label: "Type Text", destructive: true },
  { name: "luse_computer_press_keys", label: "Press Keys", destructive: true },
  { name: "luse_computer_drag_mouse", label: "Drag Mouse", destructive: true },
  { name: "luse_computer_paste_text", label: "Paste Text", destructive: true },
  { name: "luse_computer_application", label: "Launch / Focus / Close App", destructive: true },
];

const LIVOS_TOOLS: ReadonlyArray<BuiltinToolDef> = [
  { name: "weather", label: "Weather", destructive: false },
  { name: "get_current_time", label: "Current Time", destructive: false },
  { name: "ui_render", label: "Render UI", destructive: false },
];

type BuiltinMcp = {
  id: string;
  name: string;
  category: string;
  origin: string;
  tools: ReadonlyArray<BuiltinToolDef>;
};

const BUILTIN_MCPS: ReadonlyArray<BuiltinMcp> = [
  {
    id: "luse",
    name: "luse",
    category: "computer use",
    origin: "Bytebot fork — LivOS computer-use MCP (livinityd:internal)",
    tools: LUSE_TOOLS,
  },
  {
    id: "livos-utilities",
    name: "livos-utilities",
    category: "built-in helpers",
    origin: "openclaw plugin — claw-plugin:builtin-proxy",
    tools: LIVOS_TOOLS,
  },
];

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

/**
 * Parse the Args textarea — one arg per line, blank lines skipped.
 * Phase 219 post-deploy 2026-05-26 fix.
 */
function parseArgsText(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Operator-rescue: if the operator typed the WHOLE command line
 * (e.g. `npx -y @modelcontextprotocol/server-git`) into the Command field
 * and left Args empty, split on whitespace so the first token is the binary
 * and the rest become args. Preserves the historical UX while routing the
 * stored shape through the spawn-compatible split.
 */
function splitCommandLine(commandRaw: string, argsRaw: string): {command: string; args?: string[]} {
  const explicitArgs = parseArgsText(argsRaw);
  const trimmed = commandRaw.trim();
  if (explicitArgs.length > 0) {
    return {command: trimmed, args: explicitArgs};
  }
  if (!trimmed.includes(" ")) {
    return {command: trimmed};
  }
  const parts = trimmed.split(/\s+/);
  return {command: parts[0]!, args: parts.slice(1)};
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
  /**
   * Phase 219 post-deploy 2026-05-26 fix — separate Args field. Operator quote:
   * "MCP ekleme sadece Filesystemda calisiyor!" — root cause: this dialog
   * never had an Args input, so operators who typed
   * `npx -y @modelcontextprotocol/server-git` into Command got persisted as
   * `{command: "npx -y @modelcontextprotocol/server-git", args: undefined}`.
   * spawn() then ENOENT'd because the entire string is interpreted as a
   * single binary path. Adding Args (one per line) + a Command-line splitter
   * fallback fixes the silent failure.
   */
  const [pendingArgs, setPendingArgs] = useState<string>("");
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
      // Phase 219 post-deploy 2026-05-26 fix — Args field + command-line
      // splitter so `npx -y @modelcontextprotocol/server-git` typed into the
      // Command field works without leaving operators stuck on silent
      // spawn-ENOENT failures.
      const split = splitCommandLine(cmd, pendingArgs);
      body.command = split.command;
      if (split.args && split.args.length > 0) body.args = split.args;
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
      setPendingArgs("");
      setPendingUrl("");
      setPendingEnv("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add MCP server");
    } finally {
      setSaving(false);
    }
  }, [pendingName, pendingTransport, pendingCommand, pendingArgs, pendingUrl, pendingEnv, refresh]);

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
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="space-y-xs">
        <h2 className="text-md font-medium text-text-neutral-primary">
          MCP Servers ({BUILTIN_MCPS.length + servers.length})
        </h2>
        <p className="text-sm text-text-neutral-tertiary">
          Tap an MCP to expand its tool list. Built-in MCPs are always on; add
          your own below to expose more tools to the agent. Changes take effect
          within ~10 seconds — no restart required.
        </p>
      </div>

      {/* ── Built-in MCPs (clickable accordion) ─────────────────────────── */}
      <ul className="space-y-xs">
        {BUILTIN_MCPS.map((mcp) => (
          <BuiltinMcpRow key={mcp.id} mcp={mcp} />
        ))}
      </ul>

      {/* ── External MCP header ─────────────────────────────────────────── */}
      <div className="space-y-xs">
        <h3 className="text-sm font-medium text-text-neutral-primary">
          External servers ({servers.length})
        </h3>
        <p className="text-sm text-text-neutral-tertiary">
          Connect 3rd-party MCP servers (Filesystem, GitHub, Postgres, …) by
          pointing claw-client at a local command or HTTP endpoint.
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
            <>
              <label className="space-y-xxs text-xs text-text-neutral-tertiary sm:col-span-2">
                <span>Command</span>
                <input
                  type="text"
                  value={pendingCommand}
                  onChange={(e) => setPendingCommand(e.target.value)}
                  placeholder="npx  (or paste full line: npx -y @modelcontextprotocol/server-git)"
                  className="w-full rounded-md border border-border-default/60 bg-background px-s py-xxs font-mono text-sm text-text-neutral-primary"
                  disabled={saving}
                />
              </label>
              <label className="space-y-xxs text-xs text-text-neutral-tertiary sm:col-span-2">
                <span>
                  Args <span className="text-text-neutral-tertiary/60">(one per line — leave empty if pasted into Command)</span>
                </span>
                <textarea
                  value={pendingArgs}
                  onChange={(e) => setPendingArgs(e.target.value)}
                  placeholder={"-y\n@modelcontextprotocol/server-git"}
                  rows={3}
                  className="w-full rounded-md border border-border-default/60 bg-background px-s py-xxs font-mono text-xs text-text-neutral-primary"
                  disabled={saving}
                />
              </label>
            </>
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

/**
 * Clickable row for a built-in MCP. Renders a header (name + meta) that
 * expands on click to show the full tool list with destructive markers.
 */
function BuiltinMcpRow({ mcp }: { mcp: BuiltinMcp }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  const destructiveCount = mcp.tools.filter((t) => t.destructive).length;

  return (
    <li className="rounded-md border border-border-default/40 bg-sunk-light/30 dark:bg-elevated/30">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-s px-m py-s text-left transition-colors hover:bg-sunk dark:hover:bg-elevated"
      >
        <div className="flex min-w-0 items-center gap-s">
          <Chevron size={16} className="shrink-0 text-text-neutral-tertiary" />
          <div className="min-w-0">
            <div className="flex items-baseline gap-xs">
              <span className="font-mono text-sm font-medium text-text-neutral-primary">
                {mcp.name}
              </span>
              <span className="text-xs text-text-neutral-tertiary">
                · {mcp.category}
              </span>
            </div>
            <p className="mt-3xs truncate text-xs text-text-neutral-tertiary">
              {mcp.origin}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-s">
          <span className="text-xs text-text-neutral-secondary">
            {mcp.tools.length} tool{mcp.tools.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-full bg-success-background px-xs py-3xs text-xs font-medium text-text-success-primary">
            active
          </span>
        </div>
      </button>
      {open && (
        <div className="border-t border-border-default/40 px-m py-s dark:border-border-default/16">
          <ul className="space-y-2xs">
            {mcp.tools.map((tool) => (
              <li
                key={tool.name}
                className="flex items-baseline justify-between gap-s text-sm"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-text-neutral-primary">{tool.name}</span>
                  <span className="ml-xs text-text-neutral-tertiary">— {tool.label}</span>
                </div>
                {tool.destructive ? (
                  <span
                    className="shrink-0 rounded-full bg-alert-background px-xs py-3xs text-xs font-medium text-text-alert-primary"
                    title="Requires operator approval before each invocation"
                  >
                    approval
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-text-neutral-tertiary">read-only</span>
                )}
              </li>
            ))}
          </ul>
          {destructiveCount > 0 && (
            <p className="mt-s text-xs text-text-neutral-tertiary">
              {destructiveCount} of {mcp.tools.length} tools are destructive and
              require your approval before each invocation (handled by the
              ApprovalManager — you&apos;ll see an in-chat prompt).
            </p>
          )}
        </div>
      )}
    </li>
  );
}
