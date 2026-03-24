#!/usr/bin/env node
import { setupCommand, startCommand, stopCommand, statusCommand } from './cli.js';

const command = process.argv[2];

switch (command) {
  case 'setup':
    await setupCommand();
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
    break;
}
