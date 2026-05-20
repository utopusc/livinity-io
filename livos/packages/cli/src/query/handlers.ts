// Phase 172-03 — initial query handlers for @livos/cli.
//
// 10 handlers registered:
//   tree.list, tree.get-item,
//   item.create-project, item.create-agent, item.create-chat,
//   item.move, item.archive,
//   config.get, config.set, doctor.check
//
// All handlers receive (args, flags, ctx) and return JSON-serializable data
// that the query.ts command prints as JSON (1-line for piping, like GSD).
//
// Sacred SHA f3538e1d811992b782a9bb057d1b7f0a0189f95f UNCHANGED.

import {readFile, writeFile, mkdir} from 'node:fs/promises'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {createQueryClient} from '../query-client.js'
import {QueryRegistry, type QueryHandler} from './registry.js'

// ── tree.* handlers ──────────────────────────────────────────────────────

const treeList: QueryHandler = async (_args, flags) => {
  const client = await createQueryClient()
  const archived =
    flags.archived === true ? true : flags.archived === false ? false : undefined
  const items = await client.list(archived !== undefined ? {archived} : undefined)
  return {items}
}

const treeGetItem: QueryHandler = async (args) => {
  if (args.length < 1) throw new Error('tree.get-item: id positional arg required')
  const client = await createQueryClient()
  const item = await client.get(args[0])
  return {item}
}

// ── item.create-* handlers ───────────────────────────────────────────────

const itemCreateProject: QueryHandler = async (_args, flags) => {
  const name = flags.name as string
  if (!name) throw new Error('item.create-project: --name required')
  const client = await createQueryClient()
  const item = await client.create({
    type: 'project',
    name,
    cwd: typeof flags.cwd === 'string' ? flags.cwd : undefined,
    parentId: typeof flags['parent-id'] === 'string' ? flags['parent-id'] : null,
  })
  return {item}
}

const itemCreateAgent: QueryHandler = async (_args, flags) => {
  const name = flags.name as string
  if (!name) throw new Error('item.create-agent: --name required')
  const client = await createQueryClient()
  const item = await client.create({
    type: 'agent',
    name,
    schedule: typeof flags.schedule === 'string' ? flags.schedule : undefined,
    parentId: typeof flags['parent-id'] === 'string' ? flags['parent-id'] : null,
  })
  return {item}
}

const itemCreateChat: QueryHandler = async (_args, flags) => {
  const name = flags.name as string
  if (!name) throw new Error('item.create-chat: --name required')
  const client = await createQueryClient()
  const item = await client.create({
    type: 'chat',
    name,
    ccSessionId:
      typeof flags['cc-session-id'] === 'string' ? flags['cc-session-id'] : undefined,
    parentId: typeof flags['parent-id'] === 'string' ? flags['parent-id'] : null,
  })
  return {item}
}

// ── item.move / item.archive ─────────────────────────────────────────────

const itemMove: QueryHandler = async (args) => {
  if (args.length < 2)
    throw new Error('item.move: <id> <newParentId-or-null> required')
  const client = await createQueryClient()
  const newParentId = args[1] === 'null' ? null : args[1]
  return await client.move(args[0], newParentId)
}

const itemArchive: QueryHandler = async (args) => {
  if (args.length < 1) throw new Error('item.archive: id required')
  const client = await createQueryClient()
  const item = await client.archive(args[0])
  return {item}
}

// ── config.* (filesystem-only — no daemon dep) ───────────────────────────

function configPath(): string {
  return join(homedir(), '.livos', 'config.json')
}

const configGet: QueryHandler = async (args) => {
  const key = args[0]
  try {
    const raw = await readFile(configPath(), 'utf8')
    const cfg = JSON.parse(raw)
    return {value: key ? cfg[key] ?? null : cfg}
  } catch (err: any) {
    if (err.code === 'ENOENT') return {value: key ? null : {}}
    throw err
  }
}

const configSet: QueryHandler = async (args) => {
  if (args.length < 2) throw new Error('config.set: <key> <value> required')
  const [key, value] = args
  let cfg: Record<string, any> = {}
  try {
    const raw = await readFile(configPath(), 'utf8')
    cfg = JSON.parse(raw)
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err
  }
  cfg[key] = value
  await mkdir(join(homedir(), '.livos'), {recursive: true})
  await writeFile(configPath(), JSON.stringify(cfg, null, 2), 'utf8')
  return {ok: true, key, value}
}

// ── doctor.check (skeleton; full impl in 172-05) ─────────────────────────

const doctorCheck: QueryHandler = async () => {
  // Phase 172-05 fleshes this out with real validation.
  return {checks: [], status: 'skeleton', note: 'full implementation in Plan 172-05'}
}

// ── Registry assembly ────────────────────────────────────────────────────

export function buildDefaultRegistry(): QueryRegistry {
  const r = new QueryRegistry()
  r.register('tree.list', treeList)
  r.register('tree.get-item', treeGetItem)
  r.register('item.create-project', itemCreateProject)
  r.register('item.create-agent', itemCreateAgent)
  r.register('item.create-chat', itemCreateChat)
  r.register('item.move', itemMove)
  r.register('item.archive', itemArchive)
  r.register('config.get', configGet)
  r.register('config.set', configSet)
  r.register('doctor.check', doctorCheck)
  return r
}
