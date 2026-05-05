/**
 * DeepgramRelay — Persistent WebSocket relay to Deepgram's real-time STT API.
 *
 * Connects to wss://api.deepgram.com/v1/listen, relays binary audio frames
 * from the browser, and parses transcript events back. Reconnects with
 * exponential backoff on connection failure.
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { logger } from '../logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DeepgramRelayConfig {
  apiKey: string;
  model?: string;         // default 'nova-3'
  language?: string;       // default 'en'
  encoding?: string;       // default 'linear16'
  sampleRate?: number;     // default 16000
  channels?: number;       // default 1
  interimResults?: boolean; // default true
  punctuate?: boolean;     // default true
  endpointing?: number;   // default 300 (ms of silence before final)
  utteranceEndMs?: number; // default 1000 (gap between utterances)
}

export interface DeepgramTranscript {
  text: string;
  isFinal: boolean;
  confidence: number;
  speechFinal: boolean;   // End of utterance (not just end of interim)
  timestamp: number;       // When received
}

// ── Deepgram response types ──────────────────────────────────────────────────

interface DeepgramResultMessage {
  type: 'Results';
  channel: {
    alternatives: Array<{
      transcript: string;
      confidence: number;
    }>;
  };
  is_final: boolean;
  speech_final: boolean;
}

// ── DeepgramRelay Class ──────────────────────────────────────────────────────

export class DeepgramRelay extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Required<DeepgramRelayConfig>;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectBackoff = [100, 500, 1000, 2000, 5000]; // ms
  private isClosing = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: DeepgramRelayConfig) {
    super();

    // Apply defaults
    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? 'nova-3',
      language: config.language ?? 'en',
      encoding: config.encoding ?? 'linear16',
      sampleRate: config.sampleRate ?? 16000,
      channels: config.channels ?? 1,
      interimResults: config.interimResults ?? true,
      punctuate: config.punctuate ?? true,
      endpointing: config.endpointing ?? 300,
      utteranceEndMs: config.utteranceEndMs ?? 1000,
    };
  }

  // ── Connection ────────────────────────────────────────────────────────────

  /**
   * Connect to Deepgram's real-time STT WebSocket.
   * Builds the URL with query parameters and authenticates via header.
   */
  connect(): void {
    if (this.isClosing) return;

    const params = new URLSearchParams({
      model: this.config.model,
      language: this.config.language,
      encoding: this.config.encoding,
      sample_rate: String(this.config.sampleRate),
      channels: String(this.config.channels),
      interim_results: String(this.config.interimResults),
      punctuate: String(this.config.punctuate),
      endpointing: String(this.config.endpointing),
      utterance_end_ms: String(this.config.utteranceEndMs),
    });

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    logger.info('[DeepgramRelay] Connecting', {
      model: this.config.model,
      language: this.config.language,
      encoding: this.config.encoding,
      sampleRate: this.config.sampleRate,
    });

    this.ws = new WebSocket(url, {
      headers: {
        Authorization: `Token ${this.config.apiKey}`,
      },
    });

    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      logger.info('[DeepgramRelay] Connected to Deepgram STT');
      this.emit('open');
    });

    this.ws.on('message', (raw: Buffer) => {
      this.handleMessage(raw);
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      logger.info('[DeepgramRelay] WebSocket closed', {
        code,
        reason: reason.toString(),
        isClosing: this.isClosing,
      });

      if (!this.isClosing) {
        this.reconnect();
      }

      this.emit('close');
    });

    this.ws.on('error', (err: Error) => {
      logger.error('[DeepgramRelay] WebSocket error', { error: err.message });
      this.emit('error', err);
    });
  }

  // ── Message Handling ──────────────────────────────────────────────────────

  /**
   * Parse Deepgram's JSON messages and extract transcript data.
   *
   * Deepgram sends:
   * {
   *   "type": "Results",
   *   "channel": { "alternatives": [{ "transcript": "...", "confidence": 0.98 }] },
   *   "is_final": true,
   *   "speech_final": true
   * }
   */
  private handleMessage(raw: Buffer): void {
    let msg: DeepgramResultMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      logger.warn('[DeepgramRelay] Failed to parse message', {
        data: raw.toString().slice(0, 200),
      });
      return;
    }

    // Only process Results messages
    if (msg.type !== 'Results') {
      logger.debug('[DeepgramRelay] Non-results message', { type: msg.type });
      return;
    }

    const alt = msg.channel?.alternatives?.[0];
    if (!alt) return;

    const text = alt.transcript?.trim();
    if (!text) return; // Skip empty transcripts

    const transcript: DeepgramTranscript = {
      text,
      isFinal: msg.is_final ?? false,
      confidence: alt.confidence ?? 0,
      speechFinal: msg.speech_final ?? false,
      timestamp: Date.now(),
    };

    logger.debug('[DeepgramRelay] Transcript received', {
      text: text.slice(0, 80),
      isFinal: transcript.isFinal,
      speechFinal: transcript.speechFinal,
      confidence: transcript.confidence.toFixed(2),
    });

    this.emit('transcript', transcript);
  }

  // ── Audio Relay ───────────────────────────────────────────────────────────

  /**
   * Send binary audio data to Deepgram.
   * Drops frames silently if the WebSocket is not open.
   */
  send(audioChunk: Buffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(audioChunk);
    } else {
      logger.debug('[DeepgramRelay] Dropping audio chunk — WebSocket not open', {
        readyState: this.ws?.readyState,
        chunkSize: audioChunk.length,
      });
    }
  }

  // ── Reconnection ──────────────────────────────────────────────────────────

  /**
   * Attempt to reconnect with exponential backoff.
   * Max 5 attempts with delays: 100, 500, 1000, 2000, 5000ms.
   */
  private reconnect(): void {
    if (this.isClosing) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('[DeepgramRelay] Max reconnect attempts reached', {
        attempts: this.reconnectAttempts,
      });
      this.emit('error', new Error('Max reconnect attempts reached'));
      return;
    }

    const delay = this.reconnectBackoff[this.reconnectAttempts] ?? 5000;
    this.reconnectAttempts++;

    logger.info('[DeepgramRelay] Reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delayMs: delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Close the Deepgram WebSocket connection gracefully.
   * Sends a CloseStream message before closing.
   */
  close(): void {
    this.isClosing = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      // Send Deepgram's close message
      if (this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'CloseStream' }));
        } catch {
          // Ignore send errors during close
        }
      }

      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }

    this.removeAllListeners();

    logger.debug('[DeepgramRelay] Closed');
  }

  /**
   * Check if the WebSocket connection to Deepgram is currently open.
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
