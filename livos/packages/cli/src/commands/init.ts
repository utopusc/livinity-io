// Phase 172-03 — `liv init [path]` skeleton.
//
// Full implementation in Plan 172-05. This skeleton exercises the yargs →
// handler wiring end-to-end so the command surface is functional from day
// one (prints a deferred message + exits 0, no filesystem mutations).
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import chalk from 'chalk'

export async function initHandler(argv: any): Promise<void> {
  const target = (argv.path as string) ?? '~/liv/'
  console.log(
    chalk.yellow(
      `[liv init ${target}] skeleton — full bootstrap implementation lands in Plan 172-05`,
    ),
  )
  process.exit(0)
}
