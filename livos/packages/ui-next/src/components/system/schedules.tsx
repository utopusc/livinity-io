'use client';

import { useState } from 'react';
import { CalendarClock, Plus, Trash2, Loader2, Clock, Bot } from 'lucide-react';
import { Button, Badge } from '@/components/ui';
import { trpcReact } from '@/trpc/client';
import { AnimatedGroup } from '@/components/motion-primitives/animated-group';

type Schedule = {
  subagentId: string;
  task: string;
  cron: string;
  timezone?: string;
  nextRun?: string;
  lastRun?: string;
};

export function SchedulesLayout() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: schedules, isLoading } = trpcReact.ai.listSchedules.useQuery();
  const { data: agents } = trpcReact.ai.listSubagents.useQuery();
  const utils = trpcReact.useUtils();

  const removeMutation = trpcReact.ai.removeSchedule.useMutation({
    onSuccess: () => utils.ai.listSchedules.invalidate(),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold text-text">Schedules</h3>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Schedule
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {showCreate && (
          <CreateSchedule
            agents={(agents as any[]) ?? []}
            onDone={() => { setShowCreate(false); utils.ai.listSchedules.invalidate(); }}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-text-tertiary" />
          </div>
        )}

        {!isLoading && (!schedules || (schedules as Schedule[]).length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
            <CalendarClock className="h-10 w-10" />
            <p className="mt-3 text-sm">No schedules configured</p>
            <p className="mt-1 text-xs">Schedule agents to run tasks automatically</p>
          </div>
        )}

        {!isLoading && schedules && (schedules as Schedule[]).length > 0 && (
          <AnimatedGroup preset="slide" className="space-y-2">
            {(schedules as Schedule[]).map((sched) => {
              const agent = (agents as any[] | undefined)?.find((a: any) => a.id === sched.subagentId);
              return (
                <div
                  key={sched.subagentId}
                  className="rounded-xl bg-white border border-border shadow-sm p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4 text-brand" />
                      <span className="text-sm font-medium text-text">
                        {agent?.name ?? sched.subagentId}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeMutation.mutate({ subagentId: sched.subagentId })}
                      disabled={removeMutation.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-text-tertiary hover:text-error" />
                    </Button>
                  </div>

                  <p className="text-xs text-text-secondary">{sched.task}</p>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      <Clock className="mr-1 h-3 w-3" />
                      {sched.cron}
                    </Badge>
                    {sched.timezone && (
                      <Badge variant="secondary">{sched.timezone}</Badge>
                    )}
                    {sched.nextRun && (
                      <Badge variant="secondary">
                        Next: {new Date(sched.nextRun).toLocaleString()}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </AnimatedGroup>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Create Schedule                                                    */
/* ------------------------------------------------------------------ */

function CreateSchedule({
  agents,
  onDone,
  onCancel,
}: {
  agents: any[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    subagentId: agents[0]?.id ?? '',
    task: '',
    cron: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const addMutation = trpcReact.ai.addSchedule.useMutation({
    onSuccess: onDone,
  });

  const handleSubmit = () => {
    if (!form.subagentId || !form.task.trim() || !form.cron.trim()) return;
    addMutation.mutate({
      subagentId: form.subagentId,
      task: form.task.trim(),
      cron: form.cron.trim(),
      timezone: form.timezone || undefined,
    });
  };

  return (
    <div className="rounded-xl bg-white border border-brand/20 shadow-sm p-4 space-y-3">
      <p className="text-xs font-medium text-text">New Schedule</p>

      <div className="space-y-1.5">
        <label className="text-[11px] text-text-tertiary">Agent</label>
        {agents.length === 0 ? (
          <p className="text-xs text-warning">Create an agent first</p>
        ) : (
          <select
            className="input-field w-full"
            value={form.subagentId}
            onChange={(e) => setForm({ ...form, subagentId: e.target.value })}
          >
            {agents.map((a: any) => (
              <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-text-tertiary">Task Description</label>
        <textarea
          className="input-field w-full min-h-[60px] resize-none"
          value={form.task}
          onChange={(e) => setForm({ ...form, task: e.target.value })}
          placeholder="What should the agent do..."
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] text-text-tertiary">Cron Expression</label>
          <input
            className="input-field w-full"
            value={form.cron}
            onChange={(e) => setForm({ ...form, cron: e.target.value })}
            placeholder="0 9 * * *"
          />
          <p className="text-[10px] text-text-tertiary">min hour day month weekday</p>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] text-text-tertiary">Timezone</label>
          <input
            className="input-field w-full"
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={!form.subagentId || !form.task.trim() || !form.cron.trim() || addMutation.isPending}>
          {addMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
