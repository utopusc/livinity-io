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
}

export class VoiceSession extends EventEmitter {
  private state: VoiceState = 'idle';
  private ws: WebSocket;
  private sessionId: string;
  private redis: Redis;
  private lastActivity: number = Date.now();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(opts: VoiceSessionOpts) {
    super();
    this.ws = opts.ws;
    this.sessionId = opts.sessionId;
    this.redis = opts.redis;
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
        this.setState('listening');
        break;
      case 'stop-listening':
        if (this.state === 'listening') {
          this.setState('processing');
        }
        break;
      case 'cancel':
        this.setState('idle');
        break;
      default:
        logger.debug('[VoiceSession] unknown control message type', {
          sessionId: this.sessionId.slice(0, 8),
          type: (msg as any).type,
        });
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
