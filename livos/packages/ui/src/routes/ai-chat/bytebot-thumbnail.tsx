import {useEffect, useState} from 'react'

import {AnimatePresence, motion} from 'framer-motion'
import {IconDeviceDesktop, IconX} from '@tabler/icons-react'

import type {ChatMessage, ChatToolCall} from '@/hooks/use-agent-socket'

// --- Image extraction helpers ---

const BYTEBOT_TOOL_RE = /mcp[_]{1,2}bytebot[_]{1,2}|computer.?use|screenshot/i

function isBytebotTool(name: string): boolean {
	return BYTEBOT_TOOL_RE.test(name)
}

/**
 * Attempt to extract a displayable image URL from a tool call's output string.
 * The output field is always a plain string; image data may be:
 *   - JSON with screenshot_base64 / image_url / screenshot / content[] image blocks
 *   - Raw base64 (no spaces, long string)
 * Returns a data URI or http URL, or null if no image found.
 */
function extractImageFromOutput(output: string | undefined): string | null {
	if (!output) return null

	// Attempt JSON parse
	let parsed: unknown = null
	try {
		parsed = JSON.parse(output)
	} catch {
		// not JSON — try raw base64 below
	}

	if (parsed !== null && typeof parsed === 'object' && parsed !== null) {
		const obj = parsed as Record<string, unknown>

		// Direct screenshot_base64 field
		if (typeof obj.screenshot_base64 === 'string' && obj.screenshot_base64.length > 0) {
			return `data:image/png;base64,${obj.screenshot_base64}`
		}

		// image_url field (full URL)
		if (typeof obj.image_url === 'string' && obj.image_url.length > 0) {
			return obj.image_url
		}

		// screenshot field — could be base64 or URL
		if (typeof obj.screenshot === 'string' && obj.screenshot.length > 0) {
			const s = obj.screenshot
			if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) {
				return s
			}
			return `data:image/png;base64,${s}`
		}

		// content[] array — look for image blocks
		if (Array.isArray(obj.content)) {
			for (const block of obj.content) {
				if (
					block &&
					typeof block === 'object' &&
					(block as Record<string, unknown>).type === 'image'
				) {
					const imgBlock = block as Record<string, unknown>
					// LivOS MCP server format: {type:'image', data, mimeType}
					if (typeof imgBlock.data === 'string') {
						const mediaType =
							typeof imgBlock.mimeType === 'string'
								? imgBlock.mimeType
								: typeof imgBlock.media_type === 'string'
									? imgBlock.media_type
									: 'image/png'
						const raw = imgBlock.data as string
						if (raw.startsWith('data:') || raw.startsWith('http')) return raw
						return `data:${mediaType};base64,${raw}`
					}
					// Anthropic format: {type:'image', source:{data, media_type}}
					const source = imgBlock.source as Record<string, unknown> | undefined
					if (source?.data && typeof source.data === 'string') {
						const mediaType = typeof source.media_type === 'string' ? source.media_type : 'image/png'
						return `data:${mediaType};base64,${source.data}`
					}
					// image_url style
					if (source?.url && typeof source.url === 'string') {
						return source.url as string
					}
				}
			}
		}
	}

	// Raw base64 fallback: no spaces, looks like base64, long enough
	const trimmed = output.trim()
	if (
		trimmed.length > 200 &&
		!/\s/.test(trimmed) &&
		/^[A-Za-z0-9+/]+=*$/.test(trimmed.slice(0, 100))
	) {
		return `data:image/png;base64,${trimmed}`
	}

	return null
}

interface ScreenshotMatch {
	key: string      // tool call id — used as dismiss key
	imageUrl: string
	toolName: string
	timestamp: number
}

/**
 * Scan messages newest-first, return the most recent bytebot screenshot found.
 *
 * Source priority:
 *   1. `tc.images[0]` — set by use-agent-socket from MCP image blocks. This
 *      is the canonical path; the text-only filter on `tc.output` drops
 *      base64 image data so we can't reliably recover it from `output`.
 *   2. `extractImageFromOutput(tc.output)` — legacy fallback for tool calls
 *      that serialize image data into the output string (older or non-MCP
 *      bytebot adapters).
 */
function findLatestScreenshot(messages: ChatMessage[]): ScreenshotMatch | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i]
		const toolCalls: ChatToolCall[] = msg.toolCalls ?? []
		// Scan tool calls newest-last (last in array = most recently added)
		for (let j = toolCalls.length - 1; j >= 0; j--) {
			const tc = toolCalls[j]
			if (!isBytebotTool(tc.name)) continue
			const imageUrl = tc.images?.[0] ?? extractImageFromOutput(tc.output)
			if (imageUrl) {
				return {
					key: tc.id,
					imageUrl,
					toolName: tc.name,
					timestamp: msg.timestamp ?? Date.now(),
				}
			}
		}
	}
	return null
}

// --- Component ---

interface BytebotThumbnailProps {
	messages: ChatMessage[]
}

export function BytebotThumbnail({messages}: BytebotThumbnailProps) {
	const [dismissedKey, setDismissedKey] = useState<string | null>(null)

	const match = findLatestScreenshot(messages)
	const currentKey = match?.key ?? null

	// Auto-reshow when a new screenshot arrives (different key)
	useEffect(() => {
		if (currentKey !== null && currentKey !== dismissedKey) {
			// New screenshot — ensure not dismissed
			setDismissedKey((prev) => (prev === currentKey ? prev : null))
		}
	}, [currentKey]) // intentionally omit dismissedKey to avoid loop

	const isVisible =
		match !== null &&
		messages.length > 0 &&
		dismissedKey !== currentKey

	return (
		<AnimatePresence>
			{isVisible && match && (
				<motion.div
					key={match.key}
					initial={{opacity: 0, y: 16}}
					animate={{opacity: 1, y: 0}}
					exit={{opacity: 0, y: 16}}
					transition={{type: 'spring', damping: 22, stiffness: 200}}
					className='fixed bottom-4 right-4 z-40 w-60 overflow-hidden rounded-lg border border-border-default bg-surface-base shadow-elevation-2'
					style={{width: 240}}
				>
					{/* Header bar */}
					<div className='flex items-center justify-between bg-surface-1/60 px-2 py-1'>
						<div className='flex items-center gap-1.5'>
							<IconDeviceDesktop size={13} className='flex-shrink-0 text-text-tertiary' />
							<span className='text-[11px] font-medium leading-none text-text-secondary'>
								Computer Use
							</span>
						</div>
						<button
							onClick={() => setDismissedKey(match.key)}
							className='flex h-5 w-5 items-center justify-center rounded text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary'
							aria-label='Close screenshot thumbnail'
						>
							<IconX size={12} />
						</button>
					</div>

					{/* Screenshot */}
					<img
						src={match.imageUrl}
						alt='Desktop screenshot'
						className='block w-full'
						draggable={false}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	)
}
