#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { registerStatusCommand } from './commands/status.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('livinity')
  .description('LivOS Onboarding & Management CLI')
  .version(pkg.version);

// Register commands
registerStatusCommand(program);

program
  .command('onboard')
  .description('Set up LivOS on this server')
  .action(() => {
    console.log('Not yet implemented — coming in a future update.');
  });

program.parse();
