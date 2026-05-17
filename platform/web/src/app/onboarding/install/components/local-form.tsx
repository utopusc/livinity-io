"use client";

export interface LocalFormState {
  hostname: string;
}

export default function LocalForm({
  state,
  onChange,
}: {
  state: LocalFormState;
  onChange: (s: LocalFormState) => void;
}) {
  const fqdn = `${state.hostname || "livinity"}.local`;
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Local (LAN) configuration</h2>
      <p className="text-sm text-zinc-500">
        Your server will be reachable at <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">https://{fqdn}</code> from any device on the same network.
      </p>
      <label className="block">
        <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Hostname (no spaces, lowercase)</span>
        <input
          type="text"
          value={state.hostname}
          onChange={(e) => onChange({ ...state, hostname: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
          placeholder="livinity"
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <span className="mt-1 block text-xs text-zinc-400">.local will be appended automatically</span>
      </label>
      <div className="rounded-lg bg-yellow-50 p-3 text-xs text-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
        <strong>Note:</strong> Local mode uses a self-signed certificate. Your browser may warn the first time you visit — accept the certificate.
      </div>
    </div>
  );
}
