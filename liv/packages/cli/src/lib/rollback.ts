import * as p from '@clack/prompts';
import pc from 'picocolors';

// ── Rollback Stack ─────────────────────────────────────────────

interface RollbackStep {
  name: string;
  undo: () => void | Promise<void>;
}

/**
 * LIFO stack for tracking state-creating operations.
 * On failure, rollback() undoes everything in reverse order.
 */
export class RollbackStack {
  private steps: RollbackStep[] = [];

  /** Add a rollback step. The undo function is called on rollback(). */
  push(name: string, undo: () => void | Promise<void>): void {
    this.steps.push({ name, undo });
  }

  /** How many steps have been registered. */
  get size(): number {
    return this.steps.length;
  }

  /** Execute all undo functions in LIFO (reverse) order. */
  async rollback(): Promise<void> {
    if (this.steps.length === 0) return;

    p.log.warn(pc.bold(`Rolling back ${this.steps.length} step(s)...`));

    // Reverse iterate — last registered = first undone
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const step = this.steps[i];
      try {
        p.log.info(`  Undoing: ${step.name}`);
        await step.undo();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        p.log.warn(`  Warning: Failed to undo "${step.name}": ${msg}`);
        // Continue rolling back remaining steps
      }
    }

    this.steps = [];
    p.log.info('Rollback complete.');
  }
}
