/**
 * VoiceGateway — WebSocket gateway for real-time voice streaming.
 *
 * Handles /ws/voice upgrade requests with JWT/API key authentication,
 * creates VoiceSession instances per connection, and routes binary
 * audio frames and JSON control messages to sessions.
 *
 * Coexists with WsGateway (/ws/agent) — each checks its own path
 * on the shared httpServer 'upgrade' event.
 */

import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import type { Redis } from 'ioredis';
import { logger } from '../logger.js';
import { verifyApiKey, verifyJwt } from '../auth.js';
import { VoiceSession } from './voice-session.js';
import type { Daemon } from '../daemon.js';
import type { VoiceConfig } from '../config/schema.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VoiceGatewayDeps {
  redis: Redis;
  redisSub: Redis;  // Dedicated subscriber for voice response channel
  daemon: Daemon;
  voiceConfig?: VoiceConfig;
}

// ── VoiceGateway Class ───────────────────────────────────────────────────────

export class VoiceGateway {
  private wss: WebSocketServer;
  private sessions: Map<string, VoiceSession> = new Map();
  private deps: VoiceGatewayDeps;

  constructor(server: Server, deps: VoiceGatewayDeps) {
    this.deps = deps;

    // Subscribe to voice response channel for TTS routing
    this.subscribeVoiceResponse();

    // Create WebSocket server with noServer mode for custom upgrade handling
    this.wss = new WebSocketServer({ noServer: true });

    // Handle HTTP upgrade requests for /ws/voice
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/ws/voice') {
        // Not our path — ignore (let other upgrade handlers deal with it)
        return;
      }

      this.authenticateUpgrade(req, url)
        .then((authenticated) => {
          if (!authenticated) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }

          this.wss.handleUpgrade(req, socket, head, (ws) => {
            this.wss.emit('connection', ws, req);
          });
        })
        .catch((err) => {
          logger.error('[VoiceGateway] Auth error during upgrade', { error: (err as Error).message });
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          socket.destroy();
        });
    });

    // Handle new authenticated connections
    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      this.handleConnection(ws);
    });

    logger.info('[VoiceGateway] Voice WebSocket gateway on /ws/voice');
  }

  // ── Authentication ──────────────────────────────────────────────────────

  /**
   * Authenticate a WebSocket upgrade request.
   * Same auth strategy as WsGateway: X-API-Key header, ?token=<jwt>, or Sec-WebSocket-Protocol JWT.
   */
  private async authenticateUpgrade(req: IncomingMessage, url: URL): Promise<boolean> {
    // Check X-API-Key header
    const apiKey = req.headers['x-api-key'];
    if (apiKey && typeof apiKey === 'string') {
      if (verifyApiKey(apiKey)) {
        return true;
      }
    }

    // Check JWT query parameter
    const token = url.searchParams.get('token');
    if (token) {
      if (await verifyJwt(token)) {
        return true;
      }
    }

    // Check Sec-WebSocket-Protocol for JWT (browser fallback)
    const protocol = req.headers['sec-websocket-protocol'];
    if (protocol) {
      const protocols = protocol.split(',').map((p) => p.trim());
      for (const p of protocols) {
        if (p.split('.').length === 3 && await verifyJwt(p)) {
          return true;
        }
      }
    }

    logger.warn('[VoiceGateway] Rejected unauthenticated upgrade', {
      ip: req.socket.remoteAddress,
      hasApiKey: !!apiKey,
      hasToken: !!token,
    });
    return false;
  }

  // ── Connection Handling ─────────────────────────────────────────────────

  private handleConnection(ws: WebSocket): void {
    const sessionId = randomUUID();

    const session = new VoiceSession({
      ws,
      sessionId,
      redis: this.deps.redis,
      deepgramApiKey: this.deps.voiceConfig?.deepgramApiKey,
      sttModel: this.deps.voiceConfig?.sttModel,
      sttLanguage: this.deps.voiceConfig?.sttLanguage,
      cartesiaApiKey: this.deps.voiceConfig?.cartesiaApiKey,
      cartesiaVoiceId: this.deps.voiceConfig?.cartesiaVoiceId,
      cartesiaModelId: this.deps.voiceConfig?.cartesiaModelId,
      onTranscript: (sid: string, text: string) => {
        logger.info('[VoiceGateway] Transcript -> daemon.addToInbox', {
          sessionId: sid.slice(0, 8),
          text: text.slice(0, 80),
        });
        this.deps.daemon.addToInbox(
          text,
          'voice',
          undefined,
          { voiceSessionId: sid },
          sid,
        );
      },
    });

    this.sessions.set(sessionId, session);

    logger.info('[VoiceGateway] Voice session connected', {
      sessionId: sessionId.slice(0, 8),
      activeSessions: this.sessions.size,
    });

    // Send initial control message
    session.sendControl({
      type: 'connected',
      sessionId,
    });

    // Start keep-alive pings
    session.startKeepAlive();

    // Route incoming messages
    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        session.handleBinaryMessage(data);
      } else {
        session.handleTextMessage(data.toString());
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      logger.info('[VoiceGateway] Voice session disconnected', {
        sessionId: sessionId.slice(0, 8),
      });
      session.close();
      this.sessions.delete(sessionId);
    });

    // Handle errors
    ws.on('error', (err) => {
      logger.error('[VoiceGateway] WebSocket error', {
        sessionId: sessionId.slice(0, 8),
        error: err.message,
      });
      session.close();
      this.sessions.delete(sessionId);
    });
  }

  // ── Voice Response Pub/Sub ──────────────────────────────────────────────

  /**
   * Subscribe to nexus:voice:response Redis channel.
   * When the daemon publishes AI response text, route it to the
   * correct VoiceSession's CartesiaRelay for TTS synthesis.
   */
  private subscribeVoiceResponse(): void {
    const sub = this.deps.redisSub;

    sub.subscribe('nexus:voice:response').catch((err) => {
      logger.error('[VoiceGateway] Failed to subscribe to voice response channel', {
        error: (err as Error).message,
      });
    });

    sub.on('message', (channel: string, message: string) => {
      if (channel !== 'nexus:voice:response') return;

      try {
        const data = JSON.parse(message) as {
          sessionId: string;
          text: string;
          isFinal: boolean;
        };

        const session = this.sessions.get(data.sessionId);
        if (!session) {
          logger.debug('[VoiceGateway] Voice response for unknown session', {
            sessionId: data.sessionId.slice(0, 8),
          });
          return;
        }

        session.speakText(data.text, data.isFinal);

        logger.debug('[VoiceGateway] Routed voice response to session', {
          sessionId: data.sessionId.slice(0, 8),
          textLength: data.text.length,
          isFinal: data.isFinal,
        });
      } catch (err) {
        logger.error('[VoiceGateway] Failed to handle voice response', {
          error: (err as Error).message,
        });
      }
    });

    logger.info('[VoiceGateway] Subscribed to nexus:voice:response channel');
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Get the number of active voice sessions. */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /** Look up an active voice session by ID. */
  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Gracefully stop: close all sessions, unsubscribe, and close the WSS. */
  stop(): void {
    // Unsubscribe from voice response channel
    this.deps.redisSub.unsubscribe('nexus:voice:response').catch(() => {});

    for (const [id, session] of this.sessions) {
      session.close();
      this.sessions.delete(id);
    }
    this.wss.close();
    logger.info('[VoiceGateway] Stopped');
  }
}

// Re-export VoiceSession for consumers
export { VoiceSession } from './voice-session.js';
export type { VoiceState, VoiceSessionOpts } from './voice-session.js';
