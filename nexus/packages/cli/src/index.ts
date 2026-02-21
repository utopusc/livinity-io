#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';
import { registerStatusCommand } from './commands/status.js';
import { registerOnboardCommand } from './commands/onboard.js';
import { registerSetupCommand } from './commands/setup.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();

program
  .name('livinity')
  .description('LivOS Onboarding & Management CLI')
  .version(pkg.version);

// Register commands
registerStatusCommand(program);
registerOnboardCommand(program);
registerSetupCommand(program);

program.parse();
