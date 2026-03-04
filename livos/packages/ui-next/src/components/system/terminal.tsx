'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, Terminal as TerminalIcon, AlertCircle } from 'lucide-react';

export function TerminalLayout() {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'loading' | 'connecting' | 'connected' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      setStatus('loading');

      // Dynamically import xterm
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);

      // Load xterm CSS
      if (!document.getElementById('xterm-css')) {
        const link = document.createElement('link');
        link.id = 'xterm-css';
        link.rel = 'stylesheet';
        link.href = '/node_modules/@xterm/xterm/css/xterm.css';
        document.head.appendChild(link);
      }

      // Clean up previous terminal
      if (termRef.current) {
        termRef.current.dispose();
      }

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        theme: {
          background: '#0a0a0a',
          foreground: '#e0e0e0',
          cursor: '#ffffff',
          selectionBackground: '#ffffff30',
          black: '#0a0a0a',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#e0e0e0',
          brightBlack: '#525252',
          brightRed: '#f87171',
          brightGreen: '#4ade80',
          brightYellow: '#facc15',
          brightBlue: '#60a5fa',
          brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',
          brightWhite: '#ffffff',
        },
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      containerRef.current.innerHTML = '';
      term.open(containerRef.current);
      fitAddon.fit();

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // Connect WebSocket
      setStatus('connecting');
      const token = localStorage.getItem('livinity-token');
      const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProto}//${window.location.host}/terminal?token=${token}`);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('connected');
        // Send initial resize
        const { cols, rows } = term;
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(event.data));
        } else {
          term.write(event.data);
        }
      };

      ws.onerror = () => {
        setStatus('error');
        setError('WebSocket connection failed');
      };

      ws.onclose = () => {
        if (status === 'connected') {
          term.write('\r\n\x1b[31mConnection closed.\x1b[0m\r\n');
        }
      };

      // Send terminal input to WS
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      // Handle resize
      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });

    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Failed to load terminal');
    }
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      wsRef.current?.close();
      termRef.current?.dispose();
    };
  }, [connect]);

  // Resize on container change
  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current) return;

    const observer = new ResizeObserver(() => {
      try {
        fitAddonRef.current?.fit();
      } catch {}
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [status]);

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0a0a0a] text-text-tertiary">
        <AlertCircle className="h-8 w-8 text-error" />
        <p className="text-sm text-error">{error ?? 'Terminal error'}</p>
        <button
          className="text-xs text-brand hover:underline"
          onClick={() => { setError(null); connect(); }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-[#0a0a0a]">
      {(status === 'loading' || status === 'connecting') && (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
          <span className="text-xs text-text-tertiary">
            {status === 'loading' ? 'Loading terminal...' : 'Connecting...'}
          </span>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full p-1" />
    </div>
  );
}
