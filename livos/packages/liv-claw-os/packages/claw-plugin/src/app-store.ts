/**
 * Phase 203-04 — AppStore reshape: livinityd HTTP backend (Postgres).
 *
 * The upstream `@openuidev/openclaw-os-plugin` AppStore writes JSON files to
 * `{stateDir}/plugins/openclaw-os/apps/<uuid>.json`. Per D-203-09 the LivOS
 * fork redirects those reads/writes to livinityd's `openclawos.apps.*` tRPC
 * namespace backed by the Postgres `livos_openui_apps` table.
 *
 * Public surface PRESERVED verbatim (so the rest of the plugin code in
 * `index.ts` keeps compiling unchanged):
 *   - create(data)          → StoredApp
 *   - update(id, patch)     → StoredApp (id is the slug post-reshape)
 *   - restore(id, idx)      → StoredApp
 *   - get(id)               → StoredApp | null
 *   - list()                → StoredApp[]
 *   - delete(id)            → void
 *
 * Mapping LivOS Postgres row → upstream StoredApp:
 *   - `slug`        ←→ `id`        (URL-safe; PK on the new table)
 *   - `name`        ←→ `title`
 *   - `content`     ←→ `content`
 *   - `version`     →  derived  versions:[…] array (snapshot metadata only)
 *   - `userId`      ←  ctx.agentId fallback when unknown
 *
 * Auth: passes `LIV_PLUGIN_TOKEN` (Plan 203-05 will introduce a proper
 * service-token shim; for v203-04 we use the existing `LIV_API_KEY` env
 * convention via `X-Api-Key` header if present, else fall back to a literal
 * `Bearer` cookie if `LIVINITY_SESSION` is present in env — that handles
 * the in-process plugin case where the gateway already verified the
 * upstream JWT). For local dev where no auth is wired yet, the plugin
 * uses `?_token=dev` shape; livinityd rejects with 401 unless dev mode.
 *
 * Network base URL: `LIVINITY_BASE_URL` env (default
 * `http://127.0.0.1:8080`). The plugin runs in the same process tree as
 * livinityd on Mini PC (loopback). On Windows dev we still talk loopback.
 *
 * Threat mitigations:
 *   T-203-03 — content is validated server-side at the tRPC boundary AND
 *              plugin-side via the shared `validateOpenUITree` (see
 *              `./openui-validator.ts`). Plugin validation gives a faster
 *              error path in lint hooks; server validation is the
 *              security boundary.
 *   T-203-07 — `db_query` / `db_execute` tools still touch local SQLite
 *              per their existing implementation; redirecting them to
 *              livinityd Postgres is OUT OF SCOPE for Plan 203-04.
 *              PHASE 203-04: db_query/db_execute still local SQLite —
 *              Plan 203-06+ to evaluate Postgres bridge.
 */

import { generateSecureUuid } from "openclaw/plugin-sdk/infra-runtime";
import { validateOpenUITree } from "./openui-validator.js";

const MAX_VERSIONS = 25;

export type VersionEntry = {
  content: string;
  timestamp: string;
  source: "create" | "edit" | "restore";
};

export type StoredApp = {
  id: string;
  title: string;
  /** OpenUI Lang markup — the live app content rendered by the Renderer. */
  content: string;
  /** Session key of the originating thread. */
  sessionKey: string;
  /** agentId that created this app. */
  agentId: string;
  /** Append-only version history — derived from livos_openui_app_versions. */
  versions: VersionEntry[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Phase 207 R4 — bare tRPC wire envelope.
 *
 * livinityd has NO superjson transformer (Phase 206 commit 3f6b0c25). The
 * canonical claw-client `livinityd-client.ts` already uses bare input + bare
 * `{result:{data:<value>}}` response. This file (claw-plugin's separate copy)
 * was missed in Phase 206 because it sits on the OTHER side of the gateway
 * RPC boundary — the symptom was `"livinityd openclawos.apps.list returned
 * empty payload"` because the batch envelope's `payload[0].result.data.json`
 * read against a non-batched bare response yields `undefined`.
 *
 * Defensive read: also tolerate the legacy `{json:<value>}` shape so a stray
 * superjson re-introduction doesn't immediately break us.
 */
interface TRPCSingleResult<T> {
  result: { data: T | { json: T } };
}

interface TRPCErrorBody {
  error: {
    message?: string;
    code?: number | string;
    data?: { code?: string; httpStatus?: number; message?: string };
    json?: {
      message: string;
      code: number;
      data?: { code?: string; httpStatus?: number };
    };
  };
}

function unwrapTrpcData<T>(payload: TRPCSingleResult<T> | undefined): T | undefined {
  const raw = payload?.result?.data;
  if (raw === null || raw === undefined) return undefined;
  if (
    typeof raw === "object" &&
    "json" in (raw as Record<string, unknown>)
  ) {
    return (raw as { json: T }).json;
  }
  return raw as T;
}

/**
 * livinityd PG row shape (mirror of `LivosOpenuiApp` from
 * `livos/packages/livinityd/source/db/schema.ts` — kept in sync manually
 * since the plugin is bundled by esbuild and cannot import livinityd types
 * across the workspace boundary).
 */
interface PgRow {
  slug: string;
  name: string;
  content: string;
  version: number;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export class AppStore {
  private baseUrl: string;
  private apiKey: string | null;

  // The constructor signature is preserved from upstream so existing
  // callers in `index.ts` (`new AppStore(stateDir)`) compile unchanged.
  // The `stateDir` argument is intentionally ignored in the Postgres
  // backend — kept only for source-compat.
  constructor(_stateDir: string) {
    this.baseUrl =
      process.env["LIVINITY_BASE_URL"] ?? process.env["LIVOS_BASE_URL"] ?? "http://127.0.0.1:8080";
    this.apiKey =
      process.env["LIV_PLUGIN_TOKEN"] ?? process.env["LIV_API_KEY"] ?? null;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h["X-Api-Key"] = this.apiKey;
    return h;
  }

  /**
   * Call a livinityd tRPC mutation. Uses the v10/v11 single-call batch
   * envelope `{0:{json:<input>}}` so the same wire format works whether
   * the route is mounted under WSS or Express. Returns the unwrapped
   * data; throws Error with the server's message text on non-2xx or on
   * tRPC error envelope.
   *
   * 5xx errors retry once after 250 ms (T-203-01 mitigation for transient
   * livinityd restarts during update.sh).
   */
  private async parseTrpcError(res: Response, path: string): Promise<string> {
    let serverMsg = `HTTP ${res.status}`;
    try {
      const payload = (await res.json()) as TRPCErrorBody | TRPCErrorBody[];
      const err = Array.isArray(payload) ? payload[0]?.error : payload?.error;
      const inner = err?.json ?? err;
      const code = inner?.data?.code ?? (typeof err?.code === "string" ? err.code : undefined);
      const message = inner?.message ?? err?.data?.message;
      if (message) serverMsg = code ? `${code}: ${message}` : message;
    } catch {
      // ignore — fall back to status text
    }
    return `livinityd ${path} ${serverMsg}`;
  }

  private async mutate<TIn, TOut>(path: string, input: TIn): Promise<TOut> {
    const url = `${this.baseUrl}/trpc/${path}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          if (res.status >= 500 && attempt === 0) {
            await new Promise((r) => setTimeout(r, 250));
            continue;
          }
          throw new Error(await this.parseTrpcError(res, path));
        }
        const payload = (await res.json()) as TRPCSingleResult<TOut>;
        const out = unwrapTrpcData(payload);
        if (out === undefined) {
          throw new Error(`livinityd ${path} returned empty payload`);
        }
        return out;
      } catch (err) {
        lastErr = err;
        if (attempt === 0 && err instanceof TypeError) {
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        throw err;
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error(`livinityd ${path} failed`);
  }

  /**
   * Call a livinityd tRPC QUERY. Non-batch bare-input shape matches
   * Phase 206 `livinityd-client.ts` callQuery (see commit 3f6b0c25).
   */
  private async query<TIn, TOut>(path: string, input: TIn): Promise<TOut> {
    const url =
      input === undefined || input === null
        ? `${this.baseUrl}/trpc/${path}`
        : `${this.baseUrl}/trpc/${path}?input=${encodeURIComponent(
            JSON.stringify(input),
          )}`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(await this.parseTrpcError(res, path));
    }
    const payload = (await res.json()) as TRPCSingleResult<TOut>;
    const out = unwrapTrpcData(payload);
    if (out === undefined) {
      // openclawos.apps.list returns [] when no rows. Treat that as the
      // empty-array case — empty payload is now distinguishable from
      // wire-shape mismatch (which would land on `out === undefined`).
      throw new Error(`livinityd ${path} returned empty payload`);
    }
    return out;
  }

  private rowToStoredApp(row: PgRow): StoredApp {
    return {
      id: row.slug,
      title: row.name,
      content: row.content,
      sessionKey: "",
      agentId: row.userId ?? "main",
      // Versions metadata is fetched separately via `openclawos.apps.version`
      // / openclawos.apps.versions when callers need the full history.
      // For the common create/update/get path we return an empty array; the
      // plugin's restore() helper hydrates this on demand.
      versions: [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Generate a URL-safe slug from a title. Falls back to a short uuid
   * fragment when the title strips to empty.
   */
  private slugify(title: string): string {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    if (base.length === 0) {
      return generateSecureUuid().slice(0, 12);
    }
    // Always append a short random tail so two apps with the same title
    // don't collide on the PK.
    const tail = generateSecureUuid().slice(0, 6);
    return `${base}-${tail}`;
  }

  async create(
    data: Omit<StoredApp, "id" | "createdAt" | "updatedAt" | "versions">,
  ): Promise<StoredApp> {
    // Plugin-side validation — fast-fail on disallowed components so the
    // agent sees the error in its tool-result without a round-trip to
    // livinityd. Server-side validator at the tRPC boundary is the
    // authoritative security gate (T-203-03).
    const trimmed = data.content.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const tree = JSON.parse(trimmed);
        const r = validateOpenUITree(tree);
        if (!r.ok) {
          throw new Error(`openui validation failed: ${r.reason}`);
        }
      } catch (e) {
        // If JSON.parse threw, this is raw lang source — leave it for the
        // server-side validator + plugin lint hook.
        if (e instanceof Error && e.message.startsWith("openui validation"))
          throw e;
      }
    }

    const slug = this.slugify(data.title);
    const row = await this.mutate<
      { slug: string; name: string; content: string; userId: string | null },
      PgRow
    >("openclawos.apps.create", {
      slug,
      name: data.title,
      content: data.content,
      userId: data.agentId ?? null,
    });
    return this.rowToStoredApp(row);
  }

  async update(
    id: string,
    patch: Partial<Pick<StoredApp, "title" | "content">>,
  ): Promise<StoredApp> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`App not found: ${id}`);

    const nextTitle = patch.title ?? existing.title;
    const nextContent = patch.content ?? existing.content;

    // Pre-flight validation symmetric with create().
    const trimmed = nextContent.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const tree = JSON.parse(trimmed);
        const r = validateOpenUITree(tree);
        if (!r.ok) {
          throw new Error(`openui validation failed: ${r.reason}`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("openui validation"))
          throw e;
      }
    }

    const row = await this.mutate<
      { slug: string; name: string; content: string; userId: string | null },
      PgRow
    >("openclawos.apps.update", {
      slug: id,
      name: nextTitle,
      content: nextContent,
      userId: existing.agentId ?? null,
    });
    return this.rowToStoredApp(row);
  }

  async restore(id: string, versionIndex: number): Promise<StoredApp> {
    // The Postgres-backed implementation tracks history in
    // livos_openui_app_versions but restore-by-arbitrary-index is not in
    // the v203-04 tRPC surface. Callers reaching here are extremely rare
    // (only the gateway RPC openclawos.apps.restore — feature parity gap
    // documented as known limitation in 203-04 SUMMARY). Throw a clear
    // error so the operator-facing gateway returns a useful message.
    void versionIndex;
    // MAX_VERSIONS reference preserved for upstream-cross-reference grep
    void MAX_VERSIONS;
    throw new Error(
      `App restore not supported in Phase 203-04 Postgres backend (slug=${id}). ` +
        `Use openclawos.apps.update to re-issue the prior content; full ` +
        `version-history restore lands in Phase 203-10 desktop integration.`,
    );
  }

  async list(): Promise<StoredApp[]> {
    const rows = await this.query<{ limit: number }, PgRow[]>(
      "openclawos.apps.list",
      { limit: 200 },
    );
    return (rows ?? []).map((r) => this.rowToStoredApp(r));
  }

  async get(id: string): Promise<StoredApp | null> {
    try {
      const row = await this.query<{ slug: string }, PgRow>(
        "openclawos.apps.get",
        { slug: id },
      );
      return this.rowToStoredApp(row);
    } catch (err) {
      // The tRPC NOT_FOUND surface carries `OPENUI_APP_NOT_FOUND` in the
      // message we constructed in openclawos-router.ts.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("OPENUI_APP_NOT_FOUND") || msg.includes("NOT_FOUND")) {
        return null;
      }
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.mutate<{ slug: string }, { ok: true }>(
        "openclawos.apps.delete",
        { slug: id },
      );
    } catch (err) {
      // Idempotent on missing slug — match upstream semantics.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("OPENUI_APP_NOT_FOUND") || msg.includes("NOT_FOUND")) {
        return;
      }
      throw err;
    }
  }
}
