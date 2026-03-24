import si from 'systeminformation';

export interface ProcessResult {
  success: boolean;
  output: string;
  error?: string;
  data?: unknown;
}

export async function executeProcesses(params: Record<string, unknown>): Promise<ProcessResult> {
  try {
    const sortBy = (params.sortBy as string | undefined) || 'cpu';
    const limit = (params.limit as number | undefined) || 20;

    const data = await si.processes();

    const processes = data.list.map((p) => ({
      pid: p.pid,
      name: p.name,
      cpu: p.cpu,
      memory: p.mem,
      user: p.user,
    }));

    // Sort descending by the chosen field
    if (sortBy === 'memory') {
      processes.sort((a, b) => b.memory - a.memory);
    } else {
      processes.sort((a, b) => b.cpu - a.cpu);
    }

    const topProcesses = processes.slice(0, limit);

    // Build human-readable table
    const header = 'PID      NAME                           CPU%    MEM%    USER';
    const rows = topProcesses.map(
      (p) =>
        `${String(p.pid).padEnd(9)}${p.name.slice(0, 30).padEnd(31)}${p.cpu.toFixed(1).padStart(5)}   ${p.memory.toFixed(1).padStart(5)}   ${p.user}`,
    );
    const output = `${header}\n${rows.join('\n')}`;

    return { success: true, output, data: topProcesses };
  } catch (err: unknown) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
