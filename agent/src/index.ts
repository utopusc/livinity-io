#!/usr/bin/env node
import { setupCommand, startCommand, stopCommand, statusCommand } from './cli.js';

const command = process.argv[2];
const cliMode = process.argv.includes('--cli');
// --web is the default; accept it as a no-op for explicitness
const _webMode = process.argv.includes('--web');

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
    console.log(`livinity-agent v${(await import('./config.js')).AGENT_VERSION}`);
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
    console.log('  --cli    Use terminal-only setup (no browser)');
    console.log('  --web    Use browser-based setup (default)');
    break;
}
