// Phase 189-02 — Agent session lifecycle hooks (ADDITIVE to cc-pty subsystem).
// manager.ts calls resolveAgentSpawnArgs() to get extra claude CLI args
// without any modification to manager.ts's core spawn logic.
//
// ADDITIVE: this file is NEW. manager.ts gets ONE new call site.
// Sacred-guard: manager.ts spawn logic unchanged; hooks isolated here.
//
// Phase 189-05 adds createAgentSessionRecorder + flushAgentSessionTranscript (additive).

import {promises as fs} from 'node:fs'
import * as path from 'node:path'
import {randomUUID} from 'node:crypto'
import {getSetupWizardPrompt} from '../vault-items/setup-wizard-prompt.js'

const AGENT_SESSION_RE = /^liv-agent-(.+)$/

export function isAgentSession(tmuxName: string): boolean {
	return AGENT_SESSION_RE.test(tmuxName)
}

interface AgentConfig {
	setup_done: boolean
	mcps: string[]
	tools: string[]
	schedule: string | null
}

async function readAgentConfig(agentDir: string): Promise<AgentConfig | null> {
	try {
		const raw = await fs.readFile(path.join(agentDir, '.agent', 'config.json'), 'utf-8')
		return JSON.parse(raw) as AgentConfig
	} catch {
		return null
	}
}

/**
 * Derive extra claude CLI args for an agent session spawn.
 * Returns {extraArgs: string[]} — empty when no injection needed.
 *
 * @param tmuxName   tmux session name — must match /^liv-agent-(.+)$/
 * @param agentDir   absolute path to the agent's item directory
 * @param agentItem  {id, name} of the agent
 * @param mcpNames   list of available MCP server names (caller injects from Redis)
 */
export async function resolveAgentSpawnArgs(opts: {
	tmuxName: string
	agentDir: string
	agentItem: {id: string; name: string}
	mcpNames: string[]
}): Promise<{extraArgs: string[]}> {
	if (!isAgentSession(opts.tmuxName)) return {extraArgs: []}

	const config = await readAgentConfig(opts.agentDir)
	// v38.2 hotfix — wizard prompt CLI injection disabled. Multi-line prompt
	// containing single-quotes broke shell escaping at the inner+outer tmux
	// layer ("/bin/sh: You: not found" + "Syntax error: ( unexpected").
	// Until we route the wizard via a tmp file or CLAUDE.md, the agent
	// spawns clean and the operator can interact normally. Setup_done stays
	// false; operator can manually configure via in-pane Settings → MCP/CC.
	if (!config || config.setup_done === false) {
		// Write the wizard prompt to the agent's CLAUDE.md (claude auto-discovers)
		// so the agent has context on its purpose without CLI escaping.
		try {
			const prompt = getSetupWizardPrompt(opts.agentItem, opts.mcpNames)
			await fs.writeFile(path.join(opts.agentDir, 'CLAUDE.md'), prompt, 'utf-8')
		} catch {
			// non-fatal — agent still spawns
		}
	}
	return {extraArgs: []}
}

// ── Session Transcript Recorder ──────────────────────────────────────────────
// Phase 189-05: captures PTY output during an agent session for post-session
// transcript writing.

const MAX_TRANSCRIPT_BYTES = 1_048_576 // 1 MB cap

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*[mGKHF]|\x1b\][^\x07]*\x07|\x1b[()][AB012]/g
function stripAnsi(s: string): string {
	return s.replace(ANSI_RE, '')
}

const SECRET_PATTERNS: RegExp[] = [
	/LivRedis[A-Za-z0-9!@#$%^&*]{4,}/g,
	/ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
]
function scrubSecrets(s: string): string {
	let out = s
	for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]')
	return out
}

export interface AgentSessionRecorder {
	readonly runId: string
	readonly startedAt: number
	append(chunk: Buffer): void
	getTranscript(): string
}

export function createAgentSessionRecorder(): AgentSessionRecorder {
	const runId = randomUUID()
	const startedAt = Date.now()
	const chunks: Buffer[] = []
	let totalBytes = 0
	return {
		runId,
		startedAt,
		append(chunk: Buffer) {
			if (totalBytes >= MAX_TRANSCRIPT_BYTES) return // cap enforced at append time
			const remaining = MAX_TRANSCRIPT_BYTES - totalBytes
			const slice = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining)
			chunks.push(slice)
			totalBytes += slice.length
		},
		getTranscript(): string {
			const raw = Buffer.concat(chunks).toString('utf-8')
			return scrubSecrets(stripAnsi(raw))
		},
	}
}

const TRANSCRIPT_MARKER = new Set<string>() // runIds already flushed (idempotency)

export async function flushAgentSessionTranscript(opts: {
	recorder: AgentSessionRecorder
	agentDir: string
}): Promise<void> {
	const {recorder, agentDir} = opts
	if (TRANSCRIPT_MARKER.has(recorder.runId)) return // idempotent

	const transcript = recorder.getTranscript()
	const durationMs = Date.now() - recorder.startedAt
	const runAt = new Date(recorder.startedAt).toISOString()

	// Derive summary: first non-empty line, max 120 chars
	const firstLine = transcript.split('\n').find((l) => l.trim().length > 0) ?? ''
	const summary = firstLine.slice(0, 120)

	const frontmatter = `---\nrunAt: ${runAt}\ndurationMs: ${durationMs}\nsummary: ${JSON.stringify(summary)}\n---\n`
	const body = transcript.slice(0, MAX_TRANSCRIPT_BYTES)
	const content = frontmatter + '\n' + body

	const sessionsDir = path.join(agentDir, '.agent', 'sessions')
	await fs.mkdir(sessionsDir, {recursive: true})
	const filePath = path.join(sessionsDir, `${recorder.runId}.md`)

	// Atomic write — .tmp + rename
	const tmp = filePath + '.tmp'
	await fs.writeFile(tmp, content, 'utf-8')
	await fs.rename(tmp, filePath)

	TRANSCRIPT_MARKER.add(recorder.runId)
}

export {randomUUID}
