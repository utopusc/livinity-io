'use client';

import { useState } from 'react';
import { AdminShell } from '../admin-shell';
import { Toast } from '../components/toast';

type Guide = {
  id: 'docker' | 'mcp' | 'custom';
  title: string;
  summary: string;
  steps: { heading: string; body: string }[];
  sample?: { label: string; app_slug: string };
};

const GUIDES: Guide[] = [
  {
    id: 'docker',
    title: 'Adding a Docker app',
    summary: 'Standard self-hosted apps that ship with a docker-compose recipe.',
    steps: [
      {
        heading: '1. Pick or author a manifest',
        body: 'Manifests live in github.com/utopusc/livinity-apps under apps/<slug>/manifest.json. Required fields: slug, name, docker_compose (string). Optional: tagline, description, category, version.',
      },
      {
        heading: '2. Sync into the platform catalog',
        body: 'On /admin/store, click "Sync from GitHub". The sync function pulls 20 manifests per call (chunked) and upserts into Supabase apps. Operator-curated fields (featured/verified/sort_order/icon_url/section) are preserved.',
      },
      {
        heading: '3. Curate & feature',
        body: 'Toggle the featured / verified pills on /admin/store to surface the app in the public catalog.',
      },
      {
        heading: '4. One-click install',
        body: 'Click Install on the app detail page (or use the embedded button below). The platform queues an install_commands row; livinityd polls Supabase every 5s and runs docker-compose up. Status streams to the UI via SSE.',
      },
    ],
    sample: { label: 'Test-install AdGuard', app_slug: 'adguard-home' },
  },
  {
    id: 'mcp',
    title: 'Adding an MCP server',
    summary: 'Model Context Protocol servers that the AI side picks up automatically.',
    steps: [
      {
        heading: '1. Decide transport',
        body: 'Most MCPs run as stdio child processes (`npx -y @scope/mcp-name`). HTTP transport is also supported via the McpConfigManager.',
      },
      {
        heading: '2. Drop into the seed file or register live',
        body: 'For first-install bootstrap: add an entry under scripts/install/seeds/mcp-servers.json (Phase 109). For runtime add: use the MCP panel inside Liv AI (right-side dock).',
      },
      {
        heading: '3. Verify discovery',
        body: 'redis-cli HKEYS liv:mcp:config should list your server. liv-core logs should show tool registration on next agent run.',
      },
      {
        heading: '4. One-click install (carry)',
        body: 'Wiring "Install from store" → MCP register is the same channel as Docker apps. The poller invokes the MCP installer instead of docker-compose. Tracked under CARRY-P215-MINIPC-POLLER.',
      },
    ],
    sample: { label: 'Test-install sequential-thinking MCP', app_slug: 'mcp-sequential-thinking' },
  },
  {
    id: 'custom',
    title: 'Adding a custom non-Docker app',
    summary: 'For native Linux apps or scripts that need bespoke install steps.',
    steps: [
      {
        heading: '1. Manifest section = "native"',
        body: 'Use section: "native" in the manifest. Required: slug, name, install_script (or download_url). Optional: post_install_command, desktop_entry.',
      },
      {
        heading: '2. Sandbox + sudo policy',
        body: 'livinityd runs install_script under the user account (not root). If sudo is needed for system packages, add the package list under a separate `system_packages` field — the platform will apt-install with operator-confirmed prompt.',
      },
      {
        heading: '3. Walkthrough doc',
        body: 'For complex installs, attach a docs URL in the manifest. The store detail page renders the linked doc inline (Phase 215 detail-redesign carry).',
      },
      {
        heading: '4. Test-install (carry)',
        body: 'Live test-install for native apps depends on the poller landing. Tracked under CARRY-P215-MINIPC-POLLER + CARRY-P215-WIRE-05-LIVE.',
      },
    ],
  },
];

type ToastState = { msg: string; error?: boolean } | null;

function TestInstallButton({ slug, label }: { slug: string; label: string }) {
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  async function run() {
    setRunning(true);
    try {
      const res = await fetch('/api/admin/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ app_slug: slug }),
      });
      const body = await res.json();
      if (!res.ok) {
        setToast({ msg: body.error ?? `Error ${res.status}`, error: true });
      } else {
        setToast({
          msg: `Queued ${slug} (cmd ${body.id.slice(0, 8)}…). Mini PC poller (CARRY-P215-MINIPC-POLLER) will pick up.`,
        });
      }
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : String(err), error: true });
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <button type="button" className="admin-btn" disabled={running} onClick={() => void run()}>
        {running ? 'Queuing…' : label}
      </button>
      {toast ? <Toast msg={toast.msg} error={toast.error} onClose={() => setToast(null)} /> : null}
    </>
  );
}

export default function AdminWalkthroughPage() {
  return (
    <AdminShell>
      <div className="admin-page">
        <header className="admin-page-head">
          <h1>Walkthrough</h1>
          <p className="admin-page-sub">
            Three guides for adding apps to the catalog. Each ends with a test-install you can run
            against your Mini PC.
          </p>
        </header>

        {GUIDES.map((g) => (
          <section key={g.id} className="walkthrough-section">
            <h2>{g.title}</h2>
            <p className="walkthrough-sub">{g.summary}</p>
            <ol className="walkthrough-steps">
              {g.steps.map((s, idx) => (
                <li key={idx}>
                  <h3>{s.heading}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
            {g.sample ? (
              <div className="walkthrough-sample">
                <TestInstallButton slug={g.sample.app_slug} label={g.sample.label} />
                <p className="walkthrough-sample-note">
                  Queue lands in <code>install_commands</code>. Live execution depends on{' '}
                  <code>CARRY-P215-MINIPC-POLLER</code>.
                </p>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
