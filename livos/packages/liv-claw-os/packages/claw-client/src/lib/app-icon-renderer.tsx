/**
 * Phase 208-07 R7 — AppIcon renderer.
 *
 * Single component used by the dock + window-chrome + app cards to render a
 * per-app icon from the `(iconKind, iconConfig)` tuple persisted on the
 * `livos_openui_apps` row.
 *
 * Three kinds:
 *   - 'icon-pack' (default) — `{icon, bg?, fg?}` → lucide-react component
 *                              tile on a solid / gradient background.
 *   - 'url'                  — `{url}` → `<img>` (URL guarded by isSafeUrl;
 *                              unsafe URLs fall back to the placeholder).
 *   - 'ai-generated'         — DEFERRED to R7.x. Renders the placeholder
 *                              with `data-icon-pending="true"` so a future
 *                              image-gen pipeline can swap it in.
 *
 * The 24-name lucide catalog (per Claude's Discretion — covers most
 * operator-facing app archetypes) is enforced at the tRPC zod schema layer,
 * NOT here. This file accepts any string name and falls back to `Folder`
 * with a `console.warn` when the name is not in the map. That way, a
 * future-shipped icon name doesn't require a renderer redeploy.
 *
 * Test surface: see `app-icon-renderer.test.tsx`. Tests inspect
 * React.createElement output structurally (no jsdom, no @testing-library
 * per D-NO-NEW-DEPS).
 */

import {
	Bell,
	Bookmark,
	Calendar,
	Clock,
	Cloud,
	Code,
	Cpu,
	Database,
	Edit,
	Folder,
	Heart,
	Image as ImageIcon,
	Lock,
	Mail,
	Music,
	Search,
	Settings,
	Share,
	Star,
	Terminal,
	Trash,
	User,
	Users,
	Video,
} from "lucide-react";
import type {ComponentType, ReactElement} from "react";

// ── Public types ─────────────────────────────────────────────────────────────

export type IconKind = "icon-pack" | "url" | "ai-generated";

export interface IconPackConfig {
	icon: string;
	bg?: string;
	fg?: string;
}

export interface UrlIconConfig {
	url: string;
}

export interface AiGeneratedIconConfig {
	prompt: string;
}

export type IconConfig =
	| IconPackConfig
	| UrlIconConfig
	| AiGeneratedIconConfig
	| Record<string, unknown>;

export interface AppIconProps {
	iconKind: IconKind | string | undefined;
	iconConfig: IconConfig | null | undefined;
	/** Pixel size of the rendered tile. Default 48. */
	size?: number;
}

// ── Lucide catalog (24 names per Claude's Discretion) ────────────────────────

type LucideComponent = ComponentType<{size?: number; color?: string}>;

const ICON_PACK: Record<string, LucideComponent> = {
	cloud: Cloud as LucideComponent,
	cpu: Cpu as LucideComponent,
	database: Database as LucideComponent,
	folder: Folder as LucideComponent,
	image: ImageIcon as LucideComponent,
	music: Music as LucideComponent,
	video: Video as LucideComponent,
	terminal: Terminal as LucideComponent,
	code: Code as LucideComponent,
	settings: Settings as LucideComponent,
	user: User as LucideComponent,
	users: Users as LucideComponent,
	lock: Lock as LucideComponent,
	mail: Mail as LucideComponent,
	calendar: Calendar as LucideComponent,
	clock: Clock as LucideComponent,
	bell: Bell as LucideComponent,
	search: Search as LucideComponent,
	star: Star as LucideComponent,
	heart: Heart as LucideComponent,
	bookmark: Bookmark as LucideComponent,
	share: Share as LucideComponent,
	edit: Edit as LucideComponent,
	trash: Trash as LucideComponent,
};

/** Public catalog — the 24-name allowlist for the zod tRPC schema. */
export const ICON_PACK_NAMES: readonly string[] = Object.keys(ICON_PACK);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Whitelist URL guard. Accepts http/https/data only. Rejects javascript:,
 * file:, ftp:, plus anything that doesn't parse as a URL.
 *
 * NOTE: data: URIs are accepted because operators commonly inline small SVG
 * icons that way. If this surface ever feeds an XSS sink, this guard must
 * grow a Content-Security-Policy review — but `<img src=data:image/...>` is
 * safe for image MIME types.
 */
export function isSafeUrl(s: string | null | undefined): boolean {
	if (!s || typeof s !== "string") return false;
	try {
		const u = new URL(s);
		return (
			u.protocol === "http:" || u.protocol === "https:" || u.protocol === "data:"
		);
	} catch {
		return false;
	}
}

const DEFAULT_BG = "#3b82f6"; // tailwind blue-500
const DEFAULT_FG = "#ffffff";

// ── Component ────────────────────────────────────────────────────────────────

export function AppIcon({
	iconKind,
	iconConfig,
	size = 48,
}: AppIconProps): ReactElement {
	const config = (iconConfig ?? {}) as Record<string, unknown>;

	// ── kind: url ────────────────────────────────────────────────────────────
	if (iconKind === "url") {
		const url = typeof config["url"] === "string" ? (config["url"] as string) : null;
		if (url && isSafeUrl(url)) {
			return (
				<img
					src={url}
					width={size}
					height={size}
					alt=""
					style={{borderRadius: 8, objectFit: "cover"}}
				/>
			);
		}
		// Unsafe / missing URL → placeholder.
		return renderPlaceholder(size);
	}

	// ── kind: icon-pack ──────────────────────────────────────────────────────
	if (iconKind === "icon-pack") {
		const iconName =
			typeof config["icon"] === "string" ? (config["icon"] as string) : null;
		if (iconName) {
			const Icon = ICON_PACK[iconName] ?? Folder;
			if (!ICON_PACK[iconName]) {
				// eslint-disable-next-line no-console
				console.warn(
					`[AppIcon] unknown icon-pack name: ${iconName}, falling back to Folder`,
				);
			}
			const bg =
				typeof config["bg"] === "string" ? (config["bg"] as string) : DEFAULT_BG;
			const fg =
				typeof config["fg"] === "string" ? (config["fg"] as string) : DEFAULT_FG;
			return (
				<div
					style={{
						background: bg,
						width: size,
						height: size,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						borderRadius: 8,
					}}
				>
					<Icon size={Math.round(size * 0.6)} color={fg} />
				</div>
			);
		}
		// icon-pack without a name → placeholder.
		return renderPlaceholder(size);
	}

	// ── kind: ai-generated (DEFERRED) ────────────────────────────────────────
	if (iconKind === "ai-generated") {
		return (
			<div
				data-icon-pending="true"
				style={{
					width: size,
					height: size,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "#1f2937", // slate-800
					borderRadius: 8,
				}}
			>
				<Folder size={Math.round(size * 0.6)} color="#9ca3af" />
			</div>
		);
	}

	// ── unknown / absent kind ────────────────────────────────────────────────
	return renderPlaceholder(size);
}

function renderPlaceholder(size: number): ReactElement {
	return (
		<div
			style={{
				width: size,
				height: size,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: DEFAULT_BG,
				borderRadius: 8,
			}}
		>
			<Folder size={Math.round(size * 0.6)} color={DEFAULT_FG} />
		</div>
	);
}
