/**
 * VoiceSession — State machine for a single real-time voice connection.
 *
 * States: idle -> listening -> processing -> speaking -> idle
 *
 * Handles binary audio frames (in/out), JSON control messages,
 * and keep-alive pings over the WebSocket connection.
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import type { Redis } from 'ioredis';
import { logger } from '../logger.js';
import { DeepgramRelay } from './deepgram-relay.js';
import type { DeepgramTranscript } from './deepgram-relay.js';
import { CartesiaRelay } from './cartesia-relay.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface VoiceSessionEvents {
  'audio-in': (chunk: Buffer) => void;
  'transcript': (text: string, isFinal: boolean) => void;
  'audio-out': (chunk: Buffer) => void;
  'state-change': (from: VoiceState, to: VoiceState) => void;
  'error': (error: Error) => void;
  'close': () => void;
}

/** Control message types sent from the browser */
interface ControlMessage {
  type: 'start-listening' | 'stop-listening' | 'cancel';
}

/** Valid state transitions (from -> allowed targets) */
const VALID_TRANSITIONS: Record<VoiceState, VoiceState[]> = {
  idle: ['listening'],
  listening: ['processing', 'idle'],
  processing: ['speaking', 'idle'],
  speaking: ['idle'],
};

// ── VoiceSession Class ───────────────────────────────────────────────────────

export interface VoiceSessionOpts {
  ws: WebSocket;
  sessionId: string;
  redis: Redis;
  /** Deepgram API key for STT. If missing, start-listening will error. */
  deepgramApiKey?: string;
  /** Deepgram STT model (default: 'nova-3') */
  sttModel?: string;
  /** Deepgram STT language (default: 'en') */
  sttLanguage?: string;
  /** Callback invoked when a complete utterance (speechFinal) is transcribed. */
  onTranscript?: (sessionId: string, text: string) => void;
  /** Cartesia API key for TTS. If missing, TTS will be skipped. */
  cartesiaApiKey?: string;
  /** Cartesia voice ID (UUID). */
  cartesiaVoiceId?: string;
  /** Cartesia model ID (default: 'sonic-2'). */
  cartesiaModelId?: string;
}

export class VoiceSession extends EventEmitter {
  private state: VoiceState = 'idle';
  private ws: WebSocket;
  private sessionId: string;
  private redis: Redis;
  private lastActivity: number = Date.now();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  // STT integration
  private sttRelay: DeepgramRelay | null = null;
  private deepgramApiKey?: string;
  private sttModel?: string;
  private sttLanguage?: string;
  private onTranscript?: (sessionId: string, text: string) => void;
  private receivedTranscript = false; // Track if any transcript was received during listening

  // TTS integration
  private ttsRelay: CartesiaRelay | null = null;
  private cartesiaApiKey?: string;
  private cartesiaVoiceId?: string;
  private cartesiaModelId?: string;

  constructor(opts: VoiceSessionOpts) {
    super();
    this.ws = opts.ws;
    this.sessionId = opts.sessionId;
    this.redis = opts.redis;
    this.deepgramApiKey = opts.deepgramApiKey;
    this.sttModel = opts.sttModel;
    this.sttLanguage = opts.sttLanguage;
    this.onTranscript = opts.onTranscript;
    this.cartesiaApiKey = opts.cartesiaApiKey;
    this.cartesiaVoiceId = opts.cartesiaVoiceId;
    this.cartesiaModelId = opts.cartesiaModelId;
  }

  // ── State Machine ────────────────────────────────────────────────────────

  /**
   * Transition to a new state. Validates the transition is legal.
   * Any state can reset to 'idle' (cancel/error recovery).
   */
  setState(newState: VoiceState): boolean {
    const from = this.state;
    if (from === newState) return true;

    // Any state can reset to idle
    if (newState === 'idle' || VALID_TRANSITIONS[from].includes(newState)) {
      this.state = newState;
      logger.debug('[VoiceSession] state transition', {
        sessionId: this.sessionId.slice(0, 8),
        from,
        to: newState,
      });
      this.emit('state-change', from, newState);
      return true;
    }

    logger.warn('[VoiceSession] invalid state transition', {
      sessionId: this.sessionId.slice(0, 8),
      from,
      to: newState,
    });
    return false;
  }

  getState(): VoiceState {
    return this.state;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  // ── Message Handlers ─────────────────────────────────────────────────────

  /**
   * Handle incoming binary audio data from the browser.
   * Only processes audio when in 'listening' state.
   */
  handleBinaryMessage(data: Buffer): void {
    this.lastActivity = Date.now();

    if (this.state === 'listening') {
      this.emit('audio-in', data);
      // Relay audio to Deepgram STT
      if (this.sttRelay) {
        this.sttRelay.send(data);
      }
    } else {
      logger.debug('[VoiceSession] ignoring binary data in state', {
        sessionId: this.sessionId.slice(0, 8),
        state: this.state,
        bytes: data.length,
      });
    }
  }

  /**
   * Handle incoming JSON control messages from the browser.
   * Supported: start-listening, stop-listening, cancel
   */
  handleTextMessage(data: string): void {
    this.lastActivity = Date.now();

    let msg: ControlMessage;
    try {
      msg = JSON.parse(data);
    } catch {
      logger.warn('[VoiceSession] invalid JSON control message', {
        sessionId: this.sessionId.slice(0, 8),
        data: data.slice(0, 100),
      });
      return;
    }

    switch (msg.type) {
      case 'start-listening':
        this.startListening();
        break;
      case 'stop-listening':
        this.stopListening();
        break;
      case 'cancel':
        this.closeSttRelay();
        this.receivedTranscript = false;
        this.setState('idle');
        break;
      default:
        logger.debug('[VoiceSession] unknown control message type', {
          sessionId: this.sessionId.slice(0, 8),
          type: (msg as any).type,
        });
    }
  }

  // ── STT Integration ────────────────────────────────────────────────────────

  /**
   * Start listening: create DeepgramRelay, wire transcript events, connect.
   * Sends error to browser if Deepgram API key is not configured.
   */
  private startListening(): void {
    if (!this.deepgramApiKey) {
      this.sendControl({ type: 'error', message: 'Deepgram API key not configured' });
      logger.warn('[VoiceSession] start-listening failed: no Deepgram API key', {
        sessionId: this.sessionId.slice(0, 8),
      });
      return;
    }

    // Close any existing relay
    this.closeSttRelay();
    this.receivedTranscript = false;

    // Create a new DeepgramRelay
    this.sttRelay = new DeepgramRelay({
      apiKey: this.deepgramApiKey,
      model: this.sttModel,
      language: this.sttLanguage,
    });

    // Wire transcript events
    this.sttRelay.on('transcript', (t: DeepgramTranscript) => {
      // Send all transcripts (interim + final) to the browser for visual feedback
      this.sendControl({
        type: 'transcript',
        text: t.text,
        isFinal: t.isFinal,
        confidence: t.confidence,
      });

      // On speechFinal (end of complete utterance), trigger AI processing
      if (t.speechFinal) {
        this.receivedTranscript = true;

        logger.info('[VoiceSession] Speech-final transcript received', {
          sessionId: this.sessionId.slice(0, 8),
          text: t.text.slice(0, 80),
          confidence: t.confidence.toFixed(2),
        });

        // Send to daemon for AI processing
        if (this.onTranscript) {
          this.onTranscript(this.sessionId, t.text);
        }

        // Transition to processing state
        this.setState('processing');
      }
    });

    this.sttRelay.on('error', (err: Error) => {
      this.sendControl({ type: 'error', message: `STT error: ${err.message}` });
      logger.error('[VoiceSession] DeepgramRelay error', {
        sessionId: this.sessionId.slice(0, 8),
        error: err.message,
      });
    });

    // Connect to Deepgram
    this.sttRelay.connect();

    // Transition to listening
    this.setState('listening');

    logger.info('[VoiceSession] Started listening with Deepgram STT', {
      sessionId: this.sessionId.slice(0, 8),
      model: this.sttModel ?? 'nova-3',
      language: this.sttLanguage ?? 'en',
    });
  }

  /**
   * Stop listening: close the STT relay and transition state.
   * If a transcript was received, transition to 'processing'.
   * If no transcript was received, transition to 'idle'.
   */
  private stopListening(): void {
    if (this.state !== 'listening') return;

    this.closeSttRelay();

    if (this.receivedTranscript) {
      this.setState('processing');
    } else {
      this.setState('idle');
    }

    this.receivedTranscript = false;
  }

  /**
   * Close the DeepgramRelay if it exists.
   */
  private closeSttRelay(): void {
    if (this.sttRelay) {
      this.sttRelay.close();
      this.sttRelay = null;
    }
  }

  // ── TTS Integration ────────────────────────────────────────────────────────

  /**
   * Initialize Cartesia TTS relay. Creates the WebSocket connection
   * and wires audio/done/error events to the browser WebSocket.
   */
  private startTts(): void {
    if (!this.cartesiaApiKey) {
      logger.warn('[VoiceSession] TTS skipped: no Cartesia API key', {
        sessionId: this.sessionId.slice(0, 8),
      });
      return;
    }

    if (!this.cartesiaVoiceId) {
      logger.warn('[VoiceSession] TTS skipped: no Cartesia voice ID', {
        sessionId: this.sessionId.slice(0, 8),
      });
      return;
    }

    // Close any existing TTS relay
    this.closeTtsRelay();

    this.ttsRelay = new CartesiaRelay({
      apiKey: this.cartesiaApiKey,
      voiceId: this.cartesiaVoiceId,
      modelId: this.cartesiaModelId,
    });

    // Relay audio chunks to browser as binary WebSocket frames
    this.ttsRelay.on('audio', (chunk: Buffer) => {
      this.sendAudio(chunk);
      // Transition processing -> speaking on first audio chunk
      if (this.state === 'processing') {
        this.setState('speaking');
      }
    });

    // TTS synthesis complete
    this.ttsRelay.on('done', () => {
      this.sendControl({ type: 'tts-done' });
      this.setState('idle');
      this.closeTtsRelay();
    });

    // TTS errors
    this.ttsRelay.on('error', (err: Error) => {
      this.sendControl({ type: 'error', message: `TTS error: ${err.message}` });
      logger.error('[VoiceSession] CartesiaRelay error', {
        sessionId: this.sessionId.slice(0, 8),
        error: err.message,
      });
    });

    // Connect to Cartesia
    this.ttsRelay.connect();

    logger.info('[VoiceSession] Started TTS with Cartesia', {
      sessionId: this.sessionId.slice(0, 8),
      voiceId: this.cartesiaVoiceId?.slice(0, 8),
      modelId: this.cartesiaModelId ?? 'sonic-2',
    });
  }

  /**
   * Send text for TTS synthesis. Lazy-initializes the TTS relay on first call.
   * @param text - Text to synthesize into speech
   * @param isFinal - If true, flushes the TTS buffer after sending
   */
  speakText(text: string, isFinal?: boolean): void {
    // Lazy-init TTS on first speakText call
    if (!this.ttsRelay || !this.ttsRelay.isConnected()) {
      this.startTts();
    }

    if (!this.ttsRelay) {
      logger.warn('[VoiceSession] speakText: TTS relay not available', {
        sessionId: this.sessionId.slice(0, 8),
      });
      return;
    }

    this.ttsRelay.synthesize(text);

    // If this is the last text chunk, flush after a short delay
    // to ensure the text message is sent before the flush
    if (isFinal) {
      setTimeout(() => {
        if (this.ttsRelay?.isConnected()) {
          this.ttsRelay.flush();
        }
      }, 50);
    }
  }

  /**
   * Close the CartesiaRelay if it exists.
   */
  private closeTtsRelay(): void {
    if (this.ttsRelay) {
      this.ttsRelay.close();
      this.ttsRelay = null;
    }
  }

  // ── Outbound ─────────────────────────────────────────────────────────────

  /**
   * Send binary audio data to the browser.
   * Transitions to 'speaking' state if not already.
   */
  sendAudio(chunk: Buffer): void {
    if (this.closed) return;

    if (this.state !== 'speaking') {
      this.setState('speaking');
    }

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(chunk, { binary: true });
    }
  }

  /**
   * Send a JSON control message to the browser.
   * Used for state updates, transcript text, latency data, etc.
   */
  sendControl(msg: Record<string, unknown>): void {
    if (this.closed) return;

    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  // ── Keep-Alive ───────────────────────────────────────────────────────────

  /**
   * Start periodic WebSocket pings to keep the connection alive.
   * Default interval: 25 seconds (under typical 30s proxy timeouts).
   */
  startKeepAlive(intervalMs = 25_000): void {
    this.stopKeepAlive();

    this.pingInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      } else {
        this.close();
      }
    }, intervalMs);
  }

  private stopKeepAlive(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Close the session: stop keep-alive, close the WebSocket,
   * emit 'close', and remove all listeners.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    this.stopKeepAlive();
    this.closeSttRelay();
    this.closeTtsRelay();

    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.close(1000, 'Session closed');
    }

    this.emit('close');
    this.removeAllListeners();

    logger.debug('[VoiceSession] closed', {
      sessionId: this.sessionId.slice(0, 8),
      lastState: this.state,
    });
  }

  /** Get the last activity timestamp (for idle detection). */
  getLastActivity(): number {
    return this.lastActivity;
  }
}
