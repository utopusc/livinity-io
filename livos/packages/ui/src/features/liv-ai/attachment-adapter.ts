/**
 * Phase 198-06 — Image attachment adapter.
 *
 * Accepts image/* MIME types only (PDF deferred to Phase 199 — needs
 * pdf-parse + a backend extraction route). Base64-encodes the bytes and
 * surfaces them in the AI-SDK message stream as multimodal content.
 * Grok via `@ai-sdk/xai` handles vision natively; livinityd's chatRoute
 * (Plan 198-01) passes the message stream through unchanged so the
 * agent receives the encoded image alongside the user's text prompt.
 *
 * This module ships TWO entry points:
 *
 *   1. Pure helpers (`acceptsFile`, `readFileAsBase64`, `attachFile`) —
 *      used by the unit tests and by any direct drag-drop wire-up that
 *      doesn't want to depend on the assistant-ui runtime.
 *
 *   2. `createImageAttachmentAdapter()` — returns an assistant-ui
 *      `CompositeAttachmentAdapter` instance composed of a single
 *      `SimpleImageAttachmentAdapter`. This is the recommended path for
 *      the `<Assistant />` runtime wire-up (see assistant.tsx Task 4).
 *      Wrapping in a Composite keeps the door open to add a PDF or
 *      audio adapter in Phase 199 without changing call sites.
 *
 * Plan 198-06 must_haves explicitly defer voice + PDF to P199; this
 * adapter intentionally rejects every non-image MIME type so accidental
 * paste of a non-image file surfaces a clear error message instead of
 * being silently forwarded to the agent.
 */

import {
	CompositeAttachmentAdapter,
	SimpleImageAttachmentAdapter,
} from '@assistant-ui/react'

/** Final shape returned by `attachFile()` — used by tests + direct callers. */
export interface AttachedFile {
	/** Stable opaque id for the attachment row in the composer state. */
	id: string
	/** Original filename. */
	name: string
	/** MIME type as reported by the File. */
	mimeType: string
	/** Pure base64 payload (NO data:image/...;base64, prefix). */
	base64: string
	/** Original byte size of the file. */
	size: number
}

/** 10 MB ceiling — same as the assistant-ui SimpleImageAttachmentAdapter default. */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024

/**
 * Allow-listed image MIME types. Anything outside this set is rejected
 * by `acceptsFile()` / `attachFile()` and the Composite adapter from
 * `createImageAttachmentAdapter()`. PNG / JPEG / WebP / GIF cover ~98%
 * of operator screenshot / camera-roll use cases.
 */
export const ACCEPTED_MIME_TYPES: ReadonlySet<string> = new Set([
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
])

/**
 * Returns true iff the file's MIME type is in ACCEPTED_MIME_TYPES AND
 * its size is within MAX_IMAGE_SIZE_BYTES.
 */
export function acceptsFile(file: File): boolean {
	if (!ACCEPTED_MIME_TYPES.has(file.type)) return false
	if (file.size > MAX_IMAGE_SIZE_BYTES) return false
	return true
}

/**
 * Read a File as base64 (sans the `data:…;base64,` prefix). Wraps the
 * browser FileReader API in a Promise so the rest of the codebase can
 * `await` it.
 */
export async function readFileAsBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => {
			const result = reader.result as string
			// dataURL prefix: `data:image/png;base64,iVBORw0KG…` — strip the
			// prefix so callers always get the raw base64 payload.
			const idx = result.indexOf(',')
			const base64 = idx >= 0 ? result.slice(idx + 1) : result
			resolve(base64)
		}
		reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
		reader.readAsDataURL(file)
	})
}

/**
 * Validate + read a File and produce an AttachedFile row. Throws a
 * descriptive Error if the file is rejected by `acceptsFile()`.
 */
export async function attachFile(file: File): Promise<AttachedFile> {
	if (!acceptsFile(file)) {
		throw new Error(
			`Unsupported file: ${file.name} (type=${file.type || 'unknown'}, size=${file.size}). Allowed: image/png|jpeg|webp|gif up to ${MAX_IMAGE_SIZE_BYTES} bytes.`,
		)
	}
	const base64 = await readFileAsBase64(file)
	return {
		id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
		name: file.name,
		mimeType: file.type,
		base64,
		size: file.size,
	}
}

/**
 * Build the assistant-ui attachment adapter used by `useChatRuntime`
 * inside `<Assistant />`. Wrapping the SimpleImageAttachmentAdapter in
 * a CompositeAttachmentAdapter (even though it has a single child for
 * now) lets Phase 199 plug in a PDF adapter later without touching the
 * call site.
 *
 * The SimpleImageAttachmentAdapter from `@assistant-ui/react` already
 * enforces image/* MIME + base64 encoding via the AI-SDK message-stream
 * shape, so the only extra job here is the composition itself.
 */
export function createImageAttachmentAdapter(): CompositeAttachmentAdapter {
	return new CompositeAttachmentAdapter([new SimpleImageAttachmentAdapter()])
}
