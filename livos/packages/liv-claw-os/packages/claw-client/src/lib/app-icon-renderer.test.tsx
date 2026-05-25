/**
 * Phase 208-07 R7 — AppIcon renderer unit tests.
 *
 * The repository ships no jsdom env + D-NO-NEW-DEPS forbids adding
 * @testing-library/react, so these tests inspect React.createElement output
 * structurally via element.type + element.props introspection. lucide-react
 * exports are stable function references — we compare component identity
 * (e.g. `el.type === Folder`) rather than rendering to DOM.
 *
 * 8 behaviour cases per the plan:
 *   1. icon-pack with `{icon:'cloud'}` → lucide Cloud component, default size 48
 *   2. icon-pack with bg/fg → outer div has those styles
 *   3. icon-pack with unknown name → falls back to Folder + console.warn
 *   4. url with safe URL → <img>
 *   5. url with unsafe URL (javascript:) → falls back to placeholder
 *   6. ai-generated → placeholder + data-icon-pending="true"
 *   7. unknown kind / iconKind absent → placeholder
 *   8. size prop respected on every kind
 */

import {beforeEach, describe, expect, test, vi} from "vitest";
import {
	Cloud,
	Database,
	Folder,
} from "lucide-react";
import type {ReactElement} from "react";

import {AppIcon, ICON_PACK_NAMES, isSafeUrl} from "./app-icon-renderer";

// Helper — find the first descendant whose `type` matches the given component.
function findByType(el: unknown, target: unknown): ReactElement | null {
	if (!el || typeof el !== "object") return null;
	const node = el as ReactElement;
	if (node.type === target) return node;
	const children = (node.props as {children?: unknown})?.children;
	if (Array.isArray(children)) {
		for (const child of children) {
			const found = findByType(child, target);
			if (found) return found;
		}
	} else if (children) {
		return findByType(children, target);
	}
	return null;
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("isSafeUrl", () => {
	test("accepts http/https/data, rejects javascript:/file:/junk", () => {
		expect(isSafeUrl("https://example.com/i.png")).toBe(true);
		expect(isSafeUrl("http://example.com/i.png")).toBe(true);
		expect(isSafeUrl("data:image/png;base64,aaaa")).toBe(true);
		expect(isSafeUrl("javascript:alert(1)")).toBe(false);
		expect(isSafeUrl("file:///etc/passwd")).toBe(false);
		expect(isSafeUrl("not-a-url")).toBe(false);
		expect(isSafeUrl("")).toBe(false);
	});
});

describe("AppIcon", () => {
	test("Test 1: icon-pack {icon:'cloud'} renders lucide Cloud at default size 48", () => {
		const el = AppIcon({iconKind: "icon-pack", iconConfig: {icon: "cloud"}});
		// Wrapper div carries size 48.
		expect(el.type).toBe("div");
		const style = (el.props as {style: Record<string, unknown>}).style;
		expect(style.width).toBe(48);
		expect(style.height).toBe(48);
		// The lucide Cloud component is rendered inside.
		const cloud = findByType(el, Cloud);
		expect(cloud).not.toBeNull();
	});

	test("Test 2: icon-pack with bg + fg applies those inline styles", () => {
		const el = AppIcon({
			iconKind: "icon-pack",
			iconConfig: {
				icon: "database",
				bg: "linear-gradient(45deg, red, blue)",
				fg: "#ffffff",
			},
		});
		const style = (el.props as {style: Record<string, unknown>}).style;
		expect(style.background).toBe("linear-gradient(45deg, red, blue)");
		const db = findByType(el, Database);
		expect(db).not.toBeNull();
		expect((db!.props as {color: string}).color).toBe("#ffffff");
	});

	test("Test 3: icon-pack with unknown icon name → Folder fallback + console.warn", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const el = AppIcon({
			iconKind: "icon-pack",
			iconConfig: {icon: "nonexistent-icon-xyz"},
		});
		const folder = findByType(el, Folder);
		expect(folder).not.toBeNull();
		expect(warn).toHaveBeenCalledOnce();
		const call = warn.mock.calls[0]?.[0];
		expect(String(call)).toMatch(/nonexistent-icon-xyz/);
	});

	test("Test 4: url with safe URL renders <img>", () => {
		const el = AppIcon({
			iconKind: "url",
			iconConfig: {url: "https://example.com/i.png"},
		});
		expect(el.type).toBe("img");
		expect((el.props as {src: string}).src).toBe("https://example.com/i.png");
		expect((el.props as {width: number}).width).toBe(48);
		expect((el.props as {height: number}).height).toBe(48);
	});

	test("Test 5: url with unsafe javascript: URL falls back to placeholder (no <img>)", () => {
		const el = AppIcon({
			iconKind: "url",
			iconConfig: {url: "javascript:alert(1)"},
		});
		// Wrapper div (placeholder) — NOT an <img>.
		expect(el.type).not.toBe("img");
		expect(el.type).toBe("div");
		// Renders the placeholder Folder icon.
		const folder = findByType(el, Folder);
		expect(folder).not.toBeNull();
	});

	test("Test 6: ai-generated kind renders placeholder with data-icon-pending=true", () => {
		const el = AppIcon({iconKind: "ai-generated", iconConfig: {prompt: "x"}});
		const props = el.props as {
			"data-icon-pending"?: string;
			style: Record<string, unknown>;
		};
		expect(props["data-icon-pending"]).toBe("true");
		const folder = findByType(el, Folder);
		expect(folder).not.toBeNull();
	});

	test("Test 7: unknown kind / iconKind absent → placeholder", () => {
		const el1 = AppIcon({iconKind: "totally-unknown" as never, iconConfig: {}});
		expect(findByType(el1, Folder)).not.toBeNull();
		// Absent iconKind (cast through unknown to bypass TS narrowing)
		const el2 = AppIcon({iconKind: undefined as unknown as string, iconConfig: {}});
		expect(findByType(el2, Folder)).not.toBeNull();
	});

	test("Test 8: size prop respected on every kind", () => {
		const pack = AppIcon({
			iconKind: "icon-pack",
			iconConfig: {icon: "cloud"},
			size: 32,
		});
		const packStyle = (pack.props as {style: Record<string, unknown>}).style;
		expect(packStyle.width).toBe(32);
		expect(packStyle.height).toBe(32);

		const urlEl = AppIcon({
			iconKind: "url",
			iconConfig: {url: "https://x.com/i.png"},
			size: 64,
		});
		expect((urlEl.props as {width: number}).width).toBe(64);
		expect((urlEl.props as {height: number}).height).toBe(64);

		const placeholder = AppIcon({
			iconKind: "unknown" as never,
			iconConfig: {},
			size: 24,
		});
		const phStyle = (placeholder.props as {style: Record<string, unknown>}).style;
		expect(phStyle.width).toBe(24);
		expect(phStyle.height).toBe(24);
	});

	test("Test 9: ICON_PACK_NAMES exports the 24-name catalog (per Claude Discretion)", () => {
		expect(ICON_PACK_NAMES).toHaveLength(24);
		// Sanity-check a few well-known names from the catalog.
		expect(ICON_PACK_NAMES).toContain("cloud");
		expect(ICON_PACK_NAMES).toContain("database");
		expect(ICON_PACK_NAMES).toContain("folder");
		expect(ICON_PACK_NAMES).toContain("trash");
	});
});
