import {describe, it, expect} from 'vitest'
import {QueryRegistry, resolveQueryArgv} from './registry.js'
import {buildDefaultRegistry} from './handlers.js'

describe('QueryRegistry', () => {
  it('register + has + get round-trip', () => {
    const r = new QueryRegistry()
    const h = async () => ({ok: true})
    r.register('foo.bar', h)
    expect(r.has('foo.bar')).toBe(true)
    expect(r.get('foo.bar')).toBe(h)
  })

  it('dispatch throws on unknown command', async () => {
    const r = new QueryRegistry()
    await expect(
      r.dispatch('missing', [], {}, {projectDir: '.'}),
    ).rejects.toThrow(/unknown command: missing/)
  })

  it('commands() lists all registered names', () => {
    const r = new QueryRegistry()
    r.register('a', async () => null)
    r.register('b.c', async () => null)
    expect(r.commands().sort()).toEqual(['a', 'b.c'])
  })
})

describe('resolveQueryArgv — longest-prefix routing', () => {
  it('matches dotted form: tree.list arg1 → cmd=tree.list, args=[arg1]', () => {
    const r = new QueryRegistry()
    r.register('tree.list', async () => null)
    const result = resolveQueryArgv(['tree.list', 'arg1'], r)
    expect(result).toEqual({cmd: 'tree.list', args: ['arg1']})
  })

  it('expands single dotted token when no exact match (registered spaced form)', () => {
    const r = new QueryRegistry()
    // Register the SPACED form ("tree list") — proves single-token expansion finds it
    r.register('tree list', async () => null)
    const result = resolveQueryArgv(['tree.list'], r)
    expect(result).toEqual({cmd: 'tree list', args: []})
  })

  it('prefers longest prefix: tree.list registered, tree NOT → matches tree.list', () => {
    const r = new QueryRegistry()
    r.register('tree.list', async () => null)
    // Tokens: ['tree', 'list', 'extra'] → tries 'tree.list.extra' (no), 'tree.list' (YES)
    const result = resolveQueryArgv(['tree', 'list', 'extra'], r)
    expect(result).toEqual({cmd: 'tree.list', args: ['extra']})
  })

  it('prefers more-specific over shorter prefix when both registered', () => {
    const r = new QueryRegistry()
    r.register('tree', async () => null)
    r.register('tree.list', async () => null)
    // ['tree', 'list'] should match 'tree.list' (i=2), not 'tree' (i=1)
    const result = resolveQueryArgv(['tree', 'list'], r)
    expect(result).toEqual({cmd: 'tree.list', args: []})
  })

  it('returns null when no prefix matches', () => {
    const r = new QueryRegistry()
    r.register('foo', async () => null)
    const result = resolveQueryArgv(['bar', 'baz'], r)
    expect(result).toBeNull()
  })

  it('buildDefaultRegistry registers exactly 10 commands', () => {
    const r = buildDefaultRegistry()
    const expected = [
      'tree.list',
      'tree.get-item',
      'item.create-project',
      'item.create-agent',
      'item.create-chat',
      'item.move',
      'item.archive',
      'config.get',
      'config.set',
      'doctor.check',
    ]
    expect(r.commands().sort()).toEqual(expected.sort())
  })
})
