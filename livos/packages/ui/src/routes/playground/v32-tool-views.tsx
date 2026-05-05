/**
 * v32 Per-Tool Views Playground (Phase 83)
 *
 * Visual QA for all 9 tool view components.
 * Renders complete + running fixture for each view type.
 * Reachable at /playground/v32-tool-views (gated by EnsureLoggedIn).
 *
 * Each section shows:
 *   - View label (which component will render)
 *   - "complete" state fixture
 *   - "running" state fixture
 */

import {useTheme} from '@/hooks/use-theme'
import {type ToolCallSnapshot} from '@/routes/ai-chat/v32/types'
import {ToolViewRegistry} from '@/routes/ai-chat/v32/views/ToolViewRegistry'
import {ALL_FIXTURE_GROUPS, type FixtureGroup} from './v32-tool-views-fixtures'

function StatusPill({status}: {status: ToolCallSnapshot['status']}) {
  const cls =
    status === 'running'
      ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
      : status === 'error'
      ? 'bg-red-500/10 text-red-600 border-red-500/20'
      : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}

function FixtureCard({fixture}: {fixture: ToolCallSnapshot}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <code className="text-xs font-mono text-zinc-500">{fixture.name}</code>
        <StatusPill status={fixture.status} />
      </div>
      {/* min-h so running state has room to render */}
      <div className="min-h-[220px] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <ToolViewRegistry tool={fixture} />
      </div>
    </div>
  )
}

function FixtureSection({group}: {group: FixtureGroup}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
        {group.label}
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {group.fixtures.map((fixture) => (
          <FixtureCard key={fixture.toolId} fixture={fixture} />
        ))}
      </div>
    </section>
  )
}

export default function V32ToolViewsPlayground() {
  const {theme, setTheme} = useTheme()

  return (
    <div className="min-h-screen bg-liv-background p-6 lg:p-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-liv-foreground font-mono">
            v32 Per-Tool Views
          </h1>
          <p className="text-sm text-liv-muted-foreground mt-1">
            Phase 83 — visual QA for all 9 view components + MCP content renderer
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded-lg border border-liv-border px-3 py-1.5 text-sm text-liv-foreground hover:bg-liv-muted transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>

      {/* Fixture sections */}
      <div className="space-y-12 max-w-6xl mx-auto">
        {ALL_FIXTURE_GROUPS.map((group) => (
          <FixtureSection key={group.label} group={group} />
        ))}
      </div>
    </div>
  )
}
