// Phase 172-03 — `liv attach <id>` handler skeleton.
//
// CC PTY attach wiring lands in Phase 174 (SidebarTree + xterm.js host).
// For now: print a clear deferred message + exit 0.
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import chalk from 'chalk'

export async function attachHandler(argv: any): Promise<void> {
  const id = argv.id as string
  console.log(
    chalk.yellow(
      `[liv attach ${id}] CC PTY attach deferred to Phase 174 (SidebarTree wiring)`,
    ),
  )
  process.exit(0)
}
