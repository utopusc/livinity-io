/**
 * CartesiaRelay — WebSocket relay to Cartesia's real-time TTS API.
 *
 * Connects to wss://api.cartesia.ai/tts/websocket, sends text for synthesis,
 * and receives base64-encoded audio chunks. Maintains context_id per session
 * for voice continuity (consistent voice characteristics across utterances).
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { logger } from '../logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CartesiaRelayConfig {
  apiKey: string;
  modelId?: string;       // default 'sonic-2'
  voiceId: string;        // UUID for the voice
  outputEncoding?: string; // default 'pcm_s16le' (raw PCM for AudioWorklet)
  sampleRate?: number;     // default 24000 (Cartesia default)
  language?: string;       // default 'en'
}

// ── Cartesia response types ──────────────────────────────────────────────────

interface CartesiaChunkMessage {
  type: 'chunk';
  data: string;        // base64-encoded audio
  step_time: number;
  done: boolean;
}

interface CartesiaDoneMessage {
  type: 'done';
  done: true;
}

interface CartesiaErrorMessage {
  type: 'error';
  message: string;
  status_code?: number;
}

type CartesiaMessage = CartesiaChunkMessage | CartesiaDoneMessage | CartesiaErrorMessage;

// ── CartesiaRelay Class ──────────────────────────────────────────────────────

export class CartesiaRelay extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: {
    apiKey: string;
    modelId: string;
    voiceId: string;
    outputEncoding: string;
    sampleRate: number;
    language: string;
  };
  private contextId: string;
  private isClosing = false;

  constructor(config: CartesiaRelayConfig) {
    super();

    // Apply defaults
    this.config = {
      apiKey: config.apiKey,
      modelId: config.modelId ?? 'sonic-2',
      voiceId: config.voiceId,
      outputEncoding: config.outputEncoding ?? 'pcm_s16le',
      sampleRate: config.sampleRate ?? 24000,
      language: config.language ?? 'en',
    };

    // Persistent context_id per session for voice continuity
    this.contextId = randomUUID();
  }

  // ── Connection ────────────────────────────────────────────────────────────

  /**
   * Connect to Cartesia's real-time TTS WebSocket.
   * Authenticates via API key in the query string.
   */
  connect(): void {
    if (this.isClosing) return;

    const url = `wss://api.cartesia.ai/tts/websocket?api_key=${this.config.apiKey}&cartesia_version=2025-04-16`;

    logger.info('[CartesiaRelay] Connecting', {
      modelId: this.config.modelId,
      voiceId: this.config.voiceId.slice(0, 8),
      outputEncoding: this.config.outputEncoding,
      sampleRate: this.config.sampleRate,
      contextId: this.contextId.slice(0, 8),
    });

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      logger.info('[CartesiaRelay] Connected to Cartesia TTS');
      this.emit('open');
    });

    this.ws.on('message', (raw: Buffer) => {
      this.handleMessage(raw);
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      logger.info('[CartesiaRelay] WebSocket closed', {
        code,
        reason: reason.toString(),
        isClosing: this.isClosing,
      });

      if (!this.isClosing) {
        this.emit('error', new Error(`Cartesia WebSocket closed unexpectedly: code=${code}`));
      }
    });

    this.ws.on('error', (err: Error) => {
      logger.error('[CartesiaRelay] WebSocket error', { error: err.message });
      this.emit('error', err);
    });
  }

  // ── Message Handling ──────────────────────────────────────────────────────

  /**
   * Parse Cartesia's JSON responses and extract audio data.
   *
   * Cartesia sends:
   * - { type: 'chunk', data: '<base64>', step_time: 0.05, done: false }
   * - { type: 'done', done: true }
   * - { type: 'error', message: '...', status_code: 400 }
   */
  private handleMessage(raw: Buffer): void {
    let msg: CartesiaMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      logger.warn('[CartesiaRelay] Failed to parse message', {
        data: raw.toString().slice(0, 200),
      });
      return;
    }

    if (msg.type === 'chunk') {
      // Decode base64 audio data to Buffer
      const audioBuffer = Buffer.from(msg.data, 'base64');
      this.emit('audio', audioBuffer);

      // If this chunk also signals completion
      if (msg.done) {
        this.emit('done');
      }
    } else if (msg.type === 'done') {
      logger.debug('[CartesiaRelay] TTS synthesis complete', {
        contextId: this.contextId.slice(0, 8),
      });
      this.emit('done');
    } else if (msg.type === 'error') {
      const error = new Error(`Cartesia TTS error: ${msg.message} (status: ${msg.status_code ?? 'unknown'})`);
      logger.error('[CartesiaRelay] TTS error', {
        message: msg.message,
        statusCode: msg.status_code,
      });
      this.emit('error', error);
    } else {
      logger.debug('[CartesiaRelay] Unknown message type', { type: (msg as any).type });
    }
  }

  // ── TTS Synthesis ──────────────────────────────────────────────────────────

  /**
   * Send text for TTS synthesis.
   * Text is synthesized with the configured voice and output format.
   * Use `flush` to signal end of text input (flushes Cartesia's internal buffer).
   */
  synthesize(text: string, flush?: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('[CartesiaRelay] Cannot synthesize — WebSocket not open', {
        readyState: this.ws?.readyState,
      });
      return;
    }

    const msg = {
      model_id: this.config.modelId,
      transcript: text,
      voice: { mode: 'id', id: this.config.voiceId },
      output_format: {
        container: 'raw',
        encoding: this.config.outputEncoding,
        sample_rate: this.config.sampleRate,
      },
      language: this.config.language,
      context_id: this.contextId,
      continue: true,
      add_timestamps: false,
    };

    this.ws.send(JSON.stringify(msg));

    logger.debug('[CartesiaRelay] Synthesize sent', {
      textLength: text.length,
      text: text.slice(0, 80),
      flush: !!flush,
    });

    // If flush requested, send a flush message to finalize buffered audio
    if (flush) {
      this.flush();
    }
  }

  /**
   * Flush Cartesia's internal buffer to finalize any remaining audio.
   * Sends a whitespace transcript with continue=false to signal end of input.
   */
  flush(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const flushMsg = {
      model_id: this.config.modelId,
      transcript: ' ',
      voice: { mode: 'id', id: this.config.voiceId },
      output_format: {
        container: 'raw',
        encoding: this.config.outputEncoding,
        sample_rate: this.config.sampleRate,
      },
      language: this.config.language,
      context_id: this.contextId,
      continue: false,
    };

    this.ws.send(JSON.stringify(flushMsg));

    logger.debug('[CartesiaRelay] Flush sent', {
      contextId: this.contextId.slice(0, 8),
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Close the Cartesia WebSocket connection gracefully.
   */
  close(): void {
    this.isClosing = true;

    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.removeAllListeners();

    logger.debug('[CartesiaRelay] Closed', {
      contextId: this.contextId.slice(0, 8),
    });
  }

  /**
   * Check if the WebSocket connection to Cartesia is currently open.
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get the context_id for this session (useful for debugging).
   */
  getContextId(): string {
    return this.contextId;
  }
}
