#!/usr/bin/env node
import path from 'node:path';
import { setupCommand, startCommand, stopCommand, statusCommand } from './cli.js';
import { AGENT_VERSION } from './config.js';

// SEA binary: set CWD to exe directory so systray2 finds traybin/ and setup-ui/ is resolved correctly
const exeDir = path.dirname(process.execPath);
if (!process.execPath.includes('node')) {
  try { process.chdir(exeDir); } catch {}
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const cliMode = process.argv.includes('--cli');
  // --web is the default; accept it as a no-op for explicitness
  const _webMode = process.argv.includes('--web');
  // --background: suppress console output, log to file, for auto-start on boot
  const backgroundMode = process.argv.includes('--background');
  if (backgroundMode) {
    process.env.LIVINITY_BACKGROUND = '1';
  }

  switch (command) {
    case 'setup':
      await setupCommand({ cli: cliMode });
      break;
    case 'start':
      await startCommand();
      break;
    case 'stop':
      await stopCommand();
      break;
    case 'status':
      await statusCommand();
      break;
    default:
      console.log(`livinity-agent v${AGENT_VERSION}`);
      console.log('');
      console.log('Usage: livinity-agent <command>');
      console.log('');
      console.log('Commands:');
      console.log('  setup    Authenticate this device with your Livinity account');
      console.log('  start    Connect to relay and start accepting tool calls');
      console.log('  stop     Stop the running agent');
      console.log('  status   Show connection status');
      console.log('');
      console.log('Flags:');
      console.log('  --cli         Use terminal-only setup (no browser)');
      console.log('  --web         Use browser-based setup (default)');
      console.log('  --background  Suppress console output, log to file (for auto-start)');
      break;
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
