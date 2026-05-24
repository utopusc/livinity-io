/**
 * Phase 204-02 — `useProviders` hook.
 *
 * Native-fetch tRPC wrapper for the /settings → Providers tab. Returns the
 * currently-configured provider rows (redacted) plus mutation helpers for
 * Save + Delete + a status check used by the restart banner.
 *
 * Pattern follows `use-mcp-servers.ts` (Phase 202-07) byte-for-byte for the
 * unwrap helpers + focus-refetch lifecycle.
 *
 * INV-204-04 — server-side guarantees the raw key never crosses the wire;
 * this hook handles only `ProviderRow` shapes.
 * INV-204-02 — every string the hook emits is English.
 */

"use client";

import {useCallback, useEffect, useRef, useState} from "react";

// ── Types ───────────────────────────────────────────────────────────────

export type ProviderName =
	| "xai"
	| "anthropic"
	| "openai"
	| "groq"
	| "mistral"
	| "ollama";

export const PROVIDER_NAMES: readonly ProviderName[] = [
	"xai",
	"anthropic",
	"openai",
	"groq",
	"mistral",
	"ollama",
] as const;

/** Provider display labels — used by the dropdown. */
export const PROVIDER_LABELS: Record<ProviderName, string> = {
	xai: "xAI (Grok)",
	anthropic: "Anthropic (Claude)",
	openai: "OpenAI (GPT)",
	groq: "Groq",
	mistral: "Mistral",
	ollama: "Ollama (local)",
};

/**
 * Redacted public row shape mirrored from
 * `livos/packages/livinityd/source/modules/provider/key-store.ts`.
 */
export interface ProviderRow {
	provider: ProviderName;
	preview: string;
	addedAt: string;
}

export interface ProviderMutationResult {
	ok: boolean;
	envFilePath?: string;
	restartTriggered?: boolean;
	restartRequired?: boolean;
	restartReason?: string;
	error?: string;
}

// ── Fetch wrappers ──────────────────────────────────────────────────────

const PROVIDER_LIST_QS =
	"batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%7D";

interface BatchResult<T> {
	result?: {data?: T | {json?: T}};
	error?: {json?: {message?: string}; message?: string};
}

function unwrapBatch<T>(entry: BatchResult<T> | undefined): T | null {
	if (!entry) return null;
	const direct = entry.result?.data;
	if (
		Array.isArray(direct) ||
		(direct && typeof direct === "object" && !("json" in direct))
	) {
		return direct as T;
	}
	const wrapped = (entry.result?.data as {json?: T} | undefined)?.json;
	if (wrapped !== undefined) return wrapped;
	return (direct as T) ?? null;
}

function readBatchError(entry: BatchResult<unknown> | undefined): string | null {
	if (!entry?.error) return null;
	return entry.error.json?.message ?? entry.error.message ?? "Unknown error";
}

async function fetchProviders(): Promise<{
	providers: ProviderRow[];
	error: string | null;
}> {
	try {
		const res = await fetch(`/trpc/provider.config.list?${PROVIDER_LIST_QS}`, {
			credentials: "include",
		});
		if (!res.ok) {
			return {
				providers: [],
				error: `Failed to load providers (HTTP ${res.status})`,
			};
		}
		const data = (await res.json()) as Array<BatchResult<unknown>>;
		const entry = data?.[0] as
			| BatchResult<{providers: ProviderRow[]}>
			| undefined;
		const err = readBatchError(entry);
		if (err) return {providers: [], error: err};
		const payload = unwrapBatch<{providers: ProviderRow[]}>(entry);
		const providers = payload?.providers ?? [];
		return {providers: Array.isArray(providers) ? providers : [], error: null};
	} catch (err) {
		return {
			providers: [],
			error: err instanceof Error ? err.message : "Network error",
		};
	}
}

/**
 * Non-batch tRPC mutation envelope.
 *
 * NOTE: this livinityd uses NO superjson transformer (see
 * `livos/packages/livinityd/source/modules/server/trpc/trpc.ts`), and the
 * `{"0":{"json":{...}}}` batch envelope used by McpTab silently fails for
 * input validation (router sees `undefined` for every field — pre-existing
 * bug in McpTab.tsx, not addressed here). The bare non-batch body
 * `{...input}` POSTed to `/trpc/<path>` (no `?batch=1`) is the contract that
 * actually works against `provider.config.set/delete`.
 *
 * Verified live on Mini PC 2026-05-24 via JWT-authenticated curl.
 */
async function callMutation<T>(
	path: string,
	input: Record<string, unknown>,
): Promise<{ok: true; data: T} | {ok: false; error: string}> {
	try {
		const res = await fetch(`/trpc/${path}`, {
			method: "POST",
			credentials: "include",
			headers: {"content-type": "application/json"},
			body: JSON.stringify(input),
		});
		const text = await res.text();
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			return {
				ok: false,
				error: `${path} returned non-JSON (HTTP ${res.status})`,
			};
		}
		// Non-batch envelope shape: {result: {data: T}} OR {error: {message: ...}}
		const obj = parsed as {
			result?: {data?: T | {json?: T}};
			error?: {message?: string; json?: {message?: string}};
		};
		if (obj.error) {
			return {
				ok: false,
				error: obj.error.json?.message ?? obj.error.message ?? `Server error (HTTP ${res.status})`,
			};
		}
		if (!res.ok) {
			return {ok: false, error: `${path} failed (HTTP ${res.status})`};
		}
		const direct = obj.result?.data;
		if (
			direct !== undefined &&
			direct !== null &&
			typeof direct === "object" &&
			"json" in (direct as Record<string, unknown>)
		) {
			return {ok: true, data: (direct as {json: T}).json};
		}
		return {ok: true, data: (direct as T) ?? ({} as T)};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Network error",
		};
	}
}

async function callSetProvider(
	provider: ProviderName,
	key: string,
): Promise<ProviderMutationResult> {
	const res = await callMutation<ProviderMutationResult>(
		"provider.config.set",
		{provider, key},
	);
	if (!res.ok) return {ok: false, error: res.error};
	return res.data;
}

async function callDeleteProvider(
	provider: ProviderName,
): Promise<ProviderMutationResult> {
	const res = await callMutation<ProviderMutationResult>(
		"provider.config.delete",
		{provider},
	);
	if (!res.ok) return {ok: false, error: res.error};
	return res.data;
}

/**
 * Probe the openclaw gateway's health endpoint via the Caddy split. Returns
 * true when the gateway responds with a 2xx (anything else → false). Used
 * by the ProvidersTab's restart-banner poll loop.
 */
export async function pingGatewayHealth(): Promise<boolean> {
	try {
		const res = await fetch("/liv-ai-app/openclawos/health", {
			credentials: "include",
			cache: "no-store",
		});
		return res.ok;
	} catch {
		return false;
	}
}

// ── Hook ────────────────────────────────────────────────────────────────

export interface UseProvidersResult {
	providers: ProviderRow[];
	isLoading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
	setProvider: (
		provider: ProviderName,
		key: string,
	) => Promise<ProviderMutationResult>;
	deleteProvider: (provider: ProviderName) => Promise<ProviderMutationResult>;
}

export function useProviders(): UseProvidersResult {
	const [providers, setProviders] = useState<ProviderRow[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const mountedRef = useRef<boolean>(true);

	const refetch = useCallback(async (): Promise<void> => {
		const next = await fetchProviders();
		if (!mountedRef.current) return;
		setProviders(next.providers);
		setError(next.error);
		setIsLoading(false);
	}, []);

	const setProvider = useCallback(
		async (
			provider: ProviderName,
			key: string,
		): Promise<ProviderMutationResult> => {
			const res = await callSetProvider(provider, key);
			if (res.ok) await refetch();
			return res;
		},
		[refetch],
	);

	const deleteProvider = useCallback(
		async (provider: ProviderName): Promise<ProviderMutationResult> => {
			const res = await callDeleteProvider(provider);
			if (res.ok) await refetch();
			return res;
		},
		[refetch],
	);

	useEffect(() => {
		mountedRef.current = true;
		void refetch();
		const onFocus = (): void => {
			void refetch();
		};
		window.addEventListener("focus", onFocus);
		return () => {
			mountedRef.current = false;
			window.removeEventListener("focus", onFocus);
		};
	}, [refetch]);

	return {providers, isLoading, error, refetch, setProvider, deleteProvider};
}
