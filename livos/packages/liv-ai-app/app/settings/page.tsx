/**
 * Phase 202-07 — /settings page.
 *
 * Composes three tabs (Account / MCP / Models) via the shadcn-style Tabs
 * primitive. D-202-11 — route lives at /settings (subapp root, NOT
 * /agents/settings).
 *
 * The page is intentionally narrow (max-w-4xl) so the tab content stays
 * legible on wide monitors — same container width the /agents/new create
 * form uses (Phase 202-06).
 *
 * INV-202-05 — every visible string is English.
 */

"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountTab } from "@/components/settings/AccountTab";
import { McpTab } from "@/components/settings/McpTab";
import { ModelsTab } from "@/components/settings/ModelsTab";

export default function SettingsPage() {
	return (
		<div className="container mx-auto max-w-4xl px-6 py-8">
			<div className="mb-6">
				<h1 className="text-2xl font-semibold">Settings</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Account, MCP servers, and the default Grok model.
				</p>
			</div>
			<Tabs defaultValue="account" className="space-y-6">
				<TabsList>
					<TabsTrigger value="account">Account</TabsTrigger>
					<TabsTrigger value="mcp">MCP</TabsTrigger>
					<TabsTrigger value="models">Models</TabsTrigger>
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
			</Tabs>
		</div>
	);
}
