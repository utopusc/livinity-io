import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

declare global {
  interface Window {
    api: {
      getState: () => Promise<AgentState>;
      setup: (name: string) => Promise<void>;
      connect: () => Promise<void>;
      disconnect: () => Promise<void>;
      getAuditLog: () => Promise<AuditEntry[]>;
      openExternal: (url: string) => Promise<void>;
      minimize: () => Promise<void>;
      close: () => Promise<void>;
      onStateChanged: (cb: (state: AgentState) => void) => void;
      onAuditEntry: (cb: (entry: AuditEntry) => void) => void;
    };
  }
}

interface AgentState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  setupStatus: 'none' | 'awaiting_code' | 'polling' | 'success' | 'error';
  deviceName: string;
  deviceId: string | null;
  userCode: string | null;
  verificationUri: string | null;
  errorMessage: string | null;
  relayUrl: string | null;
  sessionId: string | null;
  platform: string;
  osUser: string;
}

interface AuditEntry {
  timestamp: string;
  tool: string;
  params: string;
  success: boolean;
  duration: number;
  error?: string;
}

type Tab = 'status' | 'activity' | 'setup';

export default function App() {
  const [state, setState] = useState<AgentState | null>(null);
  const [tab, setTab] = useState<Tab>('status');
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  useEffect(() => {
    window.api.getState().then(setState);
    window.api.getAuditLog().then(setAudit);
    window.api.onStateChanged((s) => {
      setState(s);
      if (s.setupStatus === 'success' && s.connectionStatus === 'connected') {
        setTab('status');
      }
    });
    window.api.onAuditEntry((entry) => {
      setAudit((prev) => [entry, ...prev].slice(0, 200));
    });
  }, []);

  useEffect(() => {
    if (state && !state.deviceId && state.setupStatus === 'none') {
      setTab('setup');
    }
  }, [state]);

  if (!state) return <div className="h-full flex items-center justify-center"><Spinner /></div>;

  return (
    <div className="h-full flex flex-col">
      {/* Titlebar */}
      <div className="titlebar-drag flex items-center justify-between px-4 py-2 bg-white/80 backdrop-blur border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${
            state.connectionStatus === 'connected' ? 'bg-emerald-500' :
            state.connectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-slate-300'
          }`} />
          <span className="text-sm font-semibold text-slate-700">Livinity Agent</span>
        </div>
        <div className="titlebar-no-drag flex gap-1">
          <button onClick={() => window.api.minimize()} className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400">
            <svg width="12" height="2" viewBox="0 0 12 2"><rect width="12" height="2" fill="currentColor" rx="1" /></svg>
          </button>
          <button onClick={() => window.api.close()} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 hover:text-red-500 text-slate-400">
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200/60 bg-white/50 px-4">
        {(['status', 'activity', 'setup'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-xs font-medium capitalize transition-colors relative ${
              tab === t ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t}
            {tab === t && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait">
          {tab === 'status' && <StatusTab key="status" state={state} />}
          {tab === 'activity' && <ActivityTab key="activity" audit={audit} />}
          {tab === 'setup' && <SetupTab key="setup" state={state} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- Status Tab ---
function StatusTab({ state }: { state: AgentState }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
      {/* Connection Card */}
      <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800">Connection</h2>
          <StatusBadge status={state.connectionStatus} />
        </div>
        <div className="space-y-2.5 text-sm">
          <InfoRow label="Device" value={state.deviceName} />
          <InfoRow label="Platform" value={state.platform === 'win32' ? 'Windows' : state.platform === 'darwin' ? 'macOS' : 'Linux'} />
          <InfoRow label="User" value={state.osUser} />
          {state.sessionId && <InfoRow label="Session" value={state.sessionId.slice(0, 12) + '...'} />}
          {state.relayUrl && <InfoRow label="Relay" value={state.relayUrl.replace('wss://', '')} />}
        </div>

        {state.connectionStatus === 'connected' ? (
          <button onClick={() => window.api.disconnect()}
            className="mt-4 w-full py-2 rounded-lg text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors">
            Disconnect
          </button>
        ) : state.deviceId ? (
          <button onClick={() => window.api.connect()}
            className="mt-4 w-full py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors">
            Connect
          </button>
        ) : null}
      </div>

      {/* Device Info Card */}
      {state.deviceId && (
        <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 mb-3">Device Info</h2>
          <div className="space-y-2.5 text-sm">
            <InfoRow label="Device ID" value={state.deviceId.slice(0, 8) + '...'} />
            <InfoRow label="Tools" value="9 tools available" />
          </div>
        </div>
      )}

      {/* Quick Help */}
      <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-4">
        <p className="text-xs text-blue-700 leading-relaxed">
          {state.connectionStatus === 'connected'
            ? 'Your PC is connected. Use the LivOS AI chat to control it — try "show me files on my desktop"'
            : state.deviceId
            ? 'Click Connect to start. Your LivOS AI will be able to control this PC.'
            : 'Go to Setup tab to connect this PC to your Livinity account.'}
        </p>
      </div>
    </motion.div>
  );
}

// --- Activity Tab ---
function ActivityTab({ audit }: { audit: AuditEntry[] }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
      <h2 className="text-sm font-semibold text-slate-800 mb-3">Recent Activity</h2>
      {audit.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-slate-400">No activity yet.</p>
          <p className="text-xs text-slate-300 mt-1">Operations from LivOS AI will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {audit.map((entry, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200/60 p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${entry.success ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="text-xs font-mono font-medium text-slate-700">{entry.tool}</span>
                </div>
                <span className="text-[10px] text-slate-400">{formatTime(entry.timestamp)} · {entry.duration}ms</span>
              </div>
              {entry.params && entry.params !== '{}' && (
                <p className="text-[11px] text-slate-400 mt-1 font-mono truncate">{entry.params}</p>
              )}
              {entry.error && <p className="text-[11px] text-red-500 mt-1">{entry.error}</p>}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// --- Setup Tab ---
function SetupTab({ state }: { state: AgentState }) {
  const [deviceName, setDeviceName] = useState(state.deviceName);

  if (state.setupStatus === 'success' || state.deviceId) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center py-12">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-800">Connected!</h2>
        <p className="text-sm text-slate-500 mt-1">Device: {state.deviceName}</p>
      </motion.div>
    );
  }

  if (state.setupStatus === 'polling' && state.userCode) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center py-8">
        <Spinner />
        <h2 className="text-lg font-semibold text-slate-800 mt-6">Waiting for Approval</h2>
        <p className="text-sm text-slate-500 mt-2 mb-6">Enter this code at livinity.io/device</p>
        <div className="bg-white rounded-xl border-2 border-blue-200 py-5 px-8 inline-block shadow-sm">
          <span className="text-3xl font-mono font-bold tracking-[0.25em] text-slate-900">{state.userCode}</span>
        </div>
        <button onClick={() => window.api.openExternal(state.verificationUri || 'https://livinity.io/device')}
          className="mt-6 block mx-auto text-sm text-blue-600 hover:text-blue-700 font-medium">
          Open livinity.io/device →
        </button>
      </motion.div>
    );
  }

  if (state.setupStatus === 'error') {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center py-8">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-800">Something went wrong</h2>
        <p className="text-sm text-red-500 mt-2">{state.errorMessage}</p>
        <button onClick={() => window.api.setup(deviceName)}
          className="mt-6 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          Try Again
        </button>
      </motion.div>
    );
  }

  // Default: setup form
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="py-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-800">Connect Your PC</h2>
        <p className="text-sm text-slate-500 mt-1">Link this computer to your Livinity account</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">Device Name</label>
          <input type="text" value={deviceName} onChange={(e) => setDeviceName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400" />
        </div>
        <button onClick={() => window.api.setup(deviceName)}
          disabled={state.setupStatus === 'awaiting_code'}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {state.setupStatus === 'awaiting_code' ? 'Connecting...' : 'Connect Account'}
        </button>
      </div>

      <p className="text-xs text-slate-400 text-center mt-4">
        You'll need a <button onClick={() => window.api.openExternal('https://livinity.io/register')} className="text-blue-500 hover:underline">Livinity account</button>
      </p>
    </motion.div>
  );
}

// --- Components ---
function StatusBadge({ status }: { status: string }) {
  const colors = {
    connected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    connecting: 'bg-amber-50 text-amber-700 border-amber-200',
    disconnected: 'bg-slate-50 text-slate-500 border-slate-200',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status as keyof typeof colors] || colors.disconnected}`}>
      {status}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium">{value}</span>
    </div>
  );
}

function Spinner() {
  return (
    <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto" />
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
