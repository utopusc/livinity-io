// Phase 172-03 — query handler registry for @livos/cli.
//
// Direct mirror of GSD's @gsd-build/sdk/dist/query/registry.js logic:
//   - Flat Map<string, handler> registration
//   - Longest-prefix argv resolution (dotted and spaced keys)
//   - Single-dotted-token expansion fallback (a.b.c → ['a', 'b', 'c'])
//
// Used by:
//   - src/commands/query.ts (handler for `liv query <argv...>`)
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f
// + Phase 162-171 source UNCHANGED.

export type QueryHandler = (
  args: string[],
  flags: Record<string, string | boolean>,
  ctx: {projectDir: string},
) => Promise<unknown>

export class QueryRegistry {
  private handlers = new Map<string, QueryHandler>()

  register(command: string, handler: QueryHandler): void {
    this.handlers.set(command, handler)
  }

  has(command: string): boolean {
    return this.handlers.has(command)
  }

  get(command: string): QueryHandler | undefined {
    return this.handlers.get(command)
  }

  commands(): string[] {
    return Array.from(this.handlers.keys())
  }

  async dispatch(
    command: string,
    args: string[],
    flags: Record<string, string | boolean>,
    ctx: {projectDir: string},
  ): Promise<unknown> {
    const handler = this.handlers.get(command)
    if (!handler) {
      throw new Error(`[liv query] unknown command: ${command}`)
    }
    return await handler(args, flags, ctx)
  }
}

// ── Longest-prefix argv routing (verbatim mirror of GSD pattern) ────────

function matchRegisteredPrefix(
  tokens: string[],
  registry: QueryRegistry,
): {cmd: string; args: string[]} | null {
  for (let i = tokens.length; i > 0; i--) {
    const head = tokens.slice(0, i)
    const dotted = head.join('.')
    const spaced = head.join(' ')
    if (registry.has(dotted)) return {cmd: dotted, args: tokens.slice(i)}
    if (registry.has(spaced)) return {cmd: spaced, args: tokens.slice(i)}
  }
  return null
}

function expandSingleDottedToken(tokens: string[]): string[] {
  if (tokens.length === 1 && tokens[0].includes('.')) {
    return tokens[0].split('.')
  }
  return tokens
}

/**
 * Map argv after `liv query` to a registered handler key + remaining args.
 * Longest-prefix match on dotted (`a.b.c`) and spaced (`a b c`) keys; if no match,
 * expands a single dotted token (`tree.list` → `['tree', 'list']`) and retries.
 */
export function resolveQueryArgv(
  tokens: string[],
  registry: QueryRegistry,
): {cmd: string; args: string[]} | null {
  let matched = matchRegisteredPrefix(tokens, registry)
  if (!matched) {
    const expanded = expandSingleDottedToken(tokens)
    if (expanded !== tokens) {
      matched = matchRegisteredPrefix(expanded, registry)
    }
  }
  return matched
}
