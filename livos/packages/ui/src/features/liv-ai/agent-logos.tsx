// Phase 267-04 — CLI / agent brand-logo map + <AgentLogo> renderer.
//
// WHY: the Local Agents install panel (scripts/aionui-patches/
// local-agents-install-section.js) and the Liv AI model picker list ~20 CLI
// agents (Claude Code, Gemini, OpenCode, Cursor, Codex, Kimi, Qwen, Copilot,
// Goose, …) that previously rendered with only a text monogram or a lucide
// placeholder — no real brand logo. This module ships vetted STATIC brand
// SVGs (under `public/agent-logos/`) plus a deterministic monogram fallback so
// every agent shows a recognizable mark and a CLI without an asset NEVER shows
// a broken <img>.
//
// KEYING: AGENT_LOGOS is keyed by BOTH the AionUi backend short-string
// (claude / gemini / cursor / opencode / hermes / …) AND the cli-installer
// `CliName` (claude-code / cursor-agent / kimi-cli / …) so a lookup by either
// identifier resolves the same brand. `agentLogoFor(key)` normalises the input
// (lower-case, trim) before lookup.
//
// THREAT MODEL (267-04): assets are STATIC, vetted, monochrome brand SVGs
// shipped from `public/` — never remote, never user-supplied. They are
// rendered via `<img src>` (the browser sandboxes external SVG documents
// loaded as images — no script execution), NEVER via dangerouslySetInnerHTML.
// Do not inline untrusted SVG here.

import {useState, type ComponentType} from 'react'

/** Public URL of a brand SVG under `public/agent-logos/`. Served at the LivOS
 * origin root (e.g. `/agent-logos/claude.svg`). `undefined` ⇒ monogram. */
type LogoSrc = string

export interface AgentLogoEntry {
	/** Public asset URL, or `undefined` when only a monogram is available. */
	src?: LogoSrc
	/** Human-readable label (used for the `<img>` alt + the monogram aria-label). */
	label: string
	/** Brand colour — monogram background + (when no `src`) the avatar fill. */
	brandColor: string
}

const ASSET = (name: string): LogoSrc => `/agent-logos/${name}.svg`

/**
 * The canonical per-brand entry. Each brand is registered under EVERY key an
 * upstream surface might use: the AionUi backend short-name AND the
 * cli-installer `CliName`. A brand with a shipped SVG sets `src`; one without
 * omits `src` and falls back to a monogram (graceful degradation — never a
 * broken image).
 *
 * Brands WITH a shipped asset: claude, gemini, opencode, codex, cursor, qwen,
 * github-copilot, kimi, mistral, goose. Everything else is monogram-only.
 */
export const AGENT_LOGOS: Record<string, AgentLogoEntry> = {
	// ── Claude Code ──────────────────────────────────────────────────────────
	claude: {src: ASSET('claude'), label: 'Claude Code', brandColor: '#D97757'},
	'claude-code': {src: ASSET('claude'), label: 'Claude Code', brandColor: '#D97757'},
	// ── Gemini ───────────────────────────────────────────────────────────────
	gemini: {src: ASSET('gemini'), label: 'Gemini', brandColor: '#4285F4'},
	// ── OpenCode ─────────────────────────────────────────────────────────────
	opencode: {src: ASSET('opencode'), label: 'OpenCode', brandColor: '#0F766E'},
	// ── Codex (OpenAI) ───────────────────────────────────────────────────────
	codex: {src: ASSET('codex'), label: 'Codex', brandColor: '#10A37F'},
	openai: {src: ASSET('codex'), label: 'Codex', brandColor: '#10A37F'},
	// ── Cursor ───────────────────────────────────────────────────────────────
	cursor: {src: ASSET('cursor'), label: 'Cursor', brandColor: '#334155'},
	'cursor-agent': {src: ASSET('cursor'), label: 'Cursor Agent', brandColor: '#334155'},
	// ── Qwen ─────────────────────────────────────────────────────────────────
	qwen: {src: ASSET('qwen'), label: 'Qwen', brandColor: '#6D28D9'},
	'qwen-code': {src: ASSET('qwen'), label: 'Qwen Code', brandColor: '#6D28D9'},
	// ── GitHub Copilot ───────────────────────────────────────────────────────
	copilot: {src: ASSET('github-copilot'), label: 'GitHub Copilot', brandColor: '#24292F'},
	github: {src: ASSET('github-copilot'), label: 'GitHub Copilot', brandColor: '#24292F'},
	'github-copilot': {
		src: ASSET('github-copilot'),
		label: 'GitHub Copilot',
		brandColor: '#24292F',
	},
	// ── Kimi ─────────────────────────────────────────────────────────────────
	kimi: {src: ASSET('kimi'), label: 'Kimi CLI', brandColor: '#4F46E5'},
	'kimi-cli': {src: ASSET('kimi'), label: 'Kimi CLI', brandColor: '#4F46E5'},
	// ── Mistral ──────────────────────────────────────────────────────────────
	mistral: {src: ASSET('mistral'), label: 'Mistral Vibe', brandColor: '#F97316'},
	'mistral-vibe': {src: ASSET('mistral'), label: 'Mistral Vibe', brandColor: '#F97316'},
	// ── Goose ────────────────────────────────────────────────────────────────
	goose: {src: ASSET('goose'), label: 'Goose', brandColor: '#16A34A'},

	// ── Monogram-only (no shipped asset → deterministic monogram avatar) ──────
	openclaw: {label: 'OpenClaw', brandColor: '#F59E0B'},
	'aion-cli': {label: 'Aion CLI', brandColor: '#7C3AED'},
	aion: {label: 'Aion CLI', brandColor: '#7C3AED'},
	augment: {label: 'Augment', brandColor: '#0EA5E9'},
	codebuddy: {label: 'CodeBuddy', brandColor: '#E11D48'},
	'qoder-cli': {label: 'Qoder', brandColor: '#2563EB'},
	qoder: {label: 'Qoder', brandColor: '#2563EB'},
	'factory-droid': {label: 'Factory Droid', brandColor: '#DB2777'},
	droid: {label: 'Factory Droid', brandColor: '#DB2777'},
	'hermes-agent': {label: 'Hermes Agent', brandColor: '#0D9488'},
	hermes: {label: 'Hermes Agent', brandColor: '#0D9488'},
	nanobot: {label: 'Nanobot', brandColor: '#475569'},
	'snow-cli': {label: 'Snow CLI', brandColor: '#0891B2'},
	snow: {label: 'Snow CLI', brandColor: '#0891B2'},
	kiro: {label: 'Kiro', brandColor: '#9333EA'},
}

/** Deterministic fallback colour for an unknown key (slate). */
const FALLBACK_COLOR = '#475569'

/** Normalise a backend / CLI-name key (lower-case + trim) for lookup. */
function normaliseKey(key: string): string {
	return key.trim().toLowerCase()
}

/**
 * Resolve the logo entry for a backend short-name OR a `CliName`. Returns a
 * synthesised monogram-only entry (first letter, slate background) for an
 * unknown key — so the renderer ALWAYS has something to draw and never a
 * broken image. Pure + deterministic.
 */
export function agentLogoFor(key: string): AgentLogoEntry {
	const found = AGENT_LOGOS[normaliseKey(key)]
	if (found) return found
	const label = key.trim() || '?'
	return {label, brandColor: FALLBACK_COLOR}
}

/** First letter (uppercase) of a label, for the monogram avatar. */
function monogramOf(label: string): string {
	const c = label.trim().charAt(0)
	return c ? c.toUpperCase() : '?'
}

export interface AgentLogoProps {
	/** AionUi backend short-name (claude / gemini / cursor / …). */
	backend?: string
	/** cli-installer `CliName` (claude-code / cursor-agent / …). Alias of backend. */
	name?: string
	/** Square px size. Default 20. */
	size?: number
	/** Extra className on the wrapper. */
	className?: string
	/**
	 * Optional fallback glyph (e.g. a lucide icon) rendered INSTEAD of the
	 * monogram when the key has no brand asset AND is unknown to AGENT_LOGOS.
	 * Lets a surface that already has its own icons (e.g. the model picker's
	 * Grok lucide icons) keep them while still uniformly rendering <AgentLogo>.
	 * Receives `{size, className}`-compatible props.
	 */
	fallbackIcon?: ComponentType<{size?: number; className?: string}>
}

/**
 * Renders a brand logo for a CLI/agent. Resolution order:
 *   1. `backend` ?? `name` → `agentLogoFor(...)`.
 *   2. If the entry has `src` AND the `<img>` loads → the brand SVG.
 *   3. Otherwise (no `src`, or the asset 404s at runtime) → a deterministic
 *      monogram avatar (first letter on `brandColor`). NEVER a broken image.
 *
 * The `<img>` `onError` flips to the monogram, so even a missing/renamed asset
 * degrades gracefully instead of showing the browser's broken-image glyph.
 */
export function AgentLogo({
	backend,
	name,
	size = 20,
	className,
	fallbackIcon: FallbackIcon,
}: AgentLogoProps) {
	const key = (backend ?? name ?? '').toString()
	const known = Boolean(AGENT_LOGOS[normaliseKey(key)])
	const entry = agentLogoFor(key)
	const [imgFailed, setImgFailed] = useState(false)

	const dim = `${size}px`
	const radius = `${Math.round(size * 0.28)}px`

	// A caller-supplied fallback glyph wins over the monogram, but ONLY when the
	// key is genuinely unknown to AGENT_LOGOS (so a registered brand that simply
	// lacks an SVG still gets its branded monogram, not a generic icon).
	if (FallbackIcon && !known) {
		return <FallbackIcon size={size} className={className} />
	}

	// Monogram avatar — used when there is no asset OR the asset failed to load.
	if (!entry.src || imgFailed) {
		return (
			<span
				className={className}
				role='img'
				aria-label={entry.label}
				data-agent-logo='monogram'
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: dim,
					height: dim,
					borderRadius: radius,
					background: entry.brandColor,
					color: '#fff',
					fontSize: `${Math.round(size * 0.5)}px`,
					fontWeight: 600,
					lineHeight: 1,
					flexShrink: 0,
					userSelect: 'none',
				}}
			>
				{monogramOf(entry.label)}
			</span>
		)
	}

	// Brand SVG — sandboxed external image (no script execution), static asset.
	return (
		<img
			className={className}
			src={entry.src}
			alt={entry.label}
			width={size}
			height={size}
			data-agent-logo='asset'
			loading='lazy'
			decoding='async'
			onError={() => setImgFailed(true)}
			style={{
				width: dim,
				height: dim,
				borderRadius: radius,
				objectFit: 'contain',
				flexShrink: 0,
			}}
		/>
	)
}

export default AgentLogo
