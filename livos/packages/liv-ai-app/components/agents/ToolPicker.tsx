/**
 * Phase 202-06 — ToolPicker.
 *
 * Two-category checkbox grid for the create form. Categories:
 *
 *   - **Computer-use (Luse)** — 17 tools (mirrors Phase 109 / 201 Luse MCP
 *     spawn surface). Names follow `luse_*` convention. Destructive ones
 *     carry a `destructive` flag → render a red badge inline (mirrors the
 *     ApprovalCard surface from Phase 198-04 W-02 / INV-202-04).
 *
 *   - **Built-in** — 10 tools from Phase 200-C (INV-202-09 preserved). The
 *     plan template references `mastra.agent.listBuiltInTools`; that tRPC
 *     query was NOT shipped in Wave 1 (the catalog is hardcoded in the
 *     Mastra registry + mirrored on the frontend via the BUILTIN_TOOLS const
 *     in 202-05 AgentEditForm). To keep INV-202-02 honoured (NO backend
 *     changes in Wave 2 plans), this picker uses the SAME hardcoded list
 *     202-05 ships. If a future plan moves the catalog server-side, this
 *     component swaps to a tRPC fetch — the prop shape (`{value, onChange}`)
 *     stays stable so the create form does not break.
 *
 * Semantics:
 *   - Empty selection (`[]`) means "all tools available" — matches the
 *     repo's existing `toolIds: []` semantics, where an empty array is the
 *     "give the agent the full catalog" sentinel (per agent-router.ts +
 *     202-05 AgentEditForm convention).
 *   - "Select all" + "Clear" buttons per category, plus a category-level
 *     count badge so the operator sees `7 / 10` selected at a glance.
 *
 * INV-202-05 English text only.
 */

"use client";

import { useCallback } from "react";
import { ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

interface ToolPickerProps {
	value: string[];
	onChange: (next: string[]) => void;
}

interface ToolMeta {
	id: string;
	description: string;
	destructive?: boolean;
}

/**
 * Luse computer-use tools — 17 entries that match the MCP server's exposed
 * tool catalog. Source: Phase 109 Luse spec + 201-05 panel reference. The
 * subset flagged `destructive` flows through ApprovalManager (Phase 198-04
 * W-02 / INV-202-04 preserved); the rest fire without prompting.
 */
const LUSE_TOOLS: ReadonlyArray<ToolMeta> = [
	{ id: "luse_list_windows", description: "Enumerate visible windows." },
	{ id: "luse_focus_window", description: "Bring a window to the foreground." },
	{ id: "luse_screenshot", description: "Capture the screen as an image." },
	{ id: "luse_click", description: "Click at x,y on the focused window.", destructive: true },
	{ id: "luse_double_click", description: "Double-click at x,y.", destructive: true },
	{ id: "luse_right_click", description: "Right-click at x,y.", destructive: true },
	{ id: "luse_type_text", description: "Type a string into the focused field.", destructive: true },
	{ id: "luse_press_key", description: "Press a single key or hotkey.", destructive: true },
	{ id: "luse_scroll", description: "Scroll the focused window." },
	{ id: "luse_navigate", description: "Navigate a browser to a URL.", destructive: true },
	{ id: "luse_drag", description: "Drag from (x1,y1) to (x2,y2).", destructive: true },
	{ id: "luse_get_active_window", description: "Read the active window's metadata." },
	{ id: "luse_wait", description: "Pause for N milliseconds." },
	{ id: "luse_read_clipboard", description: "Read the system clipboard." },
	{ id: "luse_write_clipboard", description: "Write to the system clipboard.", destructive: true },
	{ id: "luse_run_shell", description: "Run a shell command on the host.", destructive: true },
	{ id: "luse_find_text_on_screen", description: "OCR + locate text on the current screen." },
];

/**
 * Built-in tools from Phase 200-C (10). Mirrors the BUILTIN_TOOLS const in
 * 202-05 AgentEditForm — keep them in sync so both forms surface the same
 * canonical catalog. The 7 destructive ones flow through ApprovalManager
 * (INV-202-04).
 */
const BUILTIN_TOOLS: ReadonlyArray<ToolMeta> = [
	{ id: "weather", description: "Fetch current weather for a location." },
	{ id: "get_current_time", description: "Return the current ISO timestamp." },
	{ id: "luse_list_windows", description: "Enumerate visible windows (built-in wrapper)." },
	{ id: "luse_focus_window", description: "Focus a window (built-in wrapper)." },
	{ id: "luse_screenshot", description: "Screenshot (built-in wrapper)." },
	{ id: "luse_click", description: "Click (built-in wrapper).", destructive: true },
	{ id: "luse_type_text", description: "Type text (built-in wrapper).", destructive: true },
	{ id: "luse_press_key", description: "Press key (built-in wrapper).", destructive: true },
	{ id: "luse_scroll", description: "Scroll (built-in wrapper)." },
	{ id: "luse_navigate", description: "Navigate (built-in wrapper).", destructive: true },
];

export function ToolPicker({ value, onChange }: ToolPickerProps) {
	const selected = new Set(value);

	const toggle = useCallback(
		(toolId: string) => {
			if (selected.has(toolId)) {
				onChange(value.filter((t) => t !== toolId));
			} else {
				onChange([...value, toolId]);
			}
		},
		[onChange, selected, value],
	);

	const selectAll = useCallback(
		(tools: ReadonlyArray<ToolMeta>) => {
			const merged = new Set(value);
			for (const t of tools) merged.add(t.id);
			onChange(Array.from(merged));
		},
		[onChange, value],
	);

	const clearCategory = useCallback(
		(tools: ReadonlyArray<ToolMeta>) => {
			const remove = new Set(tools.map((t) => t.id));
			onChange(value.filter((t) => !remove.has(t)));
		},
		[onChange, value],
	);

	return (
		<div className="space-y-6">
			<ToolCategory
				title="Computer-use (Luse)"
				subtitle="Drives the host desktop via the Luse MCP server."
				tools={LUSE_TOOLS}
				selected={selected}
				onToggle={toggle}
				onSelectAll={() => selectAll(LUSE_TOOLS)}
				onClear={() => clearCategory(LUSE_TOOLS)}
			/>
			<ToolCategory
				title="Built-in"
				subtitle="Always available across every agent (Phase 200-C catalog)."
				tools={BUILTIN_TOOLS}
				selected={selected}
				onToggle={toggle}
				onSelectAll={() => selectAll(BUILTIN_TOOLS)}
				onClear={() => clearCategory(BUILTIN_TOOLS)}
			/>
			<p className="text-xs text-muted-foreground/80">
				Tip: leave every box unchecked to give the agent access to every
				tool registered at boot.
			</p>
		</div>
	);
}

interface ToolCategoryProps {
	title: string;
	subtitle: string;
	tools: ReadonlyArray<ToolMeta>;
	selected: Set<string>;
	onToggle: (toolId: string) => void;
	onSelectAll: () => void;
	onClear: () => void;
}

function ToolCategory({
	title,
	subtitle,
	tools,
	selected,
	onToggle,
	onSelectAll,
	onClear,
}: ToolCategoryProps) {
	const selectedCount = tools.filter((t) => selected.has(t.id)).length;
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h3 className="text-sm font-medium">{title}</h3>
					<p className="text-xs text-muted-foreground/80">{subtitle}</p>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<span className="text-xs text-muted-foreground">
						{selectedCount} / {tools.length}
					</span>
					<button
						type="button"
						onClick={onSelectAll}
						className="rounded-md border border-border/60 px-2 py-0.5 text-xs hover:border-foreground/30 hover:bg-muted/40"
					>
						Select all
					</button>
					<button
						type="button"
						onClick={onClear}
						className="rounded-md border border-border/60 px-2 py-0.5 text-xs hover:border-foreground/30 hover:bg-muted/40"
					>
						Clear
					</button>
				</div>
			</div>
			<div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
				{tools.map((t) => {
					const isOn = selected.has(t.id);
					return (
						<label
							key={`${title}::${t.id}`}
							className={cn(
								"flex cursor-pointer items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-sm transition-colors",
								"hover:border-foreground/30",
								isOn && "border-foreground/40 bg-muted/40",
							)}
						>
							<input
								type="checkbox"
								className="mt-0.5 size-4 rounded accent-foreground"
								checked={isOn}
								onChange={() => onToggle(t.id)}
							/>
							<span className="min-w-0 flex-1">
								<span className="flex items-center gap-1.5">
									<span className="font-mono text-xs">{t.id}</span>
									{t.destructive ? (
										<span
											className="inline-flex items-center gap-1 rounded-sm bg-destructive/10 px-1 py-0.5 text-[10px] font-medium text-destructive"
											title="Destructive — routes through the approval gate."
										>
											<ShieldAlert className="size-2.5" />
											destructive
										</span>
									) : null}
								</span>
								<span className="mt-0.5 block text-xs text-muted-foreground">
									{t.description}
								</span>
							</span>
						</label>
					);
				})}
			</div>
		</div>
	);
}
