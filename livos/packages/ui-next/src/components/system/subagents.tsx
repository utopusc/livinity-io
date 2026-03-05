'use client';

import { useState } from 'react';
import { Plus, Bot, Trash2, Play, Pause, Square, Loader2, ChevronRight, Pencil, Zap } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { trpcReact } from '@/trpc/client';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';

type Subagent = {
  id: string;
  name: string;
  description: string;
  skills: string[];
  systemPrompt?: string;
  schedule?: string;
  scheduledTask?: string;
  tier: 'flash' | 'sonnet' | 'opus';
  maxTurns: number;
  status: 'active' | 'paused' | 'stopped';
};

export function SubagentsLayout() {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col">
      {view === 'list' && (
        <AgentList
          onSelect={(id) => { setSelectedId(id); setView('detail'); }}
          onCreate={() => setView('create')}
        />
      )}
      {view === 'create' && (
        <CreateAgent onBack={() => setView('list')} />
      )}
      {view === 'detail' && selectedId && (
        <AgentDetail id={selectedId} onBack={() => { setSelectedId(null); setView('list'); }} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent List                                                         */
/* ------------------------------------------------------------------ */

function AgentList({ onSelect, onCreate }: { onSelect: (id: string) => void; onCreate: () => void }) {
  const { data: agents, isLoading } = trpcReact.ai.listSubagents.useQuery();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold text-text">Agents</h3>
        <Button size="sm" onClick={onCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New Agent
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
          </div>
        )}

        {!isLoading && (!agents || (agents as Subagent[]).length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
            <Bot className="h-10 w-10" />
            <p className="mt-3 text-sm">No agents configured</p>
            <p className="mt-1 text-xs">Create an agent to automate tasks</p>
          </div>
        )}

        {!isLoading && agents && (agents as Subagent[]).length > 0 && (
          <AnimatedGroup preset="slide" className="space-y-2">
            {(agents as Subagent[]).map((agent) => (
              <button
                key={agent.id}
                className="flex w-full items-center gap-3 rounded-xl bg-white border border-border shadow-sm p-3 text-left hover:bg-neutral-50 transition-colors"
                onClick={() => onSelect(agent.id)}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10">
                  <Bot className="h-4 w-4 text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text truncate">{agent.name}</p>
                  <p className="text-[11px] text-text-tertiary truncate">{agent.description}</p>
                </div>
                <StatusBadge status={agent.status} />
                <ChevronRight className="h-4 w-4 text-text-tertiary" />
              </button>
            ))}
          </AnimatedGroup>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Create Agent                                                       */
/* ------------------------------------------------------------------ */

function CreateAgent({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState({
    id: '',
    name: '',
    description: '',
    systemPrompt: '',
    tier: 'sonnet' as 'flash' | 'sonnet' | 'opus',
    maxTurns: 10,
    schedule: '',
    scheduledTask: '',
  });

  const utils = trpcReact.useUtils();
  const createMutation = trpcReact.ai.createSubagent.useMutation({
    onSuccess: () => { utils.ai.listSubagents.invalidate(); onBack(); },
  });

  const handleSubmit = () => {
    if (!form.id.trim() || !form.name.trim()) return;
    createMutation.mutate({
      id: form.id.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      systemPrompt: form.systemPrompt.trim() || undefined,
      tier: form.tier,
      maxTurns: form.maxTurns,
      schedule: form.schedule.trim() || undefined,
      scheduledTask: form.scheduledTask.trim() || undefined,
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <Button size="sm" variant="ghost" onClick={onBack}>Back</Button>
        <h3 className="text-sm font-semibold text-text">Create Agent</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4 max-w-xl">
        <Field label="ID" hint="Alphanumeric identifier">
          <input
            className="input-field"
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })}
            placeholder="my-agent"
          />
        </Field>

        <Field label="Name">
          <input
            className="input-field"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="My Agent"
          />
        </Field>

        <Field label="Description">
          <textarea
            className="input-field min-h-[60px] resize-none"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What this agent does..."
            rows={2}
          />
        </Field>

        <Field label="System Prompt" hint="Optional">
          <textarea
            className="input-field min-h-[80px] resize-none"
            value={form.systemPrompt}
            onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            placeholder="Custom instructions for the agent..."
            rows={3}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Model Tier">
            <select
              className="input-field"
              value={form.tier}
              onChange={(e) => setForm({ ...form, tier: e.target.value as 'flash' | 'sonnet' | 'opus' })}
            >
              <option value="flash">Flash (fastest)</option>
              <option value="sonnet">Sonnet (balanced)</option>
              <option value="opus">Opus (smartest)</option>
            </select>
          </Field>

          <Field label="Max Turns">
            <input
              type="number"
              className="input-field"
              value={form.maxTurns}
              onChange={(e) => setForm({ ...form, maxTurns: Math.max(1, Math.min(50, parseInt(e.target.value) || 10)) })}
              min={1}
              max={50}
            />
          </Field>
        </div>

        <Field label="Schedule (Cron)" hint="Optional, e.g. 0 9 * * *">
          <input
            className="input-field"
            value={form.schedule}
            onChange={(e) => setForm({ ...form, schedule: e.target.value })}
            placeholder="0 9 * * *"
          />
        </Field>

        {form.schedule && (
          <Field label="Scheduled Task">
            <textarea
              className="input-field min-h-[60px] resize-none"
              value={form.scheduledTask}
              onChange={(e) => setForm({ ...form, scheduledTask: e.target.value })}
              placeholder="Task to run on schedule..."
              rows={2}
            />
          </Field>
        )}

        <Button onClick={handleSubmit} disabled={!form.id.trim() || !form.name.trim() || createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Create Agent
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Agent Detail                                                       */
/* ------------------------------------------------------------------ */

function AgentDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: agents } = trpcReact.ai.listSubagents.useQuery();
  const agent = (agents as Subagent[] | undefined)?.find((a) => a.id === id);

  const [message, setMessage] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const utils = trpcReact.useUtils();

  const updateMutation = trpcReact.ai.updateSubagent.useMutation({
    onSuccess: () => utils.ai.listSubagents.invalidate(),
  });

  const deleteMutation = trpcReact.ai.deleteSubagent.useMutation({
    onSuccess: () => { utils.ai.listSubagents.invalidate(); onBack(); },
  });

  const executeMutation = trpcReact.ai.executeSubagent.useMutation({
    onSuccess: (data: any) => setResult(data?.content ?? 'Done'),
  });

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
      </div>
    );
  }

  const toggleStatus = () => {
    const next = agent.status === 'active' ? 'paused' : 'active';
    updateMutation.mutate({ id: agent.id, updates: { status: next } });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <Button size="sm" variant="ghost" onClick={onBack}>Back</Button>
        <h3 className="text-sm font-semibold text-text flex-1">{agent.name}</h3>
        <StatusBadge status={agent.status} />
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5 max-w-xl">
        {/* Info */}
        <div className="rounded-xl bg-white border border-border shadow-sm p-4 space-y-2">
          <InfoRow label="ID" value={agent.id} />
          <InfoRow label="Tier" value={agent.tier} />
          <InfoRow label="Max Turns" value={String(agent.maxTurns)} />
          {agent.schedule && <InfoRow label="Schedule" value={agent.schedule} />}
          {agent.scheduledTask && <InfoRow label="Scheduled Task" value={agent.scheduledTask} />}
        </div>

        {agent.description && (
          <div className="rounded-xl bg-white border border-border shadow-sm p-4">
            <p className="text-[11px] text-text-tertiary mb-1">Description</p>
            <p className="text-xs text-text">{agent.description}</p>
          </div>
        )}

        {agent.systemPrompt && (
          <div className="rounded-xl bg-white border border-border shadow-sm p-4">
            <p className="text-[11px] text-text-tertiary mb-1">System Prompt</p>
            <pre className="text-xs text-text whitespace-pre-wrap font-mono">{agent.systemPrompt}</pre>
          </div>
        )}

        {/* Execute */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-text">Run Task</p>
          <div className="flex gap-2">
            <input
              className="input-field flex-1"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Send a message to this agent..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && message.trim()) {
                  executeMutation.mutate({ id: agent.id, message: message.trim() });
                  setMessage('');
                }
              }}
            />
            <Button
              size="sm"
              disabled={!message.trim() || executeMutation.isPending}
              onClick={() => {
                executeMutation.mutate({ id: agent.id, message: message.trim() });
                setMessage('');
              }}
            >
              {executeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            </Button>
          </div>
          {result && (
            <div className="rounded-lg bg-neutral-50 border border-border p-3">
              <pre className="text-xs text-text whitespace-pre-wrap">{result}</pre>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={toggleStatus} disabled={updateMutation.isPending}>
            {agent.status === 'active' ? (
              <><Pause className="mr-1.5 h-3.5 w-3.5" /> Pause</>
            ) : (
              <><Play className="mr-1.5 h-3.5 w-3.5" /> Activate</>
            )}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => deleteMutation.mutate({ id: agent.id })}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared                                                             */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'active' ? 'success' : status === 'paused' ? 'warning' : 'secondary';
  return <Badge variant={variant as any}>{status}</Badge>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-text-tertiary">{label}</span>
      <span className="text-xs text-text font-mono">{value}</span>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <label className="text-xs font-medium text-text">{label}</label>
        {hint && <span className="text-[10px] text-text-tertiary">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
