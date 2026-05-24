/**
 * Phase 202-07 — /settings page.
 * Phase 204-02 — extended with the Providers tab (LLM provider API key entry).
 *
 * Composes four tabs (Account / MCP / Models / Providers) via the shadcn-style
 * Tabs primitive. D-202-11 — route lives at /settings (subapp root, NOT
 * /agents/settings). D-204-06 — Providers is a sibling tab, never a separate
 * /providers route.
 *
 * The page is intentionally narrow (max-w-4xl) so the tab content stays
 * legible on wide monitors — same container width the /agents/new create
 * form uses (Phase 202-06).
 *
 * INV-202-05 + INV-204-02 — every visible string is English.
 */

"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountTab } from "@/components/settings/AccountTab";
import { McpTab } from "@/components/settings/McpTab";
import { ModelsTab } from "@/components/settings/ModelsTab";
import { ProvidersTab } from "@/components/settings/ProvidersTab";

export default function SettingsPage() {
	return (
		<div className="container mx-auto max-w-4xl px-6 py-8">
			<div className="mb-6">
				<h1 className="text-2xl font-semibold">Settings</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Account, MCP servers, default Grok model, and LLM provider API keys.
				</p>
			</div>
			<Tabs defaultValue="account" className="space-y-6">
				<TabsList>
					<TabsTrigger value="account">Account</TabsTrigger>
					<TabsTrigger value="mcp">MCP</TabsTrigger>
					<TabsTrigger value="models">Models</TabsTrigger>
					<TabsTrigger value="providers">Providers</TabsTrigger>
				</TabsList>
				<TabsContent value="account">
					<AccountTab />
				</TabsContent>
				<TabsContent value="mcp">
					<McpTab />
				</TabsContent>
				<TabsContent value="models">
					<ModelsTab />
				</TabsContent>
				<TabsContent value="providers">
					<ProvidersTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}
