/**
 * Phase 44 Plan 44-02 — Express middleware that taps the broker response to
 * record usage rows. ZERO imports from livinity-broker/* (sacred boundary —
 * see grep guard in 44-02-PLAN.md and AUDIT.md Section 4).
 *
 * Mount point: app.use('/u/:userId/v1', captureMiddleware) BEFORE the broker
 * router. The middleware patches res.json (sync) and res.write/res.end (SSE),
 * then calls next() so the broker handler executes normally.
 *
 * Failure mode: parser errors / DB errors are caught and logged at warn
 * level — never crash the broker request, never leak the original exception
 * up the stack. A failed insertUsage is observability data lost, NOT a user
 * error.
 *
 * Buffer cap: 10MB (matches the broker's JSON body limit) — overflow stops
 * appending to the SSE buffer to prevent memory blowup on very large
 * streams. A row may still be written from whatever was already buffered.
 */

import type {Request, Response, NextFunction, Application} from 'express'
import type Livinityd from '../../index.js'

import {parseUsageFromResponse, parseUsageFromSseBuffer, type ParsedUsage} from './parse-usage.js'
import {insertUsage} from './database.js'
import {resolveAppIdFromIp} from './container-resolver.js'

const MAX_BUFFER_BYTES = 10 * 1024 * 1024 // 10 MB

export function createCaptureMiddleware(livinityd: Livinityd) {
	return async function captureMiddleware(
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<void> {
		const userId = req.params?.userId
		if (!userId) {
			next()
			return
		}
		const urlPath = req.originalUrl || req.url
		const remoteIp = req.socket?.remoteAddress || ''

		let sseBuffer = ''
		let sseBufferOverflowed = false
		let isSse = false
		let captured = false

		const recordRow = async (parsed: ParsedUsage | null): Promise<void> => {
			if (!parsed || captured) return
			captured = true
			try {
				const appId = await resolveAppIdFromIp(remoteIp)
				// Phase 62 FR-BROKER-E1-02 — read apiKeyId set by Phase 59 bearer middleware.
				// Mount order: capture < bearer < broker; bearer runs BEFORE res.end fires
				// recordRow, so req.apiKeyId IS set here when authMethod === 'bearer'.
				// Explicit coercion: legacy URL-path traffic has req.apiKeyId === undefined
				// but insertUsage's UsageInsertInput types apiKeyId as `string | null`.
				const apiKeyId = req.authMethod === 'bearer' ? req.apiKeyId ?? null : null
				await insertUsage({
					userId,
					appId,
					apiKeyId,
					model: parsed.model ?? 'unknown',
					promptTokens: parsed.prompt_tokens,
					completionTokens: parsed.completion_tokens,
					requestId: parsed.request_id,
					endpoint: parsed.endpoint,
				})
			} catch (err) {
				livinityd.logger.verbose(
					`[usage-tracking] insertUsage failed (non-fatal): ${(err as Error).message}`,
				)
			}
		}

		// Patch res.json — sync responses
		const originalJson = res.json.bind(res)
		res.json = ((body: unknown) => {
			if (!isSse) {
				try {
					const parsed = parseUsageFromResponse({
						body: body as object,
						statusCode: res.statusCode,
						urlPath,
					})
					// Fire-and-forget — never block res.json on the insert
					recordRow(parsed).catch(() => {})
				} catch (err) {
					livinityd.logger.verbose(
						`[usage-tracking] parser failed (non-fatal): ${(err as Error).message}`,
					)
				}
			}
			return originalJson(body)
		}) as typeof res.json

		// Patch res.write — SSE chunk accumulator
		const originalWrite = res.write.bind(res)
		res.write = ((chunk: unknown, ...rest: unknown[]) => {
			const ct = res.getHeader('content-type')
			if (typeof ct === 'string' && ct.includes('text/event-stream')) isSse = true
			if (isSse && !sseBufferOverflowed) {
				const text =
					typeof chunk === 'string'
						? chunk
						: Buffer.isBuffer(chunk)
							? chunk.toString('utf8')
							: ''
				if (sseBuffer.length + text.length > MAX_BUFFER_BYTES) {
					sseBufferOverflowed = true
				} else {
					sseBuffer += text
				}
			}
			// @ts-expect-error pass-through to original write signature variants
			return originalWrite(chunk, ...rest)
		}) as typeof res.write

		// Patch res.end — finalize SSE parse + 429 fallthrough
		const originalEnd = res.end.bind(res)
		res.end = ((chunk?: unknown, ...rest: unknown[]) => {
			if (chunk !== undefined && isSse && !sseBufferOverflowed) {
				const text =
					typeof chunk === 'string'
						? chunk
						: Buffer.isBuffer(chunk)
							? chunk.toString('utf8')
							: ''
				if (text && sseBuffer.length + text.length <= MAX_BUFFER_BYTES) sseBuffer += text
			}
			if (isSse) {
				try {
					const parsed = parseUsageFromSseBuffer({sseBuffer, urlPath})
					recordRow(parsed).catch(() => {})
				} catch (err) {
					livinityd.logger.verbose(
						`[usage-tracking] SSE parser failed (non-fatal): ${(err as Error).message}`,
					)
				}
			}
			if (res.statusCode === 429 && !captured) {
				recordRow({
					prompt_tokens: 0,
					completion_tokens: 0,
					model: null,
					request_id: null,
					endpoint: '429-throttled',
				}).catch(() => {})
			}
			// @ts-expect-error pass-through to original end signature variants
			return originalEnd(chunk, ...rest)
		}) as typeof res.end

		next()
	}
}

export function mountUsageCaptureMiddleware(app: Application, livinityd: Livinityd): void {
	app.use('/u/:userId/v1', createCaptureMiddleware(livinityd))
	livinityd.logger.log(
		'[usage-tracking] capture middleware mounted at /u/:userId/v1 (BEFORE broker)',
	)
}
