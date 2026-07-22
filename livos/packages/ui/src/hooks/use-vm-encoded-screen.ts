// Phase 365-01 (VMENC-01, UI half) — useVmEncodedScreen: the MSE analog of the
// 355 RFB hook (use-webapp-vnc.ts). It consumes 364's `/ws/vm-stream/<streamId>`
// fragmented-MP4 stream and feeds it into a <video> via MediaSource/SourceBuffer.
//
// NO NEW DEPENDENCY: the server (encoder-args.ts / ffmpeg) already muxes real
// fMP4 fragments; the browser only has to `appendBuffer` them. A muxer dep
// (jmuxer/mux.js) would re-solve a problem the server already solved — this
// mirrors the repo's own Fmp4Fanout "the format is trivially simple, no dep"
// call. The one hand-rolled piece with a real correctness stake — the codec
// string — lives in the DOM-free, behaviorally-tested parse-avc-codec.ts.
//
// HONESTY GUARANTEE (T-365-04): status flips to 'connected' ONLY on a real
// <video> 'playing'/'canplay' event — never on WS-open or first-byte. A
// silently-stalled or black frame is NEVER reported as live. EVERY failure
// surface — startEncodedScreen refusal, MediaSource absent, unparseable/
// unsupported codec, isTypeSupported false, SourceBuffer error, <video> error,
// WS early-close/error, connect-deadline elapsed — funnels through ONE
// generation-guarded fail() → a terminal status, never an indefinite spinner.
// The consuming component (365-02) latches the 355 RFB fallback on that
// terminal status — so an unavailable encoder or an MSE-hostile browser degrades
// honestly, never into a hung 'connecting'.
//
// This hook is VIDEO-OUT ONLY: no pointer/keyboard/RFB/@novnc reference (input
// rides the existing 355 path until 366's hybrid input). It owns the videoRef +
// the MediaSource/SourceBuffer/WS lifecycle; the <video> element itself is
// rendered by the consumer (365-02).

import {useCallback, useEffect, useRef, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'
import {codecStringFromInitSegment} from '@/utils/parse-avc-codec'

export type VmEncodedScreenStatus = 'idle' | 'connecting' | 'connected' | 'unavailable' | 'error'

export interface UseVmEncodedScreenResult {
	videoRef: React.RefObject<HTMLVideoElement>
	status: VmEncodedScreenStatus
}

// Client-side append-queue cap — a stalled decoder can't grow tab memory
// without bound (drop-oldest past this). Mirrors the server Fmp4Fanout's own
// 4 MB per-subscriber backpressure precedent (T-365-02).
const MAX_QUEUE_BYTES = 8 * 1024 * 1024
// Fail-closed connect deadline: if a real playing frame hasn't arrived by now,
// fall back rather than spin forever (mirrors the 364-01 startTimeoutMs
// guarantee — connect NEVER hangs).
const CONNECT_DEADLINE_MS = 15_000
// Live-edge catch-up threshold — jump near the buffered end if we drift behind.
const MAX_LAG_SECONDS = 1.5

/**
 * MediaSource fMP4 player over the 364 encoded-screen stream. `vmId` falsy →
 * idle (no mutation, no WS, no MediaSource; any prior session torn down).
 */
export function useVmEncodedScreen(vmId: string | undefined): UseVmEncodedScreenResult {
	const videoRef = useRef<HTMLVideoElement>(null)
	const mediaSourceRef = useRef<MediaSource | null>(null)
	const sourceBufferRef = useRef<SourceBuffer | null>(null)
	const wsRef = useRef<WebSocket | null>(null)
	const objectUrlRef = useRef<string | null>(null)
	const queueRef = useRef<ArrayBuffer[]>([])
	const queueBytesRef = useRef(0)
	const initHandledRef = useRef(false)
	const listenersAbortRef = useRef<AbortController | null>(null)
	const deadlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const reconnectGenerationRef = useRef(0)
	// The vmId we actually started a backend session for, so teardown stops the
	// RIGHT one on a vmId change (best-effort encode-session release).
	const startedVmIdRef = useRef<string | null>(null)
	const vmIdRef = useRef(vmId)

	const [status, setStatus] = useState<VmEncodedScreenStatus>('idle')

	// Stash the mutations in refs so connect/teardown callbacks never capture a
	// stale mutation object (mirrors use-webapp-vnc's optionsRef idiom).
	const startEncodedScreenMut = trpcReact.vm.startEncodedScreen.useMutation()
	const stopEncodedScreenMut = trpcReact.vm.stopEncodedScreen.useMutation()
	const startEncodedScreenMutRef = useRef(startEncodedScreenMut)
	const stopEncodedScreenMutRef = useRef(stopEncodedScreenMut)
	useEffect(() => {
		vmIdRef.current = vmId
		startEncodedScreenMutRef.current = startEncodedScreenMut
		stopEncodedScreenMutRef.current = stopEncodedScreenMut
	}, [vmId, startEncodedScreenMut, stopEncodedScreenMut])

	// Full teardown: bump generation (invalidates every in-flight async +
	// event handler), clear the deadline, detach all listeners, close the WS,
	// revoke the object URL, drop the queue, and best-effort stop the backend
	// encode session. Runs on unmount and on vmId change.
	const teardown = useCallback(() => {
		reconnectGenerationRef.current++
		if (deadlineTimerRef.current) {
			clearTimeout(deadlineTimerRef.current)
			deadlineTimerRef.current = null
		}
		// Abort removes all video/SourceBuffer listeners attached with the signal.
		try {
			listenersAbortRef.current?.abort()
		} catch {
			/* noop */
		}
		listenersAbortRef.current = null
		const ws = wsRef.current
		wsRef.current = null
		if (ws) {
			ws.onopen = null
			ws.onmessage = null
			ws.onerror = null
			ws.onclose = null
			try {
				ws.close()
			} catch {
				/* noop */
			}
		}
		const sb = sourceBufferRef.current
		sourceBufferRef.current = null
		const ms = mediaSourceRef.current
		mediaSourceRef.current = null
		if (ms && sb) {
			try {
				ms.removeSourceBuffer(sb)
			} catch {
				/* noop */
			}
		}
		const video = videoRef.current
		if (video) {
			try {
				video.removeAttribute('src')
				video.load()
			} catch {
				/* noop */
			}
		}
		if (objectUrlRef.current) {
			try {
				URL.revokeObjectURL(objectUrlRef.current)
			} catch {
				/* noop */
			}
			objectUrlRef.current = null
		}
		queueRef.current = []
		queueBytesRef.current = 0
		initHandledRef.current = false
		// Best-effort release of the backend RFB+ffmpeg pair for the session we
		// actually started (stopEncodedScreen is idempotent server-side).
		const startedId = startedVmIdRef.current
		startedVmIdRef.current = null
		if (startedId) {
			try {
				stopEncodedScreenMutRef.current.mutate({id: startedId})
			} catch {
				/* best-effort */
			}
		}
	}, [])

	// The SINGLE terminal-failure handler. teardown() bumps the generation, so a
	// second failing surface is guarded out at its call site (each handler checks
	// its captured generation before calling fail) — idempotent + terminal.
	const fail = useCallback(
		(kind: 'unavailable' | 'error') => {
			teardown()
			setStatus(kind)
		},
		[teardown],
	)

	const connect = useCallback(async () => {
		const currentVmId = vmIdRef.current
		if (!currentVmId) return
		const generation = ++reconnectGenerationRef.current

		// Cap-slot discipline (research Anti-Pattern): the cheap, synchronous
		// MediaSource support check MUST precede the vm.startEncodedScreen mutation
		// — never burn a backend StreamManager cap slot (and spin up a real
		// RFB+ffmpeg pair) for a browser that can never play the result.
		if (typeof MediaSource === 'undefined') {
			fail('unavailable')
			return
		}

		setStatus('connecting')

		let session: {streamId: string; wsUrl: string}
		try {
			session = await startEncodedScreenMutRef.current.mutateAsync({id: currentVmId})
		} catch {
			// BAD_REQUEST capability refusal (no VAAPI / pre-364 record / race /
			// cap) — all one terminal outcome here; 365-02 may inspect the message.
			if (generation !== reconnectGenerationRef.current) return
			fail('unavailable')
			return
		}
		if (generation !== reconnectGenerationRef.current) return
		startedVmIdRef.current = currentVmId

		// wsUrl is the RELATIVE path /ws/vm-stream/<id>; prefix same-origin exactly
		// as buildVmWsUrl does (cookie auth rides the same-origin handshake).
		const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
		const fullUrl = `${proto}//${window.location.host}${session.wsUrl}`

		const ac = new AbortController()
		listenersAbortRef.current = ac

		// Fail-closed deadline: no real playing frame in time → fall back.
		deadlineTimerRef.current = setTimeout(() => {
			if (generation !== reconnectGenerationRef.current) return
			fail('error')
		}, CONNECT_DEADLINE_MS)

		let ws: WebSocket
		try {
			ws = new WebSocket(fullUrl)
		} catch {
			if (generation !== reconnectGenerationRef.current) return
			fail('error')
			return
		}
		ws.binaryType = 'arraybuffer'
		wsRef.current = ws

		const pump = () => {
			const sb = sourceBufferRef.current
			if (!sb || sb.updating || queueRef.current.length === 0) return
			const chunk = queueRef.current.shift()!
			queueBytesRef.current -= chunk.byteLength
			try {
				sb.appendBuffer(chunk)
			} catch {
				if (generation !== reconnectGenerationRef.current) return
				fail('error')
			}
		}

		const enqueue = (buf: ArrayBuffer) => {
			queueRef.current.push(buf)
			queueBytesRef.current += buf.byteLength
			// Drop-oldest past the cap so a stalled decoder can't grow tab memory.
			while (queueBytesRef.current > MAX_QUEUE_BYTES && queueRef.current.length > 1) {
				const dropped = queueRef.current.shift()!
				queueBytesRef.current -= dropped.byteLength
			}
			pump()
		}

		const handleInitSegment = (data: ArrayBuffer) => {
			const codec = codecStringFromInitSegment(new Uint8Array(data))
			if (!codec) {
				fail('unavailable')
				return
			}
			const mime = `video/mp4; codecs="${codec}"`
			if (!MediaSource.isTypeSupported(mime)) {
				fail('unavailable')
				return
			}
			const video = videoRef.current
			if (!video) {
				fail('error')
				return
			}
			// Honest 'connected' — only on a real playing frame.
			const onPlaying = () => {
				if (generation !== reconnectGenerationRef.current) return
				setStatus('connected')
			}
			video.addEventListener('playing', onPlaying, {signal: ac.signal})
			video.addEventListener('canplay', onPlaying, {signal: ac.signal})
			video.addEventListener(
				'error',
				() => {
					if (generation !== reconnectGenerationRef.current) return
					fail('error')
				},
				{signal: ac.signal},
			)
			// Live-edge catch-up — fight drift so the view stays near-live.
			video.addEventListener(
				'timeupdate',
				() => {
					const buffered = video.buffered
					if (buffered.length === 0) return
					const end = buffered.end(buffered.length - 1)
					if (end - video.currentTime > MAX_LAG_SECONDS) {
						try {
							video.currentTime = end - 0.2
						} catch {
							/* seeking can throw mid-append; harmless */
						}
					}
				},
				{signal: ac.signal},
			)

			const ms = new MediaSource()
			mediaSourceRef.current = ms
			const objectUrl = URL.createObjectURL(ms)
			objectUrlRef.current = objectUrl
			video.src = objectUrl
			ms.addEventListener(
				'sourceopen',
				() => {
					if (generation !== reconnectGenerationRef.current) return
					let sb: SourceBuffer
					try {
						sb = ms.addSourceBuffer(mime)
					} catch {
						fail('error')
						return
					}
					sourceBufferRef.current = sb
					sb.addEventListener('updateend', pump, {signal: ac.signal})
					sb.addEventListener(
						'error',
						() => {
							if (generation !== reconnectGenerationRef.current) return
							fail('error')
						},
						{signal: ac.signal},
					)
					// Init segment is already first in the FIFO queue — drain it.
					pump()
				},
				{signal: ac.signal},
			)
			// Queue the init segment; it appends once 'sourceopen' wires the buffer.
			enqueue(data)
		}

		ws.onmessage = (ev) => {
			if (generation !== reconnectGenerationRef.current) return
			if (!(ev.data instanceof ArrayBuffer)) return
			if (!initHandledRef.current) {
				initHandledRef.current = true
				handleInitSegment(ev.data)
				return
			}
			enqueue(ev.data)
		}
		ws.onerror = () => {
			if (generation !== reconnectGenerationRef.current) return
			fail('error')
		}
		ws.onclose = () => {
			// Any close before a real teardown (generation still current) is a
			// failed attempt — route it to the same terminal fallback (Pitfall 3:
			// a stale/rejected streamId surfaces as a WS close, not a throw).
			if (generation !== reconnectGenerationRef.current) return
			fail('error')
		}
	}, [fail])

	// Sync vmIdRef BEFORE the connect effect (declared above) so connect() reads
	// the fresh id. Connect (or idle) on mount + vmId change; teardown on cleanup.
	useEffect(() => {
		if (!vmId) {
			setStatus('idle')
			teardown()
			return
		}
		void connect()
		return () => {
			teardown()
		}
	}, [vmId, connect, teardown])

	return {videoRef, status}
}
