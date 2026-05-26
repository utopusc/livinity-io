/**
 * Phase 219 T6 — Skill loader.
 *
 * Walks `~bruce/livinity/<agent>/skills/` and produces a manifest of every
 * SKILL.md the operator (or T7 marketplace) dropped in. Invalid skills are
 * logged + skipped so a single bad SKILL.md doesn't brick agent boot.
 *
 * The loader is filesystem-only — no Redis, no DB. The vault path matches
 * `feedback_v38_3_drop_vault_concept` (single dir under `livinity/`, no
 * separate `vault/` subtree). Honors `LIV_VAULT_ROOT` env override.
 */
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync} from 'node:fs'
import {homedir} from 'node:os'
import {join, resolve} from 'node:path'

import {parseSkill, type ParsedSkill, type SkillFrontmatter} from './schema.js'

const DEFAULT_VAULT_ROOT = join(homedir(), 'livinity')

export interface SkillManifestEntry {
	name: string
	slug: string
	description: string
	tools: string[]
	bytes: number
	modified_at: string
	path: string
}

export interface SkillManifest {
	agent: string
	skills: SkillManifestEntry[]
	errors: Array<{path: string; reason: string}>
}

export interface SkillsLoaderDeps {
	logger: {info: (m: string) => void; warn: (m: string, err?: unknown) => void}
	/** Override the vault root — defaults to LIV_VAULT_ROOT env → ~/livinity. */
	vaultRoot?: string
}

export class SkillsLoader {
	private readonly vaultRoot: string

	constructor(private readonly deps: SkillsLoaderDeps) {
		this.vaultRoot = resolve(deps.vaultRoot ?? process.env.LIV_VAULT_ROOT ?? DEFAULT_VAULT_ROOT)
	}

	/** Resolve + safety-check the skills dir for an agent. Auto-creates if missing. */
	private agentSkillsDir(agent: string): string {
		if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(agent)) {
			throw new Error(`SKILL_AGENT_INVALID: ${agent}`)
		}
		const dir = resolve(this.vaultRoot, agent, 'skills')
		// Defense-in-depth: refuse paths that escape the vault root.
		const sep = process.platform === 'win32' ? '\\' : '/'
		if (!dir.startsWith(this.vaultRoot + sep)) {
			throw new Error(`SKILL_PATH_ESCAPE: ${dir}`)
		}
		if (!existsSync(dir)) {
			mkdirSync(dir, {recursive: true, mode: 0o700})
		}
		return dir
	}

	/** Walk one agent's skills/ dir + parse each SKILL.md. */
	loadManifest(agent: string): SkillManifest {
		const root = this.agentSkillsDir(agent)
		const skills: SkillManifestEntry[] = []
		const errors: Array<{path: string; reason: string}> = []

		let dirents: string[]
		try {
			dirents = readdirSync(root)
		} catch (err) {
			this.deps.logger.warn(`SkillsLoader: readdir ${root} failed`, err)
			return {agent, skills, errors: [{path: root, reason: (err as Error).message}]}
		}

		for (const slug of dirents) {
			if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(slug)) continue
			const skillDir = join(root, slug)
			const skillFile = join(skillDir, 'SKILL.md')
			let st
			try {
				st = statSync(skillFile)
			} catch {
				continue
			}
			try {
				const raw = readFileSync(skillFile, 'utf8')
				const parsed = parseSkill(raw, skillFile)
				skills.push({
					name: parsed.frontmatter.name,
					slug,
					description: parsed.frontmatter.description,
					tools: parsed.frontmatter.tools ?? [],
					bytes: st.size,
					modified_at: st.mtime.toISOString(),
					path: skillFile,
				})
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err)
				errors.push({path: skillFile, reason})
				this.deps.logger.warn(`SkillsLoader: skipping ${skillFile} — ${reason}`)
			}
		}
		skills.sort((a, b) => a.slug.localeCompare(b.slug))
		return {agent, skills, errors}
	}

	/** Read one parsed skill (full body) for the agent runtime to inject. */
	loadSkillBody(agent: string, slug: string): ParsedSkill | null {
		const root = this.agentSkillsDir(agent)
		if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(slug)) return null
		const skillFile = join(root, slug, 'SKILL.md')
		if (!existsSync(skillFile)) return null
		try {
			const raw = readFileSync(skillFile, 'utf8')
			return parseSkill(raw, skillFile)
		} catch (err) {
			this.deps.logger.warn(`SkillsLoader: loadSkillBody(${agent}, ${slug}) failed`, err)
			return null
		}
	}

	/**
	 * Delete a skill (the SKILL.md file). Does NOT remove the parent dir
	 * (operator may have other files like notes there). Returns the
	 * frontmatter of the deleted skill or null when nothing was deleted.
	 */
	deleteSkill(agent: string, slug: string): SkillFrontmatter | null {
		const root = this.agentSkillsDir(agent)
		if (!/^[a-z0-9][a-z0-9_.-]{0,127}$/.test(slug)) return null
		const skillFile = join(root, slug, 'SKILL.md')
		if (!existsSync(skillFile)) return null
		let parsed: ParsedSkill | null = null
		try {
			parsed = parseSkill(readFileSync(skillFile, 'utf8'), skillFile)
		} catch {
			// Even if parse fails, still delete — operator wants it gone.
		}
		unlinkSync(skillFile)
		this.deps.logger.info(`SkillsLoader: deleted ${skillFile}`)
		return parsed?.frontmatter ?? null
	}
}
