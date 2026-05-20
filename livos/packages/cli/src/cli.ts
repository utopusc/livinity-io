#!/usr/bin/env node
// Phase 172-03 — @livos/cli entry point (replaces Plan 172-01 stubs with
// real handler imports). The 10 yargs .command() registrations are
// byte-identical to 172-01 for name/positional/option shape — only the
// handler bodies are upgraded from the 172-01 placeholder shims to real
// command modules under ./commands/.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import yargs from 'yargs'
import {hideBin} from 'yargs/helpers'
import chalk from 'chalk'
import {getVersion} from './version.js'
import {initHandler} from './commands/init.js'
import {projectHandler} from './commands/project.js'
import {agentHandler} from './commands/agent.js'
import {chatHandler} from './commands/chat.js'
import {listHandler} from './commands/list.js'
import {attachHandler} from './commands/attach.js'
import {configHandler} from './commands/config.js'
import {doctorHandler} from './commands/doctor.js'
import {migrateHandler} from './commands/migrate.js'
import {queryHandler} from './commands/query.js'

async function main() {
  await yargs(hideBin(process.argv))
    .scriptName('liv')
    .version(getVersion())
    .usage('Usage: $0 <command> [options]')
    .command('init [path]', 'Bootstrap a new vault at [path] (default: ~/liv/)',
      (y) => y.positional('path', {type: 'string', describe: 'Vault root directory'}),
      initHandler)
    .command('project <subcmd>', 'Project Item commands (new, list, open)',
      (y) => y.positional('subcmd', {type: 'string', choices: ['new', 'list', 'open']})
              .option('name', {type: 'string'})
              .option('cwd', {type: 'string'})
              .option('id', {type: 'string'})
              .option('parent-id', {type: 'string'}),
      projectHandler)
    .command('agent <subcmd>', 'Agent Item commands (new, run, stop, inbox)',
      (y) => y.positional('subcmd', {type: 'string', choices: ['new', 'run', 'stop', 'inbox']})
              .option('name', {type: 'string'})
              .option('schedule', {type: 'string'})
              .option('parent-id', {type: 'string'}),
      agentHandler)
    .command('chat [name]', 'Open a chat session (attaches to CC PTY)',
      (y) => y.positional('name', {type: 'string'}).option('parent-id', {type: 'string'}),
      chatHandler)
    .command('list', 'List vault items (use --tree for tree view)',
      (y) => y.option('tree', {type: 'boolean', default: false}).option('archived', {type: 'boolean', default: false}),
      listHandler)
    .command('attach <id>', 'Attach to an existing chat session by ID',
      (y) => y.positional('id', {type: 'string', demandOption: true}),
      attachHandler)
    .command('config <action> [key] [value]', 'Get or set a config value',
      (y) => y.positional('action', {type: 'string', choices: ['get', 'set']})
              .positional('key', {type: 'string'})
              .positional('value', {type: 'string'}),
      configHandler)
    .command('doctor', 'Validate vault integrity (items/, tree.json, schema)',
      () => {},
      doctorHandler)
    .command('migrate', 'Run vault schema migrations',
      () => {},
      migrateHandler)
    .command('query <argv...>', 'Dispatch to query handler registry (longest-prefix routing)',
      (y) => y.positional('argv', {type: 'string', array: true, demandOption: true}),
      queryHandler)
    .demandCommand(1, 'A command is required. Run `liv --help` for the list.')
    .strict()
    .help()
    .alias('help', 'h')
    .alias('version', 'v')
    .parse()
}

main().catch((err: Error) => {
  console.error(chalk.red(`[liv] fatal: ${err.message}`))
  process.exit(1)
})
