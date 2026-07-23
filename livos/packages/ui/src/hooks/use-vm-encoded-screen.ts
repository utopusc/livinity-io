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
// VIDEO-OUT + a thin client→server input sender (367-02): the hook owns the
// videoRef + the MediaSource/SourceBuffer/WS lifecycle and additionally
// exposes `sendInput`, a guarded JSON send on its OWN admitted socket — the
// 367-01 server side parses/validates/rate-limits every frame (vm-input.ts);
// nothing here is the trust boundary. Event CAPTURE (pointer/keyboard/the
// noVNC Keyboard class) lives in use-vm-input.ts; the <video> element itself
// is rendered by the consumer (365-02).

import {useCallback, useEffect, useRef, useState} from 'react'

import {trpcReact} from '@/trpc/trpc'
import {codecStringFromInitSegment} from '@/utils/parse-avc-codec'
import type {VmInputMessage} from '@/utils/vm-input-coords'

export type VmEncodedScreenStatus = 'idle' | 'connecting' | 'connected' | 'unavailable' | 'error'

export interface UseVmEncodedScreenResult {
	videoRef: React.RefObject<HTMLVideoElement>
	status: VmEncodedScreenStatus
	/** Send one input frame over the hook's OWN stream socket (no-op unless OPEN). */
	sendInput: (msg: VmInputMessage) => void
}

// Client-side append-queue cap — a stalled decoder can't grow tab memory
// without bound (drop-oldest past this). Mirrors the server Fmp4Fanout's own
// 4 MB per-subscriber backpressure precedent (T-365-02).
const MAX_QUEUE_BYTES = 8 * 1024 * 1024
// Fail-closed connect deadline: if a real playing frame hasn't arrived by now,
// fall back rather than spin forever (mirrors the 364-01 startTimeoutMs
// guarantee — connect NEVER hangs).
const CONNECT_DEADLINE_MS = 15_000
// Live-edge chase tuning (Phase 366, VMENC-01) — the playbackRate chase is the
// industry-standard MSE live-edge technique (hls.js maxLiveSyncPlaybackRate /
// dash.js liveCatchup), replacing the old 1.5 s seek-only tolerance that let up
// to 1.5 s of STANDING latency sit forever. NOTE: KEEP_SECONDS below is
// MEMORY-only (behind the playhead) — honestly NOT a latency knob (Pitfall 6).
//
// Hold-back from the buffered end — decode headroom: Chromium needs ~3 decoded
// frames (~100 ms at 30 fps) before playback starts, so 0.3 s is safe; seeking
// closer risks a seek→waiting→stall loop.
const TARGET_LIVE_OFFSET_S = 0.3
// Beyond this drift, engage the gentle rate chase.
const RATE_ENGAGE_DRIFT_S = 0.8
// Gentle, near-invisible catch-up speed.
const CHASE_RATE = 1.1
// Beyond this (stall / backgrounded tab), hard-jump near the edge instead.
const JUMP_DRIFT_S = 2.5
// Live-window eviction (WR-02): keep only this many seconds of decoded media
// behind the playhead. The 8 MB queue cap bounds only the PENDING append queue,
// not the SourceBuffer's buffered range — without eviction a long live session
// grows until QuotaExceededError. `sb.remove` operates on a TIME range, so the
// init segment (ftyp+moov, decode metadata — not part of any time range) is
// never touched by it (IN-01, SourceBuffer side).
const KEEP_SECONDS = 30

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
	// The init segment (ftyp+moov) is held APART from the drop-oldest media queue
	// (IN-01): a pre-sourceopen media burst > MAX_QUEUE_BYTES must never shift the
	// init out of the FIFO. It is appended first, exactly once, before any media.
	const initSegmentRef = useRef<ArrayBuffer | null>(null)
	const initAppendedRef = useRef(false)
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
		initSegmentRef.current = null
		initAppendedRef.current = false
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

		// Fail-closed connect deadline — ARM BEFORE the mutation await (WR-01) so
		// the ENTIRE connect (mutation + WS handshake + first frame) is bounded: a
		// hung startEncodedScreen (network stall with a live TCP conn, proxy hang
		// that never resolves/rejects) can no longer spin 'connecting' forever.
		// One shared timer covers connecting→connected; it is CLEARED on the real
		// 'playing' event (onPlaying, CR-01) and in teardown(). The generation
		// check inside the callback makes early arming safe.
		deadlineTimerRef.current = setTimeout(() => {
			if (generation !== reconnectGenerationRef.current) return
			fail('error')
		}, CONNECT_DEADLINE_MS)

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
			if (!sb || sb.updating) return
			// Init segment ALWAYS appends first, exactly once, before any media
			// fragment — held apart from the drop-oldest queue so it can never be
			// evicted (IN-01).
			if (!initAppendedRef.current) {
				const init = initSegmentRef.current
				if (!init) return
				initAppendedRef.current = true
				try {
					sb.appendBuffer(init)
				} catch {
					if (generation !== reconnectGenerationRef.current) return
					fail('error')
				}
				return
			}
			if (queueRef.current.length === 0) return
			const chunk = queueRef.current.shift()!
			queueBytesRef.current -= chunk.byteLength
			try {
				sb.appendBuffer(chunk)
			} catch {
				if (generation !== reconnectGenerationRef.current) return
				fail('error')
			}
		}

		// Live-window eviction (WR-02): reclaim decoded frames older than
		// KEEP_SECONDS behind the playhead. Guarded on !sb.updating AND an empty
		// pending queue (never remove-while-updating — that throws — and never
		// starve a pending append). Driven from the updateend queue + timeupdate.
		// `remove` takes a TIME range from buffered.start(0); the init segment is
		// decode metadata outside any time range and is never touched (IN-01).
		const evict = () => {
			const sb = sourceBufferRef.current
			const video = videoRef.current
			if (!sb || sb.updating || !video) return
			if (!initAppendedRef.current || queueRef.current.length > 0) return
			const buffered = sb.buffered
			if (buffered.length === 0) return
			const start = buffered.start(0)
			const target = video.currentTime - KEEP_SECONDS
			if (target > start + 1) {
				try {
					sb.remove(start, target)
				} catch {
					/* remove can throw mid-state; harmless — retried on next updateend */
				}
			}
		}

		// Live-edge chase (Phase 366, VMENC-01): converge on TARGET_LIVE_OFFSET_S
		// behind the buffered end and STAY there. Driven from BOTH 'timeupdate'
		// (~4 Hz, does NOT fire while stalled) and the updateend path (per append,
		// ~30 Hz with frag_every_frame) — the updateend driver is what lets drift
		// accumulated during a stall self-heal instead of standing forever. The
		// per-call work is a handful of property reads — no throttle needed.
		// No generation check needed: the listeners invoking this die with the
		// ac.signal abort in teardown, and the function touches only element-level
		// properties (currentTime/playbackRate) — never deadlineTimerRef (CR-01
		// stays dead after connect; a chase-induced seek merely re-fires the
		// idempotent onPlaying).
		const chaseLiveEdge = () => {
			const video = videoRef.current
			const sb = sourceBufferRef.current
			if (!video || !sb) return
			const buffered = video.buffered
			if (buffered.length === 0) return
			const end = buffered.end(buffered.length - 1)
			const drift = end - video.currentTime
			// Initial placement / gross catch-up: a currentTime outside the live
			// range (far-from-0 baseMediaDecodeTime, long tab-background) or gross
			// drift → one jump near the edge, never closer than the hold-back.
			if (video.currentTime < buffered.start(buffered.length - 1) || drift > JUMP_DRIFT_S) {
				try {
					video.currentTime = Math.max(buffered.start(buffered.length - 1), end - TARGET_LIVE_OFFSET_S)
				} catch {
					/* seeking can throw mid-append; harmless — retried on next driver tick */
				}
				return
			}
			// Gentle chase: speed up past RATE_ENGAGE_DRIFT_S, release back to 1x
			// once we've converged on the hold-back (small hysteresis avoids
			// rate-flapping around the threshold).
			if (drift > RATE_ENGAGE_DRIFT_S) {
				if (video.playbackRate !== CHASE_RATE) video.playbackRate = CHASE_RATE
			} else if (video.playbackRate !== 1 && drift <= TARGET_LIVE_OFFSET_S + 0.1) {
				video.playbackRate = 1
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
			// Honest 'connected' — only on a real playing frame. CR-01: this is the
			// ONLY place that disarms the connect deadline. Without this clear the
			// shared timer fires at CONNECT_DEADLINE_MS on the HAPPY path and demotes
			// the working <video> to RFB; after 'connected' the deadline must NEVER
			// fire. (Success ≠ teardown, so teardown's clear alone is insufficient.)
			const onPlaying = () => {
				if (generation !== reconnectGenerationRef.current) return
				if (deadlineTimerRef.current) {
					clearTimeout(deadlineTimerRef.current)
					deadlineTimerRef.current = null
				}
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
			// Live-edge chase driver 1 of 2 — the second rides onUpdateEnd, which
			// keeps chasing while the element is stalled ('timeupdate' does not fire
			// then).
			video.addEventListener(
				'timeupdate',
				() => {
					chaseLiveEdge()
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
					// On each completed append/remove: drain queued media, then (queue
					// empty, not updating) reclaim the live window behind the playhead,
					// then chase the live edge LAST — after the append settles, so the
					// chase reads the settled buffered range (Pitfall 5 ordering).
					const onUpdateEnd = () => {
						pump()
						evict()
						chaseLiveEdge()
					}
					sb.addEventListener('updateend', onUpdateEnd, {signal: ac.signal})
					sb.addEventListener(
						'error',
						() => {
							if (generation !== reconnectGenerationRef.current) return
							fail('error')
						},
						{signal: ac.signal},
					)
					// Init segment is held in its dedicated ref — pump appends it first.
					pump()
				},
				{signal: ac.signal},
			)
			// Hold the init segment apart from the drop-oldest media queue (IN-01);
			// pump() appends it before any media once 'sourceopen' wires the buffer.
			initSegmentRef.current = data
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

	// 367-02: guarded input send on the hook's OWN admitted socket (the
	// multiplex invariant — input never opens a second socket). Deliberately
	// NO status read here (staleness — the callback identity is stable); the
	// CONSUMER gates on status === 'connected', and the OPEN check makes a
	// send during connect/teardown a silent no-op, never a throw.
	const sendInput = useCallback((msg: VmInputMessage) => {
		const ws = wsRef.current
		if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
	}, [])

	return {videoRef, status, sendInput}
}
