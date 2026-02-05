import { Job } from 'bullmq';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger.js';

const execAsync = promisify(exec);

export class TestJob {
  static async process(job: Job): Promise<{ success: boolean; message: string; data?: any }> {
    const { command, path, timeout = 120000 } = job.data;

    const testCmd = command || `npx playwright test ${path || ''}`;
    logger.info(`Running test: ${testCmd}`);

    try {
      const { stdout, stderr } = await execAsync(testCmd, {
        cwd: job.data.cwd || '/opt/nexus',
        timeout,
        env: { ...process.env, CI: 'true' },
      });

      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
      const passed = !stderr || stderr.includes('passed');

      logger.info(`Test result: ${passed ? 'PASSED' : 'FAILED'}`, { outputLen: output.length });

      return {
        success: passed,
        message: passed ? 'All tests passed' : 'Some tests failed',
        data: { output: output.substring(0, 5000), command: testCmd },
      };
    } catch (err: any) {
      logger.error(`Test error: ${err.message}`);
      return {
        success: false,
        message: `Test failed: ${err.message}`,
        data: { stdout: err.stdout?.substring(0, 3000), stderr: err.stderr?.substring(0, 3000) },
      };
    }
  }
}
