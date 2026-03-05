'use client';

/**
 * VoiceButton — Push-to-talk component for the AI Chat input area.
 *
 * Protocol:
 *   - Connects to /ws/voice?token=<jwt> using the same JWT stored in localStorage.
 *   - Hold to record (pointerdown), release to send (pointerup / pointerleave).
 *   - Sends JSON control messages: { type: 'start-listening' } / { type: 'stop-listening' }.
 *   - Sends audio as binary WebM/Opus frames via MediaRecorder (250ms chunks).
 *   - Receives { type: 'transcript', text, isFinal } and calls onTranscript with final text.
 *   - Only renders when voice is configured (getVoiceConfig returns enabled + keys present).
 *
 * Usage:
 *   <VoiceButton onTranscript={(text) => setInput((prev) => prev + text)} disabled={isLoading} />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpcReact } from '@/trpc/client';
import { getJwt } from '@/trpc/client';

// ── Types ─────────────────────────────────────────────────────────────────────

type VoiceState =
  | 'unavailable'   // voice not configured or no JWT
  | 'disconnected'  // WS closed, reconnecting
  | 'connecting'    // WS open event not yet fired
  | 'idle'          // connected, waiting for push-to-talk
  | 'listening'     // recording audio
  | 'processing';   // sent stop-listening, awaiting transcript

interface VoiceButtonProps {
  /** Called with the final transcription text so the parent can insert it into the input. */
  onTranscript: (text: string) => void;
  /** Disable the button (e.g. while an AI response is in-flight). */
  disabled?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VoiceButton({ onTranscript, disabled }: VoiceButtonProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('unavailable');
  const [interimText, setInterimText] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isUnmountedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // ── Voice config query ────────────────────────────────────────────────────

  const { data: voiceConfig } = trpcReact.ai.getVoiceConfig.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const isConfigured = !!(
    voiceConfig?.enabled &&
    voiceConfig.hasDeepgramKey &&
    voiceConfig.hasCartesiaKey
  );

  // ── WebSocket management ──────────────────────────────────────────────────

  const connectWebSocket = useCallback(() => {
    if (isUnmountedRef.current || !isConfigured) return;

    const jwt = getJwt();
    if (!jwt) {
      setVoiceState('unavailable');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const port = window.location.port ? `:${window.location.port}` : '';
    const wsUrl = `${protocol}//${window.location.hostname}${port}/ws/voice?token=${jwt}`;

    setVoiceState('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        // State will flip to 'idle' once we receive the { type: 'connected' } control message.
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        // Ignore binary frames — we don't play TTS in this simplified button
        if (event.data instanceof ArrayBuffer) return;

        try {
          const msg = JSON.parse(event.data as string) as {
            type: string;
            text?: string;
            isFinal?: boolean;
            to?: string;
          };

          switch (msg.type) {
            case 'connected':
              setVoiceState('idle');
              break;

            case 'transcript':
              if (msg.text) {
                setInterimText(msg.text);
                if (msg.isFinal && msg.text.trim()) {
                  onTranscript(msg.text.trim());
                  setInterimText('');
                }
              }
              break;

            case 'state-change':
              if (msg.to === 'idle') {
                setVoiceState('idle');
                setInterimText('');
              } else if (msg.to === 'processing') {
                setVoiceState('processing');
              }
              break;

            case 'tts-done':
              setVoiceState('idle');
              setInterimText('');
              break;

            case 'error':
              console.error('[VoiceButton] server error:', (msg as any).message);
              break;
          }
        } catch {
          // Non-JSON frame — ignore
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!isUnmountedRef.current && isConfigured) {
          setVoiceState('disconnected');
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        // onclose will fire next; just log
        console.error('[VoiceButton] WebSocket error');
      };
    } catch (err) {
      console.error('[VoiceButton] Failed to create WebSocket:', err);
      setVoiceState('disconnected');
      scheduleReconnect();
    }
  }, [isConfigured, onTranscript]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleReconnect = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (reconnectAttemptsRef.current >= 5) {
      setVoiceState('unavailable');
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 16_000);
    reconnectAttemptsRef.current++;
    reconnectTimerRef.current = setTimeout(() => {
      if (!isUnmountedRef.current) connectWebSocket();
    }, delay);
  }, [connectWebSocket]);

  // Connect / disconnect whenever isConfigured changes
  useEffect(() => {
    isUnmountedRef.current = false;

    if (isConfigured) {
      connectWebSocket();
    } else {
      setVoiceState('unavailable');
    }

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    };
  }, [isConfigured, connectWebSocket]);

  // ── Push-to-talk handlers ─────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    if (voiceState !== 'idle') return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          e.data.arrayBuffer().then((buf) => wsRef.current?.send(buf));
        }
      };

      // Notify server we are starting
      wsRef.current.send(
        JSON.stringify({ type: 'start-listening', format: 'webm-opus', micCapture: Date.now() }),
      );

      recorder.start(250); // 250ms chunks for real-time streaming
      setVoiceState('listening');
    } catch (err) {
      console.error('[VoiceButton] Microphone access error:', err);
    }
  }, [voiceState]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop-listening' }));
    }
    // Transition to processing; server will send state-change back to idle when done
    if (voiceState === 'listening') {
      setVoiceState('processing');
    }
  }, [voiceState]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      startListening();
    },
    [startListening],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      stopListening();
    },
    [stopListening],
  );

  // ── Render guard ──────────────────────────────────────────────────────────

  if (voiceState === 'unavailable') return null;

  // ── Visual state ──────────────────────────────────────────────────────────

  const isRecording = voiceState === 'listening';
  const isProcessing = voiceState === 'processing';
  const isDisconnected = voiceState === 'disconnected' || voiceState === 'connecting';

  return (
    <div className="relative flex items-center">
      {/* Interim transcript popover */}
      {interimText && (
        <div
          className={cn(
            'absolute bottom-full mb-2 right-0 max-w-[280px] min-w-[100px]',
            'rounded-xl border border-border bg-surface-1 shadow-md',
            'px-3 py-1.5',
          )}
        >
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse shrink-0" />
            <span className="text-[11px] text-text-secondary truncate">{interimText}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        disabled={disabled || isDisconnected}
        aria-label={
          isRecording
            ? 'Release to send voice message'
            : isProcessing
              ? 'Processing voice...'
              : isDisconnected
                ? 'Voice connecting...'
                : 'Hold to speak'
        }
        title={
          isRecording
            ? 'Release to send'
            : isProcessing
              ? 'Processing...'
              : isDisconnected
                ? 'Reconnecting...'
                : 'Hold to speak'
        }
        className={cn(
          // Base — matches the send Button size="icon" footprint (h-9 w-9 rounded-lg)
          'inline-flex h-9 w-9 items-center justify-center rounded-lg',
          'font-medium transition-all duration-fast cursor-pointer select-none',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          'disabled:opacity-50 disabled:pointer-events-none',
          // Idle state
          !isRecording && !isProcessing && !isDisconnected && [
            'bg-neutral-100 text-text-secondary border border-border',
            'hover:bg-neutral-200 hover:text-text',
            'active:bg-neutral-300',
          ],
          // Recording state — brand color with pulse ring
          isRecording && [
            'bg-brand text-white shadow-sm',
            'ring-2 ring-brand/40 ring-offset-1 animate-pulse',
          ],
          // Processing state
          isProcessing && 'bg-neutral-100 text-brand border border-brand/30',
          // Disconnected / connecting
          isDisconnected && 'bg-neutral-100 text-text-tertiary border border-border cursor-wait',
        )}
      >
        {isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isDisconnected ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
