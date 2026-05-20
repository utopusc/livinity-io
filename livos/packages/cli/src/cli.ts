#!/usr/bin/env node
// Phase 172-01 — @livos/cli entry point.
//
// yargs-based dispatcher registering all 10 v38 commands as stubs. The
// stubs print "not implemented yet — Phase 172-XX" and exit 0; --help
// enumerates them so the v38 contract surface is visible from day one.
// Plans 172-02 (query-client + filesystem-mode), 172-03 (query registry
// + handlers), 172-04 (postinstall + skills), 172-05 (init + doctor)
// replace the stub bodies in place.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + D-09 luse-system-prompt.ts + all Phase 162-171 source UNCHANGED.

import yargs from 'yargs'
import {hideBin} from 'yargs/helpers'
import chalk from 'chalk'
import {getVersion} from './version.js'

function stub(name: string, planRef: string) {
  return async () => {
    console.log(chalk.yellow(`[liv ${name}] not implemented yet — see Phase ${planRef}`))
    process.exit(0)
  }
}

async function main() {
  await yargs(hideBin(process.argv))
    .scriptName('liv')
    .version(getVersion())
    .usage('Usage: $0 <command> [options]')
    .command('init [path]', 'Bootstrap a new vault at [path] (default: ~/liv/)',
      (y) => y.positional('path', {type: 'string', describe: 'Vault root directory'}),
      stub('init', '172-05'))
    .command('project <subcmd>', 'Project Item commands (new, list, open)',
      (y) => y.positional('subcmd', {type: 'string', choices: ['new', 'list', 'open']}),
      stub('project', '172-03'))
    .command('agent <subcmd>', 'Agent Item commands (new, run, stop, inbox)',
      (y) => y.positional('subcmd', {type: 'string', choices: ['new', 'run', 'stop', 'inbox']}),
      stub('agent', '172-03'))
    .command('chat [name]', 'Open a chat session (attaches to CC PTY)',
      (y) => y.positional('name', {type: 'string'}),
      stub('chat', '172-03'))
    .command('list', 'List vault items (use --tree for tree view)',
      (y) => y.option('tree', {type: 'boolean', default: false}),
      stub('list', '172-03'))
    .command('attach <id>', 'Attach to an existing chat session by ID',
      (y) => y.positional('id', {type: 'string', demandOption: true}),
      stub('attach', '172-03'))
    .command('config <action> [key] [value]', 'Get or set a config value',
      (y) => y.positional('action', {type: 'string', choices: ['get', 'set']})
              .positional('key', {type: 'string'})
              .positional('value', {type: 'string'}),
      stub('config', '172-03'))
    .command('doctor', 'Validate vault integrity (items/, tree.json, schema)',
      () => {},
      stub('doctor', '172-05'))
    .command('migrate', 'Run vault schema migrations',
      () => {},
      stub('migrate', '173-x'))
    .command('query <argv...>', 'Dispatch to query handler registry (longest-prefix routing)',
      (y) => y.positional('argv', {type: 'string', array: true, demandOption: true}),
      stub('query', '172-03'))
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
