/**
 * VoiceButton — Push-to-talk voice interaction component.
 *
 * Handles WebSocket connection to /ws/voice, microphone capture via
 * MediaRecorder (webm/opus format), and TTS audio playback via AudioContext.
 * Shows different visual states: idle, connected, listening, processing, speaking.
 */

import {useCallback, useEffect, useRef, useState} from 'react'
import {IconMicrophone} from '@tabler/icons-react'
import {cn} from '@/shadcn-lib/utils'
import {trpcReact} from '@/trpc/trpc'

// ── Types ────────────────────────────────────────────────────────────────────

type VoiceButtonState = 'unavailable' | 'disconnected' | 'idle' | 'listening' | 'processing' | 'speaking'

interface LatencyData {
	sttMs?: number
	llmMs?: number
	ttsMs?: number
	totalServerMs?: number
	e2eMs?: number
}

interface VoiceButtonProps {
	disabled?: boolean
	onTranscript?: (text: string) => void
}

// ── Audio Playback Queue ─────────────────────────────────────────────────────

class AudioPlaybackQueue {
	private audioCtx: AudioContext | null = null
	private queue: ArrayBuffer[] = []
	private isPlaying = false
	private onPlayStart?: () => void
	private onPlayEnd?: () => void

	constructor(onPlayStart?: () => void, onPlayEnd?: () => void) {
		this.onPlayStart = onPlayStart
		this.onPlayEnd = onPlayEnd
	}

	enqueue(pcmData: ArrayBuffer): void {
		this.queue.push(pcmData)
		if (!this.isPlaying) this.playNext()
	}

	private playNext(): void {
		if (this.queue.length === 0) {
			this.isPlaying = false
			this.onPlayEnd?.()
			return
		}

		if (!this.audioCtx) {
			this.audioCtx = new AudioContext({sampleRate: 24000})
		}

		this.isPlaying = true
		this.onPlayStart?.()

		const pcm = this.queue.shift()!
		const int16 = new Int16Array(pcm)
		const float32 = new Float32Array(int16.length)
		for (let i = 0; i < int16.length; i++) {
			float32[i] = int16[i] / 32768
		}

		const buffer = this.audioCtx.createBuffer(1, float32.length, 24000)
		buffer.getChannelData(0).set(float32)

		const source = this.audioCtx.createBufferSource()
		source.buffer = buffer
		source.connect(this.audioCtx.destination)
		source.onended = () => this.playNext()
		source.start()
	}

	clear(): void {
		this.queue = []
		this.isPlaying = false
	}

	close(): void {
		this.clear()
		if (this.audioCtx) {
			this.audioCtx.close().catch(() => {})
			this.audioCtx = null
		}
	}
}

// ── VoiceButton Component ───────────────────────────────────────────────────

export function VoiceButton({disabled, onTranscript}: VoiceButtonProps) {
	const [state, setState] = useState<VoiceButtonState>('unavailable')
	const [interimText, setInterimText] = useState('')
	const [latencyData, setLatencyData] = useState<LatencyData | null>(null)
	const [latencyVisible, setLatencyVisible] = useState(false)
	const [sessionId, setSessionId] = useState<string | null>(null)

	const wsRef = useRef<WebSocket | null>(null)
	const mediaRecorderRef = useRef<MediaRecorder | null>(null)
	const mediaStreamRef = useRef<MediaStream | null>(null)
	const audioQueueRef = useRef<AudioPlaybackQueue | null>(null)
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const reconnectAttemptsRef = useRef(0)
	const micCaptureRef = useRef(0)
	const browserPlaybackRef = useRef(0)
	const isUnmountedRef = useRef(false)
	const latencyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Check if voice is configured
	const voiceConfigQ = trpcReact.ai.getVoiceConfig.useQuery(undefined, {
		refetchInterval: 30_000,
	})

	const isConfigured = !!(
		voiceConfigQ.data?.hasDeepgramKey &&
		voiceConfigQ.data?.hasCartesiaKey &&
		voiceConfigQ.data?.enabled
	)

	// ── WebSocket Connection ────────────────────────────────────────────────

	const connectWebSocket = useCallback(() => {
		if (isUnmountedRef.current || !isConfigured) return

		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
		const jwt = localStorage.getItem('jwt')
		if (!jwt) {
			setState('unavailable')
			return
		}

		const port = window.location.port ? `:${window.location.port}` : ''
		const wsUrl = `${protocol}//${window.location.hostname}${port}/ws/voice?token=${jwt}`

		try {
			const ws = new WebSocket(wsUrl)
			wsRef.current = ws

			ws.binaryType = 'arraybuffer'

			ws.onopen = () => {
				reconnectAttemptsRef.current = 0
				// Wait for 'connected' control message before setting state
			}

			ws.onmessage = (event) => {
				if (event.data instanceof ArrayBuffer) {
					// Binary: TTS audio data (PCM s16le, 24kHz)
					if (!browserPlaybackRef.current) {
						browserPlaybackRef.current = Date.now()
					}
					if (!audioQueueRef.current) {
						audioQueueRef.current = new AudioPlaybackQueue(
							() => {}, // onPlayStart handled by state
							() => {}, // onPlayEnd handled by tts-done
						)
					}
					audioQueueRef.current.enqueue(event.data)
					return
				}

				// Text: JSON control message
				try {
					const msg = JSON.parse(event.data as string)

					switch (msg.type) {
						case 'connected':
							setSessionId(msg.sessionId)
							setState('idle')
							break

						case 'transcript':
							if (msg.text) {
								setInterimText(msg.text)
								if (msg.isFinal && msg.text.trim()) {
									onTranscript?.(msg.text)
								}
							}
							break

						case 'state-change':
							if (msg.to === 'processing') setState('processing')
							else if (msg.to === 'speaking') setState('speaking')
							else if (msg.to === 'idle') {
								setState('idle')
								setInterimText('')
							}
							else if (msg.to === 'listening') setState('listening')
							break

						case 'tts-done':
							// TTS complete; audio queue will finish playing
							// Wait briefly for audio queue to drain
							setTimeout(() => {
								if (!isUnmountedRef.current) {
									setState('idle')
									setInterimText('')
								}
							}, 500)
							break

						case 'latency': {
							const durations = msg.durations || {}
							const e2e = browserPlaybackRef.current && micCaptureRef.current
								? browserPlaybackRef.current - micCaptureRef.current
								: undefined
							const data: LatencyData = {
								sttMs: durations.sttMs,
								llmMs: durations.llmMs,
								ttsMs: durations.ttsMs,
								totalServerMs: durations.totalServerMs,
								e2eMs: e2e,
							}
							setLatencyData(data)
							setLatencyVisible(true)
							console.log('[VoiceButton] Pipeline latency:', data)

							// Clear latency display after 5 seconds
							if (latencyTimerRef.current) clearTimeout(latencyTimerRef.current)
							latencyTimerRef.current = setTimeout(() => {
								if (!isUnmountedRef.current) setLatencyVisible(false)
							}, 5000)
							break
						}

						case 'error':
							console.error('[VoiceButton] Server error:', msg.message)
							break
					}
				} catch (e) {
					console.warn('[VoiceButton] Failed to parse control message:', e)
				}
			}

			ws.onclose = () => {
				wsRef.current = null
				setSessionId(null)
				if (!isUnmountedRef.current && isConfigured) {
					setState('disconnected')
					scheduleReconnect()
				}
			}

			ws.onerror = (err) => {
				console.error('[VoiceButton] WebSocket error:', err)
			}
		} catch (err) {
			console.error('[VoiceButton] Failed to create WebSocket:', err)
			setState('disconnected')
			scheduleReconnect()
		}
	}, [isConfigured, onTranscript])

	const scheduleReconnect = useCallback(() => {
		if (isUnmountedRef.current) return
		if (reconnectAttemptsRef.current >= 5) {
			setState('unavailable')
			return
		}

		const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 16000)
		reconnectAttemptsRef.current++

		reconnectTimerRef.current = setTimeout(() => {
			if (!isUnmountedRef.current) connectWebSocket()
		}, delay)
	}, [connectWebSocket])

	// Connect/disconnect based on config
	useEffect(() => {
		isUnmountedRef.current = false

		if (isConfigured) {
			connectWebSocket()
		} else {
			setState('unavailable')
		}

		return () => {
			isUnmountedRef.current = true
			if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
			if (latencyTimerRef.current) clearTimeout(latencyTimerRef.current)
			if (wsRef.current) {
				wsRef.current.close()
				wsRef.current = null
			}
			if (mediaStreamRef.current) {
				mediaStreamRef.current.getTracks().forEach((t) => t.stop())
				mediaStreamRef.current = null
			}
			if (audioQueueRef.current) {
				audioQueueRef.current.close()
				audioQueueRef.current = null
			}
		}
	}, [isConfigured, connectWebSocket])

	// ── Push-to-Talk ────────────────────────────────────────────────────────

	const startListening = useCallback(async () => {
		if (state !== 'idle' || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					sampleRate: 16000,
					channelCount: 1,
					echoCancellation: true,
					noiseSuppression: true,
				},
			})
			mediaStreamRef.current = stream

			// Determine best mime type
			const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
				? 'audio/webm;codecs=opus'
				: 'audio/webm'

			const recorder = new MediaRecorder(stream, {mimeType})
			mediaRecorderRef.current = recorder

			recorder.ondataavailable = (e) => {
				if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
					e.data.arrayBuffer().then((buf) => {
						wsRef.current?.send(buf)
					})
				}
			}

			// Record timestamp for latency tracking
			micCaptureRef.current = Date.now()
			browserPlaybackRef.current = 0

			// Send start-listening control message with format hint
			wsRef.current.send(
				JSON.stringify({
					type: 'start-listening',
					micCapture: micCaptureRef.current,
					format: 'webm-opus',
				}),
			)

			// Start recording with 250ms chunks for real-time streaming
			recorder.start(250)
			setState('listening')
		} catch (err) {
			console.error('[VoiceButton] Microphone access error:', err)
		}
	}, [state])

	const stopListening = useCallback(() => {
		// Stop MediaRecorder
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
			mediaRecorderRef.current.stop()
			mediaRecorderRef.current = null
		}

		// Stop media stream
		if (mediaStreamRef.current) {
			mediaStreamRef.current.getTracks().forEach((t) => t.stop())
			mediaStreamRef.current = null
		}

		// Send stop-listening control message
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({type: 'stop-listening'}))
		}

		// State will transition via server control messages
	}, [])

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault()
			startListening()
		},
		[startListening],
	)

	const handlePointerUp = useCallback(
		(e: React.PointerEvent) => {
			e.preventDefault()
			stopListening()
		},
		[stopListening],
	)

	// Don't render if voice is not configured
	if (!isConfigured || state === 'unavailable') return null

	// ── Visual State ────────────────────────────────────────────────────────

	const stateStyles: Record<Exclude<VoiceButtonState, 'unavailable'>, string> = {
		disconnected: 'bg-surface-3 text-text-tertiary cursor-wait',
		idle: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 cursor-pointer',
		listening: 'bg-red-500/30 text-red-400 cursor-pointer',
		processing: 'bg-amber-500/20 text-amber-400 cursor-wait',
		speaking: 'bg-green-500/20 text-green-400 cursor-default',
	}

	const pulseStyles: Record<string, string> = {
		idle: '',
		listening: 'animate-pulse',
		processing: '',
		speaking: 'animate-pulse',
	}

	return (
		<div className='relative flex flex-col items-center'>
			{/* Interim transcript */}
			{interimText && (
				<div className='absolute bottom-full mb-2 max-w-[300px] rounded-radius-md border border-border-default bg-surface-2 px-3 py-2 text-caption text-text-secondary shadow-lg'>
					<div className='flex items-center gap-2'>
						<IconMicrophone size={12} className='flex-shrink-0 text-red-400' />
						<span className='truncate'>{interimText}</span>
					</div>
				</div>
			)}

			<button
					onPointerDown={handlePointerDown}
					onPointerUp={handlePointerUp}
					onPointerLeave={handlePointerUp}
					disabled={disabled || state === 'disconnected' || state === 'processing' || state === 'speaking'}
					className={cn(
						'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-radius-md transition-colors',
						stateStyles[state],
						pulseStyles[state] || '',
						disabled && 'opacity-40',
					)}
					title={
						state === 'idle'
							? 'Hold to speak'
							: state === 'listening'
								? 'Release to send'
								: state === 'processing'
									? 'Processing...'
									: state === 'speaking'
										? 'AI is speaking...'
										: state === 'disconnected'
											? 'Reconnecting...'
											: 'Voice'
					}
				>
					<IconMicrophone size={18} />
			</button>

			{/* Latency display */}
			{latencyVisible && latencyData && (
				<div className='absolute top-full mt-1 whitespace-nowrap text-center'>
					<span className='rounded bg-surface-2 px-1.5 py-0.5 text-[10px] tabular-nums text-text-tertiary'>
						{latencyData.e2eMs ? `${latencyData.e2eMs}ms` : latencyData.totalServerMs ? `${latencyData.totalServerMs}ms` : ''}
					</span>
				</div>
			)}
		</div>
	)
}

export default VoiceButton
