/**
 * Phase 316-06 (LLM-01 / LLM-02) — `useOllamaModels` hook.
 *
 * Native-fetch tRPC wrapper for the Local Models tab. Clones the
 * `use-providers.ts` conventions verbatim (no tRPC React client in this subapp):
 *   - batch-query unwrap envelope for the no-input queries
 *     (`provider.ollamaModels.list`, `.getActiveModel`)
 *   - non-batch GET (`?input=<json>`) for the input query `.pullStatus`
 *   - the NON-BATCH `callMutation` envelope for `.pull` / `.delete` /
 *     `.setActiveModel` / `.clearActiveModel`
 *
 * The 1s poll-until-done progress loop lives HERE (not in the component), so the
 * component stays a thin renderer of the exposed pull state.
 *
 * INV-204-02 — every string this hook emits is English (no i18n in this subapp).
 */

"use client";

import {useCallback, useEffect, useRef, useState} from "react";

// ── Types (display mirrors of the livinityd provider/ollama-models shapes) ──

export interface OllamaModel {
	name: string;
	size: number;
	digest: string;
	modified_at: string;
}

export interface GuardrailCheck {
	availableGb: number;
	neededGb: number;
	ok: boolean;
}

export interface PullGuardrails {
	ram: GuardrailCheck;
	disk: GuardrailCheck;
	estimate: {gb: number; known: boolean; note?: string};
}

export interface PullResponse {
	started: boolean;
	blocked: boolean;
	guardrail: PullGuardrails;
}

export interface PullProgress {
	percent: number;
	status: string;
	totalBytes: number;
	completedBytes: number;
	done: boolean;
	error?: string;
}

export interface MutationResult<T> {
	ok: boolean;
	data?: T;
	error?: string;
}

// ── Batch-query envelope (no-input) — reused verbatim from use-providers ────

const NO_INPUT_BATCH_QS =
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

async function fetchNoInputQuery<T>(
	path: string,
): Promise<{data: T | null; error: string | null}> {
	try {
		const res = await fetch(`/trpc/${path}?${NO_INPUT_BATCH_QS}`, {
			credentials: "include",
		});
		if (!res.ok) {
			return {data: null, error: `Failed to load (HTTP ${res.status})`};
		}
		const body = (await res.json()) as Array<BatchResult<T>>;
		const entry = body?.[0];
		const err = readBatchError(entry);
		if (err) return {data: null, error: err};
		return {data: unwrapBatch<T>(entry), error: null};
	} catch (err) {
		return {
			data: null,
			error: err instanceof Error ? err.message : "Network error",
		};
	}
}

// ── Non-batch GET query WITH input (?input=<raw json>, no superjson) ─────────

async function fetchInputQuery<T>(
	path: string,
	input: Record<string, unknown>,
): Promise<T | null> {
	try {
		const qs = `input=${encodeURIComponent(JSON.stringify(input))}`;
		const res = await fetch(`/trpc/${path}?${qs}`, {credentials: "include"});
		if (!res.ok) return null;
		const parsed = (await res.json()) as {
			result?: {data?: T | {json?: T}};
		};
		const direct = parsed.result?.data;
		if (
			direct !== undefined &&
			direct !== null &&
			typeof direct === "object" &&
			"json" in (direct as Record<string, unknown>)
		) {
			return (direct as {json: T}).json;
		}
		return (direct as T) ?? null;
	} catch {
		return null;
	}
}

// ── Non-batch mutation envelope — reused verbatim from use-providers ────────

async function callMutation<T>(
	path: string,
	input: Record<string, unknown>,
): Promise<MutationResult<T>> {
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
			return {ok: false, error: `${path} returned non-JSON (HTTP ${res.status})`};
		}
		const obj = parsed as {
			result?: {data?: T | {json?: T}};
			error?: {message?: string; json?: {message?: string}};
		};
		if (obj.error) {
			return {
				ok: false,
				error:
					obj.error.json?.message ??
					obj.error.message ??
					`Server error (HTTP ${res.status})`,
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
		return {ok: false, error: err instanceof Error ? err.message : "Network error"};
	}
}

// ── Route callers ───────────────────────────────────────────────────────────

async function callPull(
	name: string,
	override: boolean,
): Promise<MutationResult<PullResponse>> {
	return callMutation<PullResponse>("provider.ollamaModels.pull", {name, override});
}

async function callDelete(name: string): Promise<MutationResult<{status: string}>> {
	return callMutation<{status: string}>("provider.ollamaModels.delete", {name});
}

async function callSetActive(
	name: string,
): Promise<MutationResult<{ok: true; activeModel: string}>> {
	return callMutation("provider.ollamaModels.setActiveModel", {name});
}

async function callClearActive(): Promise<MutationResult<{ok: true}>> {
	return callMutation("provider.ollamaModels.clearActiveModel", {});
}

// ── Hook ────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 1000;
/** Safety cap so a stuck/never-finishing pull cannot poll forever. */
const POLL_MAX_ITERATIONS = 3600; // ~1 hour at 1s cadence

export interface UseOllamaModelsResult {
	models: OllamaModel[];
	activeModel: string | null;
	isLoading: boolean;
	error: string | null;
	pullTarget: string | null;
	pullProgress: PullProgress | null;
	refetch: () => Promise<void>;
	pull: (name: string, override: boolean) => Promise<PullResponse | null>;
	remove: (name: string) => Promise<MutationResult<{status: string}>>;
	setActive: (name: string) => Promise<MutationResult<{ok: true; activeModel: string}>>;
	revertToClaude: () => Promise<MutationResult<{ok: true}>>;
}

export function useOllamaModels(): UseOllamaModelsResult {
	const [models, setModels] = useState<OllamaModel[]>([]);
	const [activeModel, setActiveModelState] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const [pullTarget, setPullTarget] = useState<string | null>(null);
	const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
	const mountedRef = useRef<boolean>(true);

	const refetch = useCallback(async (): Promise<void> => {
		const [listRes, activeRes] = await Promise.all([
			fetchNoInputQuery<{models: OllamaModel[]}>("provider.ollamaModels.list"),
			fetchNoInputQuery<{activeModel: string | null}>(
				"provider.ollamaModels.getActiveModel",
			),
		]);
		if (!mountedRef.current) return;
		setModels(listRes.data?.models ?? []);
		setActiveModelState(activeRes.data?.activeModel ?? null);
		setError(listRes.error);
		setIsLoading(false);
	}, []);

	// 1s poll-until-done loop (owned by the hook). Updates pullProgress each tick;
	// stops on done / error / cleared progress / the safety cap, then refetches so
	// the freshly-pulled model shows in the installed list.
	const startPoll = useCallback(
		async (name: string): Promise<void> => {
			for (let i = 0; i < POLL_MAX_ITERATIONS; i++) {
				await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
				if (!mountedRef.current) return;
				const status = await fetchInputQuery<PullProgress | null>(
					"provider.ollamaModels.pullStatus",
					{name},
				);
				if (!mountedRef.current) return;
				if (status) setPullProgress(status);
				if (!status || status.done) break;
			}
			if (!mountedRef.current) return;
			await refetch();
		},
		[refetch],
	);

	const pull = useCallback(
		async (name: string, override: boolean): Promise<PullResponse | null> => {
			const res = await callPull(name, override);
			if (!res.ok || !res.data) {
				setError(res.error ?? "Pull failed");
				return null;
			}
			if (res.data.started) {
				setPullTarget(name);
				setPullProgress({
					percent: 0,
					status: "starting",
					totalBytes: 0,
					completedBytes: 0,
					done: false,
				});
				void startPoll(name);
			}
			return res.data;
		},
		[startPoll],
	);

	const remove = useCallback(
		async (name: string) => {
			const res = await callDelete(name);
			if (res.ok) await refetch();
			return res;
		},
		[refetch],
	);

	const setActive = useCallback(
		async (name: string) => {
			const res = await callSetActive(name);
			if (res.ok) await refetch();
			return res;
		},
		[refetch],
	);

	const revertToClaude = useCallback(async () => {
		const res = await callClearActive();
		if (res.ok) await refetch();
		return res;
	}, [refetch]);

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

	return {
		models,
		activeModel,
		isLoading,
		error,
		pullTarget,
		pullProgress,
		refetch,
		pull,
		remove,
		setActive,
		revertToClaude,
	};
}
